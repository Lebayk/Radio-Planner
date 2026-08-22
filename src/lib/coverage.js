// Enveloppe de portee du relais.
//
// Un cercle de rayon constant ne dirait rien du relief : la portee reelle
// d un relais est une etoile irreguliere, longue dans les vallees ouvertes et
// coupee net derriere le moindre versant. On tire donc des rayons dans toutes
// les directions et on cherche, sur chacun, la distance a laquelle le bilan de
// liaison decroche.

import { analyzeHop, fspl } from './radio.js';
import { destination } from './geo.js';

/**
 * Portee en espace libre, sans aucun relief : borne haute theorique.
 *
 * Pour LoRa cette valeur est enorme (plus de 1000 km en LongFast a 22 dBm) et
 * n a aucun sens pratique. Elle est affichee malgre tout, parce qu elle montre
 * d un coup d oeil que ce n est jamais la puissance qui limite la portee, mais
 * la geometrie.
 */
export function freeSpaceRangeM({ txPower, gA, gB, cableLoss, sensitivity, margin, freqMHz }) {
  const budget = txPower + gA + gB - 2 * cableLoss - sensitivity - margin;
  const dKm = Math.pow(10, (budget - 20 * Math.log10(freqMHz) - 32.44) / 20);
  return Math.max(0, dKm * 1000);
}

/**
 * Horizon radio avec refraction standard k = 4/3, hauteurs en metres.
 * d(km) = 4,12 * (racine(h1) + racine(h2))
 *
 * C est la limite geometrique au-dela de laquelle le bombement terrestre seul
 * coupe la liaison, meme sur un terrain parfaitement plat.
 */
export function radioHorizonM(h1, h2) {
  return 4.12 * (Math.sqrt(Math.max(0, h1)) + Math.sqrt(Math.max(0, h2))) * 1000;
}

/** Verifie la coherence de FSPL avec la portee inverse (garde-fou interne). */
export function checkFreeSpace(params) {
  const d = freeSpaceRangeM(params);
  const back =
    params.txPower +
    params.gA +
    params.gB -
    2 * params.cableLoss -
    fspl(d / 1000, params.freqMHz) -
    params.sensitivity;
  return { rangeM: d, marginAtRange: back };
}

/**
 * Points a interroger : nAz directions, nSamples echantillons par direction.
 * L echantillon 0 est le relais lui-meme, deja connu, donc non redemande.
 */
export function buildRays(center, maxDistM, nAz, nSamples) {
  const azimuths = new Float64Array(nAz);
  const points = [];
  const stepM = maxDistM / (nSamples - 1);
  for (let a = 0; a < nAz; a++) {
    const az = (360 * a) / nAz;
    azimuths[a] = az;
    for (let s = 1; s < nSamples; s++) {
      points.push(destination(center, az, stepM * s));
    }
  }
  return { azimuths, points, nAz, nSamples, stepM, maxDistM };
}

/**
 * Portee atteinte sur chaque rayon, pour chaque seuil de marge demande.
 *
 * Le rayon s arrete a la **premiere** rupture durable du bilan, pas au point
 * le plus lointain encore atteignable. Un polygone ne sait representer qu une
 * region etoilee : integrer une poche de reception isolee au-dela d une zone
 * d ombre reviendrait a colorier l ombre elle-meme. La zone tracee est donc
 * une zone continue depuis le relais, et des poches de reception peuvent
 * exister au-dela sans y figurer.
 *
 * @param {object} o
 * @param {Float32Array} o.elevations  nAz * (nSamples-1) altitudes, rayon par rayon
 * @param {number} o.centerElev        altitude du sol au relais
 * @param {number[]} o.thresholds      seuils de marge, en dB, decroissants
 */
export function computeCoverage({
  center,
  centerElev,
  elevations,
  clutterFoliage,
  clutterBuildings,
  rays,
  params,
  thresholds = [0],
}) {
  const { nAz, nSamples, stepM, azimuths } = rays;
  const perRay = nSamples - 1;
  const radii = thresholds.map(() => new Float64Array(nAz));

  // Profil reutilise : relais en tete, puis les echantillons du rayon.
  const profile = new Float64Array(nSamples);
  const foliage = clutterFoliage ? new Float64Array(nSamples) : null;
  const buildingHeight = clutterBuildings ? new Float64Array(nSamples) : null;
  // Une rupture isolee peut venir d un artefact du MNT ; on n arrete le rayon
  // qu apres deux echantillons consecutifs sous le seuil.
  const RUPTURE = 2;

  let evaluated = 0;

  for (let a = 0; a < nAz; a++) {
    profile[0] = centerElev;
    let valid = nSamples;
    for (let s = 1; s < nSamples; s++) {
      const v = elevations[a * perRay + (s - 1)];
      if (!Number.isFinite(v)) {
        valid = s;
        break;
      }
      profile[s] = v;
      if (foliage) foliage[s] = clutterFoliage[a * perRay + (s - 1)] || 0;
      if (buildingHeight) buildingHeight[s] = clutterBuildings[a * perRay + (s - 1)] || 0;
    }

    const reached = thresholds.map(() => 0);
    const misses = thresholds.map(() => 0);
    const done = thresholds.map(() => false);

    for (let s = 2; s < valid; s++) {
      if (done.every(Boolean)) break;
      const hop = analyzeHop(profile.subarray(0, s + 1), stepM * s, {
        ...params,
        foliage: foliage ? foliage.subarray(0, s + 1) : undefined,
        buildingHeight: buildingHeight ? buildingHeight.subarray(0, s + 1) : undefined,
      });
      evaluated++;
      for (let t = 0; t < thresholds.length; t++) {
        if (done[t]) continue;
        if (hop.margin >= thresholds[t]) {
          reached[t] = stepM * s;
          misses[t] = 0;
        } else if (++misses[t] >= RUPTURE) {
          done[t] = true;
        }
      }
    }

    for (let t = 0; t < thresholds.length; t++) radii[t][a] = reached[t];
  }

  const rings = thresholds.map((threshold, t) => {
    const r = radii[t];
    const polygon = [];
    for (let a = 0; a < nAz; a++) {
      // Un rayon nul rendrait le polygone degenere : on garde un rayon
      // minuscule pour que la forme reste fermee et lisible.
      const p = destination(center, azimuths[a], Math.max(r[a], 1));
      polygon.push([p.lat, p.lon]);
    }
    return { threshold, radii: r, polygon, stats: ringStats(r, nAz, rays.maxDistM) };
  });

  return { rings, evaluated, rays };
}

function ringStats(r, nAz, maxDistM) {
  let min = Infinity;
  let max = 0;
  let sum = 0;
  let blocked = 0;
  for (let a = 0; a < nAz; a++) {
    if (r[a] <= 1) blocked++;
    min = Math.min(min, r[a]);
    max = Math.max(max, r[a]);
    sum += r[a];
  }
  // Aire de l etoile : somme des triangles entre rayons consecutifs.
  const dTheta = (2 * Math.PI) / nAz;
  let area = 0;
  for (let a = 0; a < nAz; a++) {
    area += 0.5 * r[a] * r[(a + 1) % nAz] * Math.sin(dTheta);
  }
  const mean = sum / nAz;
  // Un rayon qui atteint la limite d exploration ne dit rien de la portee
  // reelle : il dit seulement qu on n a pas regarde assez loin.
  let atLimit = 0;
  for (let a = 0; a < nAz; a++) if (r[a] >= maxDistM * 0.98) atLimit++;
  return {
    atLimit,
    saturated: atLimit > nAz * 0.15,
    min: Number.isFinite(min) ? min : 0,
    max,
    mean,
    blocked,
    areaKm2: area / 1e6,
    // Part du disque theorique de rayon max reellement couverte : mesure
    // directe de ce que le relief coute.
    fillRatio: max > 0 ? area / (Math.PI * max * max) : 0,
  };
}

/** Estimation du cout reseau avant de lancer le calcul. */
export function estimateCoverage(nAz, nSamples, batch, intervalMs) {
  const points = nAz * (nSamples - 1);
  const requests = Math.ceil(points / batch);
  return { points, requests, seconds: Math.ceil((requests * intervalMs) / 1000) };
}

/**
 * Nombre d echantillons par rayon, vise un pas de 100 m.
 *
 * Le pas reste **uniforme** : `analyzeHop` suppose un espacement constant pour
 * situer chaque arete le long du trajet. Un pas variable, plus fin pres du
 * relais, imposerait de lui passer un tableau de distances - refonte que ne
 * justifie pas le gain.
 *
 * Le plafond etait de 150 points, soit un pas de 170 m a 26 km : assez
 * grossier pour manquer une colline qui bloque. A 400 points le pas reste de
 * 100 m jusqu a 40 km, pour un cout reseau superieur d environ trois quarts.
 */
export function samplesForRadius(maxDistM) {
  return Math.max(20, Math.min(400, Math.round(maxDistM / 100) + 1));
}
