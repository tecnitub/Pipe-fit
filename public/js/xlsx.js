// Génération de classeurs Excel (.xlsx) sans bibliothèque externe : XML SpreadsheetML + archive ZIP non compressée.
// Feuille = { name, cols: [largeurs], rows: [[cellule]] } ; cellule = valeur ou { v, s } avec s parmi STYLES.
const XLSX = (() => {
  const STYLES = { text: 0, bold: 1, num: 2, boldnum: 3, title: 4, head: 5, eur: 6, boldeur: 7, total: 8, muted: 9 };
  const escXml = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  function sheetXml(sh) {
    const cols = (sh.cols || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const rows = sh.rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
      if (cell === null || cell === undefined || cell === '') return '';
      const o = typeof cell === 'object' ? cell : { v: cell };
      if (o.v === null || o.v === undefined || o.v === '') return o.s ? `<c r="${colName(c)}${r + 1}" s="${STYLES[o.s] || 0}"/>` : '';
      const ref = `${colName(c)}${r + 1}`;
      const isNum = typeof o.v === 'number' && isFinite(o.v);
      const s = STYLES[o.s || (isNum ? 'num' : 'text')] || 0;
      const prec = /eur/.test(o.s || '') ? 100 : 10000; // montants arrondis au centime
      return isNum ? `<c r="${ref}" s="${s}"><v>${Math.round(o.v * prec) / prec}</v></c>`
        : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escXml(o.v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const freeze = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
  }

  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF777777"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE9E4"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8E6DE"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFB5482A"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  // ZIP (méthode « stockée », sans compression) avec CRC-32
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((t, p) => t + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((t, p) => t + p.length, 0));
    let pos = 0; for (const p of all) { out.set(p, pos); pos += p.length; }
    return out;
  }

  function build(sheets) {
    const used = new Set();
    const names = sheets.map(s => {
      let n = String(s.name || 'Feuille').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'Feuille', base = n, i = 2;
      while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
      used.add(n.toLowerCase()); return n;
    });
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES_XML },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ];
    return zip(files);
  }
  /* ---------- Lecture d'un classeur .xlsx (ou d'un fichier CSV) ---------- */
  // Décompression des entrées ZIP « deflate » avec l'API native du navigateur
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Ce fichier n\'est pas un classeur Excel (.xlsx) valide.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {}, dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), comLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      files[name] = { method, data: u8.subarray(start, start + csize) };
      p += 46 + nameLen + extraLen + comLen;
    }
    return {
      has: name => !!files[name],
      async text(name) {
        const f = files[name];
        if (!f) return null;
        const raw = f.method === 8 ? await inflate(f.data) : f.data;
        return dec.decode(raw);
      },
    };
  }
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const byTag = (node, tag) => Array.from(node.getElementsByTagName(tag));
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function read(buf) {
    const z = await unzip(buf);
    const wb = xml(await z.text('xl/workbook.xml') || '');
    const rels = xml(await z.text('xl/_rels/workbook.xml.rels') || '<x/>');
    const target = {};
    byTag(rels, 'Relationship').forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const ss = await z.text('xl/sharedStrings.xml');
    const shared = ss ? byTag(xml(ss), 'si').map(si => byTag(si, 't').map(t => t.textContent).join('')) : [];
    const sheets = [];
    for (const sh of byTag(wb, 'sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let path = target[rid] || '';
      path = path.startsWith('/') ? path.slice(1) : 'xl/' + path.replace(/^\.\//, '');
      const doc = xml(await z.text(path) || '<x/>');
      const rows = [];
      byTag(doc, 'row').forEach(row => {
        const r = (+row.getAttribute('r') || rows.length + 1) - 1;
        const vals = rows[r] = rows[r] || [];
        byTag(row, 'c').forEach((c, k) => {
          const ref = c.getAttribute('r'), t = c.getAttribute('t');
          const i = ref ? colIndex(ref) : k;
          const v = (byTag(c, 'v')[0] || {}).textContent;
          let val = '';
          if (t === 's') val = shared[+v] ?? '';
          else if (t === 'inlineStr') val = byTag(c, 't').map(x => x.textContent).join('');
          else if (t === 'str' || t === 'e') val = v ?? '';
          else if (t === 'b') val = v === '1' ? 'Oui' : 'Non';
          else if (v !== undefined && v !== '') val = Number(v);
          vals[i] = val;
        });
      });
      for (let i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
      sheets.push({ name: sh.getAttribute('name'), rows });
    }
    return sheets;
  }

  // CSV : séparateur ; ou , détecté, guillemets gérés, encodage UTF-8 ou Windows-1252
  function readCSV(buf) {
    const u8 = new Uint8Array(buf);
    // Unicode UTF-16 (exports de nomenclature Revit), sinon UTF-8, sinon Windows-1252
    let text = u8[0] === 0xff && u8[1] === 0xfe ? new TextDecoder('utf-16le').decode(u8) : new TextDecoder('utf-8').decode(u8);
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(u8);
    text = text.replace(/^\uFEFF/, '');
    // Séparateur le plus fréquent sur les premières lignes : tabulation, point-virgule ou virgule
    const debut = text.split(/\r?\n/).slice(0, 5).join('\n');
    const sep = ['\t', ';', ','].map(c => [c, debut.split(c).length]).sort((x, y) => y[1] - x[1])[0][0];
    const rows = [[]];
    let cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { rows[rows.length - 1].push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; rows[rows.length - 1].push(cur); cur = ''; rows.push([]); }
      else cur += ch;
    }
    rows[rows.length - 1].push(cur);
    return [{ name: 'CSV', rows: rows.filter(r => r.some(c => c !== '')) }];
  }

  return { build, read, readCSV };
})();
if (typeof module !== 'undefined') module.exports = XLSX;
