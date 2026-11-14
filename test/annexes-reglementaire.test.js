// Calculs annexes — Réglementation et contrôle : classement de chaufferie, calorifugeage économique, traitement d'eau
// (références calculées à la main, liens avec une étude fictive : schéma de principe, réseau, ventilation de chaufferie).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/industriel');
global.Terminaux = require('../etudes/public/js/terminaux');
global.Schema = require('../etudes/public/js/schema');
const A = require('../etudes/public/js/annexes-reglementaire');
const L = require('../etudes/public/js/liens');
const C = require('../etudes/public/js/calculs');

const proche = (a, b, tol = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} ≠ ${b}`);
const note = (id, type, entrees = {}, titre = type) => ({ id, type, titre, entrees: { ...N.defauts(type), ...entrees } });
const erreurs = r => r.alertes.filter(a => a.niveau === 'erreur');

test('annexes réglementaires : types enregistrés, rangés à part, calculables avec leurs valeurs par défaut', () => {
  ['chaufferie', 'calorifugeEco', 'traitementEau'].forEach(k => {
    const t = N.TYPES[k];
    assert.ok(t && t.annexe && t.famille === 'Calculs annexes' && t.theme === 'Réglementation et contrôle', k);
    const r = N.calculer(k, N.defauts(k));
    assert.ok(r.synthese && r.resume.length && r.hypotheses.length, k);
    assert.deepStrictEqual(erreurs(r), [], k);
    r.tableaux.forEach(x => x.lignes.forEach(l => assert.strictEqual(l.length, x.entetes.length, `${k} : ${x.titre}`)));
  });
});

test('chaufferie : puissance thermique nominale, seuils ICPE 2910, local, check-list', () => {
  // 300 kW utiles au gaz, rendement 95 % : 315,8 kW PCI → non classé ; chaufferie (> 70 kW)
  const r = N.calculer('chaufferie', { P: 300, combustible: 'gaz' });
  proche(r.valeurs.Pth, 300 / 0.95); assert.strictEqual(r.valeurs.icpe, 'NC'); assert.ok(r.valeurs.chaufferie);
  // 1 200 kW à 92 % : 1 304 kW PCI → déclaration avec contrôle ; 25 MW → enregistrement ; 60 MW → 3110
  assert.strictEqual(N.calculer('chaufferie', { P: 1200, combustible: 'gaz', rendement: 92 }).valeurs.icpe, 'DC');
  assert.strictEqual(N.calculer('chaufferie', { P: 25000, combustible: 'gaz' }).valeurs.icpe, 'E');
  assert.strictEqual(N.calculer('chaufferie', { P: 60000, combustible: 'gaz' }).valeurs.icpe, 'A');
  // Seuil saisi : 1 304 kW sous un seuil de déclaration porté à 2 MW
  assert.strictEqual(N.calculer('chaufferie', { P: 1200, rendement: 92, sIcpeDC: 2000 }).valeurs.icpe, 'NC');
  // PAC : pas de combustion
  const pac = N.calculer('chaufferie', { P: 300, combustible: 'elec' });
  assert.strictEqual(pac.valeurs.icpe, 'non'); assert.ok(!pac.tableaux[0].lignes.some(l => /Ventilation haute/.test(l[0])));
  // ≤ 70 kW : pas de chaufferie ; 100 kW en local non dédié : erreur ; GPL en sous-sol : erreur
  assert.ok(!N.calculer('chaufferie', { P: 60, implantation: 'nonDedie' }).valeurs.chaufferie);
  assert.deepStrictEqual(erreurs(N.calculer('chaufferie', { P: 60, implantation: 'nonDedie' })), []);
  assert.ok(erreurs(N.calculer('chaufferie', { P: 100, implantation: 'nonDedie' })).length);
  assert.ok(erreurs(N.calculer('chaufferie', { P: 200, combustible: 'gpl', implantation: 'soussol' })).some(a => /GPL/.test(a.texte)));
  // Fioul : rétention ; 500 kW : contrôle de l'efficacité énergétique, plus d'entretien annuel 4–400 kW
  const f = N.calculer('chaufferie', { P: 500, combustible: 'fioul' }), lib = f.tableaux[0].lignes.map(l => l[0]).join(' | ');
  assert.match(lib, /Rétention du fioul/); assert.match(lib, /efficacité énergétique/); assert.doesNotMatch(lib, /Entretien annuel/);
  // Cases cochées : « fait », obligations restantes décomptées
  const c = N.calculer('chaufferie', { P: 300, faits: ['local', 'parois'] }), avant = r.valeurs.restent;
  assert.strictEqual(c.valeurs.restent, avant - 2);
  assert.ok(c.tableaux[0].lignes.find(l => /^Local dédié/.test(l[0]))[3].includes('fait'));
  // ERP : vérifications périodiques
  assert.ok(N.calculer('chaufferie', { P: 300, batiment: 'erp' }).tableaux[0].lignes.some(l => /CH 58/.test(l[2])));
});

test('chaufferie : puissance et combustible repris du schéma de principe (groupes froids exclus), type de bâtiment, ventilation', () => {
  const pid = note('pid', 'pid', { generateurs: [{ type: 'chaudiere-cond', P: 150 }, { type: 'chaudiere-cond', P: 150 }, { type: 'gf-air', P: 200 }] });
  const et = { id: 'e', typeBatiment: 'enseignement', notes: [pid, note('v', 'ventilation'), note('ch', 'chaufferie'), note('ch2', 'chaufferie', { P: 450 }), note('ch3', 'chaufferie', { pid: 'pid' })] };
  const r = id => L.resoudre(et, et.notes.find(n => n.id === id));
  const e = r('ch').entrees;
  assert.strictEqual(e.P, 300); assert.strictEqual(e.combustible, 'gaz'); assert.strictEqual(e.rendement, 97); assert.strictEqual(e.batiment, 'erp');
  assert.match(e._ventilation, /N2 — ventilation/);
  // Proposé : la saisie reste ; schéma choisi : imposé et verrouillé
  assert.strictEqual(r('ch2').entrees.P, 450);
  assert.ok(r('ch3').verrous.P && r('ch3').entrees.P === 300);
  const c = L.calculer(et, et.notes.find(n => n.id === 'ch'));
  proche(c.valeurs.Pth, 300 / 0.97);
  assert.ok(!c.alertes.some(a => /ajouter un calcul « Ventilation/.test(a.texte)));
  // Schéma supprimé
  const et2 = { id: 'e2', notes: [note('x', 'chaufferie', { pid: 'disparu' })] };
  assert.ok(L.calculer(et2, et2.notes[0]).alertes.some(a => /supprimé/.test(a.texte)));
  // Générateurs saisis par nombre × puissance (sans lignes détaillées)
  assert.deepStrictEqual(A.generateursPid({ generateur: 'chaudiere-fioul', nGen: 3, Pgen: 100 }).map(g => g.P), [100, 100, 100]);
  assert.strictEqual(A.combustibleDe('chaudiere-bois'), 'bois'); assert.strictEqual(A.combustibleDe('pac-air'), 'elec');
});

test('calorifugeage économique : pertes, investissement, coût global, épaisseur optimale, classes NF EN 12828', () => {
  const e = { lignes: [{ rep: 'A', de: 60.3, L: 100, T: 70 }], heures: 5000, prix: 0.12, rendement: 90, coutFixe: 10, coutVolume: 600, duree: 20 };
  const r = N.calculer('calorifugeEco', e), det = r.tableaux[1].lignes;
  // Tube nu : pertes de la note « isolation » (calculs.js), énergie = q × L × h / η
  const qNu = Math.abs(C.isolation({ De: 0.0603, e: 0, Tf: 70, Ta: 20, isolant: 'laine-verre', emissivite: 0.9 }).q);
  proche(N.num(det[0][1]), qNu, 0.01); proche(N.num(det[0][3].replace(/\s/g, '')), qNu * 100 * 5000 / 1000 / 0.9, 1e-3);
  // 50 mm : 100 × (10 + 600 × π/4 × (0,1603² − 0,0603²)) = 2 039,6 €
  const i50 = 100 * (10 + 600 * Math.PI / 4 * (0.1603 ** 2 - 0.0603 ** 2));
  proche(N.num(det.find(l => l[0] === '50')[5].replace(/\s/g, '')), i50, 1e-3);
  // Optimum = coût global minimal
  const glob = det.map(l => N.num(l[7].replace(/\s/g, ''))), iMin = glob.indexOf(Math.min(...glob));
  assert.strictEqual(r.valeurs.lignes[0].opt, A.EPAISSEURS[iMin]);
  // Classes : U ≤ a·De + b ; De = 60,3 mm : classe 6 ≤ 0,168, classe 5 ≤ 0,206 W/m·K
  assert.strictEqual(A.classeIsolation(0.16, 0.0603), 6); assert.strictEqual(A.classeIsolation(0.17, 0.0603), 5); assert.strictEqual(A.classeIsolation(5, 0.0603), 0);
  // Prix très bas : l'optimum est plus mince ; classe minimale exigée : épaisseur portée à la classe
  const bas = N.calculer('calorifugeEco', { ...e, prix: 0.001 });
  assert.ok(bas.valeurs.lignes[0].opt < r.valeurs.lignes[0].opt);
  const cl = N.calculer('calorifugeEco', { ...e, prix: 0.001, classeMin: 4 }).valeurs.lignes[0];
  assert.ok(cl.classe >= 4 && cl.e >= cl.opt);
  // Isolant hors domaine (élastomère à 150 °C)
  assert.ok(erreurs(N.calculer('calorifugeEco', { ...e, isolant: 'elastomere', lignes: [{ rep: 'V', de: 60.3, L: 10, T: 150 }] })).length);
});

test('calorifugeage économique : tuyauteries reprises des réseaux et des circuits de l\'étude', () => {
  const res = note('res', 'reseau', { T: 75 }), pid = note('pid', 'pid');
  const et = { id: 'e', notes: [res, pid, note('c', 'calorifugeEco'), note('c2', 'calorifugeEco', { lignes: [{ rep: 'saisie', de: 33.7, L: 5, T: 60 }] })] };
  const lignes = L.resoudre(et, et.notes[2]).entrees.lignes, vr = N.calculer('reseau', L.resoudre(et, res).entrees).valeurs;
  assert.strictEqual(lignes.filter(l => /^reseau — /.test(l.rep)).length, vr.troncons.length);
  const t0 = vr.troncons[0], l0 = lignes[0];
  assert.strictEqual(l0.de, C.tube(t0.serie, t0.tube).de); assert.strictEqual(l0.L, t0.L); assert.strictEqual(l0.T, 75);
  assert.ok(lignes.some(l => /^pid — /.test(l.rep) && l.T === 60), 'circuits du schéma au régime 70/50');
  assert.strictEqual(L.resoudre(et, et.notes[3]).entrees.lignes.length, 1, 'saisie conservée');
  assert.ok(L.calculer(et, et.notes[2]).valeurs.invest > 0);
});

test('traitement d\'eau : valeurs guides VDI 2035, eau cumulée, décision, désemboueur, produits', () => {
  // 1 000 L, 100 kW : 10 L/kW → 11,2 °dH = 19,94 °f ; eau cumulée 1 000 × (1 + 5 % × 20) = 2 000 L ≤ 3 × 1 000
  const r = N.calculer('traitementEau', { V: 1000, P: 100, TH: 25 }), v = r.valeurs;
  proche(v.thVdi, 11.2 * 1.78); proche(v.Vcum, 2000); proche(v.thAdm, 11.2 * 1.78); assert.strictEqual(v.decision, 'adoucissement');
  assert.strictEqual(N.calculer('traitementEau', { V: 1000, P: 100, TH: 15 }).valeurs.decision, 'brute');
  // 30 L/kW, 100 kW : 8,4 °dH ; 700 kW : 0,11 °dH → déminéralisation
  proche(N.calculer('traitementEau', { V: 3000, P: 100 }).valeurs.thVdi, 8.4 * 1.78);
  assert.strictEqual(N.calculer('traitementEau', { V: 7000, P: 700, TH: 10 }).valeurs.decision, 'demineralisation');
  // 6 000 L cumulés pour 1 000 L : facteur 2, dureté admissible divisée par 2
  proche(N.calculer('traitementEau', { V: 1000, P: 100, Vcumul: 6000 }).valeurs.thAdm, 11.2 * 1.78 / 2);
  // Notice du générateur prioritaire ; aluminium → déminéralisation
  proche(N.calculer('traitementEau', { V: 1000, P: 100, THmax: 5 }).valeurs.thAdm, 5);
  assert.strictEqual(N.calculer('traitementEau', { V: 1000, P: 100, TH: 25, materiaux: ['alu', 'acier'] }).valeurs.decision, 'demineralisation');
  // Calcaire : 25 °f × 10 mg/L × 2 000 L = 0,5 kg ; débit 100 / (1,163 × 20) = 4,30 m³/h ; inhibiteur 1 % de 1 000 L = 10 L
  proche(v.calcaire, 0.5); proche(v.Q, 100 / (1.163 * 20)); proche(v.inhibiteur, 10);
  assert.ok(v.dnDesemboueur >= 32 && v.dnDesemboueur <= 50);
  // Installation existante : désembouant et procédure
  const ex = N.calculer('traitementEau', { V: 1000, P: 100, etat: 'existante' });
  assert.ok(ex.tableaux[1].lignes.some(l => l[0] === 'Désembouant'));
  assert.ok(ex.onglets[0].blocs[0].liste.length >= 6);
});

test('traitement d\'eau : volume et puissance repris du schéma de principe (valeurs.volume)', () => {
  const pid = note('pid', 'pid'), et = { id: 'e', notes: [pid, note('t', 'traitementEau'), note('t2', 'traitementEau', { V: 1234 }), note('t3', 'traitementEau', { pid: 'pid' })] };
  const vp = N.calculer('pid', L.resoudre(et, pid).entrees).valeurs, r = id => L.resoudre(et, et.notes.find(n => n.id === id));
  const e = r('t').entrees;
  assert.strictEqual(e.V, Math.round(vp.volume)); assert.strictEqual(e.P, 300); // 2 générateurs × 150 kW
  assert.strictEqual(r('t2').entrees.V, 1234);
  assert.ok(r('t3').verrous.V);
  assert.doesNotThrow(() => L.calculer(et, et.notes[1]));
});
