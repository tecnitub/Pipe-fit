const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../server/medias-articles');
const DB = require('../server/db');

test('liens : adresses du réseau interne refusées, type d\'image lu dans les octets', async () => {
  ['127.0.0.1', '10.2.3.4', '192.168.1.10', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '0.0.0.0'].forEach(ip => assert.ok(M.adressePrivee(ip), ip));
  ['8.8.8.8', '93.184.216.34', '2a00:1450:4007::1'].forEach(ip => assert.ok(!M.adressePrivee(ip), ip));
  await assert.rejects(M.verifierUrl('http://127.0.0.1/x.jpg'), /réseau interne/);
  await assert.rejects(M.verifierUrl('file:///etc/passwd'), /http/);
  await assert.rejects(M.verifierUrl('pas un lien'), /invalide/);
  assert.strictEqual(M.typeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), 'image/jpeg');
  assert.strictEqual(M.typeImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.strictEqual(M.typeImage(Buffer.from('RIFF0000WEBPVP8 ')), 'image/webp');
  assert.strictEqual(M.typeImage(Buffer.from('<html>')), '');
});

test('récupération : photos rangées sur les articles (une seule fois par lien), fiches confiées au catalogue, erreurs listées', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-medias-')), db = DB.open(path.join(d, 'x.db'));
  const now = new Date().toISOString(), ins = a => db.prepare('INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)').run('articles', a.id, JSON.stringify(a), now, 't');
  ins({ id: 'a1', ref: 'R1', designation: 'Vanne 1', photoUrl: 'https://cdn.exemple.fr/v.jpg', ficheUrl: 'https://cdn.exemple.fr/v.pdf' });
  ins({ id: 'a2', ref: 'R2', designation: 'Vanne 2', photoUrl: 'https://cdn.exemple.fr/v.jpg' });
  ins({ id: 'a3', ref: 'R3', designation: 'Vanne 3', photoUrl: 'https://cdn.exemple.fr/page.html' });
  ins({ id: 'a4', ref: 'R4', designation: 'Sans lien' });
  const appels = [], catalogue = [];
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
  const fetchFn = async u => { appels.push(u); const b = /\.jpg$/.test(u) ? jpeg : Buffer.from('<html>'); return { ok: true, url: u, headers: new Map([['content-length', String(b.length)]]), arrayBuffer: async () => b }; };
  const S = M.creer({ DB, db, broadcast: () => {}, FICHES: { catalogue: l => { catalogue.push(...l); return {}; } }, fetchFn, verifier: async u => u });
  assert.deepStrictEqual([S.resume().photos, S.resume().fiches], [3, 1]);
  S.lancer('test');
  for (let k = 0; k < 50 && S.resume().etat.enCours; k++) await new Promise(r => setTimeout(r, 10));
  const e = S.resume().etat, get = id => JSON.parse(db.prepare('SELECT data FROM records WHERE col = ? AND id = ?').get('articles', id).data);
  assert.deepStrictEqual([e.total, e.photos, e.erreurs.length], [3, 2, 1]);
  assert.match(e.erreurs[0].erreur, /pas une image/);
  assert.strictEqual(appels.filter(u => /v\.jpg/.test(u)).length, 1);
  assert.ok(get('a1').photoId); assert.strictEqual(get('a1').photoId, get('a2').photoId);
  assert.strictEqual(db.prepare('SELECT mime FROM files WHERE id = ?').get(get('a1').photoId).mime, 'image/jpeg');
  assert.deepStrictEqual(catalogue, [{ url: 'https://cdn.exemple.fr/v.pdf', reference: 'R1', designation: 'Vanne 1', fabricant: '' }]);
  assert.strictEqual(get('a1').ficheSource, 'https://cdn.exemple.fr/v.pdf');
  // Relance : seule la photo en erreur reste à faire
  assert.deepStrictEqual([S.resume().photos, S.resume().fiches], [1, 0]);
});
