// Répertoire des documents sur le serveur : synchronisation dans les deux sens avec les documents des chantiers.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Classement = require('../public/js/classement');

test('noms de dossiers et de fichiers valables sur un partage Windows', () => {
  assert.strictEqual(Classement.propre('Sécurité / PPSPS'), 'Sécurité - PPSPS');
  assert.strictEqual(Classement.propre('plan: "A"?.pdf'), 'plan- -A-.pdf');
  assert.strictEqual(Classement.propre('CON'), '_CON');
  assert.strictEqual(Classement.propre('fin. '), 'fin');
  assert.strictEqual(Classement.dossierChantier({ code: 'CH-2026-001', nom: 'Ligne NEP / inox' }), 'CH-2026-001 - Ligne NEP - inox');
  assert.strictEqual(Classement.dossierChantier({ id: 'x1', code: '', nom: '' }), 'x1');
  assert.strictEqual(Classement.categorieDuDossier('securite - ppsps'), 'Sécurité / PPSPS');
  assert.strictEqual(Classement.categorieDuDossier('Divers'), null);
  assert.ok(Classement.ignore('~$plan.docx') && Classement.ignore('Thumbs.db') && Classement.ignore('_Corbeille') && !Classement.ignore('plan.pdf'));
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-dossier-'));
const racine = path.join(dir, 'Documents');
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.DOCUMENTS_DIR = racine;
const { server, DOSSIER } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie, headers = {}) => {
  const raw = Buffer.isBuffer(body);
  const res = await fetch(base + url, { method, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: method !== 'GET' ? (raw ? body : JSON.stringify(body || {})) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};
const pdf = texte => Buffer.from(`%PDF-1.4\n% ${texte}\n%%EOF\n`, 'latin1');
// Fichier « posé » il y a une minute (une copie en cours, trop récente, est laissée pour le passage suivant)
const poser = (f, buf) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); const t = new Date(Date.now() - 60000); fs.utimesSync(f, t, t); };

test('appli -> répertoire -> appli : dépôt, nouvel indice, rangement, renommage, suppressions', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  const get = async () => (await call('GET', '/api/data', null, admin)).body.affaires.find(a => a.id === 'af1');
  let af1 = await get();
  const ch = path.join(racine, 'Chantiers', Classement.dossierChantier(af1));

  // 1. Premier passage : les documents existants sont écrits, rangés par catégorie
  let r = await DOSSIER.synchroniser();
  assert.strictEqual(r.erreur, '');
  assert.ok(fs.existsSync(path.join(ch, 'Plan', 'Isométrique NEP aller – ISO-NEP-01.pdf')));
  assert.ok(fs.existsSync(path.join(ch, 'Sécurité - PPSPS', 'PPSPS Laiterie des Alpes.pdf')));
  assert.strictEqual((await DOSSIER.synchroniser()).exportes, 0, 'rien à refaire');

  // 2. Fichier copié à la racine du dossier du chantier : apparaît dans l'appli et rangé dans sa catégorie
  poser(path.join(ch, 'Plan implantation chaufferie.pdf'), pdf('implantation'));
  poser(path.join(ch, 'Notice', 'Notice pompe doseuse.pdf'), pdf('notice'));
  poser(path.join(ch, 'Divers', 'Compte rendu réunion.pdf'), pdf('cr'));
  poser(path.join(ch, 'virus.exe'), Buffer.from('MZ'));
  r = await DOSSIER.synchroniser();
  assert.strictEqual(r.importes, 3);
  assert.ok(r.ignores.some(x => /virus\.exe/.test(x)));
  af1 = await get();
  const imp = af1.documents.find(d => d.nom === 'Plan implantation chaufferie.pdf');
  assert.strictEqual(imp.categorie, 'Plan'); assert.strictEqual(imp.visible, true); assert.strictEqual(imp.par, 'Répertoire serveur');
  assert.ok(fs.existsSync(path.join(ch, 'Plan', 'Plan implantation chaufferie.pdf')) && !fs.existsSync(path.join(ch, 'Plan implantation chaufferie.pdf')));
  assert.strictEqual(af1.documents.find(d => d.nom === 'Notice pompe doseuse.pdf').categorie, 'Notice');
  assert.strictEqual(af1.documents.find(d => d.nom === 'Compte rendu réunion.pdf').dossier, 'Divers');
  const contenu = await fetch(`${base}/api/files/${imp.fichierId}`, { headers: { Cookie: admin } }).then(x => x.text());
  assert.match(contenu, /implantation/);

  // Même fichier recopié à la racine : pas de doublon ; contenu différent : nouvel indice
  poser(path.join(ch, 'Plan implantation chaufferie.pdf'), pdf('implantation'));
  r = await DOSSIER.synchroniser();
  assert.strictEqual(r.importes, 0);
  assert.ok(!fs.existsSync(path.join(ch, 'Plan implantation chaufferie.pdf')));
  poser(path.join(ch, 'Plan implantation chaufferie.pdf'), pdf('implantation indice B'));
  r = await DOSSIER.synchroniser();
  assert.strictEqual(r.nouveauxIndices, 1);
  af1 = await get();
  assert.strictEqual(af1.documents.filter(d => d.nom === 'Plan implantation chaufferie.pdf').length, 1);
  assert.strictEqual(af1.documents.find(d => d.nom === 'Plan implantation chaufferie.pdf').indice, 'B');

  // 3. Fichier remplacé dans le répertoire : nouvel indice dans l'appli
  poser(path.join(ch, 'Plan', 'Isométrique NEP aller – ISO-NEP-01.pdf'), pdf('indice C'));
  r = await DOSSIER.synchroniser();
  assert.strictEqual(r.nouveauxIndices, 1);
  af1 = await get();
  let iso = af1.documents.find(d => d.id === 'dc1');
  assert.strictEqual(iso.indice, 'C'); assert.strictEqual(iso.anciens.length, 2);

  // 4. Nouvel indice déposé dans l'appli : écrit dans le répertoire, l'ancien fichier part dans « _Indices précédents »
  const up = await call('POST', '/api/documents/fichier', pdf('indice D'), admin, { 'X-PipeFit-Upload': '1', 'X-Filename': 'iso.pdf', 'Content-Type': 'application/pdf' });
  iso = { ...iso, anciens: [...iso.anciens, { fichierId: iso.fichierId, indice: 'C', date: iso.date }], fichierId: up.body.id, indice: 'D' };
  // Catégorie changée d'un autre document en même temps : le fichier change de dossier
  const notice = af1.documents.find(d => d.nom === 'Notice pompe doseuse.pdf');
  af1.documents = af1.documents.map(d => (d.id === 'dc1' ? iso : d.id === notice.id ? { ...d, categorie: 'Fiche technique' } : d));
  assert.strictEqual((await call('PUT', '/api/records/affaires/af1', { data: af1, version: af1._v }, admin)).status, 200);
  r = await DOSSIER.synchroniser();
  assert.match(fs.readFileSync(path.join(ch, 'Plan', 'Isométrique NEP aller – ISO-NEP-01.pdf'), 'latin1'), /indice D/);
  assert.match(fs.readFileSync(path.join(ch, '_Indices précédents', 'Plan', 'Isométrique NEP aller – ISO-NEP-01 (ind. C).pdf'), 'latin1'), /indice C/);
  assert.ok(fs.existsSync(path.join(ch, 'Fiche technique', 'Notice pompe doseuse.pdf')) && !fs.existsSync(path.join(ch, 'Notice', 'Notice pompe doseuse.pdf')));

  // 5. Fichier renommé dans le répertoire : le document suit (pas de doublon)
  fs.renameSync(path.join(ch, 'Divers', 'Compte rendu réunion.pdf'), path.join(ch, 'Divers', 'CR réunion de lancement.pdf'));
  r = await DOSSIER.synchroniser();
  af1 = await get();
  assert.ok(af1.documents.some(d => d.nom === 'CR réunion de lancement.pdf') && !af1.documents.some(d => d.nom === 'Compte rendu réunion.pdf'));

  // 6. Supprimé dans l'appli -> corbeille du répertoire ; supprimé du répertoire -> retiré de l'appli
  af1.documents = af1.documents.filter(d => d.id !== 'dc2');
  await call('PUT', '/api/records/affaires/af1', { data: af1, version: af1._v }, admin);
  fs.unlinkSync(path.join(ch, 'Plan', 'Plan implantation chaufferie.pdf'));
  r = await DOSSIER.synchroniser();
  assert.ok(!fs.existsSync(path.join(ch, 'Fiche technique', 'Fiche technique vanne papillon DN50.pdf')));
  assert.ok(fs.readdirSync(path.join(racine, '_Corbeille', path.basename(ch))).some(f => f.endsWith('Fiche technique vanne papillon DN50.pdf')));
  af1 = await get();
  assert.ok(!af1.documents.some(d => d.nom === 'Plan implantation chaufferie.pdf'));
  const n = af1.documents.length;

  // 7. Dossier vidé d'un coup (partage débranché, erreur) : rien n'est retiré de l'appli
  for (const sous of ['Plan', 'Photo', 'Autre', 'Sécurité - PPSPS', 'Fiche technique']) fs.rmSync(path.join(ch, sous), { recursive: true, force: true });
  r = await DOSSIER.synchroniser();
  assert.ok(r.alertes.some(x => /rien n'est retiré/.test(x)));
  assert.strictEqual((await get()).documents.length, n);
  assert.ok(fs.existsSync(path.join(ch, 'Plan', 'Isométrique NEP aller – ISO-NEP-01.pdf')), 'fichiers réécrits depuis l\'appli');

  // 8. Chantier renommé dans l'appli : le dossier est renommé
  af1 = await get();
  await call('PUT', '/api/records/affaires/af1', { data: { ...af1, nom: 'Ligne NEP inox (tranche 2)' }, version: af1._v }, admin);
  await DOSSIER.synchroniser();
  assert.ok(fs.existsSync(path.join(racine, 'Chantiers', `${af1.code} - Ligne NEP inox (tranche 2)`, 'Divers', 'CR réunion de lancement.pdf')));
  assert.ok(!fs.existsSync(ch));

  // Réglage et état : bureau en lecture, administrateur seul en écriture
  const etat = await call('GET', '/api/documents/dossier', null, admin);
  assert.strictEqual(etat.body.config.chemin, racine); assert.strictEqual(etat.body.config.impose, true);
});
