// Moins de ressaisie sur le chantier : points de la liste proposés au PV ouvert sans point, n° de série et photo de la
// plaque repris, équipement du registre fluides depuis le PV de mise en service, journée reprise dans le rapport,
// description d'une ligne relevée pour le PV d'épreuve.
const { test } = require('node:test');
const assert = require('node:assert');
const PlanMes = require('../public/js/plan-mes');
const Tuyauterie = require('../public/js/tuyauterie');
const Fluides = require('../public/js/fluides');
const Essais = require('../public/js/essais');
const MaterielRetenu = require('../public/js/materiel-retenu');

test('Liste du chantier : points à faire par nature, brouillon repris, noms suggérés ; n° de série et plaque dans le lien', () => {
  const materiel = [{ etudeId: 'e1', cle: 'pompe|P1', designation: 'Circulateur P1', fabricant: 'Exemple', reference: 'P-50', valide: true, serie: 'SN-42', photos: [{ fichierId: 'f1' }, { fichierId: 'f2' }] }];
  const points = [{ nature: 'epreuve', etudeId: 'e1', noteId: 'n1', reseau: 'Réseau CH', PT: 6 }];
  const debits = [{ installation: 'CTA 1', type: 'Aéraulique', lignes: [] }];
  const brouillon = { id: 'pv1', affaireId: 'a1', statut: 'Brouillon', reseau: 'Réseau CH' };
  const ts = PlanMes.plan({ affaireId: 'a1', materiel, points, debits, pv: { epreuves: [brouillon] } });
  const mes = PlanMes.pointsAFaire(ts, 'mes');
  assert.strictEqual(mes.length, 1);
  assert.match(mes[0].lien, /serie=SN-42/);
  assert.match(mes[0].lien, /plaque=f2/);
  assert.match(mes[0].lien, /plan=mat%7Ce1%7Cpompe%7CP1/);
  const ep = PlanMes.pointsAFaire(ts, 'epreuve');
  assert.strictEqual(ep[0].etat, 'enCours');
  assert.strictEqual(ep[0].lien, '#/epreuve/pv1');
  assert.strictEqual(PlanMes.pointsAFaire(ts, 'equilibrage').length, 1);
  assert.deepStrictEqual(PlanMes.nomsPoints(ts, 'epreuve'), ['Réseau CH']);
  assert.deepStrictEqual(PlanMes.nomsPoints(ts, 'equilibrage'), ['CTA 1']);
  assert.deepStrictEqual(PlanMes.nomsPoints(ts, 'mes'), ['Circulateur P1']);
  // Point fait : plus proposé
  const fait = PlanMes.plan({ affaireId: 'a1', points, pv: { epreuves: [{ ...brouillon, statut: 'Signé', resultat: 'Conforme' }] } });
  assert.strictEqual(PlanMes.pointsAFaire(fait, 'epreuve').length, 0);
  assert.strictEqual(PlanMes.photoPlaque({ photos: [{ fichierId: '../x' }] }), '');
});

test('Suivi du matériel : n° de série du PV signé sans nouvelle photo, photo déjà connue non doublée', () => {
  const d = MaterielRetenu.appliquerSuivi({ photos: [{ fichierId: 'f1' }] }, 'photo', 'Paul', '2026-11-11', { fichierId: 'f1', serie: 'SN-1', serieLue: false });
  assert.strictEqual(d.photos.length, 1);
  assert.strictEqual(d.serie, 'SN-1');
  assert.strictEqual(d.serieLue, false);
  const e = MaterielRetenu.appliquerSuivi({}, 'photo', 'Paul', '2026-11-11', { serie: 'SN-2' });
  assert.strictEqual(e.serie, 'SN-2');
  assert.strictEqual(e.serieLue, true);
  assert.throws(() => MaterielRetenu.appliquerSuivi({}, 'photo', 'Paul', '2026-11-11', {}), /Photo manquante/);
});

test('Prise de cotes : dernier relevé d\'une ligne, description pour le PV d\'épreuve, caractéristiques reprises', () => {
  const rels = [
    { id: 'r1', affaireId: 'a1', ligne: 'CH-01', date: '2026-10-01', matiere: 'Acier P235GH', systeme: 'acier', fluide: 'Eau chaude', pn: 'PN16', dnDepart: 80, elements: [{ t: 'reduc', dn: 80, dn2: 50 }, { t: 'te', dnB: 32, branche: [{ t: 'tube', dn: 25 }] }] },
    { id: 'r0', affaireId: 'a1', ligne: 'ch 01', date: '2026-09-01', matiere: 'Inox 316L', dnDepart: 40, elements: [] },
    { id: 'r2', affaireId: 'a2', ligne: 'CH-01', date: '2026-12-01', matiere: 'Autre', dnDepart: 20, elements: [] },
  ];
  const r = Tuyauterie.dernierReleve(rels, 'a1', 'Ch-01');
  assert.strictEqual(r.id, 'r1');
  assert.deepStrictEqual(Tuyauterie.diametres(r), [80, 50, 32, 25]);
  assert.strictEqual(Tuyauterie.descriptionLigne(r), 'Acier P235GH DN80–DN25');
  assert.strictEqual(Tuyauterie.descriptionLigne(rels[2]), 'Acier P235GH DN20');
  assert.strictEqual(Tuyauterie.dernierReleve(rels, 'a1', ''), null);
  assert.deepStrictEqual(Tuyauterie.reprendreLigne(r), { fluide: 'Eau chaude', systeme: 'acier', matiere: 'Acier P235GH', pn: 'PN16', dnDepart: 80 });
});

test('Fiche fluides : équipement du registre depuis le PV de mise en service, retrouvé s\'il existe', () => {
  const pv = { id: 'm1', equipement: 'PAC toiture', localisation: 'Toiture', zone: 'Bât. B', fluide: 'R410A', charge: '4,5', marque: 'Daikin', modele: 'ERGA', numeroSerie: 'SN9', photoPlaqueId: 'ph1', date: '2026-11-10' };
  const e = Fluides.equipementDepuisMes(pv, { clientId: 'c1', siteId: 's1' });
  assert.deepStrictEqual(e, { clientId: 'c1', siteId: 's1', designation: 'PAC toiture', localisation: 'Toiture, Bât. B', fluide: 'R410A', charge: 4.5, marque: 'Daikin', modele: 'ERGA', numeroSerie: 'SN9', photoPlaqueId: 'ph1', miseEnService: '2026-11-10', mesId: 'm1' });
  assert.strictEqual(Fluides.equipementDepuisMes({ fluide: 'Inconnu' }, null).fluide, 'R32');
  const eqs = [{ id: 'x1', clientId: 'c1', numeroSerie: 'sn9', designation: 'Autre' }, { id: 'x2', clientId: 'c1', designation: 'PAC toiture', localisation: 'Toiture, Bât. B' }, { id: 'x3', mesId: 'm1', archive: true }];
  assert.strictEqual(Fluides.trouverEquipement(eqs, e).id, 'x1');
  assert.strictEqual(Fluides.trouverEquipement(eqs, { ...e, numeroSerie: '' }).id, 'x2');
  assert.strictEqual(Fluides.trouverEquipement(eqs, { ...e, clientId: 'c2' }), null);
});

test('Rapport d\'intervention : journée reprise des pointages et des PV du jour', () => {
  const d = '2026-11-11', u = 'u1', a = 'a1';
  const txt = Essais.resumeJournee({
    temps: [{ userId: u, date: d, affaireId: a, debut: '13:00', fin: '16:30', tache: 'Pose' }, { userId: u, date: d, affaireId: a, debut: '07:30', fin: '12:00', tache: 'Soudure' }, { userId: 'u2', date: d, affaireId: a, debut: '08:00', tache: 'Autre' }, { userId: u, date: d, affaireId: 'a2', heures: 1, tache: 'Ailleurs' }],
    epreuves: [{ userId: u, date: d, affaireId: a, heureDebut: '10:00', numero: 'EP-012', reseau: 'CH', statut: 'Signé', resultat: 'Conforme' }],
    mises: [{ userId: u, date: d, affaireId: a, heure: '15:00', numero: '', equipement: 'PAC', statut: 'Brouillon' }],
    releves: [{ userId: u, date: '2026-11-10', affaireId: a, ligne: 'L1' }],
  }, u, d, a);
  assert.strictEqual(txt, '07:30–12:00 Soudure ; 13:00–16:30 Pose ; PV épreuve EP-012 réseau CH conforme ; PV mise en service PAC brouillon');
  assert.strictEqual(Essais.resumeJournee({ temps: [{ userId: u, date: d, heures: 3.5, tache: 'Dépannage' }] }, u, d, ''), '3,5 h Dépannage');
  assert.strictEqual(Essais.resumeJournee({}, u, d, a), '');
});
