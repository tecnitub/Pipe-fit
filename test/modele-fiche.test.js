// Modèle de fiche technique Pipe-Fit (docs/MODELE-FICHE-TECHNIQUE.md) : chaque exemple est lu entièrement par son lecteur
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
global.FichesTech = require('../public/js/fiches-tech');
const FC = require('../etudes/public/js/fiche-cta');
const FE = require('../etudes/public/js/fiche-equipement');
global.Terminaux = require('../etudes/public/js/terminaux');
const Sc = require('../etudes/public/js/schema');
const Po = require('../etudes/public/js/pompes');
const SA = require('../etudes/public/js/aeraulique-schema');
const San = require('../etudes/public/js/sanitaire');

const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'MODELE-FICHE-TECHNIQUE.md'), 'utf8');
const fiche = t => { const m = new RegExp(`<!-- fiche: ${t} -->\\s*\`\`\`text\\n([\\s\\S]*?)\`\`\``).exec(doc); assert.ok(m, `exemple ${t} absent`); return m[1].trim().split('\n'); };
const marque = (r, ref) => { assert.strictEqual(r.fabricant, 'Exemplair'); assert.strictEqual(r.reference, ref); };

test('modèle CTA : toutes les valeurs lues', () => {
  const r = FC.lire(fiche('cta')), v = r.valeurs;
  marque(r, 'CTA-DF 4500');
  assert.deepStrictEqual({ Qs: v.Qs, Qr: v.Qr, eta: v.eta, TcAller: v.TcAller, TcRetour: v.TcRetour, PchBC: v.PchBC, dpEauBC: v.dpEauBC, dpBC: v.dpBC, TfAller: v.TfAller, TfRetour: v.TfRetour, PfrBF: v.PfrBF, dpEauBF: v.dpEauBF, dpBF: v.dpBF,
    dpFiltreAN: v.dpFiltreAN, dpFiltreR: v.dpFiltreR, dpRecup: v.dpRecup, PdispoS: v.PdispoS, PdispoR: v.PdispoR, PelS: v.PelS, PelR: v.PelR, rendement: v.rendement, SFP: v.SFP, LwS: v.LwS, LwR: v.LwR, Pbe: v.Pbe, recup: v.recup, froid: v.froid },
  { Qs: 4500, Qr: 4300, eta: 78, TcAller: 70, TcRetour: 50, PchBC: 32, dpEauBC: 12, dpBC: 55, TfAller: 7, TfRetour: 12, PfrBF: 41, dpEauBF: 28, dpBF: 110,
    dpFiltreAN: 140, dpFiltreR: 90, dpRecup: 160, PdispoS: 300, PdispoR: 250, PelS: 2.4, PelR: 1.8, rendement: 62, SFP: 1700, LwS: 78, LwR: 74, Pbe: 9, recup: 'plaques', froid: 'oui' });
});

test('modèle pompe : point, maxima, P1, rendement, courbe', () => {
  const l = fiche('pompe'), r = FE.lire(l), v = r.valeurs;
  marque(r, 'CX 40-8');
  assert.deepStrictEqual([v.Q, v.H, v.Qmax, v.Hmax, v.P1, v.rendement], [4.2, 6.5, 9, 9.5, 320, 48]);
  assert.strictEqual(Po.lireFiche(l), '0:9,5 ; 2:9 ; 4:7,8 ; 6:6 ; 8:3,5');
});

test('modèle terminal : puissances, électricité, eau, air, vanne, tension', () => {
  const r = Terminaux.lireFiche(fiche('terminal')), v = r.valeurs;
  marque(r, 'CK-36');
  assert.deepStrictEqual([v.Pch, v.Pfr, v.Pvent, v.Pbe, v.dpEauC, v.dpEauF, v.Qair, v.Kvs, v.tension], [3.2, 3.6, 45, 1.5, 18, 22, 650, 1.6, 'mono']);
});

test('modèles générateur, vase, ballon d\'ECS', () => {
  const g = FE.lire(fiche('generateur'));
  marque(g, 'PAC-AE 150');
  assert.deepStrictEqual([g.valeurs.P, g.valeurs.Pfr, g.valeurs.P1], [150, 130, 38000]);
  const v = FE.lire(fiche('vase'));
  marque(v, 'VX 80');
  assert.deepStrictEqual([v.valeurs.V, v.valeurs.p0, v.valeurs.pmax], [80, 1.5, 6]);
  const b = FE.lire(fiche('ecs'));
  marque(b, 'BS 500');
  assert.deepStrictEqual([b.valeurs.V, b.valeurs.P, b.valeurs.pmax], [500, 45, 10]);
});

test('modèles bouche, robinetterie (abaque), appareil sanitaire', () => {
  const bo = SA.lireFicheBouche(fiche('bouche'));
  marque(bo, 'DF4-200');
  assert.deepStrictEqual([bo.valeurs.Q, bo.valeurs.dp, bo.valeurs.Lw], [300, 25, 32]);
  const ro = Sc.lireFicheRobinet(fiche('robinet'));
  marque(ro, 'EQ-40');
  assert.deepStrictEqual([ro.valeurs.dn, ro.valeurs.kv, ro.valeurs.tours], [40, 25.9, 4]);
  assert.strictEqual(Sc.lireAbaque(ro.valeurs.abaque).length, 8);
  const sa = San.lireFichePoint(fiche('sanitaire'));
  marque(sa, 'MT-200');
  assert.deepStrictEqual([sa.valeurs.q, sa.valeurs.pMin], [0.15, 1.5]);
});
