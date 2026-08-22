// Persistance de la configuration en localStorage.

const KEY = 'lrp.config.v1';

export const DEFAULT_CONFIG = {
  tx: { name: 'Emetteur', lat: 45.7797, lon: 4.7965, height: 2, gain: 3 },
  rx: { name: 'Recepteur', lat: 45.8125, lon: 4.8462, height: 2, gain: 3 },
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
