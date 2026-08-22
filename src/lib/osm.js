// Services OpenStreetMap : geocodage (Nominatim) et distance a la route la
// plus proche (Overpass). Les deux sont des services benevoles : requetes
// rares, resultats mis en cache, echec toujours non bloquant.

import { makeLocalProjection } from './geo.js';

// ---------------------------------------------------------------------------
// Geocodage
// ---------------------------------------------------------------------------

export async function geocode(query, signal) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1` +
    `&accept-language=fr&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim : HTTP ${res.status}`);
  const json = await res.json();
  return json.map((r) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    type: r.type,
  }));
}

// ---------------------------------------------------------------------------
// Distance a la route la plus proche
// ---------------------------------------------------------------------------

/**
 * Instances Overpass, dans l ordre d essai.
 *
 * overpass.osm.ch est en tete parce que c est le seul miroir verifie comme
 * renvoyant `Access-Control-Allow-Origin: *` depuis une origine deployee.
 * L instance principale overpass-api.de est reguliment injoignable ou repond
 * 406 sans en-tete CORS selon l origine appelante, ce qui bloque le navigateur.
 * kumi.systems, private.coffee et osm.jp ne repondent pas non plus en CORS.
 */
export const ENDPOINTS = [
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

/** Levee quand plus aucune instance n est joignable. */
export class OverpassUnavailableError extends Error {
  constructor() {
    super('Aucune instance Overpass joignable');
    this.name = 'OverpassUnavailableError';
  }
}

/**
 * Etat de sante par instance.
 *
 * Sans cela, une instance morte etait retentee pour chaque tuile : quatre
 * tentatives sur deux instances, soit huit requetes vouees a l echec par
 * tuile, plus les attentes. La console se remplissait d erreurs et le calcul
 * s eternisait. Deux echecs consecutifs suffisent a l ecarter pour un moment.
 */
const DOWN_MS = 5 * 60 * 1000;
const health = new Map();

const isDown = (url) => (health.get(url)?.downUntil ?? 0) > Date.now();

function noteFailure(url) {
  const h = health.get(url) ?? { failures: 0, downUntil: 0 };
  h.failures++;
  if (h.failures >= 2) h.downUntil = Date.now() + DOWN_MS;
  health.set(url, h);
}

const noteSuccess = (url) => health.set(url, { failures: 0, downUntil: 0 });

/** Remet toutes les instances en service (changement de reseau, nouvel essai). */
export function resetOverpassHealth() {
  health.clear();
}

// ---------------------------------------------------------------------------
// Transport Overpass partage
// ---------------------------------------------------------------------------
//
// Overpass n accorde que **deux creneaux simultanes** et refuse par 429 des
// qu ils sont pris. Son endpoint /api/status annonce le nombre de creneaux
// libres et, le cas echeant, le delai exact avant liberation : on l interroge
// plutot que de deviner un temps d attente.

const MIN_INTERVAL = 1500;
let lastCall = 0;

const napOverpass = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espace les requetes : c est ce qui evite le 429, pas le fait de reessayer. */
async function paceOverpass() {
  const wait = lastCall + MIN_INTERVAL - Date.now();
  if (wait > 0) await napOverpass(wait);
  lastCall = Date.now();
}

/** Delai annonce par Overpass avant qu un creneau se libere, en ms. */
async function slotDelay(signal) {
  // Seule overpass-api.de publie /api/status ; inutile de l interroger si on
  // l a deja declaree hors service.
  if (isDown('https://overpass-api.de/api/interpreter')) return 5000;
  try {
    const res = await fetch('https://overpass-api.de/api/status', { signal });
    const txt = await res.text();
    const free = txt.match(/(\d+) slots? available now/);
    if (free && Number(free[1]) > 0) return MIN_INTERVAL;
    const soon = txt.match(/in (\d+) seconds/);
    if (soon) return Math.min(120, Number(soon[1]) + 1) * 1000;
  } catch {
    /* le statut est un confort : son echec ne doit pas bloquer */
  }
  return 15000;
}

/**
 * Execute une requete Overpass en respectant les quotas.
 * Renvoie null si la zone reste inaccessible apres plusieurs tentatives : une
 * tuile manquante degrade le resultat, elle ne doit pas tout faire echouer.
 *
 * @param {function} onWait  ({ms, attempt}) => void, pour informer l utilisateur
 */
export async function overpassFetch(query, { signal, onWait } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const usable = ENDPOINTS.filter((u) => !isDown(u));
    // Toutes les instances sont hors service : inutile d insister tuile apres
    // tuile, l appelant doit pouvoir abandonner proprement.
    if (!usable.length) throw new OverpassUnavailableError();

    let rateLimited = false;

    for (const url of usable) {
      if (signal?.aborted) throw new DOMException('Annule', 'AbortError');
      await paceOverpass();
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal,
        });
        if (res.status === 429) {
          // Quota atteint : l instance est vivante, on ne la penalise pas.
          rateLimited = true;
          continue;
        }
        if (!res.ok) {
          // 406 sans en-tete CORS, 504, 5xx : l instance nous refuse.
          noteFailure(url);
          continue;
        }
        const json = await res.json();
        noteSuccess(url);
        return json;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        // Erreur reseau ou blocage CORS : indiscernables cote client, et de
        // toute facon aussi definitifs l un que l autre.
        noteFailure(url);
      }
    }

    if (ENDPOINTS.every((u) => isDown(u))) throw new OverpassUnavailableError();

    const ms = rateLimited ? await slotDelay(signal) : 3000 * (attempt + 1);
    onWait?.({ ms, attempt });
    await napOverpass(ms);
  }
  return null;
}

const HIGHWAYS =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track';

let roadCache = null; // { bbox, ways: [[{lat,lon}...]] }

const bboxContains = (outer, inner) =>
  outer &&
  inner.s >= outer.s &&
  inner.n <= outer.n &&
  inner.w >= outer.w &&
  inner.e <= outer.e;

/**
 * Charge une fois le reseau routier du corridor, puis calcule des distances
 * localement. Renvoie null si Overpass est injoignable (affichage " - ").
 */
export async function loadRoads(bbox, signal) {
  if (bboxContains(roadCache?.bbox, bbox)) return roadCache;

  const q =
    `[out:json][timeout:25];` +
    `way["highway"~"^(${HIGHWAYS})$"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});` +
    `out geom;`;

  let json;
  try {
    json = await overpassFetch(q, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return null; // distance aux routes : confort, jamais bloquant
  }
  if (!json) return null;
  const ways = (json.elements || [])
    .filter((e) => Array.isArray(e.geometry) && e.geometry.length > 1)
    .map((e) => ({
      tags: e.tags || {},
      pts: e.geometry.map((g) => ({ lat: g.lat, lon: g.lon })),
    }));
  roadCache = { bbox, ways };
  return roadCache;
}

export function clearRoadCache() {
  roadCache = null;
}

/** Distance en metres du point a la polyligne routiere la plus proche. */
export function nearestRoad(point, roads) {
  if (!roads || !roads.ways.length) return null;
  const proj = makeLocalProjection(point);
  const P = { x: 0, y: 0 };
  let best = Infinity;
  let bestWay = null;

  for (const way of roads.ways) {
    for (let i = 1; i < way.pts.length; i++) {
      const A = proj.forward(way.pts[i - 1]);
      const B = proj.forward(way.pts[i]);
      // Rejet rapide : si les deux extremites sont du meme cote de l origine
      // et plus loin que le meilleur candidat sur un axe, tout le segment l est.
      if (A.x * B.x > 0 && Math.min(Math.abs(A.x), Math.abs(B.x)) > best) continue;
      if (A.y * B.y > 0 && Math.min(Math.abs(A.y), Math.abs(B.y)) > best) continue;
      const vx = B.x - A.x;
      const vy = B.y - A.y;
      const len2 = vx * vx + vy * vy;
      let t = len2 === 0 ? 0 : ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      const dx = P.x - (A.x + t * vx);
      const dy = P.y - (A.y + t * vy);
      const d = Math.hypot(dx, dy);
      if (d < best) {
        best = d;
        bestWay = way;
      }
    }
  }
  if (!Number.isFinite(best)) return null;
  return {
    dist: best,
    name: bestWay?.tags?.name ?? bestWay?.tags?.highway ?? null,
  };
}

/** Bbox englobant une liste de points, avec marge en metres. */
export function bboxAround(points, padM = 800) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const padLat = padM / 111320;
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const padLon = padM / (111320 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  return {
    s: Math.min(...lats) - padLat,
    n: Math.max(...lats) + padLat,
    w: Math.min(...lons) - padLon,
    e: Math.max(...lons) + padLon,
  };
}
