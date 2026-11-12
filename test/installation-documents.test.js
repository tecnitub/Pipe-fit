// Documents de l'installation complète : schéma d'ensemble (SVG, DXF un calque par niveau), analyse fonctionnelle Word
// organisée par niveau, essais des séquences entre niveaux envoyés au chantier avec les PV de mise en service.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/schema'); global.Notes = N;
require('../etudes/public/js/cta'); require('../etudes/public/js/equilibrage'); require('../etudes/public/js/industriel'); require('../etudes/public/js/aeraulique-schema');
require('../etudes/public/js/terminaux'); require('../etudes/public/js/sanitaire'); require('../etudes/public/js/electricite');
global.XLSX = require('../public/js/xlsx');
const L = require('../etudes/public/js/liens');
const M = require('../etudes/public/js/modeles');
const I = require('../etudes/public/js/installation');
const Rg = require('../etudes/public/js/regulation');
const E = require('../etudes/public/js/ensemble');
const Dxf = require('../etudes/public/js/dxf');
const Docx = require('../etudes/public/js/docx');
const CP = require('../etudes/public/js/consignes-projet');
const PM = require('../etudes/public/js/points-mes');
const PlanMes = require('../public/js/plan-mes');

const instancier = id => { let k = 0; return { id: `et-${id}`, objet: `Essai ${id}`, notes: M.INTEGRES.find(m => m.id === id) && M.instancier(M.INTEGRES.find(m => m.id === id), () => `${id}-n${++k}`) }; };
const essais = et => { const parId = new Map(et.notes.map(n => [n.id, n])); return CP.essaisInterNiveaux(I.arbre(et), id => ({ ...N.defauts('pid'), ...((parId.get(id) || {}).entrees || {}) })); };

test('schéma d\'ensemble : productions, circuits, schémas aval et repères des niveaux', () => {
  const et = instancier('boucle-eau-temperee'), A = I.arbre(et), r = E.dessiner(A, { titre: et.objet }), svg = r.svg;
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.deepStrictEqual(r.niveaux, [1, 2]);
  assert.match(svg, /data-calque="NIVEAU_1"/);
  assert.match(svg, /data-calque="NIVEAU_2"/);
  assert.match(svg, />Niveau 1</);
  assert.strictEqual((svg.match(/>Niveau 2</g) || []).length, 3, 'une étiquette par PAC de zone');
  ['PAC zone A', 'PAC zone B', 'PAC zone C', 'PAC de zone A', 'Plancher chauffant zone A'].forEach(t => assert.ok(svg.includes(t), t));
  assert.match(svg, /Montage : Sans vanne/);
  assert.match(svg, /25\/20 °C/);
  // Une pompe dessinée par circuit (3 circuits de la boucle + 2 par PAC de zone)
  assert.strictEqual((svg.match(/<circle /g) || []).length - 1, 9);
  assert.strictEqual((svg.match(/<g /g) || []).length, (svg.match(/<\/g>/g) || []).length);
  // Étude vide : dessin avec un message
  assert.match(E.svg({ schemas: [], reseaux: [], consommateurs: [] }), /Aucun schéma de principe/);
});

test('schéma d\'ensemble : réseaux arborescents et consommateurs de deux productions', () => {
  const et = instancier('eau-glacee-vc4t'), svg = E.svg(I.arbre(et));
  assert.match(svg, /Réseau arborescent d'eau glacée/);
  assert.match(svg, /VC-01/);
  assert.ok(svg.includes('#1f6fb2') && svg.includes('#c0392b'), 'départs froid et chaud');
});

test('DXF du schéma d\'ensemble : sections, un calque par niveau, polylignes et textes', () => {
  const et = instancier('boucle-eau-temperee'), d = Dxf.depuisSvg(E.svg(I.arbre(et)), { polylignes: true }), t = d.texte, l = t.split('\r\n');
  ['HEADER', 'TABLES', 'ENTITIES'].forEach(s => assert.ok(t.includes(`0\r\nSECTION\r\n2\r\n${s}\r\n`), s));
  assert.strictEqual((t.match(/\r\nENDSEC\r\n/g) || []).length, 3);
  assert.ok(t.endsWith('0\r\nEOF\r\n'));
  const calques = l.filter((x, i) => l[i - 2] === 'LAYER' && l[i - 1] === '2');
  ['NIVEAU_1', 'NIVEAU_2', 'CARTOUCHE'].forEach(c => assert.ok(calques.includes(c), c));
  // Entités rangées sur les calques des niveaux, polylignes fermées par SEQEND
  const surCalque = c => l.filter((x, i) => x === c && l[i - 1] === '8').length;
  assert.ok(surCalque('NIVEAU_1') > 20 && surCalque('NIVEAU_2') > 20);
  assert.strictEqual((t.match(/\r\nPOLYLINE\r\n/g) || []).length, (t.match(/\r\nSEQEND\r\n/g) || []).length);
  assert.ok(t.includes('\r\nTEXT\r\n') && t.includes('PAC zone A'));
  assert.ok(d.octets.length > 1000);
  // Sans data-calque ni option : comportement inchangé (LINE sur DEPART / SYMBOLES, textes sur TEXTES)
  const s = Dxf.depuisSvg('<svg width="100" height="100" data-depart="#ff0000"><path d="M0 0 L10 0 L10 10" stroke="#ff0000"/><text x="1" y="2">A</text></svg>').texte;
  assert.ok(!s.includes('POLYLINE') && s.includes('\r\nDEPART\r\n') && s.includes('\r\nTEXTES\r\n'));
});

test('analyse fonctionnelle de l\'installation : sommaire, arbre, liaisons, niveaux dans l\'ordre, paramètres', () => {
  const et = instancier('boucle-eau-temperee'), inst = Rg.contexte(et, L).installations;
  const blocs = Docx.analyseInstallation({ arbre: I.arbre(et), installations: inst, notes: et.notes, affaire: et.objet });
  const h2 = blocs.filter(b => b.h2).map(b => b.h2);
  assert.deepStrictEqual(h2, ['Sommaire', '1. Description de l\'installation', '2. Liaisons entre niveaux', '3. Fonctionnement par niveau', '4. Paramètres par installation']);
  // Description : la boucle (niveau 1) puis chaque PAC de zone (niveau 2) sous son circuit
  const arbre = blocs.find(b => b.arbre && b.arbre.some(l => l.b)).arbre;
  const iB = arbre.findIndex(l => /^Niveau 1 — Schéma de la boucle/.test(l.texte)), iA = arbre.findIndex(l => /^Circuit PAC zone A/.test(l.texte)), iZ = arbre.findIndex(l => /^Niveau 2 — PAC de zone A/.test(l.texte));
  assert.ok(iB >= 0 && iB < iA && iA < iZ);
  assert.ok(arbre[iZ].niveau > arbre[iA].niveau);
  // Liaisons : une par PAC de zone, avec la plage de la boucle
  const li = blocs.find(b => b.table && b.table.entetes[0] === 'Amont').table.lignes;
  assert.strictEqual(li.length, 3);
  assert.ok(li.every(l => /^Niveau 1/.test(l[0]) && /^Niveau 2 — PAC de zone/.test(l[2]) && /15 et 30 °C/.test(l[3])));
  // Fonctionnement : boucle puis les zones, avec les af de la régulation
  const h3 = blocs.slice(blocs.findIndex(b => b.h2 === '3. Fonctionnement par niveau'), blocs.findIndex(b => b.h2 === '4. Paramètres par installation')).filter(b => b.h3).map(b => b.h3);
  assert.deepStrictEqual(h3.map(t => t.replace(/ \(.*$/, '')), ['Niveau 1 — Schéma de la boucle d\'eau tempérée', 'Niveau 2 — PAC de zone A', 'Niveau 2 — PAC de zone B', 'Niveau 2 — PAC de zone C']);
  const zoneA = inst.find(x => /zone A/.test(x.titre)), iz = blocs.findIndex(b => b.h3 && /zone A/.test(b.h3));
  assert.ok(blocs.slice(iz).find(b => b.num).num.some(t => /entre 15 et 30 °C/.test(t)));
  // Paramètres par installation, dans l'ordre de l'arbre, colonne « valeur réglée » à remplir
  const par = blocs.slice(blocs.findIndex(b => b.h2 === '4. Paramètres par installation'));
  assert.deepStrictEqual(par.filter(b => b.h3).map(b => b.h3), h3.map(t => t.replace(/^Niveau \d — /, '')));
  assert.ok(par.find(b => b.table).table.entetes.includes('Valeur réglée'));
  assert.ok(zoneA.params.length);
  // Document Word
  const z = Docx.build(blocs);
  assert.strictEqual(String.fromCharCode(z[0], z[1]), 'PK');
});

test('analyse fonctionnelle : récupération sur groupe froid et CTA rattachées aux deux schémas', () => {
  const et = instancier('thermofrigopompe'), blocs = Docx.analyseInstallation({ arbre: I.arbre(et), installations: Rg.contexte(et, L).installations, notes: et.notes });
  const li = blocs.find(b => b.table && b.table.entetes[0] === 'Amont').table.lignes;
  assert.ok(li.some(l => l[1] === 'Récupération sur le groupe froid' && /eau glacée/.test(l[0]) && /chauffage/.test(l[2])));
  const h3 = blocs.filter(b => b.h3).map(b => b.h3);
  assert.ok(h3.indexOf('CTA — CTA double flux (batteries chaude et froide)') > h3.findIndex(t => /eau glacée/.test(t)));
  assert.ok(blocs.some(b => b.note && /décrit plus haut/.test(b.note)), 'CTA décrite une seule fois');
});

test('essais inter-niveaux : boucle d\'eau tempérée et PAC de zone', () => {
  const l = essais(instancier('boucle-eau-temperee'));
  assert.strictEqual(l.length, 15);
  assert.ok(l.every(x => x.niveau === 2 && x.libelle && x.conditions && x.attendu && x.texte.length <= 120));
  assert.strictEqual(l.filter(x => /demande$/.test(x.libelle) && !/fin de/.test(x.libelle)).length, 3);
  assert.ok(l.some(x => /PAC de zone A — demande/.test(x.libelle) && /pompe du circuit PAC zone A en marche/.test(x.attendu)));
  assert.strictEqual(l.filter(x => /boucle < 15 °C/.test(x.libelle) && /PAC arrêtée \+ alarme/.test(x.attendu)).length, 3);
  assert.strictEqual(l.filter(x => /boucle > 30 °C/.test(x.libelle)).length, 3);
});

test('essais inter-niveaux : relève / appoint dans la temporisation, secours, récupération, échangeur', () => {
  const pac = instancier('pac-appoint-chaudiere'), p = pac.notes.find(n => n.type === 'pid');
  p.entrees.tempoReleve = 15;
  let l = essais(pac);
  assert.ok(l.some(x => /relève \/ appoint/.test(x.libelle) && /PAC1 coupé/.test(x.conditions) && /CH1 en marche après 15 min/.test(x.attendu)));
  assert.ok(l.some(x => /délestage/.test(x.libelle)));
  // Générateur de secours
  p.entrees.generateurs = [...p.entrees.generateurs, { rep: 'CH2', type: 'chaudiere-cond', P: 60, role: 'secours' }];
  l = essais(pac);
  assert.ok(l.some(x => /secours/.test(x.libelle) && /PAC1 en défaut/.test(x.conditions) && /CH2 \(secours\) enclenché/.test(x.attendu)));
  // Récupération : rejet sans besoin de chaleur, récupération sinon ; appoint côté chaud
  const tfp = essais(instancier('thermofrigopompe'));
  assert.ok(tfp.some(x => /aucun besoin de chaleur/.test(x.conditions) && /rejet/.test(x.attendu)));
  assert.ok(tfp.some(x => /besoin de chaleur/.test(x.conditions) && !/aucun/.test(x.conditions) && /basculement sur la récupération/.test(x.attendu)));
  assert.ok(tfp.some(x => /appoint/.test(x.libelle)));
  // Sous-station : pompe secondaire à ajouter, vanne primaire
  const sst = essais(instancier('sous-station'));
  assert.ok(sst.some(x => /pompe secondaire échangeur/.test(x.libelle)));
  assert.ok(sst.some(x => /vanne primaire/.test(x.libelle)));
  [...l, ...tfp, ...sst].forEach(x => assert.ok(x.texte.length <= 120, x.texte));
});

test('essais inter-niveaux envoyés au chantier : PV « Essais des séquences » avec cases OK / NC / observation', () => {
  const et = instancier('boucle-eau-temperee'), pts = PM.extraire(et, n => L.calculer(et, n)), f = pts.find(x => x.cle === 'sequences-installation');
  assert.ok(f);
  assert.strictEqual(f.nature, 'mes'); assert.strictEqual(f.type, 'gtb');
  assert.match(f.titre, /^Essais des séquences/);
  assert.strictEqual(f.controles.length, 15);
  // Côté chantier : tâche de mise en service avec la liste des essais (chaque essai devient un point de contrôle du PV)
  const taches = PlanMes.plan({ affaireId: 'a1', points: PlanMes.pointsChantier([{ app: 'etudes', id: et.id, resume: { objet: et.objet, mes: pts } }]) });
  const tache = taches.find(x => /^Essais des séquences/.test(x.libelle));
  assert.ok(tache, 'tâche du plan de mise en service');
  assert.deepStrictEqual(tache.controles, f.controles);
  // Étude sans schéma de principe : pas de fiche
  assert.ok(!PM.extraire({ notes: [] }, () => ({})).some(x => x.cle === 'sequences-installation'));
});
