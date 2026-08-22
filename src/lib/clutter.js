// Couverture du sol : vegetation et bati, depuis OpenStreetMap.
//
// Le MNT ne connait que le sol nu. La vegetation coute 10 a 20 dB a la
// traversee de feuillus a 868 MHz et le bati est purement opaque : c est de
// loin la premiere source d erreur du modele.
//
// Contrainte de volume mesuree sur le terrain : la vegetation d un corridor de
// 23 km2 pese 294 ko, mais une boite de 15 km en pese 6,2 Mo et une boite de
// 26 km se solde par un HTTP 429. Les batiments d un seul corridor pesent
// 17 Mo. D ou les deux partis pris de ce module :
//
//   1. Tuilage sequentiel espace de 1,5 s, avec attente du delai qu Overpass
//      annonce lui-meme (il n accorde que deux creneaux). Chaque tuile est
//      mise en cache separement : changer le rayon ne retelecharge que les
//      tuiles nouvelles.
//   2. **Rasterisation au fil de l eau** : chaque tuile est dessinee sur la
//      grille des son arrivee, puis jetee. La memoire reste a nx*ny octets
//      quel que soit le volume cumule telecharge.

import { gridLat, gridLon } from './dem.js';
import { idbGet, idbPut } from './idb.js';
import { overpassFetch, OverpassUnavailableError } from './osm.js';

/**
 * Taille de tuile par couche, calee sur les volumes mesures.
 *
 * La vegetation est legere : une boite de 15 km (0,25 deg) pese 6 Mo et passe
 * sans probleme, donc de grandes tuiles - ce qui reduit d autant le nombre de
 * requetes, seule cause reelle des refus d Overpass. Le bati est bien plus
 * lourd (17 Mo pour un seul corridor) et impose des tuiles serrees.
 */
export const TILE_DEG = { vegetation: 0.12, batiments: 0.04 };

/**
 * Classes retenues et hauteurs par defaut.
 *
 * Ces hauteurs sont des **hypotheses assumees** : OSM ne renseigne quasiment
 * jamais la hauteur de la vegetation, et seuls 8 % des batiments portent une
 * hauteur ou un nombre d etages. Une « foret » a 20 m peut etre un taillis de
 * 5 m. L interface le dit explicitement.
 *
 * L identifiant est espace de 40 en 40 : le remplissage de polygones sur un
 * canvas est anticrenele, et des identifiants consecutifs seraient confondus
 * sur les pixels de bordure. Avec cet ecart, l arrondi retrouve la bonne
 * classe partout sauf sur un liseré d une maille.
 */
export const CLUTTER_CLASSES = {
  none: { id: 0, label: 'degage', height: 0, kind: null },
  forest: { id: 40, label: 'foret', height: 20, kind: 'foliage' },
  scrub: { id: 80, label: 'broussaille', height: 3, kind: 'foliage' },
  orchard: { id: 120, label: 'verger', height: 5, kind: 'foliage' },
  vineyard: { id: 160, label: 'vigne', height: 2, kind: 'foliage' },
  building: { id: 200, label: 'bati', height: 8, kind: 'opaque' },
};

const CLASS_BY_ID = Object.fromEntries(
  Object.values(CLUTTER_CLASSES).map((c) => [c.id, c])
);

export const CLASS_STEP = 40;

/** Classe deduite des tags OSM d une entite. */
function classify(tags = {}) {
  if (tags.building) return CLUTTER_CLASSES.building;
  const lu = tags.landuse;
  const nat = tags.natural;
  if (nat === 'wood' || lu === 'forest') return CLUTTER_CLASSES.forest;
  if (nat === 'scrub' || nat === 'heath') return CLUTTER_CLASSES.scrub;
  if (lu === 'orchard') return CLUTTER_CLASSES.orchard;
  if (lu === 'vineyard') return CLUTTER_CLASSES.vineyard;
  return null;
}

/** Hauteur d un batiment : balise explicite, sinon etages, sinon defaut. */
function buildingHeight(tags = {}) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 0) return Math.min(255, h);
  const lv = parseFloat(tags['building:levels']);
  if (Number.isFinite(lv) && lv > 0) return Math.min(255, lv * 3 + 2);
  return CLUTTER_CLASSES.building.height;
}

// ---------------------------------------------------------------------------
// Requetes Overpass, tuilees
// ---------------------------------------------------------------------------

const VEG_QUERY = (b) =>
  `[out:json][timeout:60];(` +
  `way["landuse"~"^(forest|orchard|vineyard)$"](${b.s},${b.w},${b.n},${b.e});` +
  `way["natural"~"^(wood|scrub|heath)$"](${b.s},${b.w},${b.n},${b.e});` +
  `relation["landuse"="forest"](${b.s},${b.w},${b.n},${b.e});` +
  `relation["natural"="wood"](${b.s},${b.w},${b.n},${b.e});` +
  `);out geom;`;

const BLD_QUERY = (b) =>
  `[out:json][timeout:60];way["building"](${b.s},${b.w},${b.n},${b.e});out geom;`;

/** Decoupe une boite en tuiles d au plus `deg` degres de cote. */
export function tileBbox(bbox, deg = 0.05) {
  const tiles = [];
  for (let s = bbox.s; s < bbox.n; s += deg) {
    for (let w = bbox.w; w < bbox.e; w += deg) {
      tiles.push({
        s,
        w,
        n: Math.min(bbox.n, s + deg),
        e: Math.min(bbox.e, w + deg),
      });
    }
  }
  return tiles;
}

/**
 * Forme compacte d une tuile, telle que mise en cache.
 *
 * On ne conserve que ce qui sert au rendu : classe, hauteur, contours. Les
 * coordonnees tiennent en Float32 - a 45 deg de latitude cela vaut 0,3 m de
 * precision, tres en dessous de la maille de 50 m - ce qui divise le volume
 * par deux.
 */
function compactTile(elements) {
  const shapes = [];
  for (const el of elements) {
    const cls = classify(el.tags);
    if (!cls) continue;
    const h = cls.kind === 'opaque' ? buildingHeight(el.tags) : cls.height;
    for (const ring of ringsOf(el)) {
      if (ring.length < 3) continue;
      const r = new Float32Array(ring.length * 2);
      for (let i = 0; i < ring.length; i++) {
        r[i * 2] = ring[i].lat;
        r[i * 2 + 1] = ring[i].lon;
      }
      shapes.push({ c: cls.id, h: Math.round(h), r });
    }
  }
  return shapes;
}

const tileKey = (layer, t, deg) =>
  `tile.${layer}.${Math.round(t.s / deg)}_${Math.round(t.w / deg)}_${Math.round(deg * 1000)}`;

/**
 * Une tuile, en privilegiant le cache.
 *
 * Chaque tuile est memorisee independamment : changer le rayon de recherche ne
 * fait plus tout retelecharger, seules les tuiles nouvelles partent sur le
 * reseau. C est ce qui rend l option supportable a l usage.
 */
async function loadTile(layer, tile, deg, query, opts) {
  const key = tileKey(layer, tile, deg);
  const cached = await idbGet(key);
  if (cached?.shapes) return { shapes: cached.shapes, cached: true };

  const json = await overpassFetch(query, opts);
  if (!json) return { shapes: null, cached: false };

  const shapes = compactTile(json.elements || []);
  await idbPut(key, { shapes });
  return { shapes, cached: false };
}

// ---------------------------------------------------------------------------
// Rasterisation
// ---------------------------------------------------------------------------

/** Anneaux exterieurs d une entite Overpass, en coordonnees lat/lon. */
function ringsOf(el) {
  if (Array.isArray(el.geometry)) return [el.geometry];
  if (Array.isArray(el.members)) {
    // Multipolygone : on ne dessine que les contours exterieurs. Les clairieres
    // (role "inner") sont ignorees, ce qui surestime legerement le couvert.
    return el.members
      .filter((m) => m.role !== 'inner' && Array.isArray(m.geometry) && m.geometry.length > 2)
      .map((m) => m.geometry);
  }
  return [];
}

function makePainter(grid) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.nx;
  canvas.height = grid.ny;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, grid.nx, grid.ny);

  // Ligne 0 du canvas = nord, ligne 0 de la grille = sud : on inverse ici et
  // on relit tel quel.
  const px = (lon) => (lon - grid.lon0) / grid.dLon;
  const py = (lat) => grid.ny - 1 - (lat - grid.lat0) / grid.dLat;

  return {
    canvas,
    ctx,
    paint(shapes) {
      for (const sh of shapes) {
        ctx.fillStyle = `rgb(${sh.c},${sh.h},0)`;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        const r = sh.r;
        ctx.beginPath();
        ctx.moveTo(px(r[1]), py(r[0]));
        for (let i = 1; i < r.length / 2; i++) ctx.lineTo(px(r[i * 2 + 1]), py(r[i * 2]));
        ctx.closePath();
        ctx.fill();
        // Les objets plus fins qu une maille disparaitraient au seul
        // remplissage : un trait les rend visibles.
        ctx.stroke();
      }
    },
    read() {
      const img = ctx.getImageData(0, 0, grid.nx, grid.ny).data;
      const foliage = new Uint8Array(grid.nx * grid.ny);
      const buildings = new Uint8Array(grid.nx * grid.ny);
      const classes = new Uint8Array(grid.nx * grid.ny);
      for (let row = 0; row < grid.ny; row++) {
        const iy = grid.ny - 1 - row;
        for (let ix = 0; ix < grid.nx; ix++) {
          const o = (row * grid.nx + ix) * 4;
          if (img[o + 3] < 128) continue;
          const id = Math.round(img[o] / CLASS_STEP) * CLASS_STEP;
          const cls = CLASS_BY_ID[id];
          if (!cls || !cls.kind) continue;
          const idx = iy * grid.nx + ix;
          classes[idx] = id;
          if (cls.kind === 'opaque') buildings[idx] = img[o + 1];
          else foliage[idx] = img[o + 1];
        }
      }
      return { classes, foliage, buildings };
    },
  };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/** Boite englobant la grille. */
export function gridBbox(grid) {
  return {
    s: grid.lat0,
    w: grid.lon0,
    n: gridLat(grid, grid.ny - 1),
    e: gridLon(grid, grid.nx - 1),
  };
}

/** Cout previsionnel, en tuiles et en secondes. */
export function estimateClutter(bbox, buildingBbox) {
  const veg = tileBbox(bbox, TILE_DEG.vegetation).length;
  const bld = buildingBbox ? tileBbox(buildingBbox, TILE_DEG.batiments).length : 0;
  const tiles = veg + bld;
  // Les requetes sont espacees de 1,5 s pour respecter les creneaux Overpass.
  return { tiles, vegTiles: veg, bldTiles: bld, seconds: Math.ceil(tiles * 2) };
}

const sigOf = (grid, bbox, buildingBbox) =>
  [
    grid.lat0.toFixed(4),
    grid.lon0.toFixed(4),
    grid.nx,
    grid.ny,
    Math.round(grid.step),
    buildingBbox ? 'b' : 'v',
  ].join('_');

/**
 * Telecharge et rasterise la couverture du sol sur la grille fournie.
 *
 * @param {object} o
 * @param {object} o.grid         specification de grille (voir dem.js)
 * @param {object} o.buildingBbox zone ou les batiments sont demandes, ou null
 * @param {function} o.onProgress ({done, total, layer}) => void
 */
export async function fetchClutter({ grid, buildingBbox, onProgress, signal }) {
  const bbox = gridBbox(grid);
  const key = sigOf(grid, bbox, buildingBbox);

  const cached = await idbGet(key);
  if (cached?.foliage?.length === grid.nx * grid.ny) {
    onProgress?.({ done: 1, total: 1, layer: 'cache' });
    return { ...cached, fromCache: true };
  }

  const painter = makePainter(grid);
  const vegTiles = tileBbox(bbox, TILE_DEG.vegetation);
  const bldTiles = buildingBbox ? tileBbox(buildingBbox, TILE_DEG.batiments) : [];
  const total = vegTiles.length + bldTiles.length;
  let done = 0;
  let failed = 0;
  let fromCache = 0;
  let elements = 0;

  let unavailable = false;

  const run = async (tiles, query, layer, deg) => {
    for (const t of tiles) {
      if (signal?.aborted) throw new DOMException('Annule', 'AbortError');
      if (unavailable) {
        // Le service est tombe : compter les tuiles restantes comme manquantes
        // sans les demander. Insister ne ferait que remplir la console.
        failed += tiles.length - tiles.indexOf(t);
        done = total;
        onProgress?.({ done, total, layer });
        return;
      }

      let res;
      try {
        res = await loadTile(layer, t, deg, query(t), {
          signal,
          // Overpass impose parfois une attente de plusieurs dizaines de
          // secondes : la taire donnerait l impression d un blocage.
          onWait: ({ ms }) => onProgress?.({ done, total, layer, waitingMs: ms }),
        });
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        if (err instanceof OverpassUnavailableError) {
          unavailable = true;
          failed += tiles.length - tiles.indexOf(t);
          done = total;
          onProgress?.({ done, total, layer });
          return;
        }
        throw err;
      }

      if (res.shapes) {
        elements += res.shapes.length;
        if (res.cached) fromCache++;
        painter.paint(res.shapes); // dessine puis oublie : la memoire ne croit pas
      } else {
        failed++;
      }
      done++;
      onProgress?.({ done, total, layer });
    }
  };

  await run(vegTiles, VEG_QUERY, 'vegetation', TILE_DEG.vegetation);
  await run(bldTiles, BLD_QUERY, 'batiments', TILE_DEG.batiments);

  const raster = painter.read();
  const result = {
    ...raster,
    stats: {
      tiles: total,
      failed,
      fromCache,
      elements,
      unavailable,
      hasBuildings: bldTiles.length > 0,
    },
  };
  await idbPut(key, result);
  return result;
}

/** Part de la grille couverte par chaque classe, pour l affichage. */
export function clutterSummary(classes) {
  const counts = {};
  let covered = 0;
  for (let i = 0; i < classes.length; i++) {
    const id = classes[i];
    if (!id) continue;
    covered++;
    counts[id] = (counts[id] || 0) + 1;
  }
  return {
    coveredRatio: classes.length ? covered / classes.length : 0,
    byClass: Object.entries(counts).map(([id, n]) => ({
      label: CLASS_BY_ID[id]?.label ?? '?',
      ratio: n / classes.length,
    })),
  };
}
