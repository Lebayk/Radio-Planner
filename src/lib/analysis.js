// Analyse detaillee d un site relais donne : profils complets des deux bonds,
// bilan de liaison, balayage en hauteur d antenne.

import { analyzeHop, combine, PRESET_BY_ID } from './radio.js';
import { sampleGrid, profileSampleCount } from './dem.js';
import { haversine } from './geo.js';
import { fetchElevations } from './elevation.js';

/**
 * Profil issu de la grille MNT deja telechargee, ou null si incomplet.
 * Le nombre d echantillons est celui du balayage : classement et profils
 * affiches decrivent ainsi exactement la meme geometrie.
 */
export function profileFromGrid(grid, data, a, b, n = profileSampleCount(haversine(a, b), grid.step)) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const v = sampleGrid(grid, data, a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f);
    if (!Number.isFinite(v)) return null;
    out[i] = v;
  }
  return out;
}

/**
 * Profils de couverture du sol le long du meme trajet.
 *
 * Les rasters de clutter partagent la grille du MNT : le meme `sampleGrid` les
 * echantillonne. L interpolation bilineaire adoucit les bords de parcelles, ce
 * qui vaut mieux qu une marche d escalier a 50 m.
 */
export function clutterProfiles(grid, clutter, a, b, n) {
  if (!clutter?.foliage) return null;
  const foliage = new Float64Array(n);
  const buildingHeight = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const lat = a.lat + (b.lat - a.lat) * f;
    const lon = a.lon + (b.lon - a.lon) * f;
    const v = sampleGrid(grid, clutter.foliage, lat, lon);
    const h = sampleGrid(grid, clutter.buildings, lat, lon);
    foliage[i] = Number.isFinite(v) ? v : 0;
    buildingHeight[i] = Number.isFinite(h) ? h : 0;
  }
  return { foliage, buildingHeight };
}

/** Profil telecharge directement (point hors du corridor deja couvert). */
export async function profileFromApi(providerId, a, b, n, opts = {}) {
  const pts = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    pts[i] = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
  }
  const { values } = await fetchElevations(providerId, pts, opts);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = values[i];
  // Bouchage des trous eventuels
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(out[i])) continue;
    let lo = i - 1;
    while (lo >= 0 && !Number.isFinite(out[lo])) lo--;
    let hi = i + 1;
    while (hi < n && !Number.isFinite(out[hi])) hi++;
    if (lo < 0 && hi >= n) return null;
    if (lo < 0) out[i] = out[hi];
    else if (hi >= n) out[i] = out[lo];
    else out[i] = out[lo] + ((out[hi] - out[lo]) * (i - lo)) / (hi - lo);
  }
  return out;
}

/**
 * Recupere les deux profils TX->relais et relais->RX, en privilegiant la
 * grille locale (instantanee) et en se rabattant sur l API si le point
 * demande sort de la zone deja telechargee.
 */
export async function getHopProfiles({ tx, rx, relay, grid, dem, providerId, step, opts }) {
  const stepM = step ?? grid?.step ?? 50;
  const n1 = profileSampleCount(haversine(tx, relay), stepM);
  const n2 = profileSampleCount(haversine(relay, rx), stepM);
  let p1 = grid && dem ? profileFromGrid(grid, dem, tx, relay, n1) : null;
  let p2 = grid && dem ? profileFromGrid(grid, dem, relay, rx, n2) : null;
  let source = 'grille';
  if (!p1) {
    p1 = await profileFromApi(providerId, tx, relay, n1, opts);
    source = 'api';
  }
  if (!p2) {
    p2 = await profileFromApi(providerId, relay, rx, n2, opts);
    source = 'api';
  }
  if (!p1 || !p2) throw new Error('Profil d altitude indisponible pour ce point.');
  return { p1, p2, source };
}

/** Parametres communs deduits de la configuration radio. */
function hopParams(radio) {
  return {
    freqMHz: radio.freq,
    cableLoss: radio.cableLoss,
    sensitivity: PRESET_BY_ID[radio.preset].sens,
    k: 4 / 3,
  };
}

/**
 * Bilan complet pour un relais a une hauteur donnee.
 * Les profils doivent avoir leurs extremites deja calees sur les altitudes
 * mesurees des trois sites.
 */
export function analyzeSite({ tx, rx, relay, radio, p1, p2, c1, c2, height, detail = true }) {
  const base = hopParams(radio);
  const d1 = haversine(tx, relay);
  const d2 = haversine(relay, rx);

  const hop1 = analyzeHop(
    p1,
    d1,
    {
      ...base,
      ...(c1 || {}),
      hA: tx.height,
      hB: height,
      gA: tx.gain,
      gB: radio.relayGain,
      txPower: radio.power,
    },
    detail
  );
  const hop2 = analyzeHop(
    p2,
    d2,
    {
      ...base,
      ...(c2 || {}),
      hA: height,
      hB: rx.height,
      gA: radio.relayGain,
      gB: rx.gain,
      txPower: radio.relayPower,
    },
    detail
  );
  return { ...combine(hop1, hop2), height, d1, d2 };
}

/** Cale les extremites des profils sur les altitudes ponctuelles connues. */
export function pinProfiles(p1, p2, txElev, relayElev, rxElev) {
  if (Number.isFinite(txElev)) p1[0] = txElev;
  if (Number.isFinite(relayElev)) {
    p1[p1.length - 1] = relayElev;
    p2[0] = relayElev;
  }
  if (Number.isFinite(rxElev)) p2[p2.length - 1] = rxElev;
}

/**
 * Evolution de la marge en fonction de la hauteur d antenne du relais.
 * C est le graphique qui repond a la question : faut-il investir dans un mat ?
 */
export function heightSweep({ tx, rx, relay, radio, p1, p2, c1, c2, from = 2, to = 20, step = 1 }) {
  const rows = [];
  for (let h = from; h <= to + 1e-9; h += step) {
    const r = analyzeSite({ tx, rx, relay, radio, p1, p2, c1, c2, height: h, detail: false });
    rows.push({
      height: Math.round(h * 10) / 10,
      m1: r.hop1.margin,
      m2: r.hop2.margin,
      margin: r.margin,
      margin95: r.margin95,
      score: r.score,
      c1: r.hop1.clearance,
      c2: r.hop2.clearance,
    });
  }
  return rows;
}

/** Bilan de la liaison directe TX <-> RX, pour quantifier l apport du relais. */
export function analyzeDirect({ tx, rx, radio, profile, clutter }) {
  const base = hopParams(radio);
  const d = haversine(tx, rx);
  return analyzeHop(
    profile,
    d,
    {
      ...base,
      ...(clutter || {}),
      hA: tx.height,
      hB: rx.height,
      gA: tx.gain,
      gB: rx.gain,
      txPower: radio.power,
    },
    true
  );
}
