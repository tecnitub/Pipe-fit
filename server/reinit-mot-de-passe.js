// Réinitialisation d'un mot de passe oublié (CRM, et donc Études et DOE qui utilisent les mêmes comptes).
// À lancer SUR LE SERVEUR : l'accès direct au fichier de la base fait office d'autorisation (comme ADMIN_PASSWORD).
// Usage :
//   node server/reinit-mot-de-passe.js                     → liste des comptes
//   node server/reinit-mot-de-passe.js <identifiant>       → demande le nouveau mot de passe (saisie masquée)
//   node server/reinit-mot-de-passe.js <identifiant> <mdp> → sans question (scripts)
//   node server/reinit-mot-de-passe.js --creer-admin       → crée un compte « admin » s'il n'existe aucun administrateur
// La base est celle de DB_FILE (sinon data/pipefit.db). Le serveur peut rester démarré.
// Effets : nouveau mot de passe, toutes les sessions du compte fermées, jetons d'Études et du DOE révoqués, trace au journal.
const path = require('node:path');
const crypto = require('node:crypto');
const DB = require('./db');

const MIN = 10;
function refuse(pw, login) {
  const x = String(pw || '');
  if (x.length < MIN) return `Mot de passe : ${MIN} caractères au moins`;
  if (x.length > 200) return 'Mot de passe trop long';
  if (/^(.)\1+$/.test(x)) return 'Mot de passe trop simple';
  if (login && String(login).length >= 3 && x.toLowerCase().includes(String(login).toLowerCase())) return 'Le mot de passe ne doit pas contenir l\'identifiant';
  return '';
}

// Entrée redirigée (script, tube) : toutes les lignes lues une fois, servies une par une
let entree = null;
const lignesEntree = () => entree || (entree = new Promise(res => { let s = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', d => { s += d; }); process.stdin.on('end', () => res(s.split(/\r?\n/))); }));
// Saisie masquée sur la console (Windows comme Linux) ; repli sur une lecture simple hors terminal
function demander(question) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) { process.stdout.write('\n'); lignesEntree().then(l => resolve(l.shift() || '')); return; }
    let s = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const lire = c => {
      if (c === '\r' || c === '\n' || c === '\u0004') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', lire); process.stdout.write('\n'); resolve(s); }
      else if (c === '\u0003') { process.stdout.write('\n'); process.exit(1); }
      else if (c === '\u007f' || c === '\b') s = s.slice(0, -1);
      else s += c;
    };
    stdin.on('data', lire);
  });
}

function reinitialiser(db, login, pw) {
  const acc = db.prepare('SELECT id, login, nom, role FROM accounts WHERE login = ? COLLATE NOCASE').get(String(login || '').trim());
  if (!acc) throw new Error(`Aucun compte « ${login} »`);
  const r = refuse(pw, acc.login);
  if (r) throw new Error(r);
  DB.tx(db, () => {
    db.prepare('UPDATE accounts SET pass = ? WHERE id = ?').run(DB.hashPassword(pw), acc.id);
    db.prepare('DELETE FROM sessions WHERE account_id = ?').run(acc.id);
    try { db.prepare('DELETE FROM jetons_apps WHERE account_id = ?').run(acc.id); } catch (e) { /* base d'avant les jetons des applications */ }
    DB.audit(db, acc.login, 'réinitialisation du mot de passe sur le serveur');
  });
  return acc;
}

function creerAdmin(db, pw) {
  if (db.prepare("SELECT 1 FROM accounts WHERE role = 'admin' LIMIT 1").get()) throw new Error('Un administrateur existe déjà : réinitialisez plutôt son mot de passe');
  if (db.prepare("SELECT 1 FROM accounts WHERE login = 'admin' COLLATE NOCASE").get()) throw new Error('Un compte « admin » existe déjà (sans le rôle administrateur)');
  const r = refuse(pw, 'admin');
  if (r) throw new Error(r);
  db.prepare('INSERT INTO accounts (id, login, nom, role, user_id, pass, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(crypto.randomBytes(12).toString('hex'), 'admin', 'Administrateur', 'admin', null, DB.hashPassword(pw), new Date().toISOString());
  DB.audit(db, 'admin', 'compte administrateur créé sur le serveur');
}

async function main(argv) {
  const fichier = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'pipefit.db');
  const db = DB.open(fichier);
  const [cible, mdp] = argv;
  if (!cible) {
    const comptes = db.prepare('SELECT login, nom, role FROM accounts ORDER BY role, login').all();
    console.log(`Base : ${fichier}\nComptes (${comptes.length}) :`);
    comptes.forEach(c => console.log(`  ${c.login.padEnd(20)} ${String(c.role).padEnd(10)} ${c.nom || ''}`));
    console.log('\nRéinitialiser : reinit-mot-de-passe <identifiant>');
    if (!comptes.some(c => c.role === 'admin')) console.log('Aucun administrateur : reinit-mot-de-passe --creer-admin');
    return 0;
  }
  let pw = mdp;
  if (!pw) {
    pw = await demander(`Nouveau mot de passe (${MIN} caractères au moins) : `);
    const bis = await demander('Confirmer le mot de passe : ');
    if (pw !== bis) { console.error('Les deux saisies ne sont pas identiques : rien n\'a été changé.'); return 1; }
  }
  try {
    if (cible === '--creer-admin') { creerAdmin(db, pw); console.log('Compte « admin » créé. Connectez-vous avec « admin » et ce mot de passe.'); return 0; }
    const acc = reinitialiser(db, cible, pw);
    console.log(`Mot de passe de « ${acc.login} » (${acc.nom || acc.role}) changé. Ses sessions sont fermées : reconnexion avec le nouveau mot de passe (CRM, Études, DOE).`);
    return 0;
  } catch (e) { console.error(`Rien n'a été changé : ${e.message}`); return 1; }
}

if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(e.message); process.exit(1); });
module.exports = { reinitialiser, creerAdmin, refuse, main };
