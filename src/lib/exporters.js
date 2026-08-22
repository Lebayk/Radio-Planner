// Exports : GPX, KML et rapport PDF.

import { PRESET_BY_ID, REGION_BY_ID, erp, eirp, erpLimitFor, assessLink } from './radio.js';
import { PROVIDER_BY_ID } from './elevation.js';
import { toDMS } from './geo.js';

export const DISCLAIMER_SHORT =
  'Relief IGN, vegetation et bati OpenStreetMap. Les hauteurs de couvert sont des valeurs par defaut : OSM ne renseigne presque jamais la hauteur de la vegetation, et seuls 8 % des batiments portent une hauteur. Le bruit radio local, les reflexions et la variabilite temporelle ne sont pas modelises. Toute simulation doit etre confirmee par un test terrain avec deux noeuds reels.';

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
function linkPoints(tx, rx, relay, chain) {
  if (chain?.nodes?.length > 2) {
    return chain.nodes.map((n, i) => {
      if (i === 0) {
        return { name: tx.name || 'TX', lat: n.lat, lon: n.lon, ele: n.elev, role: 'Emetteur' };
      }
      if (i === chain.nodes.length - 1) {
        return { name: rx.name || 'RX', lat: n.lat, lon: n.lon, ele: n.elev, role: 'Recepteur' };
      }
      return {
        name: `RELAIS ${i}`,
        lat: n.lat,
        lon: n.lon,
        ele: n.elev,
        role: `Relais ${i} sur ${chain.relays} (antenne ${n.height} m)`,
      };
    });
  }

  const pts = [
    { name: tx.name || 'TX', lat: tx.lat, lon: tx.lon, ele: tx.elev, role: 'Emetteur' },
    { name: rx.name || 'RX', lat: rx.lat, lon: rx.lon, ele: rx.elev, role: 'Recepteur' },
  ];
  if (relay) {
    pts.splice(1, 0, {
      name: 'RELAIS',
      lat: relay.lat,
      lon: relay.lon,
      ele: relay.elev,
      role: `Relais (antenne ${relay.height} m)`,
    });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// GPX
// ---------------------------------------------------------------------------

export function buildGpx({ tx, rx, relay, chain }) {
  const pts = linkPoints(tx, rx, relay, chain);
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
    `  <metadata>\n    <name>Liaison LoRa ${esc(tx.name)} - ${esc(rx.name)}</name>\n` +
    `    <desc>${esc(DISCLAIMER_SHORT)}</desc>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n` +
    `${wpts}\n` +
    `  <trk>\n    <name>Trajet radio</name>\n    <trkseg>\n${trkpts}\n    </trkseg>\n  </trk>\n` +
    `</gpx>\n`
  );
}

export function exportGpx(data) {
  return makeFile(`lora-relay-${stamp()}.gpx`, buildGpx(data), 'application/gpx+xml');
}

// ---------------------------------------------------------------------------
// KML
// ---------------------------------------------------------------------------

export function buildKml({ tx, rx, relay, result, chain, desiredMargin = 10 }) {
  const pts = linkPoints(tx, rx, relay, chain);
  const coordStr = pts
    .map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)},${Number.isFinite(p.ele) ? p.ele.toFixed(1) : 0}`)
    .join(' ');

  const placemarks = pts
    .map((p) => {
      const style = p.name.startsWith('RELAIS') ? '#relais' : '#site';
      const desc = [
        p.role,
        Number.isFinite(p.ele) ? `Altitude sol : ${p.ele.toFixed(0)} m` : null,
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
      })
    : null;
  const summary = result
    ? `${v.label.toUpperCase()}\n\n${v.reason}\n\n` +
      `Marge bond 1 : ${result.hop1.margin.toFixed(1)} dB\n` +
      `Marge bond 2 : ${result.hop2.margin.toFixed(1)} dB\n` +
      `Marge globale mediane : ${result.margin.toFixed(1)} dB\n` +
      `Marge tenue sur 95 % des emplacements : ${result.margin95.toFixed(1)} dB\n` +
      `Vegetation traversee : ${(result.foliage ?? 0).toFixed(1)} dB`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n` +
    `    <name>Liaison LoRa ${esc(tx.name)} - ${esc(rx.name)}</name>\n` +
    `    <description>${esc(summary + (summary ? '\n\n' : '') + DISCLAIMER_SHORT)}</description>\n` +
    `    <Style id="site"><IconStyle><color>ff8b4513</color><scale>1.1</scale>` +
    `<Icon><href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href></Icon></IconStyle></Style>\n` +
    `    <Style id="relais"><IconStyle><color>ff22c55e</color><scale>1.3</scale>` +
    `<Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-stars.png</href></Icon></IconStyle></Style>\n` +
    `    <Style id="lien"><LineStyle><color>ff22c55e</color><width>3</width></LineStyle></Style>\n` +
    `${placemarks}\n` +
    `    <Placemark>\n      <name>Trajet radio</name>\n      <styleUrl>#lien</styleUrl>\n` +
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
  const { tx, rx, relay, radio, search, provider, result, top, chain, direct } = data;

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
    `Etude d implantation de relais - ${new Date().toLocaleString('fr-FR')}`,
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
    });
    const fill = { ok: [232, 248, 238], warn: [255, 246, 224], error: [253, 232, 234] }[v.tone];
    const ink = { ok: [21, 105, 63], warn: [140, 90, 10], error: [160, 30, 45] }[v.tone];
    const body = doc.splitTextToSize(v.reason, W - 2 * M - 8);
    const vegLine = doc.splitTextToSize(
      `Marge mediane ${v.margin50.toFixed(1)} dB, tenue sur 95 % des emplacements ` +
        `${v.margin95.toFixed(1)} dB (dispersion ${v.sigma.toFixed(1)} dB). ` +
        (result.foliage > 0.5
          ? `Vegetation traversee : ${result.foliage.toFixed(1)} dB.`
          : 'Aucune vegetation traversee sur le trajet.'),
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

  heading('Sites');
  kv([
    [
      'Emetteur (TX)',
      `${tx.name} - ${tx.lat.toFixed(5)}, ${tx.lon.toFixed(5)} - sol ${fmt(tx.elev, 0, 'm')} - antenne ${tx.height} m / ${tx.gain} dBi`,
    ],
    [
      'Recepteur (RX)',
      `${rx.name} - ${rx.lat.toFixed(5)}, ${rx.lon.toFixed(5)} - sol ${fmt(rx.elev, 0, 'm')} - antenne ${rx.height} m / ${rx.gain} dBi`,
    ],
  ]);
  if (relay) {
    const d1 = result?.hop1?.distM;
    const d2 = result?.hop2?.distM;
    kv([
      [
        'Relais retenu',
        `${relay.lat.toFixed(5)}, ${relay.lon.toFixed(5)} - sol ${fmt(relay.elev, 0, 'm')} - antenne ${relay.height} m / ${radio.relayGain} dBi`,
      ],
    ]);
    if (Number.isFinite(d1) && Number.isFinite(d2)) {
      kv([
        [
          'Distances',
          `TX ${fmt(d1 / 1000, 2, 'km')} - RX ${fmt(d2 / 1000, 2, 'km')} ` +
            `(trajet total ${fmt((d1 + d2) / 1000, 2, 'km')})`,
        ],
      ]);
    }
  }

  // La chaine est la solution recommandee : sans elle le rapport decrit une
  // liaison a relais unique qui n est pas celle que l on preconise.
  if (chain?.nodes?.length > 2) {
    heading('Chaine de relais');
    const labelOf = (i) =>
      i === 0 ? 'TX' : i === chain.nodes.length - 1 ? 'RX' : `R${i}`;

    kv([
      [
        `${chain.relays} relais`,
        (chain.feasible ? 'Objectif de marge atteint' : 'Objectif non atteint') +
          ` - maillon le plus faible ${fmt(chain.margin95, 1, 'dB')} a 95 % ` +
          `(objectif ${chain.target} dB)`,
      ],
    ]);

    chain.nodes.forEach((n, i) => {
      if (!n.relay) return;
      const dPrev = chain.hops?.[i - 1]?.distM;
      const dNext = chain.hops?.[i]?.distM;
      kv([
        [
          labelOf(i),
          `${n.lat.toFixed(5)}, ${n.lon.toFixed(5)} - sol ${fmt(n.elev, 0, 'm')} - mat ${n.height} m` +
            ` - a ${fmt(dPrev / 1000, 2, 'km')} de ${labelOf(i - 1)}` +
            ` et ${fmt(dNext / 1000, 2, 'km')} de ${labelOf(i + 1)}`,
        ],
      ]);
    });

    line(1);
    const hCols = [M, M + 40, M + 68, M + 96, M + 128];
    doc.setFont('helvetica', 'bold');
    ['Bond', 'Distance', 'Vegetation', 'Fresnel', 'Marge 95 %'].forEach((h, i) =>
      doc.text(h, hCols[i], y)
    );
    line(4.6);
    doc.setFont('helvetica', 'normal');
    (chain.hops || []).forEach((h, i) => {
      if (!h) return;
      const vals = [
        `${labelOf(i)} -> ${labelOf(i + 1)}`,
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
      `Longueur cumulee du trajet : ${fmt(total / 1000, 2, 'km')}, ` +
        `contre ${fmt((direct?.distM ?? 0) / 1000, 2, 'km')} a vol d oiseau.`,
      M,
      y
    );
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    line(5);
  }

  heading('Parametres radio');
  const eirpVal = eirp(radio.power, Math.max(tx.gain, rx.gain), radio.cableLoss);
  const erpVal = erp(radio.power, Math.max(tx.gain, rx.gain), radio.cableLoss);
  const limit = erpLimitFor(radio.region, radio.freq);
  kv([
    ['Region / frequence', `${region.label} - ${radio.freq} MHz`],
    ['Preset LoRa', `${preset.label} (SF${preset.sf}, BW ${preset.bw} kHz, sensibilite ${preset.sens} dBm)`],
    ['Puissance', `${radio.power} dBm conduits - PIRE ${fmt(eirpVal, 1, 'dBm')} - ERP ${fmt(erpVal, 1, 'dBm')}`],
    ['Limite reglementaire', `${limit} dBm ERP${erpVal > limit ? '  -- DEPASSEMENT --' : ''}`],
    ['Perte cable', `${radio.cableLoss} dB par site`],
    ['Marge souhaitee', `${radio.desiredMargin} dB`],
    ['Modele numerique de terrain', PROVIDER_BY_ID[provider]?.label ?? provider],
    ['Recherche', `rayon ${search.radius} m - pas ${search.step} m - hauteurs testees ${search.heights.join(', ')} m`],
  ]);

  if (result) {
    heading('Bilan de la liaison retenue');
    const rows = [
      ['', 'Bond 1 (TX -> relais)', 'Bond 2 (relais -> RX)'],
      ['Distance', fmt(result.hop1.distM / 1000, 2, 'km'), fmt(result.hop2.distM / 1000, 2, 'km')],
      ['Perte espace libre', fmt(result.hop1.fspl, 1, 'dB'), fmt(result.hop2.fspl, 1, 'dB')],
      ['Diffraction J(v)', fmt(result.hop1.diffraction, 1, 'dB'), fmt(result.hop2.diffraction, 1, 'dB')],
      ['RSSI estime', fmt(result.hop1.rssi, 1, 'dBm'), fmt(result.hop2.rssi, 1, 'dBm')],
      ['Vegetation', fmt(result.hop1.foliage, 1, 'dB'), fmt(result.hop2.foliage, 1, 'dB')],
      ['Marge mediane', fmt(result.hop1.margin50, 1, 'dB'), fmt(result.hop2.margin50, 1, 'dB')],
      ['Marge a 95 %', fmt(result.hop1.margin95, 1, 'dB'), fmt(result.hop2.margin95, 1, 'dB')],
      ['Fresnel degagee', fmt(result.hop1.clearance * 100, 0, '%'), fmt(result.hop2.clearance * 100, 0, '%')],
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
    doc.text(`Marge globale (maillon faible) : ${fmt(result.margin, 1, 'dB')}`, M, y);
    line(5);
    doc.setFont('helvetica', 'normal');
    if (direct) {
      doc.setTextColor(110, 110, 110);
      doc.text(
        `Pour memoire, liaison directe TX-RX sans relais : marge ${fmt(direct.margin, 1, 'dB')}, ` +
          `diffraction ${fmt(direct.diffraction, 1, 'dB')}.`,
        M,
        y
      );
      line(5);
      doc.setTextColor(40, 40, 40);
    }
  }

  if (top?.length) {
    heading('Classement des emplacements');
    const head = ['#', 'Latitude', 'Longitude', 'Alt.', 'Ht', 'd TX', 'd RX', 'B1', 'B2', 'Globale', 'Fresnel'];
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
      'Marges en dB, distances en km. Ht = hauteur d antenne retenue pour ce site, ' +
        'd TX et d RX = distances aux deux extremites.',
      M,
      y
    );
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    line(5);
  }

  const addImage = (dataUrl, title) => {
    if (!dataUrl) return;
    if (y > 190) {
      doc.addPage();
      y = M;
    }
    heading(title, 11);
    const w = W - 2 * M;
    const h = w * 0.42;
    // Sans compression, trois graphiques suffisent a produire un PDF de
    // plusieurs mega-octets.
    doc.addImage(dataUrl, 'PNG', M, y, w, h, undefined, 'FAST');
    y += h;
    line(4);
  };

  addImage(images.profile1, 'Profil bond 1 : TX -> relais');
  addImage(images.profile2, 'Profil bond 2 : relais -> RX');
  addImage(images.heights, 'Marge en fonction de la hauteur d antenne du relais');

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
  doc.text('Avertissement', M + 4, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const wrapped = doc.splitTextToSize(DISCLAIMER_SHORT, W - 2 * M - 8);
  doc.text(wrapped, M + 4, y + 7);

  return makeFile(`rapport-lora-relay-${stamp()}.pdf`, doc.output('blob'), 'application/pdf');
}
