// Notifications sur les téléphones (Web Push, RFC 8030 / 8291 / 8292) sans dépendance :
// clés VAPID générées au premier démarrage, abonnements des téléphones par compte, contenu chiffré
// (aes128gcm) envoyé au service de notification du navigateur (Google, Apple, Mozilla…).
const crypto = require('node:crypto');

const b64u = buf => Buffer.from(buf).toString('base64url');
const deb64u = s => Buffer.from(String(s || ''), 'base64url');

function initTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, account_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, appareil TEXT, created_at TEXT NOT NULL, last_ok TEXT)`);
}

// Clés VAPID du serveur (P-256) : la clé publique est donnée aux téléphones lors de l'abonnement
function vapid(DB, db) {
  let v = DB.getConfig(db, 'vapid');
  if (!v) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    v = { publicKey: b64u(Buffer.concat([Buffer.from([4]), deb64u(jwk.x), deb64u(jwk.y)])), privateJwk: privateKey.export({ format: 'jwk' }) };
    DB.setConfig(db, 'vapid', v);
  }
  return v;
}

// En-tête d'autorisation VAPID : jeton JWT ES256 pour l'origine du service de notification
function autorisation(v, endpoint, contact) {
  const aud = new URL(endpoint).origin;
  const enc = o => b64u(JSON.stringify(o));
  const corps = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact })}`;
  const cle = crypto.createPrivateKey({ key: v.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(corps), { key: cle, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${corps}.${b64u(sig)}, k=${v.publicKey}`;
}

// Chiffrement du message pour un abonnement (RFC 8291, codage aes128gcm, un seul enregistrement)
// (sel et clé éphémère imposables pour vérifier l'exemple de l'annexe A de la RFC)
function chiffrer(texte, p256dh, auth, impose = {}) {
  const uaPublic = deb64u(p256dh), secret = deb64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (impose.clePrivee) ecdh.setPrivateKey(deb64u(impose.clePrivee)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const partage = ecdh.computeSecret(uaPublic);
  const hmac = (cle, data) => crypto.createHmac('sha256', cle).update(data).digest();
  const ikm = hmac(hmac(secret, partage), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const sel = impose.sel ? deb64u(impose.sel) : crypto.randomBytes(16), prk = hmac(sel, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const chiffre = Buffer.concat([c.update(Buffer.concat([Buffer.from(texte), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const entete = Buffer.alloc(21);
  sel.copy(entete, 0); entete.writeUInt32BE(4096, 16); entete[20] = asPublic.length;
  return Buffer.concat([entete, asPublic, chiffre]);
}

const abonnementsDe = (db, accountIds) => (accountIds.length
  ? db.prepare(`SELECT * FROM push_subs WHERE account_id IN (${accountIds.map(() => '?').join(',')})`).all(...accountIds) : []);

function abonner(db, accountId, sub, appareil) {
  if (!sub || !/^https:\/\//.test(sub.endpoint || '') || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw Object.assign(new Error('Abonnement invalide'), { status: 400 });
  if (deb64u(sub.keys.p256dh).length !== 65 || deb64u(sub.keys.auth).length < 16) throw Object.assign(new Error('Clés d\'abonnement invalides'), { status: 400 });
  db.prepare(`INSERT INTO push_subs (endpoint, account_id, p256dh, auth, appareil, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET account_id = excluded.account_id, p256dh = excluded.p256dh, auth = excluded.auth, appareil = excluded.appareil`)
    .run(sub.endpoint, accountId, sub.keys.p256dh, sub.keys.auth, String(appareil || '').slice(0, 120), new Date().toISOString());
}
const desabonner = (db, accountId, endpoint) => db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND account_id = ?').run(String(endpoint || ''), accountId);

// Envoi à tous les téléphones des comptes donnés ; les abonnements expirés (404 / 410) sont supprimés
async function envoyer(DB, db, accountIds, message, contact) {
  const v = vapid(DB, db), corps = JSON.stringify(message), res = [];
  for (const s of abonnementsDe(db, accountIds)) {
    let statut;
    try {
      const r = await fetch(s.endpoint, { method: 'POST', body: chiffrer(corps, s.p256dh, s.auth), signal: AbortSignal.timeout(10000),
        headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal', Topic: String(message.tag || 'pipefit').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'pipefit',
          Authorization: autorisation(v, s.endpoint, contact || 'mailto:admin@pipefit.local') } });
      statut = r.status;
    } catch (e) { statut = e.name === 'TimeoutError' ? 'délai dépassé' : e.message; }
    if (statut === 404 || statut === 410) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(s.endpoint);
    else if (statut >= 200 && statut < 300) db.prepare('UPDATE push_subs SET last_ok = ? WHERE endpoint = ?').run(new Date().toISOString(), s.endpoint);
    res.push({ appareil: s.appareil, statut });
  }
  return res;
}

module.exports = { initTables, vapid, chiffrer, autorisation, abonner, desabonner, abonnementsDe, envoyer };
