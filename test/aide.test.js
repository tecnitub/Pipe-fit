// Guide d'utilisation intégré : contenu de l'aide des trois applications (une rubrique par écran principal, liens
// valides, parcours de 5 à 8 étapes), écran courant déduit de l'adresse, recherche en texte intégral, branchement dans
// les pages (bouton d'en-tête, scripts) et fichier partagé servi par Études et le DOE.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const Aide = require('../public/js/aide');
const APPS = {
  crm: { contenu: require('../public/js/aide-contenu'), html: 'public/index.html', scripts: ['js/aide.js', 'js/aide-contenu.js'] },
  etudes: { contenu: require('../etudes/public/js/aide-contenu'), html: 'etudes/public/index.html', scripts: ['shared/aide.js', 'js/aide-contenu.js'] },
  doe: { contenu: require('../doe/public/js/aide-contenu'), html: 'doe/public/index.html', scripts: ['shared/aide.js', 'js/aide-contenu.js'] },
};

test('chaque route principale a sa rubrique d\'aide, complète, et les écrans liés existent', () => {
  for (const [app, { contenu: C }] of Object.entries(APPS)) {
    const ids = new Set(C.rubriques.map(r => r.id));
    assert.strictEqual(ids.size, C.rubriques.length, `${app} : identifiants de rubrique en double`);
    assert.ok(C.ROUTES.length >= 6, app);
    for (const route of C.ROUTES) assert.ok(ids.has(C.ecran(route, { typeNote: '' })), `${app} : ${route} sans rubrique`);
    for (const r of C.rubriques) {
      assert.ok(r.titre && r.but && r.but.length > 40, `${app}/${r.id} : titre et but`);
      assert.ok((r.actions || []).length >= 1, `${app}/${r.id} : actions principales`);
      (r.liens || []).forEach(l => assert.ok(ids.has(l), `${app}/${r.id} : lien vers ${l} inconnu`));
      if (r.route) assert.match(r.route, /^#\//);
    }
  }
});

test('écrans demandés : CRM, Études (calculs, dialogues) et DOE (sections, génération)', () => {
  const crm = APPS.crm.contenu.ecran, et = APPS.etudes.contenu.ecran, doe = APPS.doe.contenu.ecran;
  assert.deepStrictEqual(['#/dashboard', '#/chantiers', '#/chantier/a1', '#/consultations', '#/commandes/c1', '#/stock', '#/scan', '#/planning/tableau', '#/etapes', '#/reception/a1', '#/pointage', '#/pointage/chantiers', '#/pointage/rapports'].map(h => crm(h)),
    ['accueil', 'chantiers', 'fiche-chantier', 'achats', 'achats', 'stock', 'scan', 'planning', 'etapes', 'reserves', 'compagnon-heures', 'compagnon-chantiers', 'compagnon-rapports']);
  assert.ok(APPS.crm.contenu.rubriques.some(r => r.id === 'contrats'), 'contrats d\'entretien');
  assert.strictEqual(crm('#/chantier/a1/gantt'), 'documents-chantier');
  assert.strictEqual(et('#/'), 'accueil');
  assert.strictEqual(et('#/etude/e1'), 'etude');
  assert.strictEqual(et('#/etude/e1/n1', { typeNote: 'pid' }), 'schema');
  assert.strictEqual(et('#/etude/e1/n1', { typeNote: 'cta' }), 'cta');
  assert.strictEqual(et('#/etude/e1/n1', { typeNote: 'elec' }), 'armoire');
  assert.strictEqual(et('#/etude/e1/n1', { typeNote: 'reseau' }), 'calcul');
  assert.strictEqual(et('#/reglages'), 'reglages');
  // Dialogue ouvert : son aide plutôt que celle de la page
  for (const [titre, id] of [['🏷️ Matériel retenu', 'materiel'], ['📄 Devis fournisseur — X', 'materiel'], ['🗂️ Registre des équipements', 'registre'], ['📥 Matériel en vrac', 'vrac'],
    ['🔎 Contrôle de l\'étude avant envoi', 'controle'], ['📏 Mesures de mise en service et réglages', 'retour'], ['📑 CCTP et DPGF', 'cctp']]) assert.strictEqual(et('#/etude/e1', { modale: titre }), id, titre);
  const ids = new Set(APPS.etudes.contenu.rubriques.map(r => r.id));
  ['guide', 'valeurs', 'retour'].forEach(k => assert.ok(ids.has(k === 'valeurs' ? 'reglages' : k)));
  assert.strictEqual(doe('#/'), 'accueil');
  assert.strictEqual(doe('#/doe/d1/s3'), 'materiel');
  assert.strictEqual(doe('#/doe/d1/s7'), 'maintenance');
  assert.strictEqual(doe('#/doe/d1/inconnue'), 'garde');
  assert.strictEqual(doe('#/doe/d1/garde', { modale: 'Génération du DOE' }), 'generation');
});

test('parcours de démarrage : 5 à 8 étapes, quatre profils, cibles et profil proposé selon le rôle', () => {
  const tous = Object.values(APPS).flatMap(a => a.contenu.parcours);
  const profils = new Set(tous.map(p => p.profil));
  ['Bureau d\'études', 'Conducteur de travaux / chargé d\'affaires', 'Compagnon (appli téléphone)', 'Administrateur'].forEach(p => assert.ok(profils.has(p), p));
  for (const p of tous) {
    assert.ok(p.etapes.length >= 5 && p.etapes.length <= 8, `${p.id} : ${p.etapes.length} étapes`);
    for (const e of p.etapes) {
      assert.ok(e.titre && e.texte && e.texte.length > 20, `${p.id} : ${e.titre}`);
      assert.ok(e.cible && [].concat(e.cible).every(s => typeof s === 'string' && s.length), `${p.id} : cible`);
    }
  }
  const C = APPS.crm.contenu;
  assert.deepStrictEqual(['admin', 'charge', 'atelier'].map(role => C.profil({ role })), ['admin', 'conducteur', 'compagnon']);
  assert.strictEqual(C.parcours.find(p => p.id === 'admin').acces({ role: 'charge' }), false);
  assert.strictEqual(C.parcours.find(p => p.id === 'conducteur').acces({ role: 'atelier' }), false);
});

test('recherche dans l\'aide : texte intégral, sans accents ni majuscules, titre en premier', () => {
  const C = APPS.crm.contenu;
  assert.deepStrictEqual(Aide.rechercher(C, ''), []);
  assert.deepStrictEqual(Aide.rechercher(C, 'a'), [], 'mots d\'une lettre ignorés');
  assert.strictEqual(Aide.rechercher(C, 'QR')[0].id, 'stock');
  assert.strictEqual(Aide.rechercher(C, 'RESERVE levee')[0].id, 'reserves');
  assert.ok(Aide.rechercher(C, 'mieux-disant').some(r => r.id === 'achats'));
  assert.deepStrictEqual(Aide.rechercher(C, 'zzzz introuvable'), []);
  const r = Aide.rechercher(APPS.etudes.contenu, 'armoire gtb')[0];
  assert.strictEqual(r.id, 'armoire');
  assert.ok(r.extrait && r.extrait.length <= 180);
  assert.strictEqual(Aide.rechercher(APPS.doe.contenu, 'série repère')[0].id, 'materiel');
  assert.strictEqual(Aide.normaliser('Œuvre Réservée’s'), 'oeuvre reservee s');
  assert.strictEqual(Aide.rubriqueDe(C, '#/stock').id, 'stock');
  assert.strictEqual(Aide.rubriqueDe(null, '#/'), null);
});

test('pages : bouton « ? Aide » dans l\'en-tête, moteur puis contenu chargés ; fichier partagé servi par Études et le DOE', () => {
  for (const [app, { html, scripts }] of Object.entries(APPS)) {
    const h = fs.readFileSync(path.join(racine, html), 'utf8');
    assert.match(h, /<div class="session">[^\n]*id="aide-bouton"[^\n]*<\/div>/, `${app} : bouton dans l'en-tête`);
    const pos = scripts.map(s => h.indexOf(`<script src="${s}"></script>`));
    assert.ok(pos.every(x => x > 0) && pos[0] < pos[1], `${app} : scripts de l'aide`);
    assert.ok(h.indexOf('js/app.js') < pos[0], `${app} : aide chargée après l'application`);
  }
  assert.match(fs.readFileSync(path.join(racine, 'etudes/server.js'), 'utf8'), /'aide\.js'[^\]]*\]\.map\(f => \[`\/shared\/\$\{f\}`/);
  assert.match(fs.readFileSync(path.join(racine, 'etudes/build-demo.js'), 'utf8'), /'aide\.js'[^\]]*\]\.map\(f => \[`shared\/\$\{f\}`/);
  assert.match(fs.readFileSync(path.join(racine, 'doe/server.js'), 'utf8'), /'\/shared\/aide\.js': path\.join\(PF_PUBLIC, 'js', 'aide\.js'\)/);
  for (const f of ['public/js/aide.js', 'public/js/aide-contenu.js', 'etudes/public/js/aide-contenu.js', 'doe/public/js/aide-contenu.js']) {
    assert.ok(!fs.readFileSync(path.join(racine, f), 'utf8').includes('�'), f);
  }
});
