// Recherche du meilleur emplacement de relais pour couvrir une zone donnee.
//
// Le probleme n est pas celui du reste de l application. Ailleurs, deux sites
// sont fixes et l on cherche ou poser un relais entre eux ; ici la question est
// inverse : une zone est donnee, et l on cherche l emplacement qui en couvre
// la plus grande part.
//
// La zone est un rectangle, donc **convexe** : tout segment entre deux de ses
// points y reste. Le MNT a telecharger se limite par consequent a la zone
// elle-meme - aucune marge n est necessaire pour les profils, contrairement au
// calcul de portee qui doit descendre un rayon bien au-dela du relais.

import { metersPerDeg, haversine } from './geo.js';
import { buildGridSpec } from './dem.js';

/** Deux coins cliques, dans n importe quel ordre, ramenes a une zone. */
export function normalizeZone(a, b) {
  return {
    latMin: Math.min(a.lat, b.lat),
    latMax: Math.max(a.lat, b.lat),
    lonMin: Math.min(a.lon, b.lon),
    lonMax: Math.max(a.lon, b.lon),
  };
}

/** Largeur, hauteur et surface de la zone, en metres et km2. */
export function zoneMetrics(zone) {
  if (!zone) return { widthM: 0, heightM: 0, areaKm2: 0 };
  const latMid = (zone.latMin + zone.latMax) / 2;
  const widthM = haversine({ lat: latMid, lon: zone.lonMin }, { lat: latMid, lon: zone.lonMax });
  const heightM = haversine({ lat: zone.latMin, lon: zone.lonMin }, { lat: zone.latMax, lon: zone.lonMin });
  return { widthM, heightM, areaKm2: (widthM * heightM) / 1e6 };
}

/** Coins de la zone, pour le trace sur la carte. */
export function zoneCorners(zone) {
  return [
    [zone.latMin, zone.lonMin],
    [zone.latMin, zone.lonMax],
    [zone.latMax, zone.lonMax],
    [zone.latMax, zone.lonMin],
  ];
}

/**
 * Grille MNT couvrant la zone.
 *
 * `buildGridSpec` avec un rayon nul produit exactement la boite englobante,
 * plus deux mailles de marge pour l interpolation bilineaire aux bords.
 */
export function zoneGrid(zone, step) {
  return buildGridSpec(
    { lat: zone.latMin, lon: zone.lonMin },
    { lat: zone.latMax, lon: zone.lonMax },
    0,
    step
  );
}

/**
 * Semis regulier de points dans la zone, espaces d environ `stepM`.
 *
 * Sert deux fois : pour les emplacements candidats du relais, et pour les
 * points de test qui representent la surface a couvrir. Le semis est centre
 * dans la zone, pour qu il ne colle pas a un bord en laissant l autre nu.
 */
export function zonePointGrid(zone, stepM) {
  const latMid = (zone.latMin + zone.latMax) / 2;
  const m = metersPerDeg(latMid);
  const dLat = stepM / m.lat;
  const dLon = stepM / m.lon;
  const spanLat = zone.latMax - zone.latMin;
  const spanLon = zone.lonMax - zone.lonMin;
  const ny = Math.max(1, Math.floor(spanLat / dLat) + 1);
  const nx = Math.max(1, Math.floor(spanLon / dLon) + 1);
  const lat0 = zone.latMin + (spanLat - (ny - 1) * dLat) / 2;
  const lon0 = zone.lonMin + (spanLon - (nx - 1) * dLon) / 2;

  const pts = new Array(nx * ny);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      pts[iy * nx + ix] = { lat: lat0 + iy * dLat, lon: lon0 + ix * dLon };
    }
  }
  return { pts, nx, ny, lat0, lon0, dLat, dLon, stepM };
}

// --- Plan de calcul ----------------------------------------------------------
//
// Une seule source de verite, partagee par le panneau de reglages et le worker :
// afficher un cout different de celui reellement engage serait pire que de ne
// rien afficher.

/** Echantillons de balayage qu on s autorise avant de sous-echantillonner. */
export const SAMPLE_BUDGET = 1.2e8;
/**
 * En dessous de ce cout, le moteur exact tourne sur **tous** les emplacements.
 *
 * Le filtrage par balayage est une heuristique : il peut reculer un
 * emplacement a egalite avec les meilleurs et le faire sortir de la liste
 * courte. Tant que l exhaustif reste abordable, il n y a aucune raison
 * d approximer - on ne filtre que lorsqu il ne l est plus.
 */
export const EXACT_BUDGET = 3e8;
/** Emplacements grossiers dont le voisinage est explore a pleine resolution. */
export const REFINE_SEEDS = 24;
/**
 * Emplacements repassant par le moteur exact apres filtrage.
 *
 * Le balayage est optimiste - une seule arete de diffraction la ou Deygout en
 * cumule plusieurs - donc il ne manque jamais un emplacement valable, mais il
 * tasse le classement. Mesure sur relief synthetique : des 10 meilleurs
 * emplacements exacts, une liste courte de 24 en retrouve 8, de 32 en retrouve
 * 9, de 48 les retrouve tous. Le re-calcul exact coutant peu au regard du
 * balayage, 48 est le bon compromis.
 */
export const EXACT_TOP_K = 48;
/** Plafond memoire : au-dela, les tableaux d etat ne tiennent plus. */
export const MAX_POINTS = 12_000_000;

/** Rayons necessaires pour qu aucune maille ne passe entre deux rayons. */
export function raysFor(maxRangeM, cellM) {
  return Math.max(16, Math.min(4096, Math.ceil((2 * Math.PI * maxRangeM) / Math.max(1, cellM))));
}

/**
 * Cout reel du calcul, etage par etage.
 *
 * `bruteLinks` est ce qu aurait coute l approche naive - une liaison complete
 * par couple (emplacement, point de test). Le rapport avec `totalSamples`
 * mesure exactement ce que les trois etages font gagner.
 */
export function planArea(zone, { candidateStep, testStep, gridStep, maxRangeM }) {
  if (!zone) return null;
  const c = zonePointGrid(zone, candidateStep);
  const t = zonePointGrid(zone, testStep);
  const candidates = c.nx * c.ny;
  const targets = t.nx * t.ny;
  const { widthM, heightM } = zoneMetrics(zone);
  const diagM = Math.hypot(widthM, heightM);

  const rayStepM = Math.max(25, gridStep);
  // La portee exploree borne tout. Ce n est pas la taille de la zone : au-dela
  // de l horizon radio le bombement terrestre coupe seul la liaison, et
  // balayer plus loin ne fait que du travail perdu. C est le reglage qui
  // gouverne le cout, d ou son exposition dans l interface.
  const sweepRange = Math.min(maxRangeM ?? diagM, diagM);
  const nAz = raysFor(sweepRange, testStep);
  // Longueur utile d un rayon : la portee, ou le bord de la zone s il vient
  // avant (en moyenne, la moitie de la diagonale).
  const rayLen = Math.min(sweepRange, diagM / 2);
  const samplesPerSweep = Math.max(1, Math.round(nAz * (rayLen / rayStepM)));

  const maxSweeps = Math.max(200, Math.min(candidates, Math.floor(SAMPLE_BUDGET / samplesPerSweep)));
  const stride = Math.max(1, Math.ceil(Math.sqrt(candidates / maxSweeps)));
  const coarseSweeps = Math.ceil(c.ny / stride) * Math.ceil(c.nx / stride);
  const refineSweeps = stride > 1 ? REFINE_SEEDS * (2 * stride + 1) ** 2 : 0;
  const sweeps = coarseSweeps + refineSweeps;

  // Pour comparer honnetement il faut la meme unite des deux cotes. Une
  // « liaison » de la force brute n est pas une operation : elle deroule tout
  // un profil. On ramene donc tout a l echantillon de relief, seule grandeur
  // commune aux deux approches.
  const avgDistM = diagM / 2;
  const avgProfileLen = Math.max(32, Math.min(256, Math.round(avgDistM / (rayStepM / 2)) + 1));
  const bruteLinks = candidates * targets;
  const bruteSamples = bruteLinks * avgProfileLen;

  // Seuls les points de test a portee sont deroules : au-dela, la liaison est
  // ecartee sans calcul. Sur une grande zone, cela ramene le re-calcul exact
  // au disque de portee autour de chaque emplacement, pas a la zone entiere.
  const targetsInRange = Math.min(
    targets,
    Math.max(1, Math.round((Math.PI * sweepRange * sweepRange) / (testStep * testStep)))
  );
  const exactProfileLen = Math.max(
    32,
    Math.min(256, Math.round(Math.min(avgDistM, sweepRange / 2) / (rayStepM / 2)) + 1)
  );
  const exactLinks = Math.min(EXACT_TOP_K, candidates) * targetsInRange;
  // Cout de l exhaustif, borne par la portee : un point de test hors de portee
  // est ecarte sans calcul, meme en mode exhaustif.
  const exhaustiveSamples = candidates * targetsInRange * exactProfileLen;
  const exhaustive = exhaustiveSamples <= EXACT_BUDGET;

  const sweepSamples = exhaustive ? 0 : sweeps * samplesPerSweep;
  const exactSamples = exhaustive ? exhaustiveSamples : exactLinks * exactProfileLen;
  const totalSamples = sweepSamples + exactSamples;

  return {
    candidates,
    targets,
    targetsInRange,
    sweepRange,
    exhaustive,
    stride: exhaustive ? 1 : stride,
    nAz,
    rayStepM,
    avgProfileLen,
    exactProfileLen,
    samplesPerSweep,
    sweeps: exhaustive ? 0 : sweeps,
    sweepSamples,
    exactLinks: exhaustive ? candidates * targetsInRange : exactLinks,
    exactSamples,
    totalSamples,
    bruteLinks,
    bruteSamples,
    speedup: totalSamples > 0 ? bruteSamples / totalSamples : 0,
    tooBig: candidates > MAX_POINTS || targets > MAX_POINTS,
  };
}
