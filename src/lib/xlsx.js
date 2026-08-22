// Generateur de classeur .xlsx minimal, sans dependance.
//
// Un fichier xlsx est une archive ZIP de documents XML (OOXML SpreadsheetML).
// L ecrire a la main represente environ 200 lignes ; la seule alternative
// serait SheetJS, 400 ko dont le paquet npm n est plus la distribution
// maintenue par ses auteurs. Pour ecrire quelques tableaux de nombres, la
// dependance ne se justifie pas.
//
// Pourquoi xlsx plutot qu un CSV : un CSV ne porte que du texte, et le
// separateur decimal depend de la locale du tableur qui l ouvre. Le meme
// fichier s ouvre correctement d un cote et en colonne unique de l autre,
// selon qu Excel est configure en francais ou en anglais. Un xlsx stocke de
// vrais nombres : le probleme ne se pose plus, dans aucune langue.

// --- ZIP ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Deflate brut via l API du navigateur.
 *
 * `CompressionStream` manque sur quelques navigateurs anciens : on retombe
 * alors sur la methode « stored » (aucune compression), qui reste un ZIP
 * parfaitement valide, simplement plus volumineux. Mieux vaut un fichier gros
 * qu un export qui echoue.
 */
async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Date/heure au format DOS attendu par l en-tete ZIP. */
function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  raw(bytes) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }
  u16(v) {
    this.raw(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  }
  u32(v) {
    this.raw(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
  }
  blob(type) {
    return new Blob(this.chunks, { type });
  }
}

/** Archive ZIP a partir d une liste `{ name, data: Uint8Array }`. */
async function zip(files) {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime();
  const out = new ByteWriter();
  const entries = [];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const packed = await deflateRaw(f.data);
    // Un deflate qui gonflerait la donnee n a aucun interet : on garde alors
    // la version brute.
    const useDeflate = packed && packed.length < f.data.length;
    const body = useDeflate ? packed : f.data;
    const method = useDeflate ? 8 : 0;

    entries.push({ nameBytes, crc, method, comp: body.length, uncomp: f.data.length, offset: out.length });

    out.u32(0x04034b50); // signature en-tete local
    out.u16(20); // version minimale
    out.u16(0); // drapeaux
    out.u16(method);
    out.u16(time);
    out.u16(date);
    out.u32(crc);
    out.u32(body.length);
    out.u32(f.data.length);
    out.u16(nameBytes.length);
    out.u16(0); // champ extra
    out.raw(nameBytes);
    out.raw(body);
  }

  const centralStart = out.length;
  for (const e of entries) {
    out.u32(0x02014b50); // signature repertoire central
    out.u16(20); // version d ecriture
    out.u16(20); // version minimale
    out.u16(0);
    out.u16(e.method);
    out.u16(time);
    out.u16(date);
    out.u32(e.crc);
    out.u32(e.comp);
    out.u32(e.uncomp);
    out.u16(e.nameBytes.length);
    out.u16(0); // extra
    out.u16(0); // commentaire
    out.u16(0); // disque
    out.u16(0); // attributs internes
    out.u32(0); // attributs externes
    out.u32(e.offset);
    out.raw(e.nameBytes);
  }
  const centralSize = out.length - centralStart;

  out.u32(0x06054b50); // fin du repertoire central
  out.u16(0);
  out.u16(0);
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(centralSize);
  out.u32(centralStart);
  out.u16(0);

  return out.blob('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// --- SpreadsheetML -----------------------------------------------------------

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Les caracteres de controle sont interdits en XML 1.0 : les laisser
    // passer produirait un fichier que le tableur refuse d ouvrir.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

/** Index de colonne 0 -> "A", 25 -> "Z", 26 -> "AA". */
function colName(i) {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Une cellule. Les nombres partent sans attribut `t` (numerique natif), le
 * reste en chaine « inline » - ce qui evite la table `sharedStrings` sans rien
 * changer pour le lecteur.
 */
function cellXml(value, ref, bold) {
  const s = bold ? ' s="1"' : '';
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''; // NaN/Infinity : cellule vide, pas un texte trompeur
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(rows, { headerRows = 1 } = {}) {
  // Largeurs deduites du contenu : sans elles tout arrive en colonnes etroites
  // et les nombres s affichent en ####.
  const widths = [];
  for (const row of rows) {
    row.forEach((v, i) => {
      const len = v === null || v === undefined ? 0 : String(v).length;
      widths[i] = Math.max(widths[i] ?? 8, Math.min(52, len + 2));
    });
  }
  const cols = widths.length
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => cellXml(v, `${colName(c)}${r + 1}`, r < headerRows))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    cols +
    `<sheetData>${body}</sheetData>` +
    `</worksheet>`
  );
}

/**
 * Nom de feuille accepte par Excel : 31 caracteres au plus, et aucun des
 * caracteres reserves. Un nom invalide fait rejeter le classeur entier.
 */
function safeSheetName(name, used) {
  let n = String(name).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Feuille';
  let i = 2;
  while (used.has(n.toLowerCase())) {
    const suffix = ` (${i++})`;
    n = n.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(n.toLowerCase());
  return n;
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  // Excel exige que les deux premiers remplissages soient exactement ceux-ci.
  `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `</styleSheet>`;

/**
 * Construit un classeur .xlsx.
 *
 * @param {Array<{name: string, rows: Array<Array<string|number|null>>, headerRows?: number}>} sheets
 * @returns {Promise<Blob>}
 */
export async function buildXlsx(sheets) {
  const list = sheets.filter((s) => s && s.rows?.length);
  if (!list.length) throw new Error('Aucune donnee a exporter.');

  const used = new Set();
  const named = list.map((s) => ({ ...s, name: safeSheetName(s.name, used) }));

  const enc = new TextEncoder();
  const files = [];
  const add = (name, text) => files.push({ name, data: enc.encode(text) });

  add(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      named
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
      `</Types>`
  );

  add(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );

  add(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>` +
      named
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('') +
      `</sheets></workbook>`
  );

  add(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      named
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join('') +
      `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`
  );

  add('xl/styles.xml', STYLES_XML);
  named.forEach((s, i) =>
    add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows, { headerRows: s.headerRows ?? 1 }))
  );

  return zip(files);
}
