// Lecteur .xls (Excel 97-2003 : conteneur OLE2 / CFB + BIFF8) : classeur fictif construit octet par octet en mémoire,
// dans un flux ordinaire (FAT) et dans le mini-flux (mini-FAT) ; table des chaînes coupée par un CONTINUE.
const { test } = require('node:test');
const assert = require('node:assert');
const Xls = require('../public/js/xls');
const I = require('../public/js/inventaire-cvc');

const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const f64 = n => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b; };
const rec = (type, ...parts) => { const d = Buffer.concat(parts); return Buffer.concat([u16(type), u16(d.length), d]); };
// Chaîne BIFF8 : compressée (latin-1) ou large (UTF-16)
const chars = (t, large) => (large ? Buffer.from(t, 'utf16le') : Buffer.from(t, 'latin1'));
const xlStr = (t, large = /[^\x00-\xff]/.test(t)) => Buffer.concat([u16(t.length), Buffer.from([large ? 1 : 0]), chars(t, large)]);
const bof = dt => rec(0x0809, u16(0x0600), u16(dt), u16(0x0dbb), u16(0x07cc), u32(0), u32(0x06));
const EOF = rec(0x000a);
const cell = (r, c, xf = 15) => Buffer.concat([u16(r), u16(c), u16(xf)]);
const rkInt = n => (n << 2) | 2;

// Classeur : feuille « DPGF » (toutes les sortes de cellules) et feuille « Notes »
function classeur() {
  const sst = ['Article', 'Désignation', 'Qté', 'Pompe à chaleur réversible ZX90 — 95 €/kW'];
  // SST : les trois premières chaînes, l'en-tête de la 4e et ses 10 premiers caractères compressés ; le CONTINUE
  // reprend avec un octet d'options « large » (le reste contient « — » et « € », hors latin-1)
  const s4 = sst[3], coupe = 10;
  const sstData = Buffer.concat([u32(4), u32(4), ...sst.slice(0, 3).map(t => xlStr(t, false)), u16(s4.length), Buffer.from([0]), chars(s4.slice(0, coupe), false)]);
  const cont = Buffer.concat([Buffer.from([1]), chars(s4.slice(coupe), true)]);
  const feuille1 = Buffer.concat([bof(0x10),
    rec(0x00fd, cell(0, 0), u32(0)), rec(0x00fd, cell(0, 1), u32(1)), rec(0x00fd, cell(0, 2), u32(2)),
    rec(0x0204, cell(1, 0), xlStr('4-3-1')), rec(0x00fd, cell(1, 1), u32(3)), rec(0x027e, cell(1, 2), u32(rkInt(1))),
    rec(0x0201, cell(2, 0)), // BLANK
    rec(0x0204, cell(2, 1), xlStr('Collecteur Ø70/76 départ EC')), rec(0x0203, cell(2, 2), f64(2.5)),
    // MULRK : 12,5 (RK entier / 100) puis 7 sur la ligne 3, colonnes 2 et 3
    rec(0x00bd, u16(3), u16(2), u16(15), u32(rkInt(1250) | 1), u16(15), u32(rkInt(7)), u16(3)),
    // FORMULA numérique, puis FORMULA texte et son STRING
    rec(0x0006, cell(4, 2), f64(42), u16(0), u32(0), u16(0)),
    rec(0x0006, cell(5, 1), Buffer.from([0, 0, 0, 0, 0, 0]), u16(0xffff), u16(0), u32(0), u16(0)), rec(0x0207, xlStr('Total € HT')),
    EOF]);
  const feuille2 = Buffer.concat([bof(0x10), rec(0x0204, cell(0, 0), xlStr('Notes')), EOF]);
  const bs = (pos, nom) => rec(0x0085, u32(pos), Buffer.from([0, 0]), Buffer.from([nom.length, 0]), Buffer.from(nom, 'latin1'));
  const avant = (p1, p2) => Buffer.concat([bof(0x05), bs(p1, 'DPGF'), bs(p2, 'Notes'), rec(0x00fc, sstData), rec(0x003c, cont), EOF]);
  const lg = avant(0, 0).length;
  return Buffer.concat([avant(lg, lg + feuille1.length), feuille1, feuille2]);
}

// Conteneur CFB (secteurs de 512 octets, version 3) ; mini : flux sous 4 096 octets rangé dans le mini-flux
function cfb(flux, mini) {
  const S = 512, FIN = 0xfffffffe, LIBRE = 0xffffffff, secteurs = [], fat = [];
  const ajouter = (data, fin = true) => { const n = Math.max(1, Math.ceil(data.length / S)), d = secteurs.length; for (let i = 0; i < n; i++) { secteurs.push(Buffer.concat([data.subarray(i * S, (i + 1) * S)], S)); fat.push(i === n - 1 && fin ? FIN : d + i + 1); } return d; };
  let racine = FIN, tailleRacine = 0, debut, miniFat = FIN;
  if (mini) {
    const m = Math.ceil(flux.length / 64), ms = Buffer.concat([flux], m * 64);
    racine = ajouter(ms); tailleRacine = ms.length; debut = 0;
    const mf = Buffer.alloc(S, 0xff); for (let i = 0; i < m; i++) mf.writeUInt32LE(i === m - 1 ? FIN : i + 1, i * 4);
    miniFat = ajouter(mf);
  } else debut = ajouter(flux);
  const entree = (nom, type, deb, taille) => { const e = Buffer.alloc(128); e.write(nom, 0, 'utf16le'); e.writeUInt16LE((nom.length + 1) * 2, 0x40); e[0x42] = type; e.writeUInt32LE(LIBRE, 0x44); e.writeUInt32LE(LIBRE, 0x48); e.writeUInt32LE(type === 5 ? 1 : LIBRE, 0x4c); e.writeUInt32LE(deb, 0x74); e.writeUInt32LE(taille, 0x78); return e; };
  const dir = ajouter(Buffer.concat([entree('Root Entry', 5, racine, tailleRacine), entree('Workbook', 2, debut, flux.length)], S));
  const fs = secteurs.length; secteurs.push(Buffer.alloc(S)); fat.push(0xfffffffd);
  const t = Buffer.alloc(S, 0xff); fat.forEach((v, i) => t.writeUInt32LE(v, i * 4)); secteurs[fs] = t;
  const h = Buffer.alloc(512, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(h, 0);
  h.writeUInt16LE(0x3e, 0x18); h.writeUInt16LE(3, 0x1a); h.writeUInt16LE(0xfffe, 0x1c); h.writeUInt16LE(9, 0x1e); h.writeUInt16LE(6, 0x20);
  h.writeUInt32LE(1, 0x2c); h.writeUInt32LE(dir, 0x30); h.writeUInt32LE(4096, 0x38); h.writeUInt32LE(miniFat, 0x3c); h.writeUInt32LE(mini ? 1 : 0, 0x40);
  h.writeUInt32LE(FIN, 0x44); h.writeUInt32LE(0, 0x48);
  for (let i = 0; i < 109; i++) h.writeUInt32LE(i ? LIBRE : fs, 0x4c + i * 4);
  return Buffer.concat([h, ...secteurs]);
}

test('.xls : conteneur CFB (FAT et mini-FAT), BIFF8, toutes les sortes de cellules, SST coupée par un CONTINUE', () => {
  const wb = classeur();
  [cfb(wb, true), cfb(Buffer.concat([wb], 5000), false)].forEach((fichier, k) => {
    assert.ok(Xls.estXls(fichier));
    const f = Xls.lire(new Uint8Array(fichier).buffer);
    assert.deepStrictEqual(f.map(x => x.name), ['DPGF', 'Notes'], `cas ${k}`);
    const r = f[0].rows;
    assert.deepStrictEqual(r[0], ['Article', 'Désignation', 'Qté']);
    assert.deepStrictEqual(r[1], ['4-3-1', 'Pompe à chaleur réversible ZX90 — 95 €/kW', 1]);
    assert.deepStrictEqual([r[2][0], r[2][1], r[2][2]], [undefined, 'Collecteur Ø70/76 départ EC', 2.5], 'BLANK ignoré, LABEL, NUMBER');
    assert.deepStrictEqual([r[3][2], r[3][3]], [12.5, 7], 'MULRK');
    assert.deepStrictEqual([r[4][2], r[5][1]], [42, 'Total € HT'], 'FORMULA numérique et texte (STRING)');
    assert.deepStrictEqual(f[1].rows, [['Notes']]);
  });
  assert.strictEqual(Xls.estXls(Buffer.from('PK\x03\x04')), false, 'un .xlsx n\'est pas un .xls');
  assert.throws(() => Xls.lire(Buffer.from('pas un classeur')), /Excel 97-2003/);
  assert.deepStrictEqual([Xls.rk(rkInt(-3)), Xls.rk(rkInt(150) | 1)], [-3, 1.5]);
});

test('.xls : DPGF lu comme un classeur .xlsx (en-tête, ouvrages)', () => {
  const sst = ['Article', 'Désignation', 'U', 'Qté', 'Chaudière gaz à condensation 150 kW', 'u'];
  const feuille = Buffer.concat([bof(0x10), ...[0, 1, 2, 3].map(c => rec(0x00fd, cell(0, c), u32(c))),
    rec(0x0204, cell(1, 0), xlStr('3-1')), rec(0x00fd, cell(1, 1), u32(4)), rec(0x00fd, cell(1, 2), u32(5)), rec(0x027e, cell(1, 3), u32(rkInt(2))), EOF]);
  const glob = p => Buffer.concat([bof(0x05), rec(0x0085, u32(p), Buffer.from([0, 0, 4, 0]), Buffer.from('DPGF', 'latin1')), rec(0x00fc, u32(6), u32(6), ...sst.map(t => xlStr(t))), EOF]);
  const wb = Buffer.concat([glob(glob(0).length), feuille]);
  const d = I.depuisDpgf(Xls.lire(cfb(wb, true))[0].rows);
  assert.deepStrictEqual(d.items.map(x => [x.genre, x.qte, x.P, x.sources[0]]), [['chaudiere-cond', 2, 150, 'DPGF 3.1']]);
});
