// Grille d altitudes regulieres en degres (MNT local), partagee entre le
// thread principal et le Web Worker. Ligne 0 = sud.

import { metersPerDeg, makeLocalProjection, distanceToSegment } from './geo.js';

export const NODATA = -32768;

/**
 * Construit la definition de grille couvrant le corridor TX-RX elargi.
 *
 * Le corridor est une capsule (segment TX-RX dilate de `radius`). C est un
 * convexe : tout profil TX->candidat ou candidat->RX reste donc a l interieur,
 * ce qui garantit qu aucun profil ne sort de la zone telechargee.
 */
export function buildGridSpec(tx, rx, radius, step) {
  const latMid = (tx.lat + rx.lat) / 2;
  const m = metersPerDeg(latMid);
  const dLat = step / m.lat;
  const dLon = step / m.lon;

  // Marge : rayon + 2 mailles (interpolation bilineaire aux bords).
  const padM = radius + 2 * step;
  const padLat = padM / m.lat;
  const padLon = padM / m.lon;

  const latMin = Math.min(tx.lat, rx.lat) - padLat;
  const latMax = Math.max(tx.lat, rx.lat) + padLat;
  const lonMin = Math.min(tx.lon, rx.lon) - padLon;
  const lonMax = Math.max(tx.lon, rx.lon) + padLon;

  const nx = Math.max(2, Math.ceil((lonMax - lonMin) / dLon) + 1);
  const ny = Math.max(2, Math.ceil((latMax - latMin) / dLat) + 1);

  return { lat0: latMin, lon0: lonMin, dLat, dLon, nx, ny, step, radius };
}

const cellCount = (tx, rx, radius, step) => {
  const g = buildGridSpec(tx, rx, radius, step);
  return g.nx * g.ny;
};

/**
 * Plus petit pas (m) qui fait tenir la grille sous `maxCells`, a rayon fixe.
 *
 * `nx*ny` decroit avec le pas (un pas plus grossier vide la grille) : la
 * recherche binaire est donc bien fondee. Utilise pour proposer une
 * correction en un clic quand la zone demandee depasse la limite, plutot que
 * de se contenter de dire a l utilisateur d augmenter le pas lui-meme.
 */
export function minFeasibleStep(tx, rx, radius, maxCells, currentStep) {
  let lo = Math.max(1, currentStep); // suppose infaisable : c est pour ca qu on cherche
  let hi = Math.max(lo * 2, 10);
  while (cellCount(tx, rx, radius, hi) > maxCells && hi < 200000) hi *= 2;
  for (let i = 0; i < 30 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (cellCount(tx, rx, radius, mid) > maxCells) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Plus grand rayon (m) qui fait tenir la grille sous `maxCells`, a pas fixe.
 *
 * Symetrique de `minFeasibleStep` : `nx*ny` croit avec le rayon. Retourne
 * `null` si meme un rayon nul ne suffit pas - alors seul un pas plus grossier
 * peut resoudre le probleme, pas une reduction de rayon.
 */
export function maxFeasibleRadius(tx, rx, step, maxCells, currentRadius) {
  if (cellCount(tx, rx, 0, step) > maxCells) return null;
  let lo = 0;
  let hi = Math.max(currentRadius, 1);
  for (let i = 0; i < 30 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (cellCount(tx, rx, mid, step) > maxCells) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * Nombre d echantillons le long d un trajet : deux fois la finesse du MNT,
 * borne entre 32 et 256.
 *
 * Le worker et l analyse detaillee doivent imperativement utiliser la meme
 * valeur : echantillonner plus finement fait apparaitre des obstacles que la
 * grille grossiere manquait, et le classement ne decrirait alors plus la meme
 * chose que les profils affiches.
 */
export function profileSampleCount(distM, step) {
  return Math.max(32, Math.min(256, Math.round(distM / (step / 2)) + 1));
}

export const gridLat = (g, iy) => g.lat0 + iy * g.dLat;
export const gridLon = (g, ix) => g.lon0 + ix * g.dLon;

/**
 * Masque des mailles a telecharger : celles situees a moins de
 * radius + 1,5 maille de l axe TX-RX. Uint8Array de taille nx*ny.
 */
export function buildMask(g, tx, rx) {
  const proj = makeLocalProjection({ lat: (tx.lat + rx.lat) / 2, lon: (tx.lon + rx.lon) / 2 });
  const limit = g.radius + 1.5 * g.step;
  const mask = new Uint8Array(g.nx * g.ny);
  for (let iy = 0; iy < g.ny; iy++) {
    const lat = gridLat(g, iy);
    for (let ix = 0; ix < g.nx; ix++) {
      const lon = gridLon(g, ix);
      const { dist } = distanceToSegment(proj, { lat, lon }, tx, rx);
      if (dist <= limit) mask[iy * g.nx + ix] = 1;
    }
  }
  return mask;
}

/** Liste des points {lat, lon, idx} a interroger. */
export function maskedPoints(g, mask) {
  const out = [];
  for (let iy = 0; iy < g.ny; iy++) {
    for (let ix = 0; ix < g.nx; ix++) {
      const idx = iy * g.nx + ix;
      if (mask[idx]) out.push({ lat: gridLat(g, iy), lon: gridLon(g, ix), idx });
    }
  }
  return out;
}

/** Altitude par interpolation bilineaire, avec repli sur le plus proche valide. */
export function sampleGrid(g, data, lat, lon) {
  const fx = (lon - g.lon0) / g.dLon;
  const fy = (lat - g.lat0) / g.dLat;
  let ix = Math.floor(fx);
  let iy = Math.floor(fy);
  if (ix < 0) ix = 0;
  if (iy < 0) iy = 0;
  if (ix > g.nx - 2) ix = g.nx - 2;
  if (iy > g.ny - 2) iy = g.ny - 2;
  const tx = Math.max(0, Math.min(1, fx - ix));
  const ty = Math.max(0, Math.min(1, fy - iy));

  const i00 = iy * g.nx + ix;
  const v00 = data[i00];
  const v10 = data[i00 + 1];
  const v01 = data[i00 + g.nx];
  const v11 = data[i00 + g.nx + 1];

  const ok = (v) => Number.isFinite(v) && v > NODATA + 1;
  if (ok(v00) && ok(v10) && ok(v01) && ok(v11)) {
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
  }
  // Repli : moyenne des coins valides, puis NaN.
  let sum = 0;
  let cnt = 0;
  for (const v of [v00, v10, v01, v11]) {
    if (ok(v)) {
      sum += v;
      cnt++;
    }
  }
  return cnt ? sum / cnt : NaN;
}

/**
 * Pente locale en degres (differences centrees sur la maille).
 * Sert au filtre d accessibilite.
 */
export function slopeAt(g, data, ix, iy, mPerDeg) {
  const x0 = Math.max(0, ix - 1);
  const x1 = Math.min(g.nx - 1, ix + 1);
  const y0 = Math.max(0, iy - 1);
  const y1 = Math.min(g.ny - 1, iy + 1);
  const zx0 = data[iy * g.nx + x0];
  const zx1 = data[iy * g.nx + x1];
  const zy0 = data[y0 * g.nx + ix];
  const zy1 = data[y1 * g.nx + ix];
  if (![zx0, zx1, zy0, zy1].every((v) => Number.isFinite(v))) return NaN;
  const dxM = (x1 - x0) * g.dLon * mPerDeg.lon;
  const dyM = (y1 - y0) * g.dLat * mPerDeg.lat;
  if (dxM === 0 || dyM === 0) return NaN;
  const gx = (zx1 - zx0) / dxM;
  const gy = (zy1 - zy0) / dyM;
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
}

/**
 * Detection heuristique de plan d eau : un voisinage 3x3 rigoureusement plat
 * dans un MNT correspond presque toujours a une surface en eau (les lacs sont
 * restitues comme des plateaux parfaits), ou a l ocean au niveau zero.
 * Heuristique assumee : une plaine artificiellement lissee peut etre exclue a
 * tort, et un petit etang peut passer au travers.
 */
export function looksLikeWater(g, data, ix, iy) {
  if (ix < 1 || iy < 1 || ix >= g.nx - 1 || iy >= g.ny - 1) return false;
  const z = data[iy * g.nx + ix];
  if (!Number.isFinite(z)) return false;
  if (z <= 0.5) return true; // niveau de la mer
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const v = data[(iy + dy) * g.nx + (ix + dx)];
      if (!Number.isFinite(v)) return false;
      // Tolerance calee sur la precision de stockage du cache (0,1 m) : le
      // resultat doit etre identique que la donnee vienne du reseau ou du cache.
      if (Math.abs(v - z) > 0.05) return false;
    }
  }
  return true;
}
