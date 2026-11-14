// Documentations de gamme (choix du modèle, modèle conseillé d'après le besoin du calcul), nouvelles catégories du registre
// (accessoire sanitaire, ballon tampon, conduit de fumée, capteur, document commercial), gamme de vannes par DN.
// Fiches SYNTHÉTIQUES : fabricant fictif « Exemplair », valeurs inventées.
const { test } = require('node:test');
const assert = require('node:assert');
global.FichesTech = require('../public/js/fiches-tech');
const N = require('../etudes/public/js/notes');
global.Notes = N;
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
global.Pompes = require('../etudes/public/js/pompes');
require('../etudes/public/js/industriel');
global.Sanitaire = require('../etudes/public/js/sanitaire');
global.FicheCta = require('../etudes/public/js/fiche-cta');
global.FicheEquip = require('../etudes/public/js/fiche-equipement');
global.FicheAnnexes = require('../etudes/public/js/fiche-annexes');
require('../etudes/public/js/cta');
require('../etudes/public/js/annexes-energie');
global.SchemaAir = require('../etudes/public/js/aeraulique-schema');
const R = require('../etudes/public/js/registre');
global.Registre = R;
const V = require('../etudes/public/js/vrac');

const pid = (extra = {}) => ({ id: 'p1', type: 'pid', titre: 'Chaufferie', entrees: { ...N.defauts('pid'), ...extra } });
const elec = () => ({ id: 'e1', type: 'elec', titre: 'Armoires', entrees: { armoires: [{ rep: 'AR-01' }], equipements: [] } });

test('libellé lisible des modèles d\'une gamme : référence et grandeur principale', () => {
  assert.strictEqual(V.libelleModele({ ref: '500 L', V: 500 }), '500 L');
  assert.strictEqual(V.libelleModele({ ref: '1000 L', V: 1000 }), '1 000 L');
  assert.strictEqual(V.libelleModele({ ref: 'EXA 13', P: 1150 }), 'EXA 13 — 1 150 kW');
  assert.strictEqual(V.libelleModele({ ref: 'EX 3', Lmm: 3000, P50: 897 }), 'EX 3 — L 3 m — 897 W');
  assert.strictEqual(V.libelleModele({ ref: '20', Qs: 2000 }), '20 — 2 000 m³/h');
  assert.strictEqual(V.libelleModele({ ref: 'DN 65', dn: 65, kv: 210 }), 'DN 65 — Kvs 210');
});

// Gamme de vannes : tableau des dimensions par DN (deux DN dans une colonne), tableau des Kv par angle d'ouverture,
// servomoteur par DN ; plage annoncée DN 32 à DN 200 (les DN au-delà sont écartés)
const VANNES = ['VANNES PAPILLON EXEMPLAIR EX-900', 'MODÈLES DISPONIBLES', 'DN 32 à DN 200.', 'Pression maximale PN16',
  'DIMENSIONS (mm)', 'DN\t32-40\t50\t65\t80\t100\t150\t200\t250', 'A\t200\t220\t240\t250\t290\t350\t420\t460', 'Poids', '2,5\t4,0\t4,5\t6,0\t7,5\t11,5\t18,0\t30,0', '(kg)',
  'COEFFICIENT DE DÉBIT Kv (m³/h)', 'Angle d\'ouverture', 'DN', '30°\t60°\t90°', '40\t8\t30\t65', '50\t12\t55\t150', '65\t15\t70\t190', '80\t25\t140\t330', '100\t45\t220\t600', '150\t100\t500\t1400', '200\t200\t900\t2400', '250\t300\t1400\t3800',
  'Calcul de pertes de charges : Δp = (Q / Kv)²',
  'MOTORISATION', 'DN\tServomoteur\tPuissance (W)', '32/40\tEXM-05\t20', '50\tEXM-05\t20', '65\tEXM-05\t20', '80\tEXM-10\t30', '100\tEXM-10\t30', '150\tEXM-20\t50', '200\tEXM-40\t80', 'www.exemplair.com'];

test('gamme de vannes par DN : Kvs à pleine ouverture, poids, servomoteur ; aucune valeur « premier venu »', () => {
  assert.strictEqual(V.classer(VANNES, 'vannes.pdf'), 'robinet');
  const lu = V.lire('robinet', VANNES, 'vannes.pdf');
  assert.strictEqual(lu.gamme, 'DN 32 à DN 200');
  assert.deepStrictEqual(lu.modeles.map(m => [m.dn, m.kv, m.poids, m.servo]), [[32, undefined, 2.5, 'EXM-05'], [40, 65, 2.5, 'EXM-05'], [50, 150, 4, 'EXM-05'], [65, 190, 4.5, 'EXM-05'],
    [80, 330, 6, 'EXM-10'], [100, 600, 7.5, 'EXM-10'], [150, 1400, 11.5, 'EXM-20'], [200, 2400, 18, 'EXM-40']]);
  assert.strictEqual(lu.valeurs.dn, undefined);
  assert.strictEqual(lu.valeurs.kv, undefined);
  assert.strictEqual(lu.reference, '');
  assert.ok(V.aChoisir(lu));
  const x = V.choisirModele(lu, 2);
  assert.deepStrictEqual([x.valeurs.dn, x.valeurs.kv, x.modele], [50, 150, 'DN 50']);
  assert.ok(/DN 50 — Kvs 150/.test(x.resume));
  assert.ok(!V.aChoisir(x));
});

test('vanne de la gamme : DN du circuit conseillé, Kvs et DN reportés sur l\'organe de robinetterie', () => {
  const n = pid(), et = { notes: [n] }, lu = V.lire('robinet', VANNES, 'vannes.pdf');
  const dn = Schema.dimensionner(n.entrees).circuits[0].t.dn, rep = n.entrees.circuits[0].rep;
  const k = V.modeleConseille(et, 'robinet', lu, `pidc:p1|${rep}`);
  assert.strictEqual(lu.modeles[k].dn, dn);
  assert.strictEqual(V.modeleConseille(et, 'robinet', lu, ''), -1);
  const choisi = V.choisirModele(lu, k);
  V.appliquer(et, { type: 'robinet', nom: 'vannes.pdf', lu: choisi, qte: 1, lignes: ['vanne d\'isolement'] }, `pidc:p1|${rep}`);
  const o = n.entrees.robinetterie.find(r => r.circuit === rep);
  assert.deepStrictEqual([o.dn, o.kv], [dn, lu.modeles[k].kv]);
  assert.strictEqual(et.equipements[0].gamme, undefined);
});

test('gamme non choisie : inscrite au registre sans valeur de modèle, badge, choix du modèle plus tard propagé', () => {
  const n = pid(), et = { notes: [n] }, lu = V.lire('robinet', VANNES, 'vannes.pdf'), rep = n.entrees.circuits[0].rep;
  const m = V.appliquer(et, { type: 'robinet', nom: 'vannes.pdf', lu, qte: 1, lignes: ['vanne d\'isolement'] }, `pidc:p1|${rep}`);
  assert.ok(/modèle à choisir/.test(m), m);
  const x = et.equipements[0], o = n.entrees.robinetterie.find(r => r.circuit === rep);
  assert.ok(x.gamme && x.gamme.modeles.length === 8);
  assert.strictEqual(x.valeurs.kv, undefined);
  assert.ok(o.kv === undefined || o.kv === '');
  // Deux gammes du même fabricant ne sont pas confondues
  R.ajouter(et, { type: 'robinet', fabricant: x.fabricant, valeurs: {}, nom: 'autre gamme.pdf', gamme: { titre: 'autre', modeles: [] } });
  assert.strictEqual(et.equipements.length, 2);
  assert.ok(R.choisirModele(x, 3));
  R.propager(et);
  assert.deepStrictEqual([x.gamme, x.valeurs.dn, o.kv, o.dn], [undefined, 65, 190, 65]);
  assert.ok(/DN 65$/.test(x.reference));
});

test('chaudière de gamme : modèle conseillé selon la puissance par générateur du schéma de principe', () => {
  const L = ['EXA', 'Chaudière triple parcours', '5 modèles de 100 à 500 kW', 'UNITÉS\t10\t11\t12\t13\t14', 'PUISSANCES', 'max\tkW\t100\t150\t200\t300\t500', 'Puissance utile nominale'];
  const n = pid(), et = { notes: [n] }, lu = V.lire('generateur', L), d = Schema.dimensionner(n.entrees), besoin = d.Pdem / Number(n.entrees.nGen);
  const k = V.modeleConseille(et, 'generateur', lu, 'pid:p1');
  assert.ok(lu.modeles[k].P >= besoin && (k === 0 || lu.modeles[k - 1].P < besoin), `${besoin} → ${lu.modeles[k].P}`);
});

const TAMPON = ['BALLON TAMPON EXEMPLAIR', 'GAMME 300 À 3 000', 'Capacité', '(litres)', '300\t500\t90\t400', '500\t650\t90\t430', '1 000\t800\t90\t460', '2 000\t1 100\t90\t530', '3 000\t1 250\t90\t560', 'PS maxi\t10 bar'];

test('ballon tampon : destinations du schéma de principe, volume calculé → modèle conseillé, ballon en série et ballon élément', () => {
  const n = pid({ tampon: 'oui', ballons: [{ rep: 'BT1', fonction: 'tampon', V: '' }] }), et = { notes: [n] };
  assert.deepStrictEqual(V.destinations(et, 'tampon').map(d => d[0]), ['tamp:p1', 'tamp:p1|b0', 'tamp:p1|+']);
  const lu = V.lire('tampon', TAMPON), d = Schema.dimensionner(n.entrees);
  const k = V.modeleConseille(et, 'tampon', lu, 'tamp:p1');
  assert.ok(lu.modeles[k].V >= d.tampon.Vreq && (k === 0 || lu.modeles[k - 1].V < d.tampon.Vreq));
  assert.strictEqual(lu.modeles[V.modeleConseille(et, 'tampon', lu, 'tamp:p1|b0')].V, 3000);
  const m = V.appliquer(et, { type: 'tampon', nom: 'tampon.pdf', lu: V.choisirModele(lu, k), qte: 1 }, 'tamp:p1');
  assert.ok(/ballon tampon/.test(m), m);
  assert.strictEqual(Number(n.entrees.Vtampon), lu.modeles[k].V);
  assert.strictEqual(n.entrees.tamponEq, et.equipements[0].id);
  assert.strictEqual(Schema.dimensionner(n.entrees).tampon.V, lu.modeles[k].V);
  // Nouveau ballon élément de la production
  V.appliquer(et, { type: 'tampon', nom: 'tampon2.pdf', lu: V.choisirModele(lu, 4), qte: 1 }, 'tamp:p1|+');
  const b = n.entrees.ballons[1];
  assert.deepStrictEqual([b.fonction, b.V, b.position, !!b.eq], ['tampon', 3000, 'production', true]);
  // Valeur corrigée au registre : reportée sur le schéma ; emplacement listé
  et.equipements[0].valeurs.V = 2000; R.propager(et);
  assert.strictEqual(n.entrees.Vtampon, 2000);
  assert.ok(R.bilan(et)[0].emplacements.some(p => /ballon tampon/.test(p.libelle)));
  // Ligne du métré « ballon tampon » : fabricant et référence repris
  const mat = { notes: et.notes, equipements: et.equipements };
  R.versMateriel(mat, [{ cle: 'tampon|2000', unite: 'u', sources: ['N1'] }]);
  assert.strictEqual(mat.materiel['tampon|2000'].registre, et.equipements[0].id);
});

const CAPTEUR = ['Transmetteur de débit électromagnétique', 'Exemplair EX-FLOW 50', 'Grandeur mesurée : débit d\'eau', 'Plage de mesure : 0,5 … 40 m³/h', 'Diamètre nominal DN 50',
  'Signal de sortie : 4-20 mA et impulsions', 'Tension d\'alimentation : 24 V DC', 'Consommation : 3 W', 'Indice de protection IP 67'];

test('capteur de débit : reconnu, lu, ligne « sonde » de l\'armoire selon la sortie, matériel retenu', () => {
  assert.strictEqual(V.classer(CAPTEUR, 'fiche.pdf'), 'capteur');
  assert.strictEqual(V.classer(['Boîtier de contrôle pour capteurs de débit', 'Sortie relais'], 'doc.pdf'), 'capteur');
  const lu = V.lire('capteur', CAPTEUR, 'capteur.pdf'), v = lu.valeurs;
  assert.deepStrictEqual([v.grandeur, v.sortie, v.alim, v.Paux, v.ip, v.dn], ['debit', '4-20mA', '24V', 3, 67, 50]);
  assert.ok(/capteur de débit · sortie 4-20 mA · alim\. 24 V/.test(lu.resume), lu.resume);
  const e = elec(), et = { notes: [e] };
  assert.deepStrictEqual(V.destinations(et, 'capteur').map(d => d[0]), ['capt:e1']);
  assert.strictEqual(V.destinations({ notes: [] }, 'capteur').length, 0);
  const m = V.appliquer(et, { type: 'capteur', nom: 'capteur.pdf', lu, qte: 2, local: 'Chaufferie' }, V.proposer(et, 'capteur', lu));
  assert.ok(/2 capteur/.test(m), m);
  assert.deepStrictEqual(e.entrees.equipements.map(l => [l.rep, l.type, l.regulation, l.tension, l.Paux, l.local]), [['FT-01', 'sonde', 'sonde', '24V', 3, 'Chaufferie'], ['FT-02', 'sonde', 'sonde', '24V', 3, 'Chaufferie']]);
  assert.ok(/^Capteur de débit/.test(e.entrees.equipements[0].designation));
  // Sortie impulsions seule : comptage ; relais : contact (alimentation réseau)
  const imp = V.lire('capteur', ['Capteur de débit à impulsions', 'Sortie : impulsions 1 imp/L', 'Alimentation 24 V AC'], '');
  V.appliquer(et, { type: 'capteur', nom: 'imp.pdf', lu: imp, qte: 1 }, 'capt:e1');
  assert.strictEqual(e.entrees.equipements[2].regulation, 'impulsion');
  const rel = V.lire('capteur', ['Contrôleur de débit', 'Technologie relais', 'Tension d\'alimentation [V] 90...240 AC'], '');
  V.appliquer(et, { type: 'capteur', nom: 'rel.pdf', lu: rel, qte: 1 }, 'capt:e1');
  assert.deepStrictEqual([e.entrees.equipements[3].regulation, e.entrees.equipements[3].tension], ['contact', 'mono']);
  // Matériel retenu : une ligne libre par modèle, quantité = emplacements
  R.versMateriel(et, []);
  const l = et.materiel[`reg|${et.equipements[0].id}`];
  assert.deepStrictEqual([l.libre, l.qte, l.chapitre], [true, 2, 'Régulation, instrumentation']);
  // Verrou du registre sur la ligne d'armoire
  assert.ok(Object.keys(R.verrous(et, e)).includes('equipements.0.regulation'));
});

test('accessoire sanitaire : registre sans calcul, ligne libre du matériel retenu avec la quantité', () => {
  const et = { notes: [] }, L = ['Barre d\'appui coudée Exemplair EX-BA 135°', 'Inox brossé'];
  assert.strictEqual(V.classer(L, 'barre.pdf'), 'accessoireSan');
  const lu = V.lire('accessoireSan', L, 'barre.pdf');
  assert.deepStrictEqual(lu.valeurs, {});
  const m = V.appliquer(et, { type: 'accessoireSan', nom: 'barre.pdf', lu: { ...lu, fabricant: 'Exemplair', reference: 'EX-BA' }, qte: 6 }, '');
  assert.ok(/matériel retenu et DOE/.test(m), m);
  assert.strictEqual(et.equipements[0].qte, 6);
  R.versMateriel(et, []);
  const l = et.materiel[`reg|${et.equipements[0].id}`];
  assert.deepStrictEqual([l.libre, l.qte, l.chapitre, l.fabricant, l.reference], [true, 6, 'Équipements sanitaires', 'Exemplair', 'EX-BA']);
  assert.ok(/^Accessoire sanitaire Exemplair EX-BA/.test(l.designation));
});

test('nouvelles catégories du registre ; document commercial jamais inscrit', () => {
  ['accessoireSan', 'tampon', 'fumee', 'capteur', 'document'].forEach(t => assert.ok(R.TYPES[t], t));
  assert.deepStrictEqual([R.TYPE_GENRE.tamp, R.TYPE_GENRE.bal, R.TYPE_GENRE.capt, R.TYPE_GENRE.conduitFumee], ['tampon', 'tampon', 'capteur', 'fumee']);
  const et = { notes: [] };
  assert.strictEqual(R.ajouter(et, { type: 'document', fabricant: 'X', reference: 'Y' }), null);
  assert.deepStrictEqual(V.destinations(et, 'document').map(d => d[0]), ['doc:materiel', 'doc:consultation']);
  const lu = V.lire('document', ['DEVIS', 'Prix nets hors taxes']);
  assert.ok(/joint au matériel retenu/.test(V.appliquer(et, { type: 'document', nom: 'devis.pdf', lu }, 'doc:materiel')));
  assert.ok(/joint à la consultation/.test(V.appliquer(et, { type: 'document', nom: 'devis.pdf', lu }, 'doc:consultation')));
  assert.ok(/ignoré/.test(V.appliquer(et, { type: 'document', nom: 'devis.pdf', lu }, '')));
  assert.strictEqual((et.equipements || []).length, 0);
});

test('conduit de fumée : inscrit au registre, nouveau calcul créé dans l\'étude, valeurs verrouillées', () => {
  const et = { notes: [] }, lu = { valeurs: { P: 400, combustible: 'gaz', D: 250, H: 15, generateur: 'Exemplair CX' }, fabricant: '', reference: '' };
  const m = V.appliquer(et, { type: 'fumee', nom: 'note.pdf', lu }, 'fumee:nouveau', t => ({ id: 'nf', type: t, titre: N.TYPES[t].titre, entrees: N.defauts(t) }));
  assert.ok(/4 valeur\(s\) reportée\(s\)/.test(m) && /générateur Exemplair CX/.test(m), m);
  const n = et.notes.find(y => y.type === 'conduitFumee');
  assert.ok(n, 'calcul créé et ajouté à l\'étude');
  assert.deepStrictEqual([n.entrees.P, n.entrees.D, n.entrees.H, n.entrees.eq], [400, 250, 15, et.equipements[0].id]);
  assert.ok(Object.keys(R.verrous(et, n)).includes('P'));
  assert.ok(N.calculer('conduitFumee', n.entrees).valeurs);
});
