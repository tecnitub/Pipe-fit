const test = require('node:test');
const assert = require('node:assert');
const P = require('../public/js/planches');
const mesure = (t, taille) => String(t).length * taille * 0.5;

test('Planches : positions au millimètre, case de départ et décalage', () => {
  const m = P.modele('L7651');
  assert.strictEqual(m.cols * m.lignes, 65);
  const p = P.positions(m, 3, 5, { x: 1, y: -0.5 });
  assert.deepStrictEqual(p.map(x => [x.page, +x.x.toFixed(2), +x.y.toFixed(2)]), [[0, 168.15, 10.2], [0, 5.75, 31.4], [0, 46.35, 31.4]]);
  const q = P.positions(P.modele('libre-20'), 28);
  assert.deepStrictEqual([q[25].page, q[26].page, q[26].y], [0, 1, 18.5]);
  // toutes les étiquettes tiennent dans la feuille A4
  P.MODELES.forEach(mo => { const l = P.positions(mo, mo.cols * mo.lignes); assert.ok(l.every(x => x.x >= 0 && x.x + x.w <= 210.01 && x.y >= 0 && x.y + x.h <= 297.01), mo.id); });
});

test('Disposition : QR de 18 mm au plus sur une étiquette de 2 cm, photo si la place le permet', () => {
  const d = P.disposition(95, 20, true);
  assert.ok(d.q <= 18 && d.q >= 16 && d.photo > 0 && d.texteW > 25);
  const e = P.disposition(35.6, 16.9, true);
  assert.ok(e.q <= 16.9 && e.photo === 0);
});

test('PDF : pages, accents, QR vectoriel', () => {
  const qr = { n: 21, sombre: (y, x) => (x + y) % 2 === 0 };
  const items = Array.from({ length: 30 }, (_, i) => ({ titre: `Coude 90° inox DN50 n°${i}`, sous: 'Réf. COU-316 · Empl. Rayonnage A1', qr, photo: null }));
  const r = P.pdf(items, { modele: 'libre-20', mesure });
  const txt = Buffer.from(r.octets).toString('latin1');
  assert.strictEqual(r.pages, 2);
  assert.ok(/^%PDF-1\.4/.test(txt) && /\/Count 2/.test(txt) && /startxref/.test(txt));
  assert.ok(txt.includes('(Coude 90\xb0 inox DN50 n\xb00)') || txt.includes('Coude 90\xb0'));
  assert.ok(/re f/.test(txt.replace(/ re 0 g/g, '')) || / re f/.test(txt));
  assert.strictEqual(P.winAnsi('Œuvre – 12 €'), '\x8cuvre \x96 12 \x80');
});
