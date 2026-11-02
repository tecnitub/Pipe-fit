const test = require('node:test');
const assert = require('node:assert');
const Notes = require('../etudes/public/js/notes');
require('../etudes/public/js/cta');
const FicheCta = require('../etudes/public/js/fiche-cta');

const FICHE = `VENTILIA - Fiche de sélection
Centrale de traitement d'air double flux CTA-DF 4500
Débit d'air soufflage 4 200 m³/h
Débit d'air reprise 4 000 m³/h
Pression disponible soufflage / reprise 300 / 250 Pa
Récupérateur : échangeur à plaques contre-courant
Efficacité thermique sèche (EN 308) 82 %
Perte de charge récupérateur 145 Pa
Filtre air neuf ePM1 60 % perte de charge moyenne 110 Pa
Filtre reprise ePM10 50 % perte de charge moyenne 75 Pa
Batterie chaude eau 70/50 °C puissance 32,5 kW
Batterie chaude perte de charge air 45 Pa
Batterie froide eau glacée 7/12 °C puissance 28,1 kW
Batterie froide perte de charge air 110 Pa
Ventilateur soufflage puissance électrique absorbée 1,85 kW
Ventilateur reprise puissance électrique absorbée 1,40 kW
SFP 1 450 W/(m³/s)
Puissance acoustique côté gaine soufflage 78 dB(A)
Puissance acoustique côté gaine reprise 72 dB(A)`;

test('Fiche de CTA : caractéristiques lues', () => {
  const r = FicheCta.lire(FICHE);
  assert.deepStrictEqual([r.fabricant, r.reference], ['VENTILIA', 'CTA-DF 4500']);
  const v = r.valeurs;
  assert.deepStrictEqual([v.Qs, v.Qr, v.PdispoS, v.PdispoR, v.eta, v.recup], [4200, 4000, 300, 250, 82, 'plaques']);
  assert.deepStrictEqual([v.TcAller, v.TcRetour, v.TfAller, v.TfRetour, v.froid], [70, 50, 7, 12, 'oui']);
  assert.deepStrictEqual([v.dpFiltreAN, v.dpFiltreR, v.dpRecup, v.dpBC, v.dpBF], [110, 75, 145, 45, 110]);
  assert.deepStrictEqual([v.PchBC, v.PfrBF, v.PelS, v.PelR, v.SFP, v.LwS, v.LwR], [32.5, 28.1, 1.85, 1.4, 1450, 78, 72]);
  assert.ok(/4 200/.test(r.sources.Qs));
});

test('Fiche en tableau soufflage / reprise et roue', () => {
  const r = FicheCta.lire(['Caractéristiques Soufflage Reprise', 'Débit d\'air (m³/h) 3 000 2 900', 'Pression statique externe (Pa) 250 200', 'Récupérateur rotatif (roue) efficacité 78 %', 'Sans batterie froide']);
  assert.deepStrictEqual([r.valeurs.Qs, r.valeurs.Qr, r.valeurs.PdispoS, r.valeurs.PdispoR, r.valeurs.recup, r.valeurs.eta, r.valeurs.froid], [3000, 2900, 250, 200, 'roue', 78, 'non']);
  assert.strictEqual(FicheCta.lire('Document sans données').nb, 0);
});

test('Champs remplis et contrôles du calcul', () => {
  const r = FicheCta.lire(FICHE);
  const cta = Object.fromEntries(FicheCta.champs('cta', r.valeurs).map(c => [c.k, c.val]));
  assert.deepStrictEqual([cta.Qs, cta.eta, cta.recup, cta.TcAller, cta.dpFiltreAN, cta.froid], [4200, 82, 'plaques', 70, 110, 'oui']);
  assert.ok(!('PdispoS' in cta) && !('LwS' in cta));
  const aero = Object.fromEntries(FicheCta.champs('aero', r.valeurs).map(c => [c.k, c.val]));
  assert.deepStrictEqual([aero.recuperateur, aero.dpFiltreS, aero.dpBatC, aero.LwFabS, aero.batFroide, aero.batChaude], ['plaques', 110, 45, 78, 'oui', 'oui']);
  // Calcul de CTA rempli par la fiche : pression disponible suffisante, batterie froide contrôlée
  const e = { ...cta, fiche: FicheCta.fiche(r, 'fiche.pdf'), dpReseauS: 280, dpReseauR: 300 };
  const res = Notes.calculer('cta', e);
  assert.ok(res.alertes.some(a => a.niveau === 'ok' && /Pression disponible au soufflage VENTILIA CTA-DF 4500 : 300 Pa pour 280 Pa/.test(a.texte)));
  assert.ok(res.alertes.some(a => a.niveau === 'erreur' && /reprise : 250 Pa pour 300 Pa/.test(a.texte)));
  assert.ok(res.alertes.some(a => /Batterie chaude de la fiche/.test(a.texte)));
  assert.ok(res.resume.some(([k, v]) => k === 'Centrale (fiche technique)' && v === 'VENTILIA CTA-DF 4500'));
});
