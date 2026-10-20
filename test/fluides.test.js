// Registre des fluides frigorigènes, rapprochement des factures fournisseurs, photos envoyées après une coupure réseau.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const F = require('../public/js/fluides');
const R = require('../public/js/rapprochement');

test('tonnes éq. CO2 et périodicité des contrôles d\'étanchéité', () => {
  assert.strictEqual(F.teqCO2('R410A', 12.5), 26.1);
  assert.strictEqual(F.periodicite({ fluide: 'R32', charge: 3.2 }), 0); // 2,16 t < 5 t
  assert.strictEqual(F.periodicite({ fluide: 'R410A', charge: 12.5 }), 12);
  assert.strictEqual(F.periodicite({ fluide: 'R410A', charge: 12.5, detectionPermanente: true }), 24);
  assert.strictEqual(F.periodicite({ fluide: 'R449A', charge: 45 }), 6); // 62,9 t
  assert.strictEqual(F.periodicite({ fluide: 'R134a', charge: 380, detectionPermanente: true }), 6); // 543 t avec détection
  assert.strictEqual(F.periodicite({ fluide: 'R404A', charge: 2, hermetique: true }), 0); // 7,8 t < 10 t (hermétique)
  assert.strictEqual(F.periodicite({ fluide: 'R22', charge: 6 }), 12); // HCFC : seuils en kg
  assert.strictEqual(F.periodicite({ fluide: 'R744 (CO2)', charge: 50 }), 0);
  assert.ok(F.detectionObligatoire({ fluide: 'R134a', charge: 380 }) && !F.detectionObligatoire({ fluide: 'R410A', charge: 12.5 }));
});

test('prochain contrôle, suivi de fuite, bouteilles, contrôle de la fiche, bilan', () => {
  const eq = { id: 'e', fluide: 'R410A', charge: 12.5 };
  const fiches = [{ equipementId: 'e', date: '2026-01-10', nature: 'controlePeriodique', statut: 'Signée' }];
  assert.strictEqual(F.prochainControle(eq, fiches).date, '2027-01-10');
  fiches.push({ equipementId: 'e', date: '2026-06-15', nature: 'maintenance', statut: 'Signée', fuites: [{ localisation: 'vanne', reparee: true }], chargeVierge: 1.5, bouteilleCharge: 'b1' });
  const p = F.prochainControle(eq, fiches);
  assert.deepStrictEqual([p.date, p.suiviFuite], ['2026-07-15', true]); // contrôle de suivi sous un mois
  assert.strictEqual(F.prochainControle(eq, [...fiches, { equipementId: 'e', date: '2026-08-01', nature: 'demantelement', statut: 'Signée' }]), null);
  assert.strictEqual(F.masseBouteille({ id: 'b1', masseInitiale: 10 }, fiches), 8.5);
  assert.match(F.erreur({ equipementId: 'e', date: '2026-06-15', nature: 'maintenance', chargeVierge: 2 }, eq), /bouteille/);
  assert.match(F.erreur({ equipementId: 'x', date: '2026-06-15', nature: 'maintenance', chargeVierge: 2, bouteilleCharge: 'b' }, { fluide: 'R22' }), /HCFC/);
  assert.match(F.erreur({ equipementId: 'e', date: '2026-06-15', nature: 'controlePeriodique' }, eq), /détecteur/);
  assert.strictEqual(F.erreur({ equipementId: 'e', date: '2026-06-15', nature: 'controlePeriodique', detecteur: 'Testo' }, eq), null);
  const b = F.bilan(fiches, [eq], 2026);
  assert.deepStrictEqual([b[0].fluide, b[0].interventions, b[0].fuites, b[0].charge], ['R410A', 2, 1, 1.5]);
});

test('rapprochement : prix, quantité livrée, ligne non commandée, conforme', () => {
  const c = { id: 'c', numero: 'CF-1', statut: 'Réceptionnée partiellement', lignes: [
    { designation: 'Tube inox 316L DN50 sch10S', qte: 100, pu: 41, qteRecue: 100 }, { designation: 'Tube inox 316L DN100 sch10S', qte: 50, pu: 82, qteRecue: 40 }] };
  const a = R.analyser({ lignes: [{ designation: 'TUBE 316L DN 50 SCH10S', qte: 100, pu: 43.46 }, { designation: 'Tube inox 316L DN100', qte: 50, pu: 82 }, { designation: 'Frais de port', qte: 1, pu: 45 }] }, [c]);
  assert.strictEqual(a.statut, 'ecarts');
  assert.deepStrictEqual(a.lignes.map(l => l.ecarts.map(e => [e.type, e.montant])), [[['prix', 246]], [['livraison', 820]], []]);
  assert.strictEqual(a.lignes[2].frais, true); assert.strictEqual(a.ecart, 246 + 820 + 45);
  const ok = R.analyser({ lignes: [{ designation: 'Tube inox 316L DN50', qte: 100, pu: 41.2 }], montantHT: 4120 }, [c]); // + 0,5 % : toléré
  assert.strictEqual(ok.statut, 'conforme');
  assert.deepStrictEqual(ok.nonFacturees.map(n => n.reste), [40]);
  // Déjà facturé par une autre facture : la quantité disponible diminue
  const deja = R.dejaFactureHors([{ id: 'autre', rapprochementLignes: [{ cle: 'c|0', qte: 100 }] }], 'moi');
  assert.strictEqual(R.analyser({ lignes: [{ designation: 'Tube inox 316L DN50', qte: 10, pu: 41 }] }, [c], deja).lignes[0].ecarts[0].type, 'commande');
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-fluides-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('fiches d\'intervention sur le serveur : saisie du frigoriste, contrôle, fiche signée figée', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'ahmed', password: 'motdepasse1', role: 'atelier', nom: 'Ahmed', userId: 'o2' }, admin);
  const claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const ahmed = (await call('POST', '/api/login', { login: 'ahmed', password: 'motdepasse1' })).cookie;
  // Le frigoriste voit le registre, crée un équipement sur place, mais ne modifie pas ceux du bureau
  const d = (await call('GET', '/api/data', null, ahmed)).body;
  assert.ok(d.equipementsFrigo.length >= 4 && d.bouteilles.length >= 3);
  assert.strictEqual((await call('PUT', '/api/records/equipementsFrigo/eqf2', { data: { ...d.equipementsFrigo.find(e => e.id === 'eqf2'), charge: 1 }, version: 1 }, ahmed)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/equipementsFrigo/eq-terrain', { data: { clientId: 'e2', designation: 'Split bureau', fluide: 'R32', charge: 1.1, userId: 'o2', aValider: true } }, ahmed)).status, 200);
  // Fiche incomplète refusée ; complète acceptée et numérotée
  const fiche = { userId: 'o2', equipementId: 'eqf2', date: '2026-10-20', nature: 'maintenance', chargeVierge: 1.2, statut: 'Envoyée' };
  assert.match((await call('PUT', '/api/records/fichesFluides/fi-x', { data: fiche }, ahmed)).body.error, /bouteille/);
  assert.strictEqual((await call('PUT', '/api/records/fichesFluides/fi-x', { data: { ...fiche, userId: 'o1', bouteilleCharge: 'bt3' } }, ahmed)).status, 403, 'pour soi seulement');
  const ok = await call('PUT', '/api/records/fichesFluides/fi-x', { data: { ...fiche, bouteilleCharge: 'bt3', statut: 'Signée', signatureClientId: 'abc' } }, ahmed);
  assert.strictEqual(ok.status, 200);
  const rec = (await call('GET', '/api/records/fichesFluides/fi-x', null, claire)).body;
  assert.match(rec.numero, /^FI-\d{4}-\d{4}$/);
  // Signée : plus modifiable, même par le bureau (sauf administrateur)
  assert.strictEqual((await call('PUT', '/api/records/fichesFluides/fi-x', { data: { ...rec, chargeVierge: 9 }, version: rec._v }, claire)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/fichesFluides/fi-x', { data: { ...rec, observations: 'corrigé' }, version: rec._v }, admin)).status, 200);
});

test('photo prise hors connexion : identifiant choisi par le téléphone, renvoi sans doublon', async () => {
  const ahmed = (await call('POST', '/api/login', { login: 'ahmed', password: 'motdepasse1' })).cookie;
  const dataUrl = `data:image/png;base64,${Buffer.from('\x89PNG\r\n\x1a\n-photo').toString('base64')}`;
  const id = 'a1b2c3d4e5f6a7b8c9d0e1f2';
  assert.deepStrictEqual((await call('POST', '/api/files', { dataUrl, id }, ahmed)).body, { id });
  assert.deepStrictEqual((await call('POST', '/api/files', { dataUrl, id }, ahmed)).body, { id }, 'renvoi identique accepté');
  assert.strictEqual((await call('POST', '/api/files', { dataUrl: `data:image/png;base64,${Buffer.from('autre').toString('base64')}`, id }, ahmed)).status, 409);
  assert.strictEqual((await call('POST', '/api/files', { dataUrl, id: '../etc' }, ahmed)).status, 400);
  assert.strictEqual((await fetch(`${base}/api/files/${id}`, { headers: { Cookie: ahmed } })).status, 200);
});
