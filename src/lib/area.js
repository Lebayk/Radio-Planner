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

/**
 * Cout du calcul avant de le lancer.
 *
 * Le produit candidats x points de test gouverne tout : c est un balayage
 * quadratique, et passer d un pas de 400 m a 200 m le multiplie par seize.
 * L afficher evite de lancer un calcul de plusieurs minutes sans le savoir.
 */
export function estimateArea(zone, candidateStep, testStep) {
  if (!zone) return { candidates: 0, targets: 0, links: 0 };
  const c = zonePointGrid(zone, candidateStep);
  const t = zonePointGrid(zone, testStep);
  const candidates = c.nx * c.ny;
  const targets = t.nx * t.ny;
  return { candidates, targets, links: candidates * targets };
}
