// Notifications de planning : regroupement des changements, cloche de l'appli, envoi Web Push chiffré et signé.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-notif-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.NOTIF_DELAI_MS = '60';
const { server } = require('../server/server');

// Faux service de notification : les envois vers https://push.test sont interceptés
const recus = [];
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://push.test/')) { recus.push({ url: String(url), headers: opts.headers, body: Buffer.from(opts.body) }); return new Response(null, { status: String(url).endsWith('/expire') ? 410 : 201 }); }
  return vraiFetch(url, opts);
};

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

async function call(method, url, body, cookie) {
  const res = await vraiFetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function login(l, p) { const r = await vraiFetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, password: p }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; }
const attendre = ms => new Promise(r => setTimeout(r, ms));
const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Déchiffrement côté téléphone (RFC 8291)
function dechiffrer(body, ecdh, auth) {
  const sel = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const ikm = hmac(hmac(auth, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(sel, ikm);
  const d = crypto.createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const clair = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.strictEqual(clair[clair.length - 1], 2);
  return JSON.parse(clair.subarray(0, clair.length - 1).toString());
}
function verifierVapid(entete, publicKey) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(entete);
  assert.ok(m, 'en-tête VAPID');
  assert.strictEqual(m[2], publicKey);
  const [h, c, sig] = m[1].split('.');
  const raw = Buffer.from(publicKey, 'base64url');
  const cle = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: cle, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'signature VAPID');
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.strictEqual(claims.aud, 'https://push.test');
  assert.ok(claims.exp > Date.now() / 1000);
}

test('planning modifié : notification regroupée, chiffrée et signée', async () => {
  const debut = new Date().toISOString();
  const notifsDe = async (uid, cookie) => (await call('GET', `/api/records/notifications?filtre=userId:${uid}`, null, cookie)).body.filter(n => n.date >= debut);
  const admin = await login('admin', 'admin-test-pw');
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse2', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  await call('POST', '/api/accounts', { login: 'lucas', password: 'motdepasse3', role: 'atelier', nom: 'Lucas', userId: 'o3' }, admin);
  const claire = await login('claire', 'motdepasse1'), kevin = await login('kevin', 'motdepasse2'), lucas = await login('lucas', 'motdepasse3');

  // Le téléphone de Kevin s'abonne avec la clé publique du serveur
  const cle = (await call('GET', '/api/push/cle', null, kevin)).body;
  assert.strictEqual(Buffer.from(cle.publicKey, 'base64url').length, 65);
  const tel = crypto.createECDH('prime256v1'); tel.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { endpoint: 'https://push.test/kevin', keys: { p256dh: tel.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  assert.strictEqual((await call('POST', '/api/push/abonnement', { subscription: { endpoint: 'http://x', keys: {} } }, kevin)).status, 400);
  assert.strictEqual((await call('POST', '/api/push/abonnement', { subscription: sub, appareil: 'Android' }, kevin)).status, 200);
  await call('POST', '/api/push/abonnement', { subscription: { ...sub, endpoint: 'https://push.test/expire' }, appareil: 'ancien' }, kevin);

  // Le bureau planifie Kevin sur deux jours (plusieurs enregistrements) : une seule notification
  const aff = (await call('GET', '/api/records/affaires/af1', null, claire)).body;
  await call('PUT', '/api/records/planning/pn1', { data: { userId: 'o1', date: jour(61), affaireId: 'af1', debut: '07:30', fin: '16:30', pause: 60, heuresPrevues: 8, tache: 'Soudure' } }, claire);
  await call('PUT', '/api/records/planning/pn2', { data: { userId: 'o1', date: jour(62), affaireId: 'af1', debut: '08:00', fin: '12:00', pause: 0, heuresPrevues: 4, tache: 'Montage' } }, claire);
  // Journée passée : pas de notification
  await call('PUT', '/api/records/planning/pn0', { data: { userId: 'o1', date: jour(-3), affaireId: 'af1', heuresPrevues: 8 } }, claire);
  await attendre(300);

  const notifs = (await notifsDe('o1', claire));
  assert.strictEqual(notifs.length, 1);
  assert.match(notifs[0].titre, /^Votre planning a changé : 2 jours$/);
  assert.ok(notifs[0].texte.includes(`${aff.code} 07:30–16:30 (Soudure)`), notifs[0].texte);
  assert.deepStrictEqual(notifs[0].jours, [jour(61), jour(62)]);

  const pourKevin = recus.filter(r => r.url === 'https://push.test/kevin');
  assert.strictEqual(pourKevin.length, 1);
  assert.strictEqual(pourKevin[0].headers['Content-Encoding'], 'aes128gcm');
  verifierVapid(pourKevin[0].headers.Authorization, cle.publicKey);
  const msg = dechiffrer(pourKevin[0].body, tel, auth);
  assert.strictEqual(msg.titre, notifs[0].titre); assert.strictEqual(msg.lien, '#/pointage/planning');
  // L'abonnement expiré (410) est supprimé
  assert.strictEqual((await call('GET', '/api/push/cle', null, kevin)).body.appareils.length, 1);

  // Modification sans effet pour le compagnon (même affectation) : rien de nouveau
  const pn1 = (await call('GET', '/api/records/planning/pn1', null, claire)).body;
  await call('PUT', '/api/records/planning/pn1', { data: { ...pn1 }, version: pn1._v }, claire);
  await attendre(200);
  assert.strictEqual((await notifsDe('o1', claire)).length, 1);

  // Suppression : « libre »
  await call('DELETE', '/api/records/planning/pn2', {}, claire);
  await attendre(200);
  const n2 = (await notifsDe('o1', claire)).find(n => n.id !== notifs[0].id);
  assert.match(n2.texte, /: libre$/);

  // Intérimaire sans compte (i2, équipe de Lucas) : le chef d'équipe est prévenu
  await call('PUT', '/api/records/planning/pn3', { data: { userId: 'i2', date: jour(61), affaireId: 'af1', heuresPrevues: 7 } }, claire);
  await attendre(200);
  const pourLucas = (await notifsDe('o3', claire));
  assert.strictEqual(pourLucas.length, 1); assert.match(pourLucas[0].titre, /^Planning de Damien modifié/);

  // Le compagnon marque sa notification comme lue, pas celle d'un autre
  assert.strictEqual((await call('PUT', `/api/records/notifications/${notifs[0].id}`, { data: { ...notifs[0], lu: true }, version: notifs[0]._v }, kevin)).status, 200);
  assert.strictEqual((await call('PUT', `/api/records/notifications/${pourLucas[0].id}`, { data: { ...pourLucas[0], lu: true }, version: pourLucas[0]._v }, kevin)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/planning/px', { data: { userId: 'o1', date: jour(61) } }, kevin)).status, 403);

  // Désabonnement du téléphone
  await call('DELETE', '/api/push/abonnement', { endpoint: sub.endpoint }, kevin);
  assert.strictEqual((await call('GET', '/api/push/cle', null, kevin)).body.appareils.length, 0);
  void lucas;
});
