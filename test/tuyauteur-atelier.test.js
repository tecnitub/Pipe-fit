// Tuyauteur : platines, brides (reconnaissance, boulonnerie), escaliers, supportage
const test = require('node:test');
const assert = require('node:assert');

const Dessin = require('../tuyauteur/src/dessin.js');
const Platine = require('../tuyauteur/src/platine.js');
const Brides = require('../tuyauteur/src/brides.js');
const Escalier = require('../tuyauteur/src/escalier.js');
const Supportage = require('../tuyauteur/src/supportage.js');

const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} : ${a} au lieu de ${b} (± ${tol})`);

test('platine : masse, trous en vrais cercles dans le DXF, contrôles', () => {
  const r = Platine.platine({ forme: 'rect', L: 200, l: 150, epaisseur: 10, coins: 'vifs', disposition: 'coins', bordX: 30, bordY: 30, dTrou: 14, dCentral: 40 });
  const aire = 200 * 150 - 4 * Math.PI * 49 - Math.PI * 400;
  proche(r.resultats.aire, aire / 1e6, 1e-4, 'surface');
  proche(r.resultats.masse, aire / 1e6 * 10 * 7.85, 0.01, 'masse');
  assert.deepStrictEqual(r.trous.map(t => [t.dx, t.dy]), [[30, 30], [170, 30], [170, 120], [30, 120]]);
  const dxf = Dessin.versDXF(r.dessin);
  assert.strictEqual((dxf.match(/\r\nCIRCLE\r\n/g) || []).length, 5);
  // Pince trop faible et trou hors platine
  assert.ok(Platine.platine({ forme: 'rect', L: 100, l: 100, epaisseur: 8, disposition: 'coins', bordX: 12, dTrou: 14 }).avertissements.some(a => /Pince/.test(a)));
  assert.throws(() => Platine.platine({ forme: 'rect', L: 100, l: 100, epaisseur: 8, disposition: 'coins', bordX: 5, dTrou: 14 }), /sort de la platine/);
  // Platine ronde percée sur un cercle, arrondis et chanfreins
  const ronde = Platine.platine({ forme: 'rond', D: 220, epaisseur: 12, disposition: 'cercle', n: 8, pcd: 180, dTrou: 18 });
  assert.strictEqual(ronde.trous.length, 8);
  proche(Math.hypot(ronde.trous[0].x, ronde.trous[0].y), 90, 0.1);
  assert.ok(Platine.platine({ forme: 'rect', L: 200, l: 200, epaisseur: 10, coins: 'arrondis', rayon: 20, disposition: 'aucun' }).resultats.aire < 0.04);
  proche(Platine.platine({ forme: 'rect', L: 200, l: 200, epaisseur: 10, coins: 'chanfreins', rayon: 20, disposition: 'aucun' }).resultats.aire, (40000 - 4 * 200) / 1e6, 1e-6);
});

test('brides : reconnaissance par l\'entraxe de deux trous voisins', () => {
  // DN 100 PN 16 : K 180, 8 trous → entraxe voisins = 180 × sin(22,5°) = 68,88
  const r = Brides.reconnaitre({ n: 8, mode: 'voisins', mesure: 68.9, dTrou: 18 });
  assert.strictEqual(r.candidats[0].dn, 100);
  assert.deepStrictEqual(r.candidats[0].pns, [10, 16]);
  assert.strictEqual(r.certitude, 'forte');
  // Bord à bord : DN 200 PN 16 (12 trous Ø22 sur 295) → 295·sin 15° − 22
  const b = Brides.reconnaitre({ n: 12, mode: 'bord', mesure: 295 * Math.sin(Math.PI / 12) - 22, dTrou: 22 });
  assert.strictEqual(b.candidats[0].designation, 'DN 200 PN 16');
  // Trous opposés et Ø extérieur départagent PN 25 / 40 au DN 200
  const o = Brides.reconnaitre({ n: 12, mode: 'opposes', mesure: 320, dTrou: 30, D: 375 });
  assert.strictEqual(o.candidats[0].designation, 'DN 200 PN 40');
  // Bride américaine reconnue
  assert.match(Brides.reconnaitre({ n: 8, mode: 'opposes', mesure: 190.5, dTrou: 19 }).candidats[0].designation, /NPS 4" .*classe 150/);
  assert.throws(() => Brides.reconnaitre({ n: 5, mode: 'opposes', mesure: 100 }), /pair/);
});

test('brides : longueurs de tiges et de vis selon le montage', () => {
  // Bride / bride DN 100 PN 16 : 2 × 20 + joint 2 + 2 × (écrou 14,8 + 2 filets 4) = 79,6 → 80
  const bb = Brides.boulonnerie({ dn: 100, pn: 16, montage: 'bride-bride', fixation: 'tige', joint: 2 });
  assert.strictEqual(bb.longueur, 80);
  assert.strictEqual(bb.designation, '8 tiges M16 × 80 + 16 écrous');
  // Avec rondelles : + 2 × 3
  assert.strictEqual(Brides.boulonnerie({ dn: 100, pn: 16, montage: 'bride-bride', fixation: 'tige', joint: 2, rondelles: true }).longueur, 90);
  // Vis + écrou : 42 + 14,8 + 4 = 60,8 → 65 (longueur normalisée)
  assert.strictEqual(Brides.boulonnerie({ dn: 100, pn: 16, montage: 'bride-bride', fixation: 'vis', joint: 2 }).longueur, 65);
  // Vanne papillon à insérer : 2 × 20 + 52 (EN 558-20) + écrous → 130
  const w = Brides.boulonnerie({ dn: 100, pn: 16, montage: 'papillon-wafer', fixation: 'tige', joint: 2 });
  assert.strictEqual(w.serrage, 92);
  assert.strictEqual(w.longueur, 130);
  // Vanne taraudée : 2 × 8 vis, bride 20 + engagement 16 → M16 × 40
  const t = Brides.boulonnerie({ dn: 100, pn: 16, montage: 'papillon-taraude', joint: 2 });
  assert.strictEqual(t.designation, '16 vis H M16 × 40 (ISO 4017)');
  // Bride / filtre : épaisseur de la bride du filtre prise en compte
  assert.strictEqual(Brides.boulonnerie({ dn: 100, pn: 16, montage: 'bride-filtre', fixation: 'tige', joint: 2, epaisseur2: 30 }).serrage, 52);
  // Abaque : tous les DN, PN 6 à 40 ; pas de vanne papillon au DN 15
  const ab = Brides.abaque({ montage: 'papillon-wafer', fixation: 'tige', joint: 2 });
  assert.strictEqual(ab.length, Brides.DNS.length);
  assert.strictEqual(ab[0].pns[0], null);
  assert.match(ab.find(r => r.dn === 100).pns[2].texte, /^8 × M16 × 130$/);
});

test('escalier : marches justes sur la hauteur, giron et angle', () => {
  const r = Escalier.calculer({ type: 'escalier', H1: 2800, mode: 'angle', angle: 38, hauteurMarche: 190, gardeCorps: 'deux' });
  const v = r.volees[0];
  assert.strictEqual(v.n, 15);
  proche(v.h * v.n, 2800, 0.05);
  proche(v.g, (2800 / 15) / Math.tan(38 * Math.PI / 180), 0.1);
  assert.strictEqual(v.marches, 14);
  // Par le giron : angle = atan(h / g)
  const g = Escalier.calculer({ type: 'escalier', H1: 1000, mode: 'giron', giron: 250, hauteurMarche: 200, gardeCorps: 'aucun' });
  proche(g.volees[0].alpha, Math.atan(200 / 250) * 180 / Math.PI, 0.01);
  assert.ok(g.avertissements.some(a => /garde-corps requis/.test(a)));
  // Limon : longueur de l'arête haute = distance entre ses deux coupes
  const L = Escalier.limon(Escalier.volee(2800, { mode: 'angle', angle: 38, hauteurMarche: 200 }), 200, 60);
  proche(L.longueur, Math.hypot(L.contour[2][0] - L.contour[3][0], L.contour[2][1] - L.contour[3][1]), 1e-6);
  assert.strictEqual(L.traits.length, 13);
});

test('passerelle : montée, partie droite, descente, garde-corps et plinthe', () => {
  const r = Escalier.calculer({ type: 'passerelle', H1: 1500, H2: 1500, droite: 3000, mode: 'angle', angle: 37, hauteurMarche: 190, gardeCorps: 'deux', lisse: true, plinthe: true, espacementPoteaux: 1500 });
  assert.strictEqual(r.volees.length, 2);
  const mc = r.debit.find(d => d[0] === 'Main courante');
  proche(mc[3], 2 * r.volees[0].rampant + 3000, 2, 'main courante');
  assert.strictEqual(mc[2], 2);
  assert.ok(r.debit.some(d => d[0] === 'Plinthe' && d[3] === 3000));
  assert.ok(r.debit.some(d => d[0] === 'Limon descente'));
  const sans = Escalier.calculer({ type: 'passerelle', H1: 1500, H2: 1500, droite: 3000, mode: 'angle', angle: 37, hauteurMarche: 190, gardeCorps: 'deux', plinthe: false });
  assert.ok(sans.avertissements.some(a => /plinthe/.test(a)));
  assert.ok(!sans.debit.some(d => d[0] === 'Plinthe'));
});

test('supportage : support au sol et consoles sur poteaux', () => {
  // Au sol, étrier : poteau = axe − rayon du tube − traverse − platine
  const s = Supportage.support({ repere: 'S1', de: 114.3, fixation: 'sol', maintien: 'etrier', hauteurAxe: 800, profil: 'L60', profilPoteau: 'T60', platineT: 10, mode: 'cheville' });
  proche(s.pieces[0][3], 800 - 57.15 - 60 - 10, 0.5, 'poteau');
  assert.ok(s.quincaillerie.some(q => /Étrier DIN 3570.*M12/.test(q[0])));
  assert.ok(s.quincaillerie.some(q => /Chevilles/.test(q[0]) && q[1] === 4));
  assert.strictEqual(s.platines.length, 1);
  // Poteau béton, grand déport : jambe de force automatique
  const c = Supportage.support({ repere: 'S2', de: 60.3, fixation: 'poteau', materiau: 'beton', mode: 'cheville', maintien: 'etrier', deport: 600, profil: 'UPN80' });
  assert.ok(c.pieces.some(p => /jambe/.test(p[0])));
  // Poteau acier soudé : pas de platine ; crapauds : platine plus large que le poteau
  assert.strictEqual(Supportage.support({ de: 60.3, fixation: 'poteau', materiau: 'acier', mode: 'soude', deport: 300 }).platines.length, 0);
  const cr = Supportage.support({ de: 60.3, fixation: 'poteau', materiau: 'acier', mode: 'crapauds', deport: 300, poteauL: 200 });
  assert.ok(cr.platines[0].L >= 300);
  // Bois en ceinture : contre-plaque et tiges autour du poteau
  const ce = Supportage.support({ de: 88.9, fixation: 'poteau', materiau: 'bois', mode: 'ceinture', maintien: 'collier', deport: 250, poteauL: 150, poteauP: 150 });
  assert.ok(ce.platines.some(p => /contre-plaque/.test(p.nom)));
  assert.ok(ce.quincaillerie.some(q => /Collier/.test(q[0])));
  // Récapitulatif du carnet
  const r = Supportage.recapitulatif([s, c, { ...s, quantite: 2 }]);
  assert.ok(r.profils.find(p => /Tube carré 60/.test(p.prof)).pieces >= 2);
  assert.ok(r.masse > 0);
  assert.throws(() => Supportage.support({ de: 114.3, fixation: 'sol', hauteurAxe: 150 }), /Hauteur trop faible/);
});

test('poids : tubes, profilés, tôles comparés aux tables', () => {
  const Poids = require('../tuyauteur/src/poids.js');
  const kgm = o => Poids.piece({ longueur: 1000, ...o }).kgm;
  proche(kgm({ type: 'tube', de: 114.3, ep: 3.6 }), 9.83, 0.01, 'tube Ø114,3 × 3,6');
  proche(kgm({ type: 'tube', de: 60.3, ep: 2.9 }), 4.11, 0.01, 'tube Ø60,3 × 2,9');
  proche(kgm({ type: 'corniere', H: 50, ep: 5 }), 3.77, 0.01, 'cornière 50 × 5');
  proche(kgm({ type: 'corniere', H: 80, ep: 8 }), 9.63, 0.02, 'cornière 80 × 8');
  proche(kgm({ type: 'tubeRect', H: 100, B: 100, ep: 5 }), 14.4, 0.05, 'tube carré 100 × 5');
  proche(kgm({ type: 'tubeRect', H: 80, B: 40, ep: 3 }), 5.19, 0.05, 'tube rectangulaire 80 × 40 × 3');
  proche(kgm({ type: 'plat', H: 50, ep: 10 }), 3.925, 0.001);
  proche(kgm({ type: 'rond', de: 20 }), 2.47, 0.01);
  assert.strictEqual(kgm({ type: 'HEA', taille: 200 }), 42.3);
  // Autres matières au prorata de la masse volumique
  proche(kgm({ type: 'plat', H: 50, ep: 10, matiere: 'alu' }), 3.925 * 2.70 / 7.85, 0.001);
  // Tôle : 10 mm d'acier = 78,5 kg/m² ; quantité
  const t = Poids.piece({ type: 'tole', L: 2000, l: 1000, epaisseur: 10, quantite: 3 });
  assert.strictEqual(t.kgm2, 78.5); assert.strictEqual(t.unitaire, 157); assert.strictEqual(t.total, 471);
  // Tube plein d'eau et calorifugé
  const s = Poids.piece({ type: 'tube', de: 114.3, ep: 3.6, longueur: 1000, contenu: 'eau', isolant: 50, rhoIsolant: 100 }).service;
  proche(s.contenu, Math.PI * 107.1 ** 2 / 4 / 1e6 * 1000, 0.01, 'eau');
  proche(s.isolant, Math.PI * (214.3 ** 2 - 114.3 ** 2) / 4 / 1e6 * 100, 0.01, 'calorifuge');
  // Liste : total et sous-total par matière
  const l = Poids.liste([t, Poids.piece({ type: 'tole', L: 1000, l: 1000, epaisseur: 2, matiere: 'inox' })]);
  assert.strictEqual(l.total, 486.86);
  assert.deepStrictEqual(l.parMatiere.map(m => m.matiere), ['Acier', 'Inox austénitique']);
  assert.throws(() => Poids.piece({ type: 'tube', de: 20, ep: 12, longueur: 1000 }), /Épaisseur trop forte/);
});
