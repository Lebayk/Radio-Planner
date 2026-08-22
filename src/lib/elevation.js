// Acces aux MNT libres, avec mise en cache agressive en localStorage.
// C est le goulot d etranglement de l application : tout ce qui a deja ete
// telecharge doit le rester.
//
// Contrainte determinante : l application est 100 % cote client, donc chaque
// service doit renvoyer un en-tete CORS. L API publique d OpenTopoData,
// pourtant la plus complete, n en envoie aucun : elle est inutilisable depuis
// un navigateur sans instance auto-hebergee (voir OPENTOPODATA_BASE).

/** Base OpenTopoData personnalisee (instance auto-hebergee avec CORS actif). */
const OTD_KEY = 'lrp.otd.base';
export const getOpenTopoDataBase = () => {
  try {
    return localStorage.getItem(OTD_KEY) || '';
  } catch {
    return '';
  }
};
export const setOpenTopoDataBase = (url) => {
  try {
    if (url) localStorage.setItem(OTD_KEY, url.replace(/\/+$/, ''));
    else localStorage.removeItem(OTD_KEY);
  } catch {
    /* ignore */
  }
};

export const PROVIDERS = [
  {
    id: 'ign',
    label: 'IGN RGE ALTI (France)',
    hint: 'Le plus precis pour la France : 1 a 5 m de resolution. Hors territoire francais, bascule automatiquement sur un MNT mondial.',
    kind: 'ign',
    batch: 200,
    interval: 250,
    resolution: 5,
  },
  {
    id: 'openelevation',
    label: 'Open-Elevation SRTM 30 m (mondial)',
    hint: 'Couverture mondiale entre 60 N et 56 S, resolution 30 m. Bon compromis par defaut hors de France.',
    kind: 'openelevation',
    batch: 500,
    interval: 300,
    resolution: 30,
  },
  {
    id: 'openmeteo',
    label: 'Copernicus GLO-90 (mondial)',
    hint: 'Couverture mondiale complete via Open-Meteo, resolution 90 m. Modele de surface : la canopee et le bati y sont partiellement inclus.',
    kind: 'openmeteo',
    batch: 100,
    interval: 250,
    resolution: 90,
  },
  {
    id: 'eudem25m',
    label: 'OpenTopoData EU-DEM 25 m',
    hint: "Necessite une instance OpenTopoData auto-hebergee : l'API publique n'envoie pas d'en-tete CORS et sera bloquee par le navigateur.",
    kind: 'opentopodata',
    dataset: 'eudem25m',
    batch: 100,
    interval: 1050,
    resolution: 25,
    needsSelfHost: true,
  },
  {
    id: 'srtm30m',
    label: 'OpenTopoData SRTM 30 m',
    hint: "Necessite une instance OpenTopoData auto-hebergee (meme limitation CORS).",
    kind: 'opentopodata',
    dataset: 'srtm30m',
    batch: 100,
    interval: 1050,
    resolution: 30,
    needsSelfHost: true,
  },
];

export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Ordre de repli automatique en cas d echec ou d absence de couverture. */
export const FALLBACK_ORDER = {
  ign: ['openelevation', 'openmeteo'],
  openelevation: ['openmeteo', 'ign'],
  openmeteo: ['openelevation'],
  eudem25m: ['ign', 'openelevation'],
  srtm30m: ['openelevation', 'openmeteo'],
};

// ---------------------------------------------------------------------------
// Cache localStorage, decoupe en tuiles de 0,01 degre (~1,1 km)
// ---------------------------------------------------------------------------

const TILE = 0.01;
const PREFIX = 'lrp.dem.';
const KEY_DEC = 5; // ~1,1 m de resolution de cle

const tileKey = (provider, lat, lon) =>
  `${PREFIX}${provider}.${Math.floor(lat / TILE)}_${Math.floor(lon / TILE)}`;

const ptKey = (lat, lon) => `${lat.toFixed(KEY_DEC)},${lon.toFixed(KEY_DEC)}`;

/**
 * Precision de stockage. Les valeurs sont arrondies AUSSI BIEN a l ecriture du
 * cache qu au retour des appels reseau : sans cela, un premier balayage
 * (valeurs brutes) et le suivant (valeurs relues, arrondies) ne donnent pas
 * exactement les memes exclusions de plans d eau. 0,1 m reste tres en dessous
 * de la precision reelle de n importe quel MNT.
 */
const quantize = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

const memTiles = new Map(); // key -> { obj, dirty }

function loadTile(key) {
  const cached = memTiles.get(key);
  if (cached) return cached;
  let obj = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) obj = JSON.parse(raw);
  } catch {
    obj = {};
  }
  const entry = { obj, dirty: false };
  memTiles.set(key, entry);
  return entry;
}

function flushTiles() {
  for (const [key, entry] of memTiles) {
    if (!entry.dirty) continue;
    try {
      localStorage.setItem(key, JSON.stringify(entry.obj));
      entry.dirty = false;
    } catch {
      // Quota depasse : on purge la moitie du cache et on reessaie une fois.
      // Le cache en memoire reste valable pour la session en cours.
      pruneCache(0.5);
      try {
        localStorage.setItem(key, JSON.stringify(entry.obj));
      } catch {
        /* on abandonne la persistance de cette tuile */
      }
      entry.dirty = false;
    }
  }
}

/** Supprime une fraction des tuiles en cache, les plus volumineuses d abord. */
export function pruneCache(fraction = 1) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  keys.sort(
    (a, b) => (localStorage.getItem(b)?.length ?? 0) - (localStorage.getItem(a)?.length ?? 0)
  );
  const n = Math.ceil(keys.length * fraction);
  for (let i = 0; i < n; i++) {
    localStorage.removeItem(keys[i]);
    memTiles.delete(keys[i]);
  }
}

export function cacheStats() {
  let tiles = 0;
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        tiles++;
        bytes += (localStorage.getItem(k)?.length ?? 0) * 2;
      }
    }
  } catch {
    /* ignore */
  }
  return { tiles, bytes };
}

export function clearCache() {
  pruneCache(1);
  memTiles.clear();
}

function cacheGet(provider, lat, lon) {
  const { obj } = loadTile(tileKey(provider, lat, lon));
  return obj[ptKey(lat, lon)];
}

function cacheSet(provider, lat, lon, value) {
  const entry = loadTile(tileKey(provider, lat, lon));
  entry.obj[ptKey(lat, lon)] = quantize(value);
  entry.dirty = true;
}

// ---------------------------------------------------------------------------
// Limiteur de debit, par fournisseur
// ---------------------------------------------------------------------------

const lastCall = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rateLimited(providerId, fn) {
  const interval = PROVIDER_BY_ID[providerId]?.interval ?? 300;
  const wait = (lastCall.get(providerId) ?? 0) + interval - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(providerId, Date.now());
  return fn();
}

// ---------------------------------------------------------------------------
// Appels reseau
// ---------------------------------------------------------------------------

class RateLimitError extends Error {}
export class NoCoverageError extends Error {}

/** IGN Geoplateforme. Renvoie -99999 hors couverture (France + DROM). */
async function fetchIGN(pts, signal) {
  const lon = pts.map((p) => p.lon.toFixed(6)).join('|');
  const lat = pts.map((p) => p.lat.toFixed(6)).join('|');
  const url =
    'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json' +
    `?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&delimiter=%7C&zonly=true`;
  const res = await fetch(url, { signal });
  if (res.status === 429 || res.status === 503) throw new RateLimitError('IGN sature');
  if (!res.ok) throw new Error(`IGN : HTTP ${res.status}`);
  const json = await res.json();
  const list = json.elevations ?? [];
  if (list.length !== pts.length) throw new Error('IGN : reponse de taille inattendue');
  return list.map((e) => {
    const z = typeof e === 'number' ? e : e?.z;
    return !Number.isFinite(z) || z <= -99998 ? null : z;
  });
}

/** Open-Elevation (SRTM 30 m). POST pour accepter de gros lots. */
async function fetchOpenElevation(pts, signal) {
  const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      locations: pts.map((p) => ({ latitude: +p.lat.toFixed(6), longitude: +p.lon.toFixed(6) })),
    }),
    signal,
  });
  if (res.status === 429) throw new RateLimitError('Open-Elevation sature');
  if (!res.ok) throw new Error(`Open-Elevation : HTTP ${res.status}`);
  const json = await res.json();
  const list = json.results ?? [];
  if (list.length !== pts.length) throw new Error('Open-Elevation : reponse de taille inattendue');
  return list.map((r) => (Number.isFinite(r?.elevation) ? r.elevation : null));
}

/** Open-Meteo (Copernicus DEM GLO-90). 100 coordonnees par requete. */
async function fetchOpenMeteo(pts, signal) {
  const url =
    'https://api.open-meteo.com/v1/elevation' +
    `?latitude=${pts.map((p) => p.lat.toFixed(6)).join(',')}` +
    `&longitude=${pts.map((p) => p.lon.toFixed(6)).join(',')}`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new RateLimitError('Open-Meteo sature');
  if (!res.ok) throw new Error(`Open-Meteo : HTTP ${res.status}`);
  const json = await res.json();
  const list = json.elevation ?? [];
  if (list.length !== pts.length) throw new Error('Open-Meteo : reponse de taille inattendue');
  return list.map((z) => (Number.isFinite(z) ? z : null));
}

/** OpenTopoData : uniquement sur instance auto-hebergee (CORS). */
async function fetchOpenTopoData(dataset, pts, signal) {
  const base = getOpenTopoDataBase();
  if (!base) {
    throw new Error(
      "OpenTopoData exige une instance auto-hebergee : l'API publique n'envoie pas d'en-tete CORS."
    );
  }
  const locations = pts.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join('|');
  const url = `${base}/v1/${dataset}?locations=${encodeURIComponent(locations)}&interpolation=bilinear`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new RateLimitError('OpenTopoData sature');
  if (!res.ok) throw new Error(`OpenTopoData ${dataset} : HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 'OK') throw new Error(json.error || `OpenTopoData ${dataset} : reponse invalide`);
  return json.results.map((r) => (Number.isFinite(r?.elevation) ? r.elevation : null));
}

function fetchBatch(providerId, pts, signal) {
  const p = PROVIDER_BY_ID[providerId];
  switch (p.kind) {
    case 'ign':
      return fetchIGN(pts, signal);
    case 'openelevation':
      return fetchOpenElevation(pts, signal);
    case 'openmeteo':
      return fetchOpenMeteo(pts, signal);
    case 'opentopodata':
      return fetchOpenTopoData(p.dataset, pts, signal);
    default:
      throw new Error(`Fournisseur inconnu : ${providerId}`);
  }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/** Volume de travail restant pour ce jeu de points. */
export function estimateRequests(providerId, points) {
  const p = PROVIDER_BY_ID[providerId] ?? PROVIDERS[0];
  let missing = 0;
  for (const pt of points) {
    if (cacheGet(providerId, pt.lat, pt.lon) === undefined) missing++;
  }
  const requests = Math.ceil(missing / p.batch);
  return { missing, requests, batch: p.batch, seconds: Math.ceil((requests * p.interval) / 1000) };
}

/**
 * Recupere les altitudes de `points` (tableau de {lat, lon}).
 * Renvoie un Float32Array aligne sur l entree ; NaN = donnee absente.
 *
 * Le repli est decide lot par lot : un echec reseau, mais aussi un lot
 * entierement hors couverture (cas typique de l IGN au-dela des frontieres),
 * declenchent le passage au fournisseur suivant.
 */
export async function fetchElevations(providerId, points, opts = {}) {
  const { onProgress, signal, allowFallback = true } = opts;
  const out = new Float32Array(points.length).fill(NaN);
  const todo = [];
  const warnings = [];

  for (let i = 0; i < points.length; i++) {
    const hit = cacheGet(providerId, points[i].lat, points[i].lon);
    if (hit !== undefined) out[i] = hit === null ? NaN : hit;
    else todo.push(i);
  }

  let activeProvider = providerId;
  const batchSize = PROVIDER_BY_ID[activeProvider].batch;
  const total = Math.ceil(todo.length / batchSize);
  let done = 0;

  onProgress?.({ done: 0, total, cached: points.length - todo.length, provider: activeProvider });

  for (let s = 0; s < todo.length; s += batchSize) {
    if (signal?.aborted) throw new DOMException('Annule', 'AbortError');
    const idxs = todo.slice(s, s + batchSize);
    const pts = idxs.map((i) => points[i]);

    let values = null;
    let usedProvider = activeProvider;
    let lastErr = null;
    const chain = [activeProvider, ...(allowFallback ? (FALLBACK_ORDER[activeProvider] ?? []) : [])];

    for (const prov of chain) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const v = await rateLimited(prov, () => fetchBatch(prov, pts, signal));
          // Un lot integralement vide signale une absence de couverture.
          if (v.every((x) => x === null) && chain.indexOf(prov) < chain.length - 1) {
            throw new NoCoverageError(`${PROVIDER_BY_ID[prov].label} ne couvre pas cette zone`);
          }
          values = v;
          usedProvider = prov;
          break;
        } catch (err) {
          if (err.name === 'AbortError') throw err;
          lastErr = err;
          if (err instanceof RateLimitError) {
            await sleep(1200 * (attempt + 1));
            continue;
          }
          break;
        }
      }
      if (values) break;
    }

    if (!values) {
      throw new Error(
        `Echec du telechargement des altitudes : ${lastErr?.message ?? 'erreur reseau'}.`
      );
    }

    if (usedProvider !== activeProvider) {
      warnings.push(
        `Repli sur ${PROVIDER_BY_ID[usedProvider].label} : ${PROVIDER_BY_ID[activeProvider].label} ` +
          `est indisponible ou ne couvre pas la zone.`
      );
      activeProvider = usedProvider;
    }

    for (let j = 0; j < idxs.length; j++) {
      const v = quantize(values[j] ?? null);
      out[idxs[j]] = v === null ? NaN : v;
      // On indexe sur le fournisseur reellement interroge, pour ne pas
      // memoriser des valeurs sous une mauvaise etiquette.
      cacheSet(usedProvider, pts[j].lat, pts[j].lon, v);
    }

    done++;
    onProgress?.({ done, total, cached: points.length - todo.length, provider: activeProvider });
  }

  flushTiles();

  let nodata = 0;
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) nodata++;
  if (nodata) {
    warnings.push(
      `${nodata} point(s) sans donnee d altitude (${((nodata / out.length) * 100).toFixed(1)} %). ` +
        `La zone sort peut-etre de la couverture du modele choisi.`
    );
  }

  return { values: out, warnings: [...new Set(warnings)], provider: activeProvider };
}

/** Altitude d un point unique (clic carte, saisie manuelle). */
export async function fetchSingle(providerId, point, opts = {}) {
  const { values } = await fetchElevations(providerId, [point], opts);
  return values[0];
}
