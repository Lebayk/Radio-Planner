// Exports : GPX, KML et rapport PDF.
//
// Modules purs (pas de contexte React) : la langue voyage explicitement via
// `data.lang`, lue par l appelant (App.jsx) depuis `useI18n()`. A defaut,
// tout repli en francais pour ne rien casser si l appelant l omet.

import { PRESET_BY_ID, REGION_BY_ID, erp, eirp, erpLimitFor, assessLink } from './radio.js';
import { PROVIDER_BY_ID } from './elevation.js';
import { toDMS, bearing, formatBearing, haversine } from './geo.js';
import { tFor } from './strings.js';
import { buildXlsx } from './xlsx.js';

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
// Classeur de calcul (.xlsx)
// ---------------------------------------------------------------------------

/** Arrondi d affichage, `null` si la valeur n est pas un nombre exploitable. */
const num = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/**
 * Classeur reprenant l integralite des calculs, feuille par feuille.
 *
 * Le rapport PDF resume ce qu il faut retenir ; ce classeur donne les nombres
 * bruts, y compris ceux que l interface n affiche jamais : le profil
 * d elevation point par point, les 120 emplacements du classement, et le
 * detail de chaque hauteur d antenne testee sur chacun d eux.
 */
export async function exportXlsx(data) {
  const { tx, rx, relay, radio, search, provider, result, top, chain, direct, cover, lang = 'fr' } = data;
  const tt = (key, vars) => tFor(lang, key, vars);
  const preset = PRESET_BY_ID[radio.preset];
  const region = REGION_BY_ID[radio.region];
  const yesNo = (b) => tt(b ? 'xlsx.row.yes' : 'xlsx.row.no');
  const sheets = [];

  // --- Synthese -----------------------------------------------------------
  const summary = [[tt('xlsx.col.parameter'), tt('xlsx.col.value')]];
  const row = (k, v) => summary.push([k, v]);

  row(tt('xlsx.row.generatedAt'), new Date().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US'));

  row(tt('xlsx.row.section.sites'), '');
  for (const [label, s] of [
    [tt('export.pdf.tx'), tx],
    [tt('export.pdf.rx'), rx],
  ]) {
    row(`${label} - ${tt('site.name')}`, s.name);
    row(`${label} - ${tt('xlsx.col.lat')}`, num(s.lat, 6));
    row(`${label} - ${tt('xlsx.col.lon')}`, num(s.lon, 6));
    row(`${label} - ${tt('xlsx.col.elevM')}`, num(s.elev, 1));
    row(`${label} - ${tt('xlsx.col.mastM')}`, num(s.height, 1));
    row(`${label} - ${tt('site.antennaGain')} (dBi)`, num(s.gain, 1));
  }
  row(tt('search.linkDistance') + ' (km)', num(haversine(tx, rx) / 1000, 3));
  row(tt('search.linkBearing') + ' (deg)', num(bearing(tx, rx), 1));

  row(tt('xlsx.row.section.radio'), '');
  row(tt('radio.region'), tt(`radio.region.${region.id}.label`));
  row(tt('radio.freq') + ' (MHz)', num(radio.freq, 3));
  row(tt('radio.preset'), preset.label);
  row(tt('link.row.rssi') + ' - sensibilite (dBm)', num(preset.sens, 1));
  row(tt('radio.txPower') + ' (dBm)', num(radio.power, 1));
  row(tt('radio.relayPower') + ' (dBm)', num(radio.relayPower, 1));
  row(tt('radio.relayGain') + ' (dBi)', num(radio.relayGain, 1));
  row(tt('radio.cableLoss') + ' (dB)', num(radio.cableLoss, 1));
  row(tt('radio.eirp') + ' (dBm)', num(eirp(radio.power, Math.max(tx.gain, rx.gain), radio.cableLoss), 2));
  row(tt('radio.erp') + ' (dBm)', num(erp(radio.power, Math.max(tx.gain, rx.gain), radio.cableLoss), 2));
  row(tt('export.pdf.regLimit') + ' (dBm ERP)', num(erpLimitFor(radio.region, radio.freq), 1));
  row(tt('radio.desiredMargin') + ' (dB)', num(radio.desiredMargin, 1));

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
    row(tt('xlsx.row.section.result'), '');
    row(tt('xlsx.row.verdict'), v.label);
    row(tt('xlsx.row.verdictReason'), v.reason);
    if (relay) {
      row(`${tt('export.pdf.relayRetained')} - ${tt('xlsx.col.lat')}`, num(relay.lat, 6));
      row(`${tt('export.pdf.relayRetained')} - ${tt('xlsx.col.lon')}`, num(relay.lon, 6));
      row(`${tt('export.pdf.relayRetained')} - ${tt('xlsx.col.elevM')}`, num(relay.elev, 1));
    }
    row(tt('xlsx.row.relayHeight'), num(result.height, 1));
    row(tt('xlsx.row.marginMedian'), num(result.margin, 2));
    row(tt('xlsx.row.margin95'), num(result.margin95, 2));
    row(tt('xlsx.row.sigma'), num(v.sigma, 2));
    row(tt('xlsx.row.minClearance'), num(result.clearance * 100, 1));
    row(tt('link.row.vegetation') + ' (dB)', num(result.foliage, 2));
    if (direct) {
      row(tt('xlsx.row.directMargin'), num(direct.margin, 2));
      row(tt('xlsx.row.directDiffraction'), num(direct.diffraction, 2));
      row(tt('xlsx.row.relayGainDb'), num(result.margin - direct.margin, 2));
    }
  }

  if (chain?.nodes?.length) {
    row(tt('xlsx.row.section.chain'), '');
    row(tt('xlsx.row.chainRelays'), chain.relays);
    row(tt('xlsx.row.chainMargin95'), num(chain.margin95, 2));
    row(tt('xlsx.row.chainFeasible'), yesNo(chain.feasible));
  }

  row(tt('xlsx.row.section.scan'), '');
  row(tt('export.pdf.dem'), PROVIDER_BY_ID[provider]?.label ?? provider);
  row(tt('xlsx.row.searchRadius'), num(search.radius, 0));
  row(tt('xlsx.row.gridStep'), num(search.step, 0));
  row(tt('xlsx.row.heightsTested'), search.heights.join(', '));
  row(tt('xlsx.row.clutter'), yesNo(search.clutter));
  row(tt('xlsx.row.buildings'), yesNo(search.clutter && search.buildings));
  if (data.stats) {
    row(tt('xlsx.row.candidates'), data.stats.candidates);
    row(tt('xlsx.row.evaluated'), data.stats.evaluated);
    row(tt('xlsx.row.excludedSlope'), data.stats.excludedSlope);
    row(tt('xlsx.row.excludedWater'), data.stats.excludedWater);
    row(tt('xlsx.row.excludedNoData'), data.stats.excludedNoData);
    row(tt('xlsx.row.computeMs'), data.stats.ms);
  }
  row(tt('xlsx.note.disclaimer'), disclaimerShort(lang));
  sheets.push({ name: tt('xlsx.sheet.summary'), rows: summary });

  // --- Bilan de liaison, terme par terme ----------------------------------
  if (result) {
    const { hop1, hop2 } = result;
    const lb = [[tt('xlsx.col.quantity'), tt('link.hop1'), tt('link.hop2')]];
    const pair = (label, a, b, d = 2) => lb.push([label, num(a, d), num(b, d)]);
    pair(tt('xlsx.col.distKm'), hop1.distM / 1000, hop2.distM / 1000, 3);
    pair(tt('link.row.fspl') + ' (dB)', hop1.fspl, hop2.fspl);
    pair(tt('link.row.diffraction') + ' (dB)', hop1.diffraction, hop2.diffraction);
    pair(tt('link.row.vegetation') + ' (dB)', hop1.foliage, hop2.foliage);
    pair(tt('link.row.vegetation') + ' (m)', hop1.foliageDepth, hop2.foliageDepth, 1);
    pair(tt('link.row.vParam'), hop1.v, hop2.v, 3);
    pair(tt('link.row.rssi') + ' (dBm)', hop1.rssi, hop2.rssi);
    pair(tt('link.row.fresnelClear') + ' (%)', hop1.clearance * 100, hop2.clearance * 100, 1);
    pair(tt('xlsx.row.marginMedian'), hop1.margin, hop2.margin);
    pair(tt('xlsx.row.margin95'), hop1.margin95, hop2.margin95);
    pair(tt('xlsx.row.sigma'), hop1.sigma, hop2.sigma);
    pair(tt('xlsx.col.scoreDb'), hop1.scored, hop2.scored);
    pair(`${tt('xlsx.col.mastM')} - ${tt('xlsx.col.from')}`, hop1.zA, hop2.zA, 1);
    pair(`${tt('xlsx.col.mastM')} - ${tt('xlsx.col.to')}`, hop1.zB, hop2.zB, 1);
    sheets.push({ name: tt('xlsx.sheet.linkBudget'), rows: lb });
  }

  // --- Formules : le bilan refait pas a pas, en formules vivantes ----------
  //
  // Chaque grandeur calculee est ecrite comme une vraie formule de tableur
  // referencant les lignes d entree. Changer la frequence ou la puissance
  // dans le classeur recalcule tout le bilan, sans repasser par l application.
  if (result) {
    const F = [];
    const push = (label, b, c, unit, formula) => {
      F.push([label, b, c, unit, formula ?? '']);
      return F.length; // numero de ligne, en-tete comprise
    };
    const sec = (key) => push(tt(key), '', '', '', '');

    F.push([
      tt('xlsx.f.col.quantity'),
      tt('link.hop1'),
      tt('link.hop2'),
      tt('xlsx.f.col.unit'),
      tt('xlsx.f.col.formula'),
    ]);

    // Abscisse et hauteur de l arete dominante, relues sur les series : ce
    // sont les entrees geometriques du calcul de diffraction.
    const edgeOf = (hop) => {
      const s = hop?.series;
      const i = hop?.worstIdx ?? -1;
      if (!s || i < 0 || i >= s.dist.length) return null;
      return { d1: s.dist[i], h: s.terrain[i] - s.los[i] };
    };
    const e1 = edgeOf(result.hop1);
    const e2 = edgeOf(result.hop2);

    sec('xlsx.f.section.inputs');
    const rFreq = push(tt('xlsx.f.freq'), num(radio.freq, 4), num(radio.freq, 4), 'MHz');
    const rLambda = push(
      tt('xlsx.f.lambda'),
      { f: `299792458/(B${rFreq}*1000000)`, v: num(299792458 / (radio.freq * 1e6), 6) },
      { f: `299792458/(C${rFreq}*1000000)`, v: num(299792458 / (radio.freq * 1e6), 6) },
      'm',
      'lambda = c / f'
    );
    const rDist = push(
      tt('xlsx.f.dist'),
      num(result.hop1.distM / 1000, 5),
      num(result.hop2.distM / 1000, 5),
      'km'
    );
    const rPower = push(tt('xlsx.f.txPower'), num(radio.power, 2), num(radio.relayPower, 2), 'dBm');
    const rGa = push(tt('xlsx.f.gA'), num(tx.gain, 2), num(radio.relayGain, 2), 'dBi');
    const rGb = push(tt('xlsx.f.gB'), num(radio.relayGain, 2), num(rx.gain, 2), 'dBi');
    const rCable = push(tt('xlsx.f.cableLoss'), num(radio.cableLoss, 2), num(radio.cableLoss, 2), 'dB');
    const rSens = push(tt('xlsx.f.sensitivity'), num(preset.sens, 2), num(preset.sens, 2), 'dBm');
    const rK = push(tt('xlsx.f.kFactor'), num(4 / 3, 6), num(4 / 3, 6), '');
    const rFoliage = push(
      tt('xlsx.f.foliageDepth'),
      num(result.hop1.foliageDepth, 2),
      num(result.hop2.foliageDepth, 2),
      'm'
    );

    sec('xlsx.f.section.obstacle');
    const rD1 = push(
      tt('xlsx.f.d1'),
      e1 ? num(e1.d1, 5) : tt('xlsx.f.noEdge'),
      e2 ? num(e2.d1, 5) : tt('xlsx.f.noEdge'),
      'km'
    );
    const rD2 = push(
      tt('xlsx.f.d2'),
      e1 ? { f: `B${rDist}-B${rD1}`, v: num(result.hop1.distM / 1000 - e1.d1, 5) } : '',
      e2 ? { f: `C${rDist}-C${rD1}`, v: num(result.hop2.distM / 1000 - e2.d1, 5) } : '',
      'km',
      'd2 = d - d1'
    );
    const rH = push(
      tt('xlsx.f.obstacleH'),
      e1 ? num(e1.h, 3) : '',
      e2 ? num(e2.h, 3) : '',
      'm'
    );

    sec('xlsx.f.section.geometry');
    const bulge = (col) => `${col}${rD1}*${col}${rD2}/(12.75*${col}${rK})`;
    push(
      tt('xlsx.f.bulge'),
      e1 ? { f: bulge('B'), v: num((e1.d1 * (result.hop1.distM / 1000 - e1.d1)) / (12.75 * (4 / 3)), 3) } : '',
      e2 ? { f: bulge('C'), v: num((e2.d1 * (result.hop2.distM / 1000 - e2.d1)) / (12.75 * (4 / 3)), 3) } : '',
      'm',
      'b = d1*d2 / (12,75*k)'
    );
    const fresnel = (col) =>
      `17.31*SQRT(${col}${rD1}*${col}${rD2}/((${col}${rFreq}/1000)*${col}${rDist}))`;
    const fresnelVal = (hop, e) =>
      e ? 17.31 * Math.sqrt((e.d1 * (hop.distM / 1000 - e.d1)) / ((radio.freq / 1000) * (hop.distM / 1000))) : null;
    push(
      tt('xlsx.f.fresnelR'),
      e1 ? { f: fresnel('B'), v: num(fresnelVal(result.hop1, e1), 3) } : '',
      e2 ? { f: fresnel('C'), v: num(fresnelVal(result.hop2, e2), 3) } : '',
      'm',
      'r1 = 17,31*RACINE(d1*d2 / (f_GHz*d))'
    );
    const vF = (col) =>
      `${col}${rH}*SQRT(2*(${col}${rD1}*1000+${col}${rD2}*1000)/(${col}${rLambda}*${col}${rD1}*1000*${col}${rD2}*1000))`;
    const rV = push(
      tt('xlsx.f.vParam'),
      e1 ? { f: vF('B'), v: num(result.hop1.v, 4) } : '',
      e2 ? { f: vF('C'), v: num(result.hop2.v, 4) } : '',
      '',
      'v = h*RACINE(2*(d1+d2) / (lambda*d1*d2))'
    );
    const jvF = (col) =>
      `IF(${col}${rV}<=-0.78,0,6.9+20*LOG10(SQRT((${col}${rV}-0.1)^2+1)+${col}${rV}-0.1))`;
    const jv = (v) => (!Number.isFinite(v) || v <= -0.78 ? 0 : 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1));
    push(
      tt('xlsx.f.jv'),
      e1 ? { f: jvF('B'), v: num(jv(result.hop1.v), 3) } : '',
      e2 ? { f: jvF('C'), v: num(jv(result.hop2.v), 3) } : '',
      'dB',
      'J(v) = 6,9 + 20*LOG10(RACINE((v-0,1)^2+1) + v - 0,1)'
    );

    sec('xlsx.f.section.losses');
    const rFspl = push(
      tt('xlsx.f.fsplRow'),
      { f: `20*LOG10(B${rDist})+20*LOG10(B${rFreq})+32.44`, v: num(result.hop1.fspl, 3) },
      { f: `20*LOG10(C${rDist})+20*LOG10(C${rFreq})+32.44`, v: num(result.hop2.fspl, 3) },
      'dB',
      'FSPL = 20*LOG10(d_km) + 20*LOG10(f_MHz) + 32,44'
    );
    // La diffraction totale reste une valeur calculee : voir la note en bas de
    // feuille, la construction de Deygout est recursive.
    const rDiff = push(
      tt('xlsx.f.diffTotal'),
      num(result.hop1.diffraction, 3),
      num(result.hop2.diffraction, 3),
      'dB'
    );
    const folF = (col) =>
      `IF(${col}${rFoliage}<=0,0,POWER(${col}${rFreq}/1000,0.284)*IF(MIN(${col}${rFoliage},400)<=14,` +
      `0.45*MIN(${col}${rFoliage},400),1.33*POWER(MIN(${col}${rFoliage},400),0.588)))`;
    const rFol = push(
      tt('xlsx.f.foliageRow'),
      { f: folF('B'), v: num(result.hop1.foliage, 3) },
      { f: folF('C'), v: num(result.hop2.foliage, 3) },
      'dB',
      'L = f_GHz^0,284 * (0,45*d si d<=14 m, sinon 1,33*d^0,588)'
    );

    sec('xlsx.f.section.budget');
    const rssiF = (col) =>
      `${col}${rPower}+${col}${rGa}+${col}${rGb}-2*${col}${rCable}-${col}${rFspl}-${col}${rDiff}-${col}${rFol}`;
    const rRssi = push(
      tt('xlsx.f.rssi'),
      { f: rssiF('B'), v: num(result.hop1.rssi, 3) },
      { f: rssiF('C'), v: num(result.hop2.rssi, 3) },
      'dBm',
      'RSSI = Pe + Ge + Gr - 2*Lcable - FSPL - Ldiff - Lfeuillage'
    );
    const rMargin = push(
      tt('xlsx.f.marginRow'),
      { f: `B${rRssi}-B${rSens}`, v: num(result.hop1.margin, 3) },
      { f: `C${rRssi}-C${rSens}`, v: num(result.hop2.margin, 3) },
      'dB',
      'Marge = RSSI - sensibilite'
    );
    const sigF = (col) =>
      `MIN(9.5,5.5+2.5*MIN(1,${col}${rFoliage}/200)+IF(${col}${rDiff}>15,1.5,0))`;
    const rSigma = push(
      tt('xlsx.f.sigmaRow'),
      { f: sigF('B'), v: num(result.hop1.sigma, 3) },
      { f: sigF('C'), v: num(result.hop2.sigma, 3) },
      'dB',
      'sigma = MIN(9,5 ; 5,5 + 2,5*MIN(1 ; profondeur/200) + 1,5 si Ldiff>15)'
    );
    push(
      tt('xlsx.f.margin95Row'),
      { f: `B${rMargin}-1.6449*B${rSigma}`, v: num(result.hop1.margin95, 3) },
      { f: `C${rMargin}-1.6449*C${rSigma}`, v: num(result.hop2.margin95, 3) },
      'dB',
      'Marge95 = Marge - 1,6449*sigma'
    );
    const rClear = push(
      tt('xlsx.f.clearanceRow'),
      num(result.hop1.clearance * 100, 3),
      num(result.hop2.clearance * 100, 3),
      '%',
      'degagement / r1'
    );
    const penF = (col) => `IF(${col}${rClear}>=60,0,(60-MAX(0,${col}${rClear}))/60*6)`;
    const pen = (c) => (c >= 0.6 ? 0 : ((0.6 - Math.max(0, c)) / 0.6) * 6);
    const rPen = push(
      tt('xlsx.f.penaltyRow'),
      { f: penF('B'), v: num(pen(result.hop1.clearance), 3) },
      { f: penF('C'), v: num(pen(result.hop2.clearance), 3) },
      'dB',
      '0 dB a 60 % de degagement, 6 dB a 0 %'
    );
    push(
      tt('xlsx.f.scoreRow'),
      { f: `B${rMargin}-1.6449*B${rSigma}-B${rPen}`, v: num(result.hop1.scored, 3) },
      { f: `C${rMargin}-1.6449*C${rSigma}-C${rPen}`, v: num(result.hop2.scored, 3) },
      'dB',
      'Score = Marge95 - penalite'
    );

    F.push(['', '', '', '', '']);
    F.push([tt('xlsx.f.note.live'), '', '', '', '']);
    F.push([tt('xlsx.f.note.deygout'), '', '', '', '']);
    F.push([tt('xlsx.f.note.profile'), '', '', '', '']);

    sheets.push({ name: tt('xlsx.sheet.formulas'), rows: F });
  }

  // --- Chaine de relais ----------------------------------------------------
  if (chain?.hops?.length && chain.nodes?.length > 1) {
    const labelOf = (i) => (i === 0 ? 'TX' : i === chain.nodes.length - 1 ? 'RX' : `R${i}`);
    const rows = [
      [
        tt('xlsx.col.hop'),
        tt('xlsx.col.from'),
        tt('xlsx.col.latFrom'),
        tt('xlsx.col.lonFrom'),
        tt('xlsx.col.elevFrom'),
        tt('xlsx.col.mastFrom'),
        tt('xlsx.col.to'),
        tt('xlsx.col.latTo'),
        tt('xlsx.col.lonTo'),
        tt('xlsx.col.elevTo'),
        tt('xlsx.col.mastTo'),
        tt('xlsx.col.bearingDeg'),
        tt('xlsx.col.distKm'),
        tt('xlsx.col.fresnelPct'),
        tt('xlsx.col.foliageDb'),
        tt('xlsx.col.diffractionDb'),
        tt('xlsx.col.rssiDbm'),
        tt('xlsx.col.marginDb'),
        tt('xlsx.col.margin95Db'),
      ],
    ];
    chain.hops.forEach((h, i) => {
      const a = chain.nodes[i];
      const b = chain.nodes[i + 1];
      if (!a || !b) return;
      rows.push([
        `${labelOf(i)} -> ${labelOf(i + 1)}`,
        labelOf(i),
        num(a.lat, 6),
        num(a.lon, 6),
        num(a.elev, 1),
        num(a.height, 1),
        labelOf(i + 1),
        num(b.lat, 6),
        num(b.lon, 6),
        num(b.elev, 1),
        num(b.height, 1),
        num(bearing(a, b), 1),
        num(h ? h.distM / 1000 : null, 3),
        num(h ? h.clearance * 100 : null, 1),
        num(h?.foliage, 2),
        num(h?.diffraction, 2),
        num(h?.rssi, 2),
        num(h?.margin, 2),
        num(h?.margin95, 2),
      ]);
    });
    sheets.push({ name: tt('xlsx.sheet.chain'), rows });
  }

  // --- Classement complet --------------------------------------------------
  if (top?.length) {
    const rows = [
      [
        tt('xlsx.col.rank'),
        tt('xlsx.col.lat'),
        tt('xlsx.col.lon'),
        tt('xlsx.col.elevM'),
        tt('xlsx.col.slopeDeg'),
        tt('xlsx.col.dTxKm'),
        tt('xlsx.col.dRxKm'),
        tt('xlsx.col.mastM'),
        tt('xlsx.col.m1'),
        tt('xlsx.col.m2'),
        tt('xlsx.col.marginDb'),
        tt('xlsx.col.margin95Db'),
        tt('xlsx.col.scoreDb'),
        tt('xlsx.col.c1'),
        tt('xlsx.col.c2'),
        tt('xlsx.col.rssi1'),
        tt('xlsx.col.rssi2'),
        tt('xlsx.col.diff1'),
        tt('xlsx.col.diff2'),
        tt('xlsx.col.foliageDb'),
      ],
    ];
    top.forEach((r, i) => {
      const b = r.best;
      rows.push([
        i + 1,
        num(r.lat, 6),
        num(r.lon, 6),
        num(r.elev, 1),
        num(r.slope, 2),
        num(r.d1 / 1000, 3),
        num(r.d2 / 1000, 3),
        num(b.h, 1),
        num(b.m1, 2),
        num(b.m2, 2),
        num(b.margin, 2),
        num(b.margin95, 2),
        num(b.score, 2),
        num(b.c1 * 100, 1),
        num(b.c2 * 100, 1),
        num(b.rssi1, 2),
        num(b.rssi2, 2),
        num(b.diff1, 2),
        num(b.diff2, 2),
        num(b.foliage, 2),
      ]);
    });
    sheets.push({ name: tt('xlsx.sheet.ranking'), rows });

    // Detail par hauteur : ces bilans sont bien calcules pour chaque site,
    // mais l interface n en montre jamais que le meilleur.
    const byH = [
      [
        tt('xlsx.col.rank'),
        tt('xlsx.col.lat'),
        tt('xlsx.col.lon'),
        tt('xlsx.col.mastM'),
        tt('xlsx.col.isBest'),
        tt('xlsx.col.m1'),
        tt('xlsx.col.m2'),
        tt('xlsx.col.marginDb'),
        tt('xlsx.col.margin95Db'),
        tt('xlsx.col.scoreDb'),
        tt('xlsx.col.c1'),
        tt('xlsx.col.c2'),
        tt('xlsx.col.rssi1'),
        tt('xlsx.col.rssi2'),
        tt('xlsx.col.diff1'),
        tt('xlsx.col.diff2'),
        tt('xlsx.col.foliageDb'),
      ],
    ];
    top.forEach((r, i) => {
      for (const h of r.byHeight ?? []) {
        byH.push([
          i + 1,
          num(r.lat, 6),
          num(r.lon, 6),
          num(h.h, 1),
          yesNo(h.h === r.best.h),
          num(h.m1, 2),
          num(h.m2, 2),
          num(h.margin, 2),
          num(h.margin95, 2),
          num(h.score, 2),
          num(h.c1 * 100, 1),
          num(h.c2 * 100, 1),
          num(h.rssi1, 2),
          num(h.rssi2, 2),
          num(h.diff1, 2),
          num(h.diff2, 2),
          num(h.foliage, 2),
        ]);
      }
    });
    if (byH.length > 1) sheets.push({ name: tt('xlsx.sheet.rankingByHeight'), rows: byH });
  }

  // --- Balayage en hauteur d antenne --------------------------------------
  if (data.sweep?.length) {
    const rows = [
      [
        tt('xlsx.col.mastM'),
        tt('xlsx.col.m1'),
        tt('xlsx.col.m2'),
        tt('xlsx.col.marginDb'),
        tt('xlsx.col.margin95Db'),
        tt('xlsx.col.scoreDb'),
        tt('xlsx.col.c1'),
        tt('xlsx.col.c2'),
      ],
    ];
    for (const s of data.sweep) {
      rows.push([
        num(s.height, 1),
        num(s.m1, 2),
        num(s.m2, 2),
        num(s.margin, 2),
        num(s.margin95, 2),
        num(s.score, 2),
        num(s.c1 * 100, 1),
        num(s.c2 * 100, 1),
      ]);
    }
    sheets.push({ name: tt('xlsx.sheet.heights'), rows });
  }

  // --- Profils d elevation, echantillon par echantillon --------------------
  const profileSheet = (hop, name) => {
    const s = hop?.series;
    if (!s?.dist?.length) return;
    const rows = [
      [
        tt('xlsx.col.index'),
        tt('xlsx.col.distKm'),
        tt('xlsx.col.terrainM'),
        tt('xlsx.col.canopyM'),
        tt('xlsx.col.losM'),
        tt('xlsx.col.fresnelUpM'),
        tt('xlsx.col.fresnelDownM'),
        tt('xlsx.col.fresnelRadiusM'),
        tt('xlsx.col.clearanceM'),
        tt('xlsx.col.clearanceRatioPct'),
      ],
    ];
    for (let i = 0; i < s.dist.length; i++) {
      const r1 = s.fresnelUp[i] - s.los[i];
      const clear = s.los[i] - s.terrain[i];
      rows.push([
        i,
        num(s.dist[i], 4),
        num(s.terrain[i], 2),
        num(s.canopy?.[i], 2),
        num(s.los[i], 2),
        num(s.fresnelUp[i], 2),
        num(s.fresnelDown[i], 2),
        num(r1, 2),
        num(clear, 2),
        num(r1 > 0 ? (clear / r1) * 100 : null, 1),
      ]);
    }
    sheets.push({ name, rows });
  };
  profileSheet(result?.hop1, tt('xlsx.sheet.profile1'));
  profileSheet(result?.hop2, tt('xlsx.sheet.profile2'));
  profileSheet(direct, tt('xlsx.sheet.profileDirect'));

  // --- Portee par azimut ---------------------------------------------------
  if (cover?.rings?.length && cover.rays?.azimuths?.length) {
    const az = cover.rays.azimuths;
    const strong = cover.rings.find((r) => r.threshold > 0);
    const outer = cover.rings.find((r) => r.threshold === 0);
    const rows = [
      [tt('xlsx.col.azimuthDeg'), tt('xlsx.col.rangeReliableKm'), tt('xlsx.col.rangeLimitKm')],
    ];
    for (let a = 0; a < az.length; a++) {
      rows.push([
        num(az[a], 2),
        num(strong ? strong.radii[a] / 1000 : null, 3),
        num(outer ? outer.radii[a] / 1000 : null, 3),
      ]);
    }
    sheets.push({ name: tt('xlsx.sheet.coverage'), rows });
  }

  const blob = await buildXlsx(sheets);
  return makeFile(`lora-relay-calc-${stamp()}.xlsx`, blob, blob.type);
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
