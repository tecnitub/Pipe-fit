// Revue de sécurité : chaque correction est d'abord reproduite par un test.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../server/medias-articles');

// Deux serveurs locaux : « public » (accepté par le contrôle des liens) qui redirige vers « interne » (refusé)
async function serveurs() {
  const hits = { interne: 0 };
  const interne = http.createServer((q, r) => { hits.interne++; r.writeHead(200, { 'Content-Type': 'image/jpeg' }); r.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])); });
  await new Promise(r => interne.listen(0, '127.0.0.1', r));
  const pInterne = interne.address().port;
  const pub = http.createServer((q, r) => { r.writeHead(302, { Location: `http://127.0.0.1:${pInterne}/secret.jpg` }); r.end(); });
  await new Promise(r => pub.listen(0, '127.0.0.1', r));
  const verifier = async u => { if (new URL(u).port === String(pInterne)) throw new Error('adresse du réseau interne refusée'); return new URL(u).href; };
  return { hits, verifier, pub: `http://127.0.0.1:${pub.address().port}/photo.jpg`, fermer: () => { interne.close(); pub.close(); } };
}

test('liens externes (photos, fiches des fournisseurs) : une redirection vers le réseau interne n\'est jamais suivie', async () => {
  const s = await serveurs();
  try {
    await assert.rejects(M.recupererSur(s.pub, { verifier: s.verifier }), /réseau interne/);
    // Récupération des photos des articles : même contrôle, le serveur interne n'est jamais contacté
    const DB = require('../server/db');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-ssrf-')), db = DB.open(path.join(d, 'x.db'));
    db.prepare('INSERT INTO records (col, id, data, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)').run('articles', 'a1', JSON.stringify({ id: 'a1', ref: 'R1', photoUrl: s.pub }), new Date().toISOString(), 't');
    const S = M.creer({ DB, db, broadcast: () => {}, FICHES: { catalogue: () => ({}) }, verifier: s.verifier, delai: 0 });
    S.lancer('test');
    for (let k = 0; k < 100 && S.resume().etat.enCours; k++) await new Promise(r => setTimeout(r, 10));
    assert.match(S.resume().etat.erreurs[0].erreur, /réseau interne/);
    assert.strictEqual(s.hits.interne, 0, 'serveur interne contacté');
    db.close(); fs.rmSync(d, { recursive: true, force: true });
  } finally { s.fermer(); }
});

test('abonnement aux notifications : adresse d\'envoi du réseau interne refusée (le serveur ne poste pas vers l\'intérieur)', () => {
  const Push = require('../server/push'), { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(':memory:');
  Push.initTables(db);
  const crypto = require('node:crypto'), tel = crypto.createECDH('prime256v1'); tel.generateKeys();
  const keys = { p256dh: tel.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
  for (const endpoint of ['https://127.0.0.1/x', 'https://10.0.0.5:8443/admin', 'https://[::1]/x', 'https://localhost/x', 'https://intranet/x', 'https://nas.local/x', 'https://169.254.169.254/latest'])
    assert.throws(() => Push.abonner(db, 'c1', { endpoint, keys }, 'tel'), /refusée/, endpoint);
  Push.abonner(db, 'c1', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }, 'tel');
  assert.strictEqual(Push.abonnementsDe(db, ['c1']).length, 1);
});

// Archive zip d'une entrée compressée (deflate)
function zipDeflate(nom, contenu) {
  const zlib = require('node:zlib'), d = zlib.deflateRawSync(contenu), n = Buffer.from(nom);
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(d.length, 18); loc.writeUInt32LE(contenu.length, 22); loc.writeUInt16LE(n.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(d.length, 20); cen.writeUInt32LE(contenu.length, 24); cen.writeUInt16LE(n.length, 28);
  const debut = 30 + n.length + d.length, fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10); fin.writeUInt32LE(46 + n.length, 12); fin.writeUInt32LE(debut, 16);
  return Buffer.concat([loc, n, d, cen, n, fin]);
}
test('archives zip (dossier de consultation, classeurs, Word) : contenu décompressé limité (bombe de décompression)', async () => {
  const XLSX = require('../public/js/xlsx');
  const z = await XLSX.unzip(zipDeflate('bombe.bin', Buffer.alloc(4 * 1024 * 1024)), '', { max: 1024 * 1024 });
  await assert.rejects(z.octets('bombe.bin'), /trop volumineux/);
  await assert.rejects(z.text('bombe.bin'), /trop volumineux/);
  // Contenu normal : lu
  const ok = await XLSX.unzip(zipDeflate('ok.txt', Buffer.from('bonjour '.repeat(100))));
  assert.strictEqual((await ok.text('ok.txt')).length, 800);
});

test('dépôt d\'une fiche technique : le nom du fabricant ne fait pas sortir du dossier de la bibliothèque', () => {
  const FT = require('../public/js/fiches-tech');
  for (const fab of ['..', '.', ' .. ', '...']) {
    const d = FT.nomFichier(fab), racine = path.join(os.tmpdir(), 'bibliotheque');
    assert.ok(path.join(racine, d, 'fiche.pdf').startsWith(racine + path.sep), `« ${fab} » → « ${d} »`);
    assert.ok(path.dirname(path.join(racine, d, 'fiche.pdf')) !== racine, `« ${fab} » : fiche écrite à la racine`);
  }
  assert.strictEqual(FT.nomFichier('Atlantic'), 'Atlantic');
});

test('factures reçues (adresse de dépôt, import) : flux compressés d\'un PDF décompressés avec une limite', async () => {
  const zlib = require('node:zlib'), DB = require('../server/db'), EF = require('../server/efacture');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-ef-')), db = DB.open(path.join(d, 'x.db'));
  // PDF dont un flux de 300 Ko se décompresse en 200 Mo (zéros)
  const bombe = zlib.deflateSync(Buffer.alloc(200 * 1024 * 1024));
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode /Length ' + bombe.length + ' >>\nstream\n'), bombe, Buffer.from('\nendstream\nendobj\n%%EOF')]);
  const vrai = zlib.inflateSync, sorties = [];
  zlib.inflateSync = (b, o) => { const r = vrai(b, o); sorties.push(r.length); return r; };
  try {
    const r = await EF.recevoir(DB, db, pdf, 'piege.pdf', 'test', null);
    assert.ok(r.record.aLire, 'PDF enregistré comme PDF simple');
    assert.ok(sorties.every(n => n <= 64 * 1024 * 1024), `flux décompressé de ${Math.max(...sorties)} octets`);
  } finally { zlib.inflateSync = vrai; db.close(); fs.rmSync(d, { recursive: true, force: true }); }
});
