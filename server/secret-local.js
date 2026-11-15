// Chiffrement local (AES-256-GCM) des secrets qu'une application garde dans sa base : jeton de service Pipe-Fit des
// sessions des applications Études et DOE. La clé est propre au serveur de l'application et n'est jamais dans sa base :
// variable d'environnement (64 caractères hexadécimaux, ou 32 octets en base64), sinon fichier créé au premier démarrage
// à côté de la base, lisible par le seul compte du service (droits 600). Une copie de la base seule ne livre aucun jeton.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v1';
function lireCle(valeur) {
  const v = String(valeur || '').trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return Buffer.from(v, 'hex');
  const b = Buffer.from(v, 'base64');
  return b.length === 32 ? b : null;
}
// Clé du serveur : { cle, source } ; env : valeur de la variable d'environnement ; fichier : chemin du fichier de clé
function cleServeur({ env, fichier }) {
  if (env) {
    const c = lireCle(env);
    if (!c) throw new Error('Clé de chiffrement invalide dans la variable d\'environnement : 64 caractères hexadécimaux (ou 32 octets en base64) attendus.');
    return { cle: c, source: 'variable d\'environnement' };
  }
  if (fs.existsSync(fichier)) {
    const c = lireCle(fs.readFileSync(fichier, 'utf8'));
    if (!c) throw new Error(`Fichier de clé illisible : ${fichier}`);
    try { if (process.platform !== 'win32' && (fs.statSync(fichier).mode & 0o077)) fs.chmodSync(fichier, 0o600); } catch (e) { /* système de fichiers sans droits Unix */ }
    return { cle: c, source: fichier };
  }
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const c = crypto.randomBytes(32);
  // Création exclusive (deux démarrages simultanés : le second relit la clé du premier)
  try { fs.writeFileSync(fichier, `${c.toString('hex')}\n`, { mode: 0o600, flag: 'wx' }); }
  catch (e) { if (e.code === 'EEXIST') return cleServeur({ fichier }); throw e; }
  return { cle: c, source: fichier };
}
// Texte chiffré : « v1:<iv>:<tag>:<données> » (base64url) ; aad lie le secret à son usage (ex. l'identifiant de session)
function chiffrer(cle, texte, aad = '') {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  if (aad) c.setAAD(Buffer.from(String(aad)));
  const d = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64url'), c.getAuthTag().toString('base64url'), d.toString('base64url')].join(':');
}
// Déchiffré, ou null (autre clé, contenu modifié, ancien format en clair)
function dechiffrer(cle, chiffre, aad = '') {
  const m = String(chiffre || '').split(':');
  if (m.length !== 4 || m[0] !== VERSION) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', cle, Buffer.from(m[1], 'base64url'));
    if (aad) d.setAAD(Buffer.from(String(aad)));
    d.setAuthTag(Buffer.from(m[2], 'base64url'));
    return Buffer.concat([d.update(Buffer.from(m[3], 'base64url')), d.final()]).toString('utf8');
  } catch (e) { return null; }
}
const estChiffre = v => String(v || '').startsWith(`${VERSION}:`);

module.exports = { cleServeur, chiffrer, dechiffrer, estChiffre };
