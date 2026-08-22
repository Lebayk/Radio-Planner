// Exports : GPX, KML et rapport PDF.
//
// Modules purs (pas de contexte React) : la langue voyage explicitement via
// `data.lang`, lue par l appelant (App.jsx) depuis `useI18n()`. A defaut,
// tout repli en francais pour ne rien casser si l appelant l omet.

import { PRESET_BY_ID, REGION_BY_ID, erp, eirp, erpLimitFor, assessLink } from './radio.js';
import { PROVIDER_BY_ID } from './elevation.js';
import { toDMS, bearing, formatBearing } from './geo.js';
import { tFor } from './strings.js';

export function disclaimerShort(lang = 'fr') {
  return tFor(lang, 'export.disclaimerShort');
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Prepare un fichier telechargeable et renvoie de quoi l offrir a l utilisateur.
 *
 * Volontairement, **aucun clic n est declenche par script** : un clic programme
 * sur une ancre est refuse par plusieurs navigateurs des qu il ne se rattache
 * plus clairement a une action de l utilisateur - typiquement apres un `await`,
 * ou quand le blocage des telechargements automatiques est actif. Le fichier
 * est donc simplement construit, et l interface l expose comme une vraie ancre
 * `<a download>` sur laquelle l utilisateur clique lui-meme : c est le seul
 * chemin de telechargement qui ne soit jamais bloque.
 *
 * L appelant revoque l URL quand il n en a plus besoin.
 */
export function makeFile(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  return {
    name: filename,
    url: URL.createObjectURL(blob),
    size: blob.size,
    type: blob.type,
  };
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/**
 * Points de la liaison, dans l ordre TX -> relais... -> RX.
 *
 * Une chaine peut compter plusieurs relais : on l exporte en entier, sinon le
 * fichier decrirait un trajet qui n existe pas.
 */
function linkPoints(tx, rx, relay, chain, lang) {
  if (chain?.nodes?.length > 2) {
    return withBearings(
      chain.nodes.map((n, i) => {
        if (i === 0) {
          return { name: tx.name || 'TX', lat: n.lat, lon: n.lon, ele: n.elev, role: tFor(lang, 'export.tx'), kind: 'tx' };
        }
        if (i === chain.nodes.length - 1) {
          return { name: rx.name || 'RX', lat: n.lat, lon: n.lon, ele: n.elev, role: tFor(lang, 'export.rx'), kind: 'rx' };
        }
        return {
          name: tFor(lang, 'export.relayNameN', { n: i }),
          lat: n.lat,
          lon: n.lon,
          ele: n.elev,
          role: tFor(lang, 'export.relayRoleN', { n: i, total: chain.relays, h: n.height }),
          kind: 'relay',
        };
      }),
      lang
    );
  }

  const pts = [
    { name: tx.name || 'TX', lat: tx.lat, lon: tx.lon, ele: tx.elev, role: tFor(lang, 'export.tx'), kind: 'tx' },
    { name: rx.name || 'RX', lat: rx.lat, lon: rx.lon, ele: rx.elev, role: tFor(lang, 'export.rx'), kind: 'rx' },
  ];
  if (relay) {
    pts.splice(1, 0, {
      name: tFor(lang, 'export.relayName'),
      lat: relay.lat,
      lon: relay.lon,
      ele: relay.elev,
      role: tFor(lang, 'export.relayRole', { h: relay.height }),
      kind: 'relay',
    });
  }
  return withBearings(pts, lang);
}

/**
 * Ajoute a chaque point le cap exact a viser depuis cet endroit : en avant
 * vers le suivant, en arriere vers le precedent. TX ne regarde qu en avant,
 * RX qu en arriere ; un relais intermediaire peut avoir besoin des deux s il
 * est directionnel. Calcule sur le grand cercle (nord vrai), pas une simple
 * reciproque a 180 deg.
 */
function withBearings(pts, lang) {
  return pts.map((p, i) => {
    const caps = [];
    if (i < pts.length - 1)
      caps.push(tFor(lang, 'export.capTowards', { name: pts[i + 1].name, cap: formatBearing(bearing(p, pts[i + 1])) }));
    if (i > 0)
      caps.push(tFor(lang, 'export.capTowards', { name: pts[i - 1].name, cap: formatBearing(bearing(p, pts[i - 1])) }));
    return caps.length ? { ...p, role: `${p.role}${tFor(lang, 'export.antennaCap', { caps: caps.join(' / ') })}` } : p;
  });
}

// ---------------------------------------------------------------------------
// GPX
// ---------------------------------------------------------------------------

export function buildGpx({ tx, rx, relay, chain, lang = 'fr' }) {
  const pts = linkPoints(tx, rx, relay, chain, lang);
  const wpts = pts
    .map(
      (p) =>
        `  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">\n` +
        (Number.isFinite(p.ele) ? `    <ele>${p.ele.toFixed(1)}</ele>\n` : '') +
        `    <name>${esc(p.name)}</name>\n` +
        `    <desc>${esc(p.role)}</desc>\n` +
        `    <sym>Radio Beacon</sym>\n` +
        `  </wpt>`
    )
    .join('\n');

  const trkpts = pts
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">` +
        (Number.isFinite(p.ele) ? `<ele>${p.ele.toFixed(1)}</ele>` : '') +
        `</trkpt>`
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="LoRa Relay Planner" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata>\n    <name>${esc(tFor(lang, 'export.linkName', { tx: tx.name, rx: rx.name }))}</name>\n` +
    `    <desc>${esc(disclaimerShort(lang))}</desc>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n` +
    `${wpts}\n` +
    `  <trk>\n    <name>${esc(tFor(lang, 'export.radioTrack'))}</name>\n    <trkseg>\n${trkpts}\n    </trkseg>\n  </trk>\n` +
    `</gpx>\n`
  );
}

export function exportGpx(data) {
  return makeFile(`lora-relay-${stamp()}.gpx`, buildGpx(data), 'application/gpx+xml');
}

// ---------------------------------------------------------------------------
// KML
// ---------------------------------------------------------------------------

export function buildKml({ tx, rx, relay, result, chain, desiredMargin = 10, lang = 'fr' }) {
  const pts = linkPoints(tx, rx, relay, chain, lang);
  const coordStr = pts
    .map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)},${Number.isFinite(p.ele) ? p.ele.toFixed(1) : 0}`)
    .join(' ');

  const placemarks = pts
    .map((p) => {
      const style = p.kind === 'relay' ? '#relais' : '#site';
      const desc = [
        p.role,
        Number.isFinite(p.ele) ? tFor(lang, 'export.groundAltitude', { e: p.ele.toFixed(0) }) : null,
        `${toDMS(p.lat, true)} / ${toDMS(p.lon, false)}`,
      ]
        .filter(Boolean)
        .join('\n');
      return (
        `    <Placemark>\n      <name>${esc(p.name)}</name>\n` +
        `      <description>${esc(desc)}</description>\n` +
        `      <styleUrl>${style}</styleUrl>\n` +
        `      <Point><coordinates>${p.lon.toFixed(6)},${p.lat.toFixed(6)},${
          Number.isFinite(p.ele) ? p.ele.toFixed(1) : 0
        }</coordinates></Point>\n    </Placemark>`
      );
    })
    .join('\n');

  const v = result
    ? assessLink({
        margin: result.margin,
        margin95: result.margin95,
        clearance: result.clearance,
        desiredMargin,
        foliage: result.foliage,
        lang,
      })
    : null;
  const summary = result
    ? `${v.label.toUpperCase()}\n\n${v.reason}\n\n` +
      `${tFor(lang, 'export.kml.hop1Margin', { v: result.hop1.margin.toFixed(1) })}\n` +
      `${tFor(lang, 'export.kml.hop2Margin', { v: result.hop2.margin.toFixed(1) })}\n` +
      `${tFor(lang, 'export.kml.overallMedian', { v: result.margin.toFixed(1) })}\n` +
      `${tFor(lang, 'export.kml.held95', { v: result.margin95.toFixed(1) })}\n` +
      tFor(lang, 'export.kml.foliage', { v: (result.foliage ?? 0).toFixed(1) })
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n` +
    `    <name>${esc(tFor(lang, 'export.linkName', { tx: tx.name, rx: rx.name }))}</name>\n` +
    `    <description>${esc(summary + (summary ? '\n\n' : '') + disclaimerShort(lang))}</description>\n` +
    `    <Style id="site"><IconStyle><color>ff8b4513</color><scale>1.1</scale>` +
    `<Icon><href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href></Icon></IconStyle></Style>\n` +
    `    <Style id="relais"><IconStyle><color>ff22c55e</color><scale>1.3</scale>` +
    `<Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-stars.png</href></Icon></IconStyle></Style>\n` +
    `    <Style id="lien"><LineStyle><color>ff22c55e</color><width>3</width></LineStyle></Style>\n` +
    `${placemarks}\n` +
    `    <Placemark>\n      <name>${esc(tFor(lang, 'export.radioTrack'))}</name>\n      <styleUrl>#lien</styleUrl>\n` +
    `      <LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString>\n` +
    `    </Placemark>\n  </Document>\n</kml>\n`
  );
}

export function exportKml(data) {
  return makeFile(
    `lora-relay-${stamp()}.kml`,
    buildKml({ ...data, desiredMargin: data.radio?.desiredMargin }),
    'application/vnd.google-earth.kml+xml'
  );
}

// ---------------------------------------------------------------------------
// Rapport PDF
// ---------------------------------------------------------------------------

const fmt = (v, d = 1, unit = '') =>
  Number.isFinite(v) ? `${v.toFixed(d)}${unit ? ' ' + unit : ''}` : '-';

/**
 * jsPDF pese 360 ko : il reste charge a la demande, mais l import est mis en
 * cache et preclenchable. Sans cela, le `await` du premier export intervient
 * apres le clic et le navigateur peut refuser le telechargement qui suit.
 */
let jsPdfPromise = null;
export function preloadPdf() {
  if (!jsPdfPromise) jsPdfPromise = import('jspdf');
  return jsPdfPromise;
}

/**
 * @param {object} data configuration + resultats
 * @param {object} images { profile1, profile2, heights } dataURL PNG facultatifs
 */
export async function exportPdf(data, images = {}) {
  const { jsPDF } = await preloadPdf();
  const { tx, rx, relay, radio, search, provider, result, top, chain, direct, lang = 'fr' } = data;
  const tt = (key, vars) => tFor(lang, key, vars);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 15;
  let y = M;

  const preset = PRESET_BY_ID[radio.preset];
  const region = REGION_BY_ID[radio.region];

  const line = (h = 5) => {
    y += h;
    if (y > 275) {
      doc.addPage();
      y = M;
    }
  };

  const heading = (text, size = 12) => {
    line(3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(20, 20, 20);
    doc.text(text, M, y);
    doc.setDrawColor(200);
    doc.line(M, y + 1.5, W - M, y + 1.5);
    line(7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
  };

  const kv = (rows) => {
    for (const [k, v] of rows) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110, 110, 110);
      doc.text(String(k), M, y);
      doc.setTextColor(20, 20, 20);
      doc.text(String(v), M + 55, y);
      line(4.6);
    }
  };

  // En-tete
  doc.setFillColor(15, 20, 30);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('LoRa Relay Planner', M, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(180, 190, 205);
  doc.text(
    tt('export.pdf.studyTitle', { date: new Date().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') }),
    M,
    18.5
  );
  y = 34;
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);

  if (result) {
    const v = assessLink({
      margin: result.margin,
      margin95: result.margin95,
      clearance: result.clearance,
      desiredMargin: radio.desiredMargin,
      foliage: result.foliage,
      sigma: Math.max(result.hop1?.sigma ?? 0, result.hop2?.sigma ?? 0),
      lang,
    });
    const fill = { ok: [232, 248, 238], warn: [255, 246, 224], error: [253, 232, 234] }[v.tone];
    const ink = { ok: [21, 105, 63], warn: [140, 90, 10], error: [160, 30, 45] }[v.tone];
    const body = doc.splitTextToSize(v.reason, W - 2 * M - 8);
    const vegLine = doc.splitTextToSize(
      tt('export.pdf.medianMarginLine', {
        m50: v.margin50.toFixed(1),
        m95: v.margin95.toFixed(1),
        sigma: v.sigma.toFixed(1),
        foliage:
          result.foliage > 0.5
            ? tt('export.pdf.foliageCrossed', { v: result.foliage.toFixed(1) })
            : tt('export.pdf.noFoliage'),
      }),
      W - 2 * M - 8
    );
    const boxH = 16 + body.length * 4 + vegLine.length * 3.6;
    doc.setFillColor(...fill);
    doc.setDrawColor(...ink);
    doc.roundedRect(M, y, W - 2 * M, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...ink);
    doc.text(v.label.toUpperCase(), M + 4, y + 8);
    doc.setFontSize(11);
    doc.text(
      `${result.margin >= 0 ? '+' : ''}${result.margin.toFixed(1)} dB`,
      W - M - 4,
      y + 8,
      { align: 'right' }
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(50, 50, 50);
    doc.text(body, M + 4, y + 14);
    doc.setFontSize(7.5);
    doc.setTextColor(95, 95, 95);
    doc.text(vegLine, M + 4, y + 14 + body.length * 4);
    y += boxH + 2;
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
  }

  // Cap exact a viser depuis TX et RX : vers le premier relais de la chaine
  // s il y en a une, sinon le relais unique, sinon l un vers l autre en
  // liaison directe. Calcule sur le grand cercle (nord vrai).
  const isChainRoute = chain?.nodes?.length > 2;
  const txTarget = isChainRoute ? chain.nodes[1] : relay || rx;
  const rxTarget = isChainRoute ? chain.nodes[chain.nodes.length - 2] : relay || tx;
  const capOf = (origin, target) => (target ? formatBearing(bearing(origin, target)) : '-');

  heading(tt('export.pdf.sites'));
  kv([
    [
      tt('export.pdf.tx'),
      tt('export.pdf.txLine', {
        name: tx.name,
        lat: tx.lat.toFixed(5),
        lon: tx.lon.toFixed(5),
        elev: fmt(tx.elev, 0, 'm'),
        h: tx.height,
        gain: tx.gain,
        cap: capOf(tx, txTarget),
      }),
    ],
    [
      tt('export.pdf.rx'),
      tt('export.pdf.txLine', {
        name: rx.name,
        lat: rx.lat.toFixed(5),
        lon: rx.lon.toFixed(5),
        elev: fmt(rx.elev, 0, 'm'),
        h: rx.height,
        gain: rx.gain,
        cap: capOf(rx, rxTarget),
      }),
    ],
  ]);
  if (relay) {
    const d1 = result?.hop1?.distM;
    const d2 = result?.hop2?.distM;
    kv([
      [
        tt('export.pdf.relayRetained'),
        tt('export.pdf.relayLine', {
          lat: relay.lat.toFixed(5),
          lon: relay.lon.toFixed(5),
          elev: fmt(relay.elev, 0, 'm'),
          h: relay.height,
          gain: radio.relayGain,
          capTx: capOf(relay, tx),
          capRx: capOf(relay, rx),
        }),
      ],
    ]);
    if (Number.isFinite(d1) && Number.isFinite(d2)) {
      kv([
        [
          tt('export.pdf.distances'),
          tt('export.pdf.distancesLine', {
            d1: fmt(d1 / 1000, 2, 'km'),
            d2: fmt(d2 / 1000, 2, 'km'),
            total: fmt((d1 + d2) / 1000, 2, 'km'),
          }),
        ],
      ]);
    }
  }
  if (!isChainRoute && (relay || result)) {
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(tt('export.pdf.declinationNote'), M, y);
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    line(5);
  }

  // La chaine est la solution recommandee : sans elle le rapport decrit une
  // liaison a relais unique qui n est pas celle que l on preconise.
  if (chain?.nodes?.length > 2) {
    heading(tt('export.pdf.chainTitle'));
    const labelOf = (i) =>
      i === 0 ? 'TX' : i === chain.nodes.length - 1 ? 'RX' : `R${i}`;

    kv([
      [
        tt('export.pdf.chainRelaysN', { n: chain.relays }),
        (chain.feasible ? tt('export.pdf.chainAtteint') : tt('export.pdf.chainNonAtteint')) +
          tt('export.pdf.chainSummaryLine', { margin: fmt(chain.margin95, 1, 'dB'), target: chain.target }),
      ],
    ]);

    chain.nodes.forEach((n, i) => {
      if (!n.relay) return;
      const dPrev = chain.hops?.[i - 1]?.distM;
      const dNext = chain.hops?.[i]?.distM;
      kv([
        [
          labelOf(i),
          tt('export.pdf.nodeLine', {
            lat: n.lat.toFixed(5),
            lon: n.lon.toFixed(5),
            elev: fmt(n.elev, 0, 'm'),
            h: n.height,
            dPrev: fmt(dPrev / 1000, 2, 'km'),
            prevLabel: labelOf(i - 1),
            dNext: fmt(dNext / 1000, 2, 'km'),
            nextLabel: labelOf(i + 1),
            capPrev: capOf(n, chain.nodes[i - 1]),
            capNext: capOf(n, chain.nodes[i + 1]),
          }),
        ],
      ]);
    });

    line(1);
    const hCols = [M, M + 28, M + 60, M + 82, M + 108, M + 132];
    doc.setFont('helvetica', 'bold');
    [
      tt('export.pdf.col.hop'),
      tt('export.pdf.col.cap'),
      tt('export.pdf.col.distance'),
      tt('export.pdf.col.vegetation'),
      tt('export.pdf.col.fresnel'),
      tt('export.pdf.col.margin95'),
    ].forEach((h, i) => doc.text(h, hCols[i], y));
    line(4.6);
    doc.setFont('helvetica', 'normal');
    (chain.hops || []).forEach((h, i) => {
      if (!h) return;
      const vals = [
        `${labelOf(i)} -> ${labelOf(i + 1)}`,
        capOf(chain.nodes[i], chain.nodes[i + 1]),
        fmt(h.distM / 1000, 2, 'km'),
        h.foliage > 0.5 ? fmt(h.foliage, 1, 'dB') : '-',
        fmt(h.clearance * 100, 0, '%'),
        fmt(h.margin95, 1, 'dB'),
      ];
      vals.forEach((v, j) => doc.text(v, hCols[j], y));
      line(4.6);
    });

    const total = (chain.hops || []).reduce((t, h) => t + (h?.distM ?? 0), 0);
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(8);
    doc.text(
      tt('export.pdf.chainFooter', {
        total: fmt(total / 1000, 2, 'km'),
        direct: fmt((direct?.distM ?? 0) / 1000, 2, 'km'),
      }),
      M,
      y
    );
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    line(5);
  }

  heading(tt('export.pdf.radioParams'));
  const eirpVal = eirp(radio.power, Math.max(tx.gain, rx.gain), radio.cableLoss);
  const erpVal = erp(radio.power, Math.max(tx.gain, rx.gain), radio.cableLoss);
  const limit = erpLimitFor(radio.region, radio.freq);
  const regionLabel = tt(`radio.region.${region.id}.label`);
  kv([
    [tt('export.pdf.regionFreq'), tt('export.pdf.regionFreqLine', { region: regionLabel, freq: radio.freq })],
    [tt('radio.preset'), tt('export.pdf.presetLine', { preset: preset.label, sf: preset.sf, bw: preset.bw, sens: preset.sens })],
    [tt('export.pdf.power'), tt('export.pdf.powerLine', { power: radio.power, eirp: fmt(eirpVal, 1, 'dBm'), erp: fmt(erpVal, 1, 'dBm') })],
    [
      tt('export.pdf.regLimit'),
      tt('export.pdf.regLimitLine', { limit, over: erpVal > limit ? tt('export.pdf.overSuffix') : '' }),
    ],
    [tt('export.pdf.cableLoss'), tt('export.pdf.cableLossLine', { db: radio.cableLoss })],
    [tt('export.pdf.desiredMargin'), `${radio.desiredMargin} dB`],
    [tt('export.pdf.dem'), PROVIDER_BY_ID[provider]?.label ?? provider],
    [tt('export.pdf.search'), tt('export.pdf.searchLine', { radius: search.radius, step: search.step, heights: search.heights.join(', ') })],
  ]);

  if (result) {
    heading(tt('export.pdf.linkSummary'));
    const rows = [
      ['', tt('export.pdf.hop1Col'), tt('export.pdf.hop2Col')],
      [tt('export.pdf.rowDistance'), fmt(result.hop1.distM / 1000, 2, 'km'), fmt(result.hop2.distM / 1000, 2, 'km')],
      [tt('export.pdf.rowFspl'), fmt(result.hop1.fspl, 1, 'dB'), fmt(result.hop2.fspl, 1, 'dB')],
      [tt('export.pdf.rowDiffraction'), fmt(result.hop1.diffraction, 1, 'dB'), fmt(result.hop2.diffraction, 1, 'dB')],
      [tt('export.pdf.rowRssi'), fmt(result.hop1.rssi, 1, 'dBm'), fmt(result.hop2.rssi, 1, 'dBm')],
      [tt('export.pdf.rowVegetation'), fmt(result.hop1.foliage, 1, 'dB'), fmt(result.hop2.foliage, 1, 'dB')],
      [tt('export.pdf.rowMedianMargin'), fmt(result.hop1.margin50, 1, 'dB'), fmt(result.hop2.margin50, 1, 'dB')],
      [tt('export.pdf.rowMargin95'), fmt(result.hop1.margin95, 1, 'dB'), fmt(result.hop2.margin95, 1, 'dB')],
      [tt('export.pdf.rowFresnel'), fmt(result.hop1.clearance * 100, 0, '%'), fmt(result.hop2.clearance * 100, 0, '%')],
    ];
    for (const [i, r] of rows.entries()) {
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      doc.setTextColor(i === 0 ? 20 : 110, i === 0 ? 20 : 110, i === 0 ? 20 : 110);
      doc.text(String(r[0]), M, y);
      doc.setTextColor(20, 20, 20);
      doc.text(String(r[1]), M + 60, y);
      doc.text(String(r[2]), M + 118, y);
      line(4.6);
    }
    line(1);
    doc.setFont('helvetica', 'bold');
    doc.text(tt('export.pdf.overallMargin', { v: fmt(result.margin, 1, 'dB') }), M, y);
    line(5);
    doc.setFont('helvetica', 'normal');
    if (direct) {
      doc.setTextColor(110, 110, 110);
      doc.text(
        tt('export.pdf.directRef', { margin: fmt(direct.margin, 1, 'dB'), diff: fmt(direct.diffraction, 1, 'dB') }),
        M,
        y
      );
      line(5);
      doc.setTextColor(40, 40, 40);
    }
  }

  if (top?.length) {
    heading(tt('export.pdf.ranking'));
    const head = [
      tt('export.pdf.col.n'),
      tt('export.pdf.col.lat'),
      tt('export.pdf.col.lon'),
      tt('export.pdf.col.alt'),
      tt('export.pdf.col.ht'),
      tt('export.pdf.col.dTx'),
      tt('export.pdf.col.dRx'),
      tt('export.pdf.col.b1'),
      tt('export.pdf.col.b2'),
      tt('export.pdf.col.overall'),
      tt('export.pdf.col.fresnel'),
    ];
    const cols = [M, M + 7, M + 30, M + 53, M + 65, M + 76, M + 90, M + 104, M + 118, M + 132, M + 152];
    doc.setFont('helvetica', 'bold');
    head.forEach((h, i) => doc.text(h, cols[i], y));
    line(4.6);
    doc.setFont('helvetica', 'normal');
    top.slice(0, 5).forEach((r, i) => {
      const vals = [
        String(i + 1),
        r.lat.toFixed(5),
        r.lon.toFixed(5),
        fmt(r.elev, 0),
        `${r.best.h} m`,
        fmt(r.d1 / 1000, 2),
        fmt(r.d2 / 1000, 2),
        fmt(r.best.m1, 1),
        fmt(r.best.m2, 1),
        fmt(r.best.margin, 1),
        `${fmt(Math.min(r.best.c1, r.best.c2) * 100, 0)} %`,
      ];
      vals.forEach((v, j) => doc.text(v, cols[j], y));
      line(4.6);
    });
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(8);
    doc.text(
      tt('export.pdf.rankingNote'),
      M,
      y
    );
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    line(5);
  }

  const addImage = (dataUrl, title, aspect = 0.42) => {
    if (!dataUrl) return;
    const w = W - 2 * M;
    const h = w * aspect;
    // +12 mm : marge pour le titre que `heading` va inserer juste apres.
    if (y + h + 12 > 275) {
      doc.addPage();
      y = M;
    }
    heading(title, 11);
    // Sans compression, quatre images suffisent a produire un PDF de
    // plusieurs mega-octets.
    doc.addImage(dataUrl, 'PNG', M, y, w, h, undefined, 'FAST');
    y += h;
    line(4);
  };

  // La carte en premier : c est la vue d ensemble, avant le detail des
  // profils bond par bond. Aspect 900/1400 = celui du canvas dessine.
  addImage(images.coverageMap, tt('export.pdf.mapTitle'), 900 / 1400);
  if (images.coverageMap) {
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(tt('export.pdf.mapNote'), M, y);
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    line(5);
  }

  addImage(images.profile1, tt('export.pdf.profile1Title'));
  addImage(images.profile2, tt('export.pdf.profile2Title'));
  addImage(images.heights, tt('export.pdf.heightsTitle'));

  // Avertissement
  if (y > 240) {
    doc.addPage();
    y = M;
  }
  line(4);
  doc.setFillColor(255, 244, 214);
  doc.setDrawColor(230, 190, 80);
  doc.roundedRect(M, y - 4, W - 2 * M, 26, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(120, 80, 0);
  doc.setFontSize(9);
  doc.text(tt('export.pdf.warningTitle'), M + 4, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const wrapped = doc.splitTextToSize(disclaimerShort(lang), W - 2 * M - 8);
  doc.text(wrapped, M + 4, y + 7);

  return makeFile(`rapport-lora-relay-${stamp()}.pdf`, doc.output('blob'), 'application/pdf');
}
