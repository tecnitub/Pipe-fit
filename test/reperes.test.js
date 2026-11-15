// Table des repères (un seul repère par équipement partout) et conséquences d'un changement après émission
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
global.Notes = N;
['annexes-air', 'annexes-emetteurs', 'annexes-energie', 'annexes-froid', 'annexes-plomberie', 'schema', 'cta', 'equilibrage', 'industriel', 'aeraulique-schema', 'sanitaire'].forEach(m => require(`../etudes/public/js/${m}`));
global.Terminaux = require('../etudes/public/js/terminaux');
const E = require('../etudes/public/js/electricite'), L = require('../etudes/public/js/liens'), Rp = require('../etudes/public/js/reperes');
const Rv = require('../etudes/public/js/revisions'), Rg = require('../etudes/public/js/registre');

let k = 0;
const nn = (type, x = {}) => ({ id: `n${++k}`, type, titre: N.TYPES[type].titre, entrees: { ...N.defauts(type), ...x } });
const reprendre = et => { const el = et.notes.find(n => n.type === 'elec'); el.entrees.equipements = E.fusionner(el.entrees.equipements, E.equipementsEtude(et, L), new Set(et.notes.map(n => n.id))).lignes; return el; };
const etude = (materiel = {}) => {
  const et = { id: 'e1', objet: 'Groupe scolaire ACME', notes: [nn('pid'), nn('cta'), nn('parking'), nn('elec'), nn('terminaux')], materiel };
  reprendre(et);
  return et;
};
const ligne = (et, rep) => et.notes.find(n => n.type === 'elec').entrees.equipements.find(l => l.rep === rep);
const points = (et, re) => L.calculer(et, et.notes.find(n => n.type === 'elec')).valeurs.listePoints.filter(p => re.test(p[0]));

test('table des repères : chaque équipement avec ses sources (note, armoire, GTC, métré, matériel, mise en service)', () => {
  const et = etude({ 'annexe|parking|EXT-PK': { fabricant: 'Exemplair', reference: 'XP-400', statut: 'Validé' } });
  const t = Rp.table(et), pc1 = t.lignes.find(x => x.rep === 'PC1'), ext = t.lignes.find(x => x.rep === 'EXT-PK-1');
  assert.deepStrictEqual(t.conflits, []);
  assert.ok(pc1.armoire && pc1.gtb >= 2 && pc1.mes.length, pc1.sources.join(', '));
  assert.ok(pc1.sources.includes('Armoire') && pc1.sources.some(s => /^GTC/.test(s)) && pc1.sources.includes('Mise en service'));
  // Poste de groupe du métré (« EXT-PK ») rattaché aux extracteurs, avec la ligne validée du matériel retenu
  assert.ok(ext.metre.includes('annexe|parking|EXT-PK') && ext.materiel[0].statut === 'Validé');
  assert.ok(t.lignes.some(x => x.rep === 'AR-CVC-01' && x.type === 'armoire'));
});

test('renommer une pompe du schéma de principe : armoire, points GTC, mise en service ; mémorisé pour les reprises suivantes', () => {
  const et = etude(), avant = points(et, /^PC1$/).length;
  const r = Rp.renommer(et, 'PC1', 'P-RAD-01', { date: '2026-11-15' });
  assert.ok(r.ok, r.erreur);
  assert.ok(ligne(et, 'P-RAD-01') && !ligne(et, 'PC1'));
  assert.strictEqual(ligne(et, 'P-RAD-01').src, `${et.notes[0].id}:pc1`);
  assert.strictEqual(points(et, /^P-RAD-01$/).length, avant);
  assert.strictEqual(points(et, /^PC1$/).length, 0);
  // Le calcul de l'armoire reprend le nouveau repère (calcul sans champ « repère » pour cette pompe)
  assert.strictEqual(E.equipementsEtude(et, L).find(q => q.src === `${et.notes[0].id}:pc1`).rep, 'P-RAD-01');
  assert.strictEqual(reprendre(et).entrees.equipements.filter(l => l.src === `${et.notes[0].id}:pc1`).length, 1);
  // Fiches de mise en service et correspondance transmise au chantier
  assert.ok(Rp.table(et).lignes.find(x => x.rep === 'P-RAD-01').mes.length);
  assert.deepStrictEqual(et.renumerotations.slice(-1)[0].map, { PC1: 'P-RAD-01' });
  assert.ok(r.horsEtude.some(x => x.ou === 'Étiquettes') && r.horsEtude.some(x => x.ou === 'DOE'));
  // Retour au repère d'origine : le renommage mémorisé disparaît
  assert.ok(Rp.renommer(et, 'P-RAD-01', 'PC1').ok);
  assert.strictEqual(et.renommesReperes, undefined);
});

test('renommer une CTA (ventilateur de soufflage) et une armoire : lignes, alimentations et réglages des points suivis', () => {
  const et = etude(), el = et.notes.find(n => n.type === 'elec');
  el.entrees.reglagesPoints = [{ rep: 'VS-N2', libelle: 'Défaut', priorite: 'P1 (sécurité)' }];
  assert.ok(Rp.renommer(et, 'VS-N2', 'CTA-01-VS').ok);
  assert.strictEqual(el.entrees.reglagesPoints[0].rep, 'CTA-01-VS');
  assert.ok(points(et, /^CTA-01-VS$/).length >= 2);
  const alim = ligne(et, 'CTA-01-VS').alim;
  const r = Rp.renommer(et, 'AR-CVC-01', 'TD-CVC');
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(el.entrees.armoires[0].rep, 'TD-CVC');
  if (alim === 'AR-CVC-01') assert.strictEqual(ligne(et, 'CTA-01-VS').alim, 'TD-CVC');
  assert.ok(points(et, /./).every(p => p[3] !== 'AR-CVC-01'));
});

test('renommer un équipement annexe : repère de groupe saisi dans le calcul (extracteurs de parking), matériel validé gardé', () => {
  const et = etude({ 'annexe|parking|EXT-PK': { fabricant: 'Exemplair', reference: 'XP-400', statut: 'Validé', dateValidation: '2026-10-01' } });
  const r = Rp.renommer(et, 'EXT-PK', 'EXT-PARK');
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(et.notes[2].entrees.repExt, 'EXT-PARK');
  assert.ok(ligne(et, 'EXT-PARK-1') && ligne(et, 'EXT-PARK-CO') && !ligne(et, 'EXT-PK-1'));
  assert.deepStrictEqual(et.materiel['annexe|parking|EXT-PARK'], { fabricant: 'Exemplair', reference: 'XP-400', statut: 'Validé', dateValidation: '2026-10-01' });
  assert.strictEqual(et.materiel['annexe|parking|EXT-PK'], undefined);
  assert.ok(r.horsEtude.some(x => x.ou === 'Client' && /validé/.test(x.detail)));
  // Un extracteur seul (repère calculé « EXT-PARK-2 ») : renommé sans toucher au groupe
  assert.ok(Rp.renommer(et, 'EXT-PARK-2', 'EXT-SECOURS').ok);
  assert.ok(ligne(et, 'EXT-SECOURS') && ligne(et, 'EXT-PARK-1'));
  assert.strictEqual(et.notes[2].entrees.repExt, 'EXT-PARK');
});

test('renommer un terminal : champ du calcul, source de la ligne d\'armoire et référence du réseau suivies (pas de doublon)', () => {
  const et = etude(), t = et.notes[4], arbo = nn('arbo', { troncons: [{ rep: 'T1', emetteur: `${t.id}:CA-01` }] });
  et.notes.push(arbo);
  const r = Rp.renommer(et, 'CA-01', 'CA-R1-01');
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(t.entrees.appareils[0].rep, 'CA-R1-01');
  assert.strictEqual(arbo.entrees.troncons[0].emetteur, `${t.id}:CA-R1-01`);
  assert.strictEqual(ligne(et, 'CA-R1-01').src, `${t.id}:t0:CA-R1-01`);
  assert.strictEqual(reprendre(et).entrees.equipements.filter(l => /^CA-/.test(l.rep)).length, 1);
});

test('conflits : même repère pour deux équipements, même équipement sous deux repères, ligne d\'armoire restée sous l\'ancien repère', () => {
  const et = etude(), el = et.notes.find(n => n.type === 'elec');
  // Ligne ajoutée à la main sous un repère déjà pris
  el.entrees.equipements.push({ rep: 'PC2', designation: 'Pompe de relevage', type: 'pompe', P: 0.4 });
  // Repère changé à la main dans l'armoire
  ligne(et, 'TD1').rep = 'TD-RAD';
  let c = Rp.table(et).conflits;
  assert.ok(c.some(x => x.nature === 'doublon' && x.rep === 'PC2'));
  const deux = c.find(x => x.nature === 'deuxReperes');
  assert.deepStrictEqual(deux.reps, ['TD-RAD', 'TD1']);
  // Renommer un repère porté par deux équipements : il faut choisir lequel
  const r = Rp.renommer(et, 'PC2', 'PR-01');
  assert.ok(!r.ok && r.choix.length === 2);
  assert.ok(Rp.renommer(et, 'PC2', 'PR-01', { cle: r.choix.find(x => /^man:/.test(x.cle)).cle }).ok);
  // Garder le repère de l'armoire : le calcul suit
  assert.ok(Rp.aligner(et, deux.cles[0], 'TD-RAD').ok);
  // Refus d'un repère déjà porté
  assert.match(Rp.renommer(et, 'PC3', 'PC4').erreur, /déjà porté/);
  // Terminal renommé dans son calcul sans passer par la table : l'ancienne ligne d'armoire est signalée et réalignée
  et.notes[4].entrees.appareils[0].rep = 'CA-99';
  reprendre(et);
  c = Rp.table(et).conflits;
  const anc = c.find(x => x.nature === 'ancienneLigne');
  assert.ok(anc && anc.vers && anc.vers.rep === 'CA-99', JSON.stringify(c));
  assert.strictEqual(Rp.realigner(et, anc), 1);
  assert.strictEqual(el.entrees.equipements.filter(l => /^CA-/.test(l.rep)).length, 1);
  assert.deepStrictEqual(Rp.table(et).conflits, []);
});

test('numérotation du registre : terminal en double renuméroté, sa ligne d\'armoire suit', () => {
  const et = etude(), t = et.notes[4];
  t.entrees.appareils.push({ ...t.entrees.appareils[0], local: 'Bureau 2' });
  reprendre(et);
  assert.strictEqual(Rp.table(et).conflits.filter(x => x.nature === 'doublon').length, 1);
  assert.ok(Rg.numeroterTout(et) >= 1);
  const reps = t.entrees.appareils.map(a => a.rep);
  assert.strictEqual(new Set(reps).size, 2);
  reprendre(et);
  assert.deepStrictEqual(et.notes.find(n => n.type === 'elec').entrees.equipements.filter(l => /^CA-/.test(l.rep)).map(l => l.rep).sort(), reps.sort());
  assert.deepStrictEqual(Rp.table(et).conflits, []);
});

test('conséquences du changement : armoire, matériel validé à resoumettre, commande, MES, points GTC, repère, DOE', () => {
  const et = etude({ 'cta|6000': { fabricant: 'ACME', reference: 'CTA-6000', statut: 'Validé', substitution: null, commande: 'CF-2026-12' } });
  et.affaireId = 'aff1';
  et.notes[1].emissions = [{ indice: 'A', date: '2026-11-01', entrees: {} }];
  assert.deepStrictEqual(Rv.suivreReference(et, () => Rp.etat(et), { date: '2026-11-01' }), []);
  assert.ok(et.etatReference && et.etatReference.etat.eq);
  // Débit de la CTA augmenté, pompe renommée
  et.notes[1].entrees.Qs = 9000; et.notes[1].entrees.Qr = 9000;
  reprendre(et);
  Rp.renommer(et, 'PC1', 'P-RAD-01');
  const l = Rv.suivreReference(et, () => Rp.etat(et), { date: '2026-11-15' }), cat = c => l.filter(x => x.categorie === c);
  assert.ok(cat('armoire').some(x => /^VS-N2 : puissance/.test(x.titre)), l.map(x => x.titre).join(' | '));
  const m = cat('materiel').find(x => x.cible === 'cta|6000');
  assert.ok(m && m.action === 'resoumettre' && /redimensionné/.test(m.detail));
  assert.ok(cat('commande').length && cat('repere').some(x => x.titre === 'PC1 → P-RAD-01'));
  assert.ok(cat('mes').some(x => /CTA/.test(x.titre)) && cat('gtb').length && cat('doe').length);
  // Actions : repasser à soumettre (la ligne quitte les conséquences), marquer vu
  assert.ok(Rv.repasserASoumettre(et, 'cta|6000', m.detail, '2026-11-15'));
  assert.strictEqual(et.materiel['cta|6000'].statut, 'À soumettre');
  assert.match(et.materiel['cta|6000'].obs, /^Dimensionnement modifié le 2026-11-15/);
  const g = cat('gtb')[0];
  Rv.marquerVu(et, g.cle, '2026-11-15');
  const l2 = Rv.suivreReference(et, () => Rp.etat(et), { date: '2026-11-15' });
  assert.ok(!l2.some(x => x.cle === g.cle) && !l2.some(x => x.cle === m.cle));
  // Nouvelle émission : la référence avance, les conséquences ouvertes restent (figées)
  const ouvertes = l2.length;
  et.notes[1].emissions.push({ indice: 'B', date: '2026-11-16', entrees: {} });
  const l3 = Rv.suivreReference(et, () => Rp.etat(et), { date: '2026-11-16' });
  assert.strictEqual(l3.length, ouvertes);
  assert.ok(l3.every(x => x.fige));
  assert.deepStrictEqual(Rv.consequences(et.etatReference.etat, Rp.etat(et), { materiel: et.materiel }), []);
});

test('conséquences : rien avant la première émission ou validation', () => {
  const et = etude();
  assert.deepStrictEqual(Rv.suivreReference(et, () => Rp.etat(et)), []);
  assert.strictEqual(et.etatReference, undefined);
  assert.strictEqual(Rv.signatureReference(et).engage, false);
});
