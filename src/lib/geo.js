// Primitives geodesiques. Les distances en jeu (< 50 km) autorisent le modele
// spherique ; on garde neanmoins la formule de haversine pour eviter les
// derives sur les longs bonds.

export const R_EARTH = 6371008.8; // rayon moyen IUGG, en metres

export const toRad = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;

/** Distance orthodromique en metres. */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Azimut initial A -> B, en degres (0 = nord). */
export function bearing(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point situe a `dist` metres de `p` dans l'azimut `brg` (degres). */
export function destination(p, brg, dist) {
  const d = dist / R_EARTH;
  const th = toRad(brg);
  const la1 = toRad(p.lat);
  const lo1 = toRad(p.lon);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(th)
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(th) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2)
    );
  return { lat: toDeg(la2), lon: ((toDeg(lo2) + 540) % 360) - 180 };
}

/** Interpolation sur le grand cercle, f dans [0,1]. */
export function interpolatePoint(a, b, f) {
  const la1 = toRad(a.lat);
  const lo1 = toRad(a.lon);
  const la2 = toRad(b.lat);
  const lo2 = toRad(b.lon);
  const d = haversine(a, b) / R_EARTH;
  if (d < 1e-12) return { lat: a.lat, lon: a.lon };
  const sd = Math.sin(d);
  const A = Math.sin((1 - f) * d) / sd;
  const B = Math.sin(f * d) / sd;
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

/** Chaine de n points echantillonnes de a a b (extremites incluses). */
export function samplePath(a, b, n) {
  const pts = new Array(n);
  for (let i = 0; i < n; i++) pts[i] = interpolatePoint(a, b, n === 1 ? 0 : i / (n - 1));
  return pts;
}

/** Metres par degre de latitude / longitude a la latitude donnee (WGS84). */
export function metersPerDeg(lat) {
  const p = toRad(lat);
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  };
}

/**
 * Projection equirectangulaire locale centree sur `origin`.
 * Suffisante et beaucoup plus rapide que la geodesique pour les tests de
 * masquage de la grille (erreur < 0.1 % sur quelques dizaines de km).
 */
export function makeLocalProjection(origin) {
  const m = metersPerDeg(origin.lat);
  return {
    forward: (p) => ({
      x: (p.lon - origin.lon) * m.lon,
      y: (p.lat - origin.lat) * m.lat,
    }),
    inverse: (q) => ({
      lat: origin.lat + q.y / m.lat,
      lon: origin.lon + q.x / m.lon,
    }),
    mPerDeg: m,
  };
}

/** Distance point -> segment (plan local), en metres, + abscisse curviligne t. */
export function distanceToSegment(proj, p, a, b) {
  const P = proj.forward(p);
  const A = proj.forward(a);
  const B = proj.forward(b);
  const vx = B.x - A.x;
  const vy = B.y - A.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = P.x - (A.x + t * vx);
  const dy = P.y - (A.y + t * vy);
  return { dist: Math.hypot(dx, dy), t };
}

/** Formatage lat/lon en degres decimaux. */
export function fmtCoord(lat, lon, dec = 5) {
  return `${lat.toFixed(dec)}, ${lon.toFixed(dec)}`;
}

const COMPASS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** Point cardinal le plus proche (16 directions) pour un azimut en degres. */
export function compassPoint(deg) {
  if (!Number.isFinite(deg)) return '';
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_16[i];
}

/**
 * Azimut mis en forme pour l affichage : « 134° (SE) ».
 *
 * L azimut vient de `bearing()`, un calcul de cap orthodromique exact (pas
 * une approximation planaire) : c est la ou pointer une antenne directionnelle
 * pour viser l autre extremite d un bond, boussole en main sur le terrain.
 */
export function formatBearing(deg) {
  if (!Number.isFinite(deg)) return '-';
  return `${Math.round(deg)}° (${compassPoint(deg)})`;
}

/** Formatage en degres / minutes / secondes. */
export function toDMS(value, isLat) {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'O';
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  const s = (mFull - m) * 60;
  return `${d}deg ${String(m).padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}" ${hemi}`;
}
