// Suivi des étapes du « Reste à faire » (etudes/public/js/suivi-etapes.js) : responsable, échéance, sans objet justifié,
// historique, avancement mis en cache, portefeuille, étapes d'une personne et relances — sur des étapes fictives.
const { test } = require('node:test');
const assert = require('node:assert');
const SE = require('../etudes/public/js/suivi-etapes');

const ETAPES = () => [
  { id: 'climat', groupe: 'donnees', titre: 'Climat du site', fait: true },
  { id: 'notes', groupe: 'emission', titre: 'Émettre les notes', fait: false },
  { id: 'commande-cta', phase: 'Achats', titre: 'Commander la CTA', fait: false },
  { id: 'pose-cta', phase: 'chantier', titre: 'Poser la CTA', fait: false, bloquePar: ['commande-cta'] },
  { id: 'mes-cta', phase: 'Mise en service', titre: 'Mettre en service la CTA', fait: false },
  { id: 'desenfumage', phase: 'mes', titre: 'Essais de désenfumage', fait: false },
];
const claire = { id: 'u1', nom: 'Claire Martin', role: 'charge' }, kevin = { id: 'o1', nom: 'Kevin Roux', role: 'atelier' };

test('Phases : clés, libellés et défaut « étude »', () => {
  assert.strictEqual(SE.normPhase('Mise en service'), 'mes');
  assert.strictEqual(SE.normPhase('Réception'), 'reception');
  assert.strictEqual(SE.normPhase('DOE'), 'doe');
  assert.strictEqual(SE.phaseDe({ groupe: 'calculs' }), 'etude');
  assert.deepStrictEqual(SE.decorer({}, ETAPES()).map(e => e.phase), ['etude', 'etude', 'achats', 'chantier', 'mes', 'mes']);
});

test('Affectation : responsable, échéance, historique ; correspondance personne / rôle', () => {
  const et = {};
  assert.ok(SE.affecter(et, 'pose-cta', { responsable: { type: 'user', id: 'o1', nom: 'Kevin Roux' }, echeance: '2026-11-20' }, claire, '2026-11-10T08:00:00Z'));
  assert.strictEqual(SE.affecter(et, 'pose-cta', { responsable: { type: 'user', id: 'o1', nom: 'Kevin Roux' }, echeance: '2026-11-20' }, claire), false, 'rien de changé : pas d\'entrée');
  SE.affecter(et, 'notes', { responsable: { type: 'role', role: 'be' } }, claire);
  SE.affecter(et, 'commande-cta', { responsable: { type: 'role', role: 'conducteur' }, echeance: '2026-11-12' }, claire);
  const h = SE.historique(et, 'pose-cta');
  assert.strictEqual(h.length, 1);
  assert.deepStrictEqual([h[0].action, h[0].par, h[0].parId], ['affecte', 'Claire Martin', 'u1']);
  assert.match(h[0].detail, /Kevin Roux, échéance 20\/11\/2026/);
  const d = SE.decorer(et, ETAPES(), { today: '2026-11-18' });
  assert.strictEqual(d.find(e => e.id === 'pose-cta').etatEcheance, 'bientot');
  assert.strictEqual(d.find(e => e.id === 'commande-cta').etatEcheance, 'retard');
  assert.deepStrictEqual(SE.mesEtapes(d, kevin).map(e => e.id), ['pose-cta']);
  assert.deepStrictEqual(SE.mesEtapes(d, claire).map(e => e.id), ['notes', 'commande-cta'], 'chargée d\'affaires : BE et conducteur');
  assert.deepStrictEqual(SE.mesEtapes(d, claire, { chargeId: 'u2' }).map(e => e.id), ['notes'], 'conducteur = chargé d\'affaires du chantier');
  // Responsable retiré
  SE.affecter(et, 'pose-cta', {}, claire);
  assert.strictEqual(SE.suivi(et, 'pose-cta').responsable, undefined);
  assert.strictEqual(SE.responsableValide({ type: 'role', role: 'pirate' }), null);
});

test('Sans objet : motif obligatoire, compte comme fait, tracé ; rétablir', () => {
  const et = {};
  assert.throws(() => SE.marquerSansObjet(et, 'desenfumage', '  ', claire), /Motif obligatoire/);
  SE.marquerSansObjet(et, 'desenfumage', 'Pas de désenfumage mécanique (CCTP § 4.2)', claire, '2026-11-10T09:00:00Z');
  assert.ok(SE.estSansObjet(et, 'desenfumage'));
  const e = SE.decorer(et, ETAPES()).find(x => x.id === 'desenfumage');
  assert.deepStrictEqual([e.fait, e.sansObjet, e.motif, e.sansObjetPar], [true, true, 'Pas de désenfumage mécanique (CCTP § 4.2)', 'Claire Martin']);
  assert.ok(SE.retablir(et, 'desenfumage', claire));
  assert.strictEqual(SE.estSansObjet(et, 'desenfumage'), false);
  assert.deepStrictEqual(SE.historique(et, 'desenfumage').map(h => h.action), ['sans-objet', 'retabli']);
  assert.strictEqual(SE.retablir(et, 'desenfumage', claire), false);
});

test('Historique : fait noté une fois, rouvert, fait sur le terrain', () => {
  const et = {}, etapes = ETAPES();
  assert.strictEqual(SE.suivreEtats(et, etapes, claire), 1, 'climat fait');
  assert.strictEqual(SE.suivreEtats(et, etapes, claire), 0, 'pas de doublon');
  assert.strictEqual(SE.noterFait(et, etapes[0], claire), false);
  etapes[0].fait = false;
  assert.strictEqual(SE.suivreEtats(et, etapes, claire), 1);
  assert.deepStrictEqual(SE.historique(et, 'climat').map(h => h.action), ['fait', 'rouvert']);
  assert.strictEqual(SE.suivi(et, 'notes').historique, undefined, 'étape jamais faite : pas d\'entrée');
  // Retour du terrain : fait, avec commentaire et photo ; relu deux fois sans doublon
  const r = [{ etudeId: 'e1', etapeId: 'pose-cta', cle: 'k1', le: '2026-11-12', par: 'Kevin Roux', parId: 'o1', commentaire: 'CTA posée sur plots', photoId: 'f1' }];
  assert.strictEqual(SE.fusionnerTerrain(et, r), 1);
  assert.strictEqual(SE.fusionnerTerrain(et, r), 0);
  const e = SE.decorer(et, etapes).find(x => x.id === 'pose-cta');
  assert.ok(e.fait && e.faitTerrain && e.faitTerrain.photoId === 'f1');
  assert.strictEqual(SE.historique(et, 'pose-cta')[0].action, 'fait-terrain');
  SE.suivreEtats(et, etapes, claire);
  assert.deepStrictEqual(SE.historique(et, 'pose-cta').map(h => h.action), ['fait-terrain'], 'pas de doublon « fait »');
});

test('Avancement mis en cache : %, phases, retards, restes compacts, blocages ouverts', () => {
  const et = {};
  SE.affecter(et, 'commande-cta', { responsable: { type: 'role', role: 'conducteur' }, echeance: '2026-11-01' }, claire);
  SE.marquerSansObjet(et, 'desenfumage', 'Sans objet', claire);
  const av = SE.mettreAJour(et, claire, { etapes: ETAPES(), today: '2026-11-15' });
  assert.strictEqual(et.avancement, av);
  assert.deepStrictEqual([av.faits, av.total, av.pct, av.sansObjet, av.retards], [2, 6, 33, 1, 1]);
  assert.deepStrictEqual(av.phases.mes, { faits: 1, total: 2 });
  assert.strictEqual(av.restes[0].id, 'commande-cta', 'retards d\'abord');
  assert.deepStrictEqual(av.restes.find(r => r.id === 'pose-cta').bloquePar, ['commande-cta']);
  assert.ok(JSON.stringify(av).length < 3000, 'résumé léger');
  assert.strictEqual(SE.mettreAJour({ modele: true }, claire, { etapes: ETAPES() }), null);
});

test('Portefeuille : filtres responsable, phase, retard, utilisateur', () => {
  const e1 = {}, e2 = {};
  SE.affecter(e1, 'pose-cta', { responsable: { type: 'user', id: 'o1', nom: 'Kevin Roux' }, echeance: '2026-11-10' }, claire);
  SE.affecter(e2, 'notes', { responsable: { type: 'role', role: 'be' }, echeance: '2026-12-01' }, claire);
  SE.mettreAJour(e1, claire, { etapes: ETAPES(), today: '2026-11-15' });
  SE.mettreAJour(e2, claire, { etapes: ETAPES(), today: '2026-11-15' });
  const items = [{ etudeId: 'e1', objet: 'Lycée', affaireId: 'a1', avancement: e1.avancement }, { etudeId: 'e2', objet: 'EHPAD', affaireId: 'a2', avancement: e2.avancement }, { etudeId: 'e3', objet: 'Sans résumé' }];
  assert.strictEqual(SE.portefeuille(items, {}, '2026-11-15').etudes.length, 2);
  const r = SE.portefeuille(items, { retard: true }, '2026-11-15');
  assert.deepStrictEqual(r.lignes.map(l => [l.etudeId, l.id]), [['e1', 'pose-cta']]);
  assert.deepStrictEqual(SE.portefeuille(items, { responsable: 'role:be' }, '2026-11-15').lignes.map(l => l.etudeId), ['e2']);
  assert.deepStrictEqual(SE.portefeuille(items, { moi: kevin }, '2026-11-15').lignes.map(l => l.id), ['pose-cta']);
  assert.strictEqual(SE.portefeuille(items, { phase: 'achats' }, '2026-11-15').lignes.length, 2);
  assert.deepStrictEqual(SE.responsables(items).map(x => x[0]).sort(), ['role:be', 'user:o1']);
});

test('Étapes d\'un compagnon (appli terrain) et relances sans doublon', () => {
  const et = {};
  SE.affecter(et, 'pose-cta', { responsable: { type: 'user', id: 'o1', nom: 'Kevin Roux' }, echeance: '2026-11-17' }, claire);
  SE.affecter(et, 'mes-cta', { responsable: { type: 'role', role: 'compagnon' }, echeance: '2026-11-10' }, claire);
  SE.affecter(et, 'commande-cta', { responsable: { type: 'user', id: 'u1', nom: 'Claire Martin' }, echeance: '2026-12-15' }, claire);
  SE.affecter(et, 'notes', { responsable: { type: 'role', role: 'be' } }, claire);
  SE.mettreAJour(et, claire, { etapes: ETAPES(), today: '2026-11-15' });
  const liens = [{ id: 'e1', affaireId: 'a1', resume: { objet: 'Lycée', avancement: et.avancement } }, { id: 'e2', affaireId: '', resume: { objet: 'Sans chantier', avancement: et.avancement } }];
  const ctx = { today: '2026-11-15', chargeDe: () => 'u1', planifie: (uid, aid) => uid === 'o1' && aid === 'a1', phases: SE.PHASES_TERRAIN };
  const k = SE.etapesPour(liens, kevin, ctx);
  assert.deepStrictEqual(k.map(x => x.id), ['mes-cta', 'pose-cta'], 'nominative + rôle compagnon (prévu sur le chantier), phases terrain');
  assert.strictEqual(k[0].etatEcheance, 'retard');
  assert.deepStrictEqual(Object.keys(k[0]).sort(), ['affaireId', 'echeance', 'etatEcheance', 'etudeId', 'id', 'objet', 'phase', 'responsable', 'titre'], 'champs limités');
  assert.strictEqual(SE.etapesPour(liens, { id: 'o2', role: 'atelier' }, ctx).length, 0, 'un autre compagnon ne voit rien');
  // Fait sur le terrain : passe en fin de liste, plus en retard
  const t = SE.etapesPour(liens, kevin, { ...ctx, terrain: [{ etudeId: 'e1', etapeId: 'mes-cta', le: '2026-11-15', par: 'Kevin Roux' }] });
  assert.deepStrictEqual(t.map(x => [x.id, !!x.faitTerrain]), [['pose-cta', false], ['mes-cta', true]]);
  // Relances : J-2 (pose), retard (mise en service), blocage (commande bloque la pose de Kevin)
  const r = SE.relances(liens.slice(0, 1), { today: '2026-11-15' });
  assert.deepStrictEqual(r.map(x => x.type).sort(), ['bientot', 'bloque', 'retard']);
  const b = r.find(x => x.type === 'bloque');
  assert.deepStrictEqual([b.etapeId, b.responsable.id, b.bloque], ['commande-cta', 'u1', 'pose-cta']);
  const deja = Object.fromEntries(r.map(x => [x.cle, '2026-11-15']));
  assert.strictEqual(SE.relances(liens.slice(0, 1), { today: '2026-11-16', deja }).length, 0, 'pas de doublon');
  // Une étape faite sur le terrain n'est plus relancée
  assert.ok(!SE.relances(liens.slice(0, 1), { today: '2026-11-15', terrain: [{ etudeId: 'e1', etapeId: 'mes-cta' }] }).some(x => x.etapeId === 'mes-cta'));
  assert.deepStrictEqual(Object.keys(SE.purgerDeja({ a: '2026-01-01', b: '2026-11-01' }, '2026-11-15')), ['b']);
});

test('Synthèse imprimable : phases, retards, restes par responsable, sans objet et dernières actions', () => {
  const et = { objet: 'Lycée Exemple', indice: 'B' };
  SE.affecter(et, 'pose-cta', { responsable: { type: 'user', id: 'o1', nom: 'Kevin Roux' }, echeance: '2026-11-10' }, claire, '2026-11-01T08:00:00Z');
  SE.marquerSansObjet(et, 'desenfumage', 'Pas de désenfumage <mécanique>', claire, '2026-11-02T08:00:00Z');
  const h = SE.htmlPdf(et, { etapes: ETAPES(), today: '2026-11-15', affaire: 'CH-001 — Lycée' });
  assert.match(h, /ÉTAT D'AVANCEMENT/);
  assert.match(h, /Retards/);
  assert.match(h, /<h4>Kevin Roux \(1\)<\/h4>/);
  assert.match(h, /Non affectées/);
  assert.match(h, /Pas de désenfumage &lt;mécanique&gt;/, 'échappé');
  assert.match(h, /Dernières actions/);
  assert.ok(!h.includes('\uFFFD'));
});
