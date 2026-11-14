// CTA : humidificateur adiabatique (ruissellement, contact, pulvérisation). Valeurs de référence calculées à la main sur le
// diagramme de l'air humide (101 325 Pa) : pws = 610,94 · exp(17,625 t / (t + 243,04)), x = 0,622 pv / (p − pv),
// h = 1,006 t + x (2 501 + 1,86 t).
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
const FC = require('../etudes/public/js/fiche-cta');
const E = require('../etudes/public/js/electricite');
const Rg = require('../etudes/public/js/regulation');
const Liens = require('../etudes/public/js/liens');

const proche = (a, b, tol, nom) => assert.ok(Math.abs(a - b) <= tol, `${nom} : ${a} au lieu de ${b} (± ${tol})`);
// Centrale simple flux, 10 000 m³/h, air neuf 0 °C / 80 %, reprise 20 °C, 40 % à tenir, soufflage 20 °C, ε = 85 %
const BASE = { ...N.defauts('cta'), type: 'simple', Qs: 10000, froid: 'non', TeH: 0, HReH: 80, TiH: 20, HRmin: 40, TsH: 20, humid: 'adiabatique' };

test('humidificateur adiabatique : préchauffage, évolution isenthalpe, post-chauffage, eau évaporée et d\'appoint', () => {
  // Calcul à la main :
  //  air neuf    : pws(0) = 610,94 Pa, pv = 488,75 Pa, x1 = 3,015 g/kg, h1 = 7,54 kJ/kg
  //  consigne    : pws(20) = 2 333,5 Pa, pv = 933,4 Pa, xc = 5,783 g/kg
  //  saturation  : xs = x1 + (xc − x1) / 0,85 = 6,271 g/kg -> pv = 1 011,4 Pa -> tw = 7,16 °C, h = 22,97 kJ/kg
  //  préchauffage: t1 = (22,97 − 2 501 · 0,003015) / (1,006 + 1,86 · 0,003015) = 15,25 °C
  //  humidif.    : t2 = (22,97 − 2 501 · 0,005783) / (1,006 + 1,86 · 0,005783) = 8,36 °C
  //  soufflage   : h = 1,006 · 20 + 0,005783 · (2 501 + 37,2) = 34,80 kJ/kg
  //  masse d'air : 10 000 / 3 600 · 101 325 / (287,05 · 273,15) = 3,590 kg/s
  //  eau         : 3,590 · (5,783 − 3,015) · 3,6 = 35,8 kg/h ; appoint (25 % de purge) 44,7 kg/h
  //  préchauffage 3,590 · (22,97 − 7,54) = 55,4 kW ; post-chauffage 3,590 · (34,80 − 22,97) = 42,5 kW
  //  chaleur de vaporisation apportée : 3,590 · 0,002768 · 2 538,2 = 25,2 kW
  const r = N.calculer('cta', BASE), a = r.valeurs.adiabatique;
  proche(a.T1, 15.25, 0.05, 'température après préchauffage');
  proche(a.T2, 8.36, 0.05, 'température après humidificateur');
  proche(a.Tw, 7.16, 0.05, 'température humide');
  proche(a.eau, 35.8, 0.1, 'eau évaporée');
  proche(a.appoint, 44.7, 0.1, 'eau d\'appoint');
  proche(a.Ppre, 55.4, 0.15, 'préchauffage');
  proche(a.Ppost, 42.5, 0.15, 'post-chauffage');
  proche(a.Psupp, 25.2, 0.1, 'chaleur de vaporisation');
  proche(r.valeurs.Pchaud, 97.9, 0.2, 'batterie chaude (préchauffage + post-chauffage)');
  assert.strictEqual(a.atteint, true);
  // Évolution d'hiver : enthalpie conservée dans l'humidificateur, humidité de consigne au soufflage
  const h = r.valeurs.hiver;
  assert.strictEqual(h.length, 4);
  proche(h[1].h, h[2].h, 1e-6, 'isenthalpe');
  proche(h[3].T, 20, 1e-9, 'soufflage'); proche(h[3].HR, 40, 0.05, 'humidité relative soufflée');
  assert.ok(r.tableaux[0].lignes.some(l => l[0] === 'Après humidificateur adiabatique'));
  assert.ok(r.resume.some(l => /Eau d'appoint/.test(l[0]) && /44,7 kg\/h/.test(l[1])));
  assert.ok(!r.alertes.some(x => x.niveau === 'erreur'));
  assert.ok(/préchauffage|post-chauffage/i.test(r.schema) && /Humidif\. adiabatique/.test(r.schema));
  // Perte de charge de l'humidificateur dans le ventilateur de soufflage
  assert.strictEqual(r.valeurs.dpS - N.calculer('cta', { ...BASE, humid: 'aucune' }).valeurs.dpS, 60);
});

test('humidificateur adiabatique : efficacité saisie, consigne non atteinte, soufflage trop froid', () => {
  // ε = 100 % : saturation atteinte -> xs = xc, préchauffage plus faible
  const r100 = N.calculer('cta', { ...BASE, effHum: 100 }).valeurs.adiabatique;
  assert.ok(r100.T1 < 15.25 && r100.HRsortie > 99.5);
  // Sans batterie chaude : air humidifié à 0 °C tel quel ; tw = −1,13 °C, xs = 3,47 g/kg,
  // x2 = 3,015 + 0,85 · (3,47 − 3,015) = 3,40 g/kg < 5,78 g/kg : consigne inatteignable, 3,590 · 0,389 · 3,6 = 5,0 kg/h évaporés
  const sans = N.calculer('cta', { ...BASE, froid: 'aucune' });
  assert.strictEqual(sans.valeurs.adiabatique.atteint, false);
  proche(sans.valeurs.adiabatique.xmax * 1000, 3.40, 0.01, 'humidité maximale');
  proche(sans.valeurs.adiabatique.eau, 5.03, 0.05, 'eau évaporée sans préchauffage');
  assert.ok(sans.alertes.some(x => /risque de gel/.test(x.texte)));
  assert.ok(sans.alertes.some(x => x.niveau === 'erreur' && /non atteinte/.test(x.texte)));
  // Consigne de soufflage plus froide que l'air sortant de l'humidificateur
  const froid = N.calculer('cta', { ...BASE, TsH: 6 });
  assert.ok(froid.alertes.some(x => x.niveau === 'erreur' && /au-dessus de la consigne de soufflage/.test(x.texte)));
  // Air neuf déjà assez humide : rien à évaporer
  const humide = N.calculer('cta', { ...BASE, HRmin: 15 });
  assert.ok(!humide.valeurs.adiabatique);
  // Option absente : résultats inchangés (aucun humidificateur)
  const aucun = N.calculer('cta', { ...BASE, humid: 'aucune' });
  assert.ok(!aucun.valeurs.adiabatique && aucun.valeurs.hiver.length === 2);
});

test('fiche technique : humidificateur adiabatique repris dans le calcul, débit d\'eau comparé', () => {
  assert.deepStrictEqual(FC.champs('cta', { humid: 'adiabatique' }).map(c => [c.k, c.val]), [['humid', 'adiabatique']]);
  assert.deepStrictEqual(FC.champs('cta', { humid: 'autre' }), []);
  const ok = N.calculer('cta', { ...BASE, fiche: { mHum: 40 } }), court = N.calculer('cta', { ...BASE, fiche: { mHum: 20 } });
  assert.ok(ok.alertes.some(x => x.niveau === 'ok' && /Humidificateur de la fiche : 40 kg\/h pour 35,8 kg\/h/.test(x.texte)));
  assert.ok(court.alertes.some(x => x.niveau === 'attention' && /insuffisant/.test(x.texte)));
});

test('humidificateur adiabatique : bilan électrique et régulation de la CTA', () => {
  const et = { notes: [{ id: 'c', type: 'cta', titre: 'CTA hall', entrees: { ...BASE, PpompeHum: 0.55 } }] };
  const eqs = E.equipementsEtude(et, Liens);
  const pompe = eqs.find(q => /Pompe de recirculation/.test(q.designation));
  assert.ok(pompe && pompe.P === 0.55 && pompe.type === 'pompe');
  assert.ok(eqs.some(q => /Électrovanne d'alimentation/.test(q.designation)) && eqs.some(q => /Électrovanne de vidange/.test(q.designation)) && eqs.some(q => /conductivité/.test(q.designation)));
  const sans = E.equipementsEtude({ notes: [{ id: 'c', type: 'cta', titre: 'CTA hall', entrees: { ...BASE, humid: 'aucune' } }] }, Liens);
  assert.ok(!sans.some(q => /humidificateur/i.test(q.designation)));
  const inst = Rg.contexte(et, Liens).installations.find(i => i.noteId === 'c');
  assert.ok(inst.af.some(l => /Humidificateur adiabatique/.test(l) && /conductivité/.test(l)));
  assert.ok(inst.params.some(p => /préchauffage/.test(p.libelle) && Math.abs(p.valeur - 15.3) < 0.06));
});
