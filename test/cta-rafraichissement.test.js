// CTA : rafraîchissement adiabatique en été (direct sur l'air neuf, indirect sur l'air extrait avec le récupérateur).
// Valeurs de référence calculées à la main sur le diagramme de l'air humide (101 325 Pa) : pws = 610,94 · exp(17,625 t /
// (t + 243,04)), x = 0,622 pv / (p − pv), h = 1,006 t + x (2 501 + 1,86 t), température humide th : h(th, saturé) = h.
const { test } = require('node:test');
const assert = require('node:assert');
const N = require('../etudes/public/js/notes');
const Cta = require('../etudes/public/js/cta');

const proche = (a, b, tol, nom) => assert.ok(Math.abs(a - b) <= tol, `${nom} : ${a} au lieu de ${b} (± ${tol})`);
const BASE = { ...N.defauts('cta'), Qs: 10000, Qr: 10000, effHum: 85, deconc: 25 };

test('rafraîchissement adiabatique : désactivé par défaut, résultats inchangés', () => {
  assert.strictEqual(N.defauts('cta').adiabEte, 'non');
  ['double', 'simple', 'melange'].forEach(type => {
    const a = N.calculer('cta', { ...BASE, type }), b = N.calculer('cta', { ...BASE, type, adiabEte: 'non' });
    assert.deepStrictEqual(a.valeurs, b.valeurs, type);
    assert.ok(!a.valeurs.rafraichissement && !a.alertes.some(x => /Rafraîchissement adiabatique/.test(x.texte)), type);
    const c = N.calculer('cta', { ...N.defauts('cta'), type });
    delete c.schema; assert.ok(!('rafraichissement' in c.valeurs));
  });
});

test('rafraîchissement direct : air neuf sec, sans batterie froide (température de soufflage, froid économisé, eau)', () => {
  // Air neuf 35 °C / 20 % : pws = 5 617 Pa, x1 = 6,974 g/kg, h = 53,11 kJ/kg ; th = 18,72 °C (h saturé = 53,11)
  // xs = 13,44 g/kg ; x2 = 6,974 + 0,85 (13,44 − 6,974) = 12,47 g/kg ; t2 = (53,11 − 2 501 x2) / (1,006 + 1,86 x2) = 21,14 °C
  // (≈ 35 − 0,85 × (35 − 18,72)) ; HR = 80 %
  // Froid économisé (refroidissement sensible apporté) : m = 10 000 / 3 600 · 101 325 / (287,05 · 294,29) = 3,332 kg/s
  //   3,332 × 1,006 × (35 − 21,14) = 46,46 kW ; eau : 3,182 kg/s (à 35 °C) × 5,50 g/kg × 3 600 = 63,7 kg/h, appoint 79,6 kg/h
  const r = N.calculer('cta', { ...BASE, type: 'simple', froid: 'non', TeE: 35, HReE: 20, TsE: 16, adiabEte: 'direct' }), f = r.valeurs.rafraichissement;
  proche(f.Tw, 18.72, 0.02, 'température humide');
  proche(f.Tsoufflage, 21.14, 0.02, 'température de soufflage');
  proche(f.HRsoufflage, 80.0, 0.2, 'humidité de soufflage');
  proche(f.Peco, 46.46, 0.1, 'froid économisé');
  proche(f.eau, 63.7, 0.1, 'eau évaporée'); proche(f.appoint, 79.6, 0.1, 'appoint');
  assert.ok(r.alertes.some(a => /Humidité relative de soufflage de 80 %/.test(a.texte)), 'HR de soufflage trop haute');
  assert.ok(r.alertes.some(a => /risque sanitaire.*légionelles/.test(a.texte) && /entretien/.test(a.texte)), 'rappel sanitaire et entretien');
  assert.ok(r.resume.some(l => /Rafraîchissement adiabatique/.test(l[0])));
  assert.ok(r.tableaux[1].lignes.some(l => /rafraîchissement adiabatique direct/.test(l[0])), 'point dans l\'évolution d\'été');
  assert.match(r.schema, /Rafraîch\. adiabatique/);
  // Perte de charge de l'humidificateur ajoutée au soufflage (60 Pa)
  proche(r.valeurs.dpS - N.calculer('cta', { ...BASE, type: 'simple', froid: 'non', TeE: 35, HReE: 20, TsE: 16 }).valeurs.dpS, 60, 1e-9, 'perte de charge');
  // Humidificateur modulé : pas de soufflage sous la consigne (22 °C)
  const m = N.calculer('cta', { ...BASE, type: 'simple', froid: 'non', TeE: 35, HReE: 20, TsE: 22, adiabEte: 'direct' }).valeurs.rafraichissement;
  proche(m.Tsoufflage, 22, 1e-6, 'consigne tenue');
});

test('rafraîchissement direct avec batterie froide en air humide : pas d\'économie signalée', () => {
  // 32 °C / 40 % : h = 62,6 kJ/kg, th = 21,51 °C, air à 23,07 °C après l'humidificateur ; la batterie froide ramène l'air au
  // même point (16 °C, 95 %) : même enthalpie à évacuer, aucune économie
  const r = N.calculer('cta', { ...BASE, type: 'simple', froid: 'oui', adiabEte: 'direct' }), f = r.valeurs.rafraichissement;
  proche(f.Tw, 21.51, 0.02, 'température humide'); proche(f.Tapres, 23.07, 0.02, 'après humidificateur');
  assert.ok(f.Peco < 0.05);
  assert.ok(r.alertes.some(a => /sans économie de froid/.test(a.texte)));
});

test('rafraîchissement indirect : air extrait humidifié, récupérateur à plaques 75 %', () => {
  // Reprise 26 °C / 50 % : x = 10,47 g/kg, h = 52,85 kJ/kg, th = 18,64 °C ; air extrait humidifié à 19,74 °C (ε = 85 %)
  // Air neuf après récupérateur : 32 + 0,75 (19,74 − 32) = 22,81 °C (27,5 °C sans) ; x inchangé 11,88 g/kg
  // Batterie froide jusqu'à 16 °C / 95 % (10,77 g/kg, h = 43,3 kJ/kg) : 47,78 kW sans, 32,55 kW avec : 15,23 kW économisés
  // Eau : 3,283 kg/s (air extrait à 26 °C) × 2,52 g/kg × 3 600 = 29,85 kg/h
  const r = N.calculer('cta', { ...BASE, type: 'double', recup: 'plaques', eta: 75, froid: 'oui', adiabEte: 'indirect' }), f = r.valeurs.rafraichissement;
  proche(f.Tw, 18.64, 0.02, 'température humide'); proche(f.Tapres, 19.74, 0.02, 'air extrait humidifié');
  proche(r.valeurs.ete[2].T, 22.81, 0.02, 'air neuf après récupérateur');
  proche(r.valeurs.ete[2].x * 1000, 11.88, 0.01, 'air neuf non humidifié');
  proche(f.P0, 47.78, 0.05, 'batterie froide sans'); proche(f.P, 32.55, 0.05, 'batterie froide avec');
  proche(f.Peco, 15.23, 0.05, 'froid économisé'); proche(r.valeurs.Pfroid, 32.55, 0.05, 'puissance retenue');
  proche(f.eau, 29.85, 0.05, 'eau évaporée');
  assert.ok(!r.alertes.some(a => /Humidité relative de soufflage/.test(a.texte)));
  assert.ok(r.alertes.some(a => /légionelles/.test(a.texte)));
  assert.match(r.schema, /Humidif\. air extrait/);
  proche(r.valeurs.dpR - N.calculer('cta', { ...BASE, type: 'double', recup: 'plaques', eta: 75, froid: 'oui' }).valeurs.dpR, 60, 1e-9, 'perte de charge à la reprise');
  // Roue rotative : transfert d'humidité signalé
  assert.ok(N.calculer('cta', { ...BASE, type: 'double', recup: 'roue', adiabEte: 'indirect' }).alertes.some(a => /roue rotative/.test(a.texte)));
  // Sans récupérateur (simple flux) : non compté, signalé
  const s = N.calculer('cta', { ...BASE, type: 'simple', adiabEte: 'indirect' });
  assert.ok(!s.valeurs.rafraichissement && s.alertes.some(a => /centrale double flux avec récupérateur/.test(a.texte)));
  // Hiver inchangé par l'option d'été
  assert.deepStrictEqual(r.valeurs.hiver, N.calculer('cta', { ...BASE, type: 'double', recup: 'plaques', eta: 75, froid: 'oui' }).valeurs.hiver);
  // Option proposée dans le formulaire
  const ch = N.TYPES.cta.champs.find(c => c.k === 'adiabEte'); assert.ok(ch && Object.keys(Cta.RAFR).join() === 'non,direct,indirect');
  assert.ok(N.TYPES.cta.champs.find(c => c.k === 'effHum').si({ humid: 'aucune', adiabEte: 'direct' }));
});
