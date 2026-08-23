// Persistance de la configuration en localStorage.

import { detectLang, tFor } from './strings.js';

const KEY = 'lrp.config.v1';

// Noms de site par defaut, dans la langue detectee au premier chargement :
// une valeur de champ modifiable par l utilisateur (pas un texte d interface),
// mais la voir en francais sur une interface passee en anglais se lirait
// comme un bug.
const defaultLang = detectLang();

export const DEFAULT_CONFIG = {
  tx: { name: tFor(defaultLang, 'export.tx'), lat: 45.7797, lon: 4.7965, height: 2, gain: 3 },
  rx: { name: tFor(defaultLang, 'export.rx'), lat: 45.8125, lon: 4.8462, height: 2, gain: 3 },
  radio: {
    device: 'custom',
    region: 'EU_868',
    freq: 869,
    power: 20,
    preset: 'LongFast',
    cableLoss: 0,
    desiredMargin: 10,
    relayGain: 3,
    relayPower: 20,
  },
  search: {
    heights: [2, 6, 10, 15],
    radius: 500,
    step: 50,
    exclude: true,
    clutter: true,
    buildings: true,
    maxRelays: 4,
  },
  coverage: {
    nodeHeight: 2,
    nodeGain: 3,
    radiusKm: 15,
    azimuths: 72,
  },
  // Recherche du meilleur relais pour couvrir une zone. `zone` reste nul tant
  // que l utilisateur n en a pas trace une ; la fusion defensive ci-dessous
  // ignore les objets non typables, d ou le traitement explicite plus bas.
  area: {
    zone: null,
    relayHeight: 10,
    candidateStep: 400,
    testStep: 400,
    gridStep: 100,
  },
  provider: 'ign',
  ui: { heatmap: true, candidates: true, coverage: true, chain: true },
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Fusion defensive : une config sauvegardee obsolete ne doit pas casser l app. */
function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return structuredClone(base);
  const out = structuredClone(base);
  for (const key of Object.keys(base)) {
    const s = saved[key];
    if (s === undefined || s === null) continue;
    if (Array.isArray(base[key])) {
      if (Array.isArray(s)) out[key] = s.filter(isNum);
    } else if (base[key] === null) {
      // Defaut nul (la zone a couvrir, tant qu aucune n est tracee) : il n y a
      // pas de gabarit a fusionner, seulement une valeur a valider. Sans ce
      // cas, la fusion recursive appellerait Object.keys(null).
      if (typeof s === 'object' && Object.values(s).every(isNum)) out[key] = { ...s };
    } else if (typeof base[key] === 'object') {
      out[key] = merge(base[key], s);
    } else if (typeof s === typeof base[key]) {
      out[key] = s;
    }
  }
  return out;
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    return merge(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

export function resetConfig() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return structuredClone(DEFAULT_CONFIG);
}
