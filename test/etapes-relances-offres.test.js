// Suivi des étapes, suite : relances par e-mail (un récapitulatif par personne et par jour, désinscription), contrôle à
// la connexion, compagnons du planning pour le rôle « compagnon », avancement ajusté en temps réel dans le CRM (terrain,
// réserves levées, PV de réception), étapes faites entre deux sessions (observer) ; devis lu dans Études ↔ offre de la
// consultation du chantier (OffreEtude). Données fictives.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const SE = require('../etudes/public/js/suivi-etapes');
const OE = require('../public/js/offre-etude');

const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Fonctions pures ---------- */
test('avancement ajusté : étape faite retirée, pourcentage, retards, rouverte seulement si l\'ajustement l\'avait fermée', () => {
  const et = {};
  SE.affecter(et, 'pose', { responsable: { type: 'role', role: 'compagnon' }, echeance: jour(-1) }, { nom: 'Claire' });
  const etapes = [{ id: 'pose', phase: 'chantier', titre: 'Poser la CTA', fait: false }, { id: 'mes', phase: 'mes', titre: 'Mettre en service', fait: false, bloquePar: ['pose'] },
    { id: 'chantier:reserves', phase: 'chantier', titre: 'Lever les réserves sur le chantier', fait: false }, { id: 'climat', phase: 'etude', titre: 'Climat', fait: true }];
  etapes.actives = ['etude', 'chantier', 'mes'];
  const av = SE.mettreAJour(et, null, { etapes });
  assert.deepStrictEqual([av.faits, av.total, av.pct, av.retards], [1, 4, 25, 1]);
  assert.deepStrictEqual(av.actives, ['etude', 'chantier', 'mes']);
  const a2 = SE.ajusterAvancement(av, [{ id: 'pose', fait: true }], { source: 'terrain', par: 'Kevin', le: '2026-11-15T08:00:00.000Z' });
  assert.deepStrictEqual([a2.faits, a2.pct, a2.retards, a2.phases.chantier.faits], [2, 50, 0, 1]);
  assert.ok(!a2.restes.some(r => r.id === 'pose'));
  assert.ok(!a2.restes.find(r => r.id === 'mes').bloquePar, 'plus bloquée');
  assert.deepStrictEqual(SE.fraicheur(a2), { calcule: av.le, ajuste: '2026-11-15T08:00:00.000Z', source: 'terrain', par: 'Kevin' });
  assert.strictEqual(av.restes.length, 3, 'résumé d\'origine intact');
  assert.strictEqual(SE.ajusterAvancement(a2, [{ id: 'pose', fait: true }]), null, 'déjà fait : rien');
  assert.strictEqual(SE.ajusterAvancement(a2, [{ id: 'climat', fait: false }]), null, 'faite dans Études : jamais rouverte par le CRM');
  const a3 = SE.ajusterAvancement(a2, [{ id: 'pose', fait: false }], { source: 'chantier' });
  assert.deepStrictEqual([a3.faits, a3.pct, a3.restes.some(r => r.id === 'pose')], [1, 25, true]);
  // Données du chantier : réserves venues de l'étude toutes levées, PV de réception signé
  const res = [{ affaireId: 'af1', statut: 'Levée', origine: { app: 'etudes', etudeId: 'et1', cle: 'r1' } }, { affaireId: 'af1', statut: 'Ouverte', origine: { app: 'etudes', etudeId: 'et2', cle: 'r2' } }];
  assert.deepStrictEqual(SE.etatsChantier({ reserves: res, receptions: [], affaire: { statut: 'En cours' } }, 'et1'), { 'chantier:reserves': true, 'reception:pv': false });
  assert.deepStrictEqual(SE.etatsChantier({ reserves: res, receptions: [{ type: 'reception', statut: 'Signé' }] }, 'et3'), { 'reception:pv': true });
});

test('étapes faites ou rouvertes entre deux sessions : notées à l\'ouverture, date d\'observation et source', () => {
  const et = { id: 'et1', affaireId: 'af1' }, claire = { nom: 'Claire', id: 'u1' };
  const e = (id, fait, phase = 'etude') => ({ id, titre: id, phase, fait });
  const s1 = [e('climat', true), e('calcul', false), e('chantier:reserves', false, 'chantier'), e('pose', false, 'chantier'), e('fiches', true)];
  SE.mettreAJour(et, claire, { etapes: s1, date: '2026-11-10T10:00:00.000Z' });
  assert.deepStrictEqual(et.suiviEtapes._etats.f, ['climat', 'fiches']);
  // Étapes calculées sans les données du chantier : pas d'état gardé
  const inc = s1.slice(); inc.complet = false;
  SE.suivreEtats(et, inc, claire, '2026-11-11T10:00:00.000Z');
  assert.strictEqual(et.suiviEtapes._etats.le, '2026-11-10T10:00:00.000Z');
  // Entre-temps : réserves levées (chantier), pose faite sur le terrain, étude modifiée par Paul, fiche rouverte
  SE.fusionnerTerrain(et, [{ etapeId: 'pose', cle: 'k1', le: '2026-11-12', par: 'Kevin', commentaire: 'Posée' }]);
  Object.assign(et, { _by: 'Paul', _at: '2026-11-13T09:00:00.000Z' });
  const s2 = [e('climat', true), e('calcul', true), e('chantier:reserves', true, 'chantier'), e('pose', false, 'chantier'), e('fiches', false)];
  const vus = SE.observer(et, s2, { user: claire, date: '2026-11-15T07:30:00.000Z' });
  assert.deepStrictEqual(vus.map(x => `${x.id}:${x.action}:${x.source}`).sort(), ['calcul:fait:utilisateur', 'chantier:reserves:fait:utilisateur', 'fiches:rouvert:utilisateur']);
  const h = SE.historique(et, 'calcul').pop();
  assert.deepStrictEqual([h.action, h.le, h.observe, h.par], ['fait', '2026-11-15T07:30:00.000Z', true, 'Claire']);
  assert.match(h.detail, /Constaté à l'ouverture de l'étude : faite depuis le 10\/11\/2026 \(étude modifiée par Paul\)/);
  assert.strictEqual(SE.historique(et, 'pose').filter(x => x.action === 'fait').length, 0, 'terrain : déjà « fait sur le terrain »');
  assert.strictEqual(SE.suivi(et, 'pose').etat, 'fait');
  assert.deepStrictEqual(SE.observer(et, s2, { user: claire }), [], 'pas de doublon');
  // Sans autre utilisateur : source « données du chantier » pour une étape du chantier
  const et2 = { id: 'et2' };
  SE.mettreAJour(et2, claire, { etapes: [e('chantier:reserves', false, 'chantier')] });
  assert.deepStrictEqual(SE.observer(et2, [e('chantier:reserves', true, 'chantier')], { user: claire }).map(x => x.source), ['chantier']);
  // Première ouverture : rien de noté, état pris
  const et3 = {};
  assert.deepStrictEqual(SE.observer(et3, s1, { user: claire }), []);
  assert.ok(et3.suiviEtapes._etats);
  // Le suivi noté au prochain enregistrement ne double pas l'entrée
  assert.strictEqual(SE.suivreEtats(et, s2, claire), 0);
});

test('récapitulatif des relances par e-mail : sujet, lignes, liens, désinscription', () => {
  const m = SE.mailRelances({ nom: 'Claire', items: [{ type: 'retard', texte: 'Étude ACME — Commander la CTA : échéance dépassée', code: 'CH-001', etudeId: 'et1' }, { type: 'bientot', texte: 'Étude ACME — Poser <b>', code: 'CH-001', affaireId: 'af1' }],
    liens: { etapes: 'https://crm.exemple.fr/#/etapes', etude: id => `https://etudes.exemple.fr/#/etude/${id}`, preferences: 'https://crm.exemple.fr/#/etapes?preferences=1' }, societe: 'Exemple SARL', today: '2026-11-15' });
  assert.strictEqual(m.sujet, '1 étape(s) en retard — CH-001 (récapitulatif du 15/11/2026)');
  assert.match(m.html, /https:\/\/etudes\.exemple\.fr\/#\/etude\/et1/);
  assert.match(m.html, /Ne plus recevoir ces e-mails/);
  assert.match(m.html, /Poser &lt;b&gt;/, 'texte échappé');
  assert.match(m.texte, /- CH-001 · Étude ACME — Commander la CTA/);
});

test('offre de la consultation : fournisseur, consultation du matériel retenu, pas de doublon, sens inverse', () => {
  const ents = [{ id: 'c1', nom: 'Client SA', categorie: 'Client' }, { id: 'f1', nom: 'Distri-Clim SAS', categorie: 'Fournisseur' }, { id: 'f2', nom: 'Thermo Négoce', categorie: 'Fournisseur' }];
  assert.strictEqual(OE.trouverFournisseur(ents, 'DISTRI CLIM').id, 'f1');
  assert.strictEqual(OE.trouverFournisseur(ents, 'Thermo Négoce Ouest').id, 'f2');
  assert.strictEqual(OE.trouverFournisseur(ents, 'Client'), null);
  const cs = [{ id: 'cs1', affaireId: 'af1', statut: 'En cours', date: '2026-11-01', lignes: [{ designation: 'Autre', qte: 1 }] },
    { id: 'cs2', affaireId: 'af1', statut: 'En cours', date: '2026-10-01', lignes: [{ designation: 'CTA', qte: 1, materiel: { etudeId: 'et1', cle: 'cta' } }] },
    { id: 'cs3', affaireId: 'af1', statut: 'Attribuée', lignes: [{ designation: 'CTA', qte: 1, materiel: { etudeId: 'et1', cle: 'cta' } }, { materiel: { etudeId: 'et1', cle: 'pac' } }] }];
  assert.strictEqual(OE.trouverConsultation(cs, { affaireId: 'af1', etudeId: 'et1', cles: ['cta', 'pac'] }).id, 'cs2', 'en cours et liée au matériel');
  assert.strictEqual(OE.trouverConsultation(cs, { affaireId: 'af2', etudeId: 'et1', cles: ['cta'] }), null);
  const c = JSON.parse(JSON.stringify(cs[1]));
  const { index, ajoutees } = OE.completerLignes(c, 'et1', [{ cle: 'cta', designation: 'CTA' }, { cle: 'pac', designation: 'PAC air/eau', fabricant: 'Fab', reference: 'P-12', qte: 2 }]);
  assert.deepStrictEqual([index, ajoutees, c.lignes[1].materiel.reference, c.lignes[1].qte], [{ cta: 0, pac: 1 }, 1, 'P-12', 2]);
  const devis = { fournisseur: 'Distri-Clim', numero: 'D-100', date: '2026-11-10', validite: '2026-12-10', totalFrais: 45, lignes: [{ cle: 'cta', pu: 1200, reference: 'CTA-1' }] };
  let r = OE.appliquerOffre(c, 'f1', devis, index, { etudeId: 'et1', devisId: 'd1', pieceId: 'p1', pieceNom: 'D-100.pdf', par: 'Claire', jour: '2026-11-15', source: 'Devis Distri-Clim n° D-100' });
  assert.deepStrictEqual([r.etat, r.lignes, c.fournisseurs.length, c.fournisseurs[0].statut, c.fournisseurs[0].offre.prix, c.fournisseurs[0].offre.port], ['creee', 1, 1, 'Offre reçue', { 0: 1200 }, 45]);
  // Même fournisseur, même n° : offre complétée (une seule offre, prix ajoutés)
  r = OE.appliquerOffre(c, 'f1', { ...devis, numero: 'd 100', lignes: [{ cle: 'pac', pu: 3400 }] }, index, { jour: '2026-11-16' });
  assert.deepStrictEqual([r.etat, c.fournisseurs.length, c.fournisseurs[0].offre.prix, c.fournisseurs[0].offre.pieceId], ['completee', 1, { 0: 1200, 1: 3400 }, 'p1']);
  // Nouveau n° : offre remplacée, ancien n° gardé
  r = OE.appliquerOffre(c, 'f1', { ...devis, numero: 'D-200', lignes: [{ cle: 'cta', pu: 1150 }] }, index, { jour: '2026-11-17' });
  assert.deepStrictEqual([r.etat, c.fournisseurs[0].offre.prix, c.fournisseurs[0].offre.remplace.reference], ['remplacee', { 0: 1150 }, 'D-100']);
  // Sens inverse : offre saisie dans le CRM (autre fournisseur, remise globale) → étude
  c.fournisseurs.push({ entrepriseId: 'f2', statut: 'Offre reçue', offre: { prix: { 0: 1000, 1: '' }, remise: 10, reference: 'TN-7', refs: { 0: 'X1' } } });
  const offres = OE.offresEtude([c], 'et1', id => (ents.find(e => e.id === id) || {}).nom);
  assert.deepStrictEqual(offres.map(o => [o.fournisseur, o.lignes.map(l => [l.cle, l.pu])]), [['Distri-Clim SAS', [['cta', 1150]]], ['Thermo Négoce', [['cta', 900]]]]);
  const et = { id: 'et1', materiel: { cta: { prix: { pu: 1300, devisId: 'local' } } }, devisFournisseurs: [{ id: 'd1', fournisseur: 'Distri-Clim', numero: 'D-100' }] };
  const saisies = [], saisir = (l, p) => { saisies.push([l.cle, p.pu]); et.materiel[l.cle] = { ...(et.materiel[l.cle] || {}), prix: p }; };
  let v = OE.versEtude(et, offres, { lignes: [{ cle: 'cta' }, { cle: 'pac' }], saisir, today: '2026-11-18' });
  assert.deepStrictEqual(v, { devis: 2, prix: 0 }, 'prix déjà choisi dans l\'étude : gardé');
  assert.deepStrictEqual(et.devisFournisseurs.filter(d => d.origine === 'crm').map(d => d.fournisseur), ['Distri-Clim SAS', 'Thermo Négoce']);
  // Offre retenue dans le CRM : son prix passe dans l'étude ; relue sans changement : rien
  offres[1].retenue = true;
  v = OE.versEtude(et, offres, { lignes: [{ cle: 'cta' }], saisir, today: '2026-11-18' });
  assert.deepStrictEqual([v.prix, saisies], [1, [['cta', 900]]]);
  assert.deepStrictEqual(OE.versEtude(et, offres, { lignes: [{ cle: 'cta' }], saisir }), { devis: 0, prix: 0 });
  // Offre née d'un devis de cette étude : pas reprise
  assert.deepStrictEqual(OE.versEtude({ id: 'et1', devisFournisseurs: [{ id: 'd1' }] }, [{ ...offres[0], origine: { etudeId: 'et1', devisId: 'd1' } }], { lignes: [{ cle: 'cta' }], saisir }), { devis: 0, prix: 0 });
});

/* ---------- Serveur ---------- */
const appels = [];
const graph = http.createServer((req, res) => {
  let corps = ''; req.on('data', c => { corps += c; });
  req.on('end', () => {
    appels.push({ u: decodeURIComponent(req.url), b: corps.startsWith('{') ? JSON.parse(corps) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/oauth2/v2.0/token')) return res.end(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }));
    if (/\/sendMail$/.test(req.url)) { res.statusCode = 202; return res.end('{}'); }
    res.statusCode = 404; return res.end('{}');
  });
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-etapes2-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.PIPEFIT_PUBLIC_URL = 'https://crm.exemple.fr';
let base, server, db, RELANCES;
before(async () => {
  await new Promise(r => graph.listen(0, '127.0.0.1', r));
  process.env.M365_LOGIN_URL = process.env.M365_GRAPH_URL = `http://127.0.0.1:${graph.address().port}`;
  ({ server, db, RELANCES } = require('../server/server'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); server.closeAllConnections(); graph.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};
const login = async (l, p) => (await call('POST', '/api/login', { login: l, password: p })).cookie;
const pause = ms => new Promise(r => setTimeout(r, ms));
const mails = () => appels.filter(a => /\/sendMail$/.test(a.u));

test('serveur : relances par e-mail, compagnons du planning, contrôle à la connexion, avancement en temps réel', async () => {
  const admin = await login('admin', 'admin-test-pw');
  await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', clientSecret: 's', actif: true }, admin);
  assert.strictEqual((await call('PUT', '/api/mail/adresses', { etapes: { expediteur: 'pipefit@exemple.fr' } }, admin)).status, 200);
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1', email: 'claire@exemple.fr' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse2', role: 'atelier', nom: 'Kevin', userId: 'o1', email: 'kevin@exemple.fr' }, admin);
  await call('POST', '/api/accounts', { login: 'lucas', password: 'motdepasse3', role: 'atelier', nom: 'Lucas', userId: 'o3' }, admin);
  await call('POST', '/api/accounts', { login: 'paul', password: 'motdepasse4', role: 'atelier', nom: 'Paul', userId: 'o4' }, admin);
  const claire = await login('claire', 'motdepasse1'), kevin = await login('kevin', 'motdepasse2'), lucas = await login('lucas', 'motdepasse3'), paul = await login('paul', 'motdepasse4');
  assert.strictEqual((await call('PUT', '/api/records/affaires/aft1', { data: { code: 'CH-001', nom: 'Chantier fictif', chargeId: 'u1', statut: 'En cours' } }, admin)).status, 200);
  // Kevin et Lucas prévus au planning du chantier (deux jours pour Kevin : pas de doublon), Paul ailleurs
  for (const [id, userId, date, affaireId] of [['plt1', 'o1', jour(0), 'aft1'], ['plt2', 'o1', jour(1), 'aft1'], ['plt3', 'o3', jour(0), 'aft1'], ['plt4', 'o4', jour(0), 'aft9']])
    assert.strictEqual((await call('PUT', `/api/records/planning/${id}`, { data: { userId, affaireId, date } }, admin)).status, 200);

  const et = {};
  SE.affecter(et, 'pose', { responsable: { type: 'role', role: 'compagnon' }, echeance: jour(-1) }, { nom: 'Claire' });
  SE.affecter(et, 'commande', { responsable: { type: 'user', id: 'u1', nom: 'Claire' }, echeance: jour(1) }, { nom: 'Claire' });
  const etapes = [{ id: 'pose', phase: 'chantier', titre: 'Poser la CTA', fait: false }, { id: 'commande', phase: 'achats', titre: 'Commander la CTA', fait: false },
    { id: 'chantier:reserves', phase: 'chantier', titre: 'Lever les réserves sur le chantier', fait: false }, { id: 'reception:pv', phase: 'reception', titre: 'Prononcer la réception des travaux', fait: false }];
  SE.mettreAJour(et, null, { etapes });
  assert.strictEqual((await call('PUT', '/api/liens/etudes/ett1', { affaireId: 'aft1', resume: { objet: 'Étude fictive', avancement: et.avancement } }, claire)).status, 200);

  // Étapes dues à l'ouverture de session : chacun les siennes
  assert.deepStrictEqual((await call('GET', '/api/liens/etapes/dues', null, kevin)).body.map(x => x.etapeId), ['pose']);
  assert.deepStrictEqual((await call('GET', '/api/liens/etapes/dues', null, lucas)).body.map(x => x.etapeId), ['pose']);
  assert.deepStrictEqual((await call('GET', '/api/liens/etapes/dues', null, paul)).body, [], 'pas au planning de ce chantier');
  assert.deepStrictEqual((await call('GET', '/api/liens/etapes/dues', null, claire)).body.map(x => x.etapeId), ['commande']);
  // Désinscription de Lucas (et il n'a pas d'adresse) ; Claire garde le récapitulatif
  assert.deepStrictEqual((await call('GET', '/api/liens/etapes/preferences', null, claire)).body, { email: true, adresse: true });
  assert.deepStrictEqual((await call('PUT', '/api/liens/etapes/preferences', { email: false }, kevin)).body, { email: false, adresse: true });

  // Contrôle : cloche des compagnons du planning (une fois chacun), récapitulatif par e-mail (Claire seulement : Kevin désinscrit)
  const n = await RELANCES.verifier();
  assert.strictEqual(n, 2);
  const notifs = db.prepare("SELECT data FROM records WHERE col = 'notifications'").all().map(r => JSON.parse(r.data)).filter(x => x.type === 'etape');
  assert.deepStrictEqual(notifs.map(x => x.userId).sort(), ['o1', 'o3', 'u1']);
  assert.deepStrictEqual(mails().map(m => m.b.message.toRecipients[0].emailAddress.address), ['claire@exemple.fr']);
  const m = mails()[0];
  assert.ok(m.u.includes('/users/pipefit@exemple.fr/sendMail'), 'adresse d\'envoi des relances');
  assert.match(m.b.message.subject, /1 étape\(s\) à suivre — CH-/);
  assert.match(m.b.message.body.content, /https:\/\/crm\.exemple\.fr\/#\/etapes\?preferences=1/);
  assert.doesNotMatch(JSON.stringify(m.b), /clientSecret|"s"/, 'pas de secret dans le message');
  // Le jour même : une nouvelle relance attend le récapitulatif du lendemain
  const et2 = {};
  SE.affecter(et2, 'calcul', { responsable: { type: 'user', id: 'u1', nom: 'Claire' }, echeance: jour(-3) }, { nom: 'Claire' });
  SE.mettreAJour(et2, null, { etapes: [{ id: 'calcul', phase: 'etude', titre: 'Faire le bilan', fait: false }] });
  await call('PUT', '/api/liens/etudes/ett2', { affaireId: 'aft1', resume: { objet: 'Étude fictive 2', avancement: et2.avancement } }, claire);
  assert.strictEqual(await RELANCES.verifier(), 1);
  assert.strictEqual(mails().length, 1, 'un e-mail par personne et par jour au plus');
  assert.strictEqual(await RELANCES.verifier(jour(1)), 0);
  assert.strictEqual(mails().length, 2);
  assert.match(mails()[1].b.message.body.content, /Faire le bilan/);
  assert.strictEqual(await RELANCES.verifier(jour(1)), 0);
  assert.strictEqual(mails().length, 2);

  // Étape cochée sur le terrain : avancement du CRM à jour tout de suite, avec sa fraîcheur
  assert.strictEqual((await call('POST', '/api/liens/etapes/fait', { etudeId: 'ett1', etapeId: 'pose', commentaire: 'Posée' }, kevin)).status, 200);
  let pf = (await call('GET', '/api/liens/etapes', null, claire)).body.find(x => x.etudeId === 'ett1');
  assert.deepStrictEqual([pf.avancement.faits, pf.avancement.restes.some(r => r.id === 'pose'), pf.fraicheur.source, pf.fraicheur.par], [1, false, 'terrain', 'Kevin']);
  assert.ok(pf.fraicheur.ajuste && pf.fraicheur.calcule);
  // Toujours dans « Mes étapes » de Kevin, cochée ; Paul ne la voit pas
  assert.strictEqual((await call('GET', '/api/liens/etapes/mes', null, kevin)).body.find(e => e.id === 'pose').faitTerrain.commentaire, 'Posée');
  assert.deepStrictEqual((await call('GET', '/api/liens/etapes/mes', null, paul)).body, []);
  // Réserve de l'étude levée sur le chantier, puis PV de réception signé : ajustés sans enregistrer l'étude
  assert.strictEqual((await call('PUT', '/api/records/reserves/rst1', { data: { affaireId: 'aft1', numero: '1', statut: 'Levée', origine: { app: 'etudes', etudeId: 'ett1', cle: 'r1' } } }, admin)).status, 200);
  await pause(700);
  pf = (await call('GET', '/api/liens/etapes', null, claire)).body.find(x => x.etudeId === 'ett1');
  assert.deepStrictEqual([pf.avancement.faits, pf.avancement.restes.map(r => r.id).sort(), pf.fraicheur.source], [2, ['commande', 'reception:pv'], 'chantier']);
  assert.strictEqual((await call('PUT', '/api/records/receptions/pvt1', { data: { affaireId: 'aft1', type: 'reception', statut: 'Signé', date: jour(0) } }, admin)).status, 200);
  await pause(700);
  pf = (await call('GET', '/api/liens/etapes', null, claire)).body.find(x => x.etudeId === 'ett1');
  assert.deepStrictEqual([pf.avancement.faits, pf.avancement.pct], [3, 75]);
  // Étude enregistrée de nouveau dans Études (sans les données du chantier) : recalage, puis données du chantier réappliquées
  const r = await call('PUT', '/api/liens/etudes/ett1', { affaireId: 'aft1', resume: { objet: 'Étude fictive', avancement: et.avancement } }, claire);
  assert.deepStrictEqual([r.body.resume.avancement.faits, r.body.resume.avancement.restes.map(x => x.id)], [3, ['commande']]);
});

test('serveur : devis lu dans Études → offre de la consultation (créée, complétée, sans doublon), sens inverse', async () => {
  const admin = await login('admin', 'admin-test-pw'), claire = await login('claire', 'motdepasse1'), kevin = await login('kevin', 'motdepasse2');
  const pdf = Buffer.from('%PDF-1.4\n% devis fictif\n').toString('base64');
  const corps = { etudeId: 'ett1', devisId: 'd1', devis: { fournisseur: 'Distri-Clim', numero: 'D-100', date: '2026-11-10', totalFrais: 30, lignes: [{ cle: 'cta', pu: 1200, reference: 'CTA-1', designation: 'CTA double flux', qte: 1 }] },
    materiel: [{ cle: 'cta', designation: 'CTA', reference: 'CTA-1', fabricant: 'Fab', qte: 1 }, { cle: 'pac', designation: 'PAC', qte: 2 }], pdf: { nom: 'D-100.pdf', base64: pdf } };
  assert.strictEqual((await call('POST', '/api/liens/offre-etude', corps, kevin)).status, 403, 'bureau seulement');
  assert.strictEqual((await call('POST', '/api/liens/offre-etude', { ...corps, etudeId: 'inconnue' }, claire)).status, 400);
  let r = await call('POST', '/api/liens/offre-etude', corps, claire);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.cree, r.body.offre, r.body.lignes, r.body.fournisseurCree, r.body.piece], [true, 'creee', 1, true, true]);
  const id = r.body.consultationId;
  let c = (await call('GET', `/api/records/consultations/${id}`, null, admin)).body;
  assert.match(c.ref, /^CS/);
  assert.deepStrictEqual(c.lignes.map(l => l.materiel.cle), ['cta', 'pac'], 'tout le matériel retenu, relié par clé');
  assert.deepStrictEqual([c.fournisseurs.length, c.fournisseurs[0].offre.prix, c.fournisseurs[0].offre.reference, c.fournisseurs[0].offre.port, c.fournisseurs[0].offre.origine.etudeId], [1, { 0: 1200 }, 'D-100', 30, 'ett1']);
  assert.match(c.fournisseurs[0].offre.source, /Devis Distri-Clim n° D-100 du 10\/11\/2026/);
  // Même fournisseur + même n° : complétée, pas de doublon ni de nouvelle consultation, fournisseur retrouvé
  r = await call('POST', '/api/liens/offre-etude', { ...corps, devis: { ...corps.devis, fournisseur: 'DISTRI CLIM', lignes: [{ cle: 'pac', pu: 3400 }] }, pdf: undefined }, claire);
  assert.deepStrictEqual([r.body.consultationId, r.body.cree, r.body.offre, r.body.fournisseurCree], [id, false, 'completee', false]);
  c = (await call('GET', `/api/records/consultations/${id}`, null, admin)).body;
  assert.deepStrictEqual([c.fournisseurs.length, c.fournisseurs[0].offre.prix, !!c.fournisseurs[0].offre.pieceId], [1, { 0: 1200, 1: 3400 }, true]);
  // Offre saisie dans le CRM par un autre fournisseur : remonte vers l'étude
  c.fournisseurs.push({ entrepriseId: 'f-autre', statut: 'Offre reçue', offre: { prix: { 0: 1100 }, reference: 'TN-1' } });
  assert.strictEqual((await call('PUT', `/api/records/consultations/${id}`, { data: c, version: c._v }, admin)).status, 200);
  assert.strictEqual((await call('GET', '/api/liens/offres-etude?etudeId=ett1', null, kevin)).status, 403);
  const offres = (await call('GET', '/api/liens/offres-etude?etudeId=ett1', null, claire)).body;
  assert.deepStrictEqual(offres.map(o => [o.numero, o.lignes.map(l => [l.cle, l.pu])]), [['D-100', [['cta', 1200], ['pac', 3400]]], ['TN-1', [['cta', 1100]]]]);
  assert.deepStrictEqual(offres[0].origine, { etudeId: 'ett1', devisId: 'd1' });
});
