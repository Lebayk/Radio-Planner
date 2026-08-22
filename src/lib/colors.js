// Echelles de couleur partagees par la carte, la table et les graphiques.

/** Vert / orange / rouge selon la marge, seuils 15 dB et 5 dB. */
export function marginColor(m) {
  if (!Number.isFinite(m)) return '#52525b';
  if (m >= 15) return '#22c55e';
  if (m >= 5) return '#f59e0b';
  return '#ef4444';
}

export function marginLabel(m) {
  if (!Number.isFinite(m)) return 'inconnue';
  if (m >= 15) return 'confortable';
  if (m >= 5) return 'juste';
  return 'insuffisante';
}

// Rampe continue pour la carte de chaleur, exprimee en dB de marge.
const RAMP = [
  [-25, [69, 10, 10]],
  [-10, [153, 27, 27]],
  [0, [239, 68, 68]],
  [5, [249, 115, 22]],
  [10, [234, 179, 8]],
  [15, [163, 230, 53]],
  [25, [34, 197, 94]],
  [40, [16, 122, 66]],
];

/** Couleur RGB interpolee pour une marge donnee. */
export function heatRgb(value) {
  if (!Number.isFinite(value)) return null;
  if (value <= RAMP[0][0]) return RAMP[0][1];
  const last = RAMP[RAMP.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < RAMP.length; i++) {
    if (value <= RAMP[i][0]) {
      const [v0, c0] = RAMP[i - 1];
      const [v1, c1] = RAMP[i];
      const t = (value - v0) / (v1 - v0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return last[1];
}

export function heatCss(value, alpha = 1) {
  const c = heatRgb(value);
  if (!c) return 'transparent';
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/** Bornes de la legende de la carte de chaleur. */
export const HEAT_STOPS = RAMP.map(([v]) => v);
