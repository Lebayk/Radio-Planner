// Carte schematique pour le rapport PDF.
//
// La carte Leaflet elle-meme (tuiles OpenTopoMap/IGN) ne peut pas etre
// capturee proprement : les tuiles sont chargees sans en-tete CORS, ce qui
// « souille » le canvas et bloque `toDataURL`. On dessine donc une carte
// schematique - sans fond de plan, mais avec la geometrie exacte du calcul :
// sites, chaine de relais, enveloppe de portee, horizon radio, echelle - ce
// qui est en realite plus lisible dans un rapport imprime qu une capture de
// tuiles.

import { metersPerDeg, haversine } from './geo.js';
import { marginColor } from './colors.js';
import { tFor } from './strings.js';

const NICE_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000];

/** Le multiple « rond » le plus proche, sans depasser `maxM`. */
function niceScale(maxM) {
  let best = NICE_STEPS[0];
  for (const s of NICE_STEPS) {
    if (s <= maxM) best = s;
  }
  return best;
}

/**
 * Rend une carte schematique en PNG (data URL).
 *
 * @param {object} o
 * @param {object} o.tx  { lat, lon, name }
 * @param {object} o.rx  { lat, lon, name }
 * @param {object} o.chain  chaine de relais (nodes, hops), ou null
 * @param {object} o.relay  relais unique de secours si pas de chaine, ou null
 * @param {object} o.cover  resultat de computeCoverage (rings, center, horizonM), ou null
 * @param {number} o.width  largeur du canvas en pixels
 * @param {number} o.height  hauteur du canvas en pixels
 */
export function renderCoverageMapPNG({ tx, rx, chain, relay, cover, width = 1400, height = 900, lang = 'fr' }) {
  const nodes =
    chain?.nodes?.length > 2
      ? chain.nodes
      : [
          { ...tx, relay: false },
          ...(relay ? [{ ...relay, relay: true }] : []),
          { ...rx, relay: false },
        ];

  // --- Bornes geographiques : tous les noeuds, les anneaux de portee et
  //     l horizon radio doivent tenir dans le cadre. ------------------------
  const lats = [tx.lat, rx.lat];
  const lons = [tx.lon, rx.lon];
  for (const n of nodes) {
    lats.push(n.lat);
    lons.push(n.lon);
  }
  for (const ring of cover?.rings ?? []) {
    for (const [lat, lon] of ring.polygon) {
      lats.push(lat);
      lons.push(lon);
    }
  }

  const latMid = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mPerDeg = metersPerDeg(latMid);

  // Cercle d horizon radio : pas retourne sous forme de polygone, on le
  // construit ici pour l inclure dans les bornes et le dessin.
  let horizonPts = null;
  if (cover?.horizonM > 0 && cover?.center) {
    horizonPts = [];
    for (let a = 0; a <= 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      const dLat = ((cover.horizonM * Math.cos(rad)) / mPerDeg.lat) ;
      const dLon = ((cover.horizonM * Math.sin(rad)) / mPerDeg.lon) ;
      const lat = cover.center.lat + dLat;
      const lon = cover.center.lon + dLon;
      horizonPts.push([lat, lon]);
      lats.push(lat);
      lons.push(lon);
    }
  }

  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);

  // Projection equirectangulaire locale (metres), suffisante sur l emprise
  // de quelques dizaines de km d une carte de portee.
  const toXY = (lat, lon) => ({
    x: (lon - lonMin) * mPerDeg.lon,
    y: (latMax - lat) * mPerDeg.lat, // y croit vers le bas
  });

  const spanX = Math.max(1, (lonMax - lonMin) * mPerDeg.lon);
  const spanY = Math.max(1, (latMax - latMin) * mPerDeg.lat);

  const PAD = 70; // marge pour legende, echelle, fleche nord
  const availW = width - 2 * PAD;
  const availH = height - 2 * PAD;
  const scale = Math.min(availW / spanX, availH / spanY);

  // Centrage du contenu dans le cadre disponible.
  const offX = PAD + (availW - spanX * scale) / 2;
  const offY = PAD + (availH - spanY * scale) / 2;
  const px = (lat, lon) => {
    const { x, y } = toXY(lat, lon);
    return [offX + x * scale, offY + y * scale];
  };

  // --- Canvas ---------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fond : theme sombre coherent avec le reste de l application, mais assez
  // clair pour rester lisible imprime en niveaux de gris.
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(0, 0, width, height);

  const polyPath = (pts, close = true) => {
    ctx.beginPath();
    pts.forEach(([lat, lon], i) => {
      const [x, y] = px(lat, lon);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (close) ctx.closePath();
  };

  // Anneaux de portee : le plus large d abord (seuil le plus bas, donc le
  // moins strict), pour que l anneau fiable, plus etroit, reste dessine et
  // lisible par-dessus plutot que noye sous l orange.
  const rings = [...(cover?.rings ?? [])].sort((a, b) => a.threshold - b.threshold);
  for (const ring of rings) {
    const strong = ring.threshold > 0;
    polyPath(ring.polygon);
    // Opacite plus marquee qu a l ecran : une carte imprimee ou vue en PDF
    // n a pas la meme luminosite qu un ecran, et un remplissage a 12 %
    // devient quasi invisible sur fond sombre.
    ctx.fillStyle = strong ? 'rgba(34, 197, 94, 0.38)' : 'rgba(245, 158, 11, 0.24)';
    ctx.fill();
    ctx.strokeStyle = strong ? 'rgba(74, 222, 128, 1)' : 'rgba(251, 191, 36, 0.9)';
    ctx.lineWidth = strong ? 2.4 : 1.8;
    ctx.setLineDash(strong ? [] : [7, 5]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Horizon radio : reference geometrique pure, sans relief.
  if (horizonPts) {
    polyPath(horizonPts);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Liaisons TX->...->RX, colorees selon la marge de chaque bond si connue.
  const links =
    chain?.nodes?.length > 2
      ? chain.nodes.slice(0, -1).map((n, i) => ({
          a: n,
          b: chain.nodes[i + 1],
          margin: chain.hops?.[i]?.margin95,
        }))
      : relay
        ? [
            { a: tx, b: relay, margin: relay.m1 },
            { a: relay, b: rx, margin: relay.m2 },
          ]
        : [{ a: tx, b: rx, margin: null }];

  for (const l of links) {
    const [x1, y1] = px(l.a.lat, l.a.lon);
    const [x2, y2] = px(l.b.lat, l.b.lon);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = Number.isFinite(l.margin) ? marginColor(l.margin) : '#64748b';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    if (!Number.isFinite(l.margin)) ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Noeuds : TX/RX en bleu, relais en vert numerotes.
  const labelOf = (n, i) =>
    i === 0 ? 'TX' : i === nodes.length - 1 && nodes.length > 1 ? 'RX' : n.relay ? `R${i}` : '';

  nodes.forEach((n, i) => {
    const [x, y] = px(n.lat, n.lon);
    const isRelay = n.relay;
    const r = isRelay ? 15 : 13;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isRelay ? '#16a34a' : '#2563eb';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = `700 ${isRelay ? 11 : 12}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelOf(n, i), x, y + 0.5);
  });

  // --- Echelle ---------------------------------------------------------------
  const targetPx = width * 0.16;
  const targetM = targetPx / scale;
  const barM = niceScale(targetM);
  const barPx = barM * scale;
  const sx = PAD;
  const sy = height - 34;
  ctx.strokeStyle = '#e4e4e7';
  ctx.fillStyle = '#e4e4e7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + barPx, sy);
  ctx.moveTo(sx, sy - 5);
  ctx.lineTo(sx, sy + 5);
  ctx.moveTo(sx + barPx, sy - 5);
  ctx.lineTo(sx + barPx, sy + 5);
  ctx.stroke();
  ctx.font = '600 13px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(barM >= 1000 ? `${barM / 1000} km` : `${barM} m`, sx, sy - 8);

  // --- Fleche nord -------------------------------------------------------
  const nx = width - PAD + 10;
  const ny = 46;
  ctx.strokeStyle = '#e4e4e7';
  ctx.fillStyle = '#e4e4e7';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(nx, ny + 22);
  ctx.lineTo(nx, ny - 18);
  ctx.moveTo(nx, ny - 18);
  ctx.lineTo(nx - 6, ny - 8);
  ctx.moveTo(nx, ny - 18);
  ctx.lineTo(nx + 6, ny - 8);
  ctx.stroke();
  ctx.font = '700 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(tFor(lang, 'mapRender.north'), nx, ny - 24);

  // --- Legende -------------------------------------------------------------
  const legendItems = [];
  if (rings.length) {
    legendItems.push(['#22c55e', tFor(lang, 'mapRender.legend.reliable'), false]);
    legendItems.push(['#f59e0b', tFor(lang, 'mapRender.legend.limited'), true]);
  }
  if (horizonPts) legendItems.push(['#94a3b8', tFor(lang, 'mapRender.legend.horizon'), true]);
  legendItems.push(['#2563eb', tFor(lang, 'mapRender.legend.txRx'), false]);
  if (nodes.some((n) => n.relay)) legendItems.push(['#16a34a', tFor(lang, 'mapRender.legend.relay'), false]);

  const lx = PAD;
  let ly = PAD - 40;
  ly = 26;
  ctx.font = '600 12px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = lx;
  for (const [color, label] of legendItems) {
    ctx.fillStyle = color;
    ctx.fillRect(cx, ly - 5, 16, 10);
    ctx.fillStyle = '#e4e4e7';
    const w = ctx.measureText(label).width;
    ctx.fillText(label, cx + 22, ly);
    cx += 22 + w + 24;
  }

  return canvas.toDataURL('image/png', 0.92);
}

/** Distance totale du trajet TX -> ... -> RX, pour l annotation de la carte. */
export function chainLengthM(tx, rx, chain, relay) {
  if (chain?.nodes?.length > 2) {
    let d = 0;
    for (let i = 0; i < chain.nodes.length - 1; i++) d += haversine(chain.nodes[i], chain.nodes[i + 1]);
    return d;
  }
  if (relay) return haversine(tx, relay) + haversine(relay, rx);
  return haversine(tx, rx);
}
