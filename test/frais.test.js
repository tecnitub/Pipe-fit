// Notes de frais : lecture des tickets (texte OCR) et noms des convives obligatoires au restaurant.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const NoteFrais = require('../public/js/frais');

test('lecture d\'un ticket de restaurant', () => {
  const r = NoteFrais.analyserTicket(`LE BISTROT DU PORT
12 quai des Pêcheurs
Tél 04 50 00 00 00
Table 7   Couverts: 3
15/10/2026 12:42
3 Plat du jour        41,40
2 Café                 4,40
TOTAL TTC          49,30 €
TVA 10,00%   HT 44,82   TVA 4,48
CB                49,30`, '2026-10-17');
  assert.deepStrictEqual({ ...r }, { montantTTC: 49.3, date: '2026-10-15', tauxTVA: 10, montantTVA: 4.48, multiTaux: false, enseigne: 'Le Bistrot Du Port', categorie: 'Repas', couverts: 3 });
});

test('carburant, péage et hôtel : montant, date, TVA et catégorie', () => {
  const c = NoteFrais.analyserTicket('TOTAL ENERGIES\nDATE 14.10.26 HEURE 07:58\nGAZOLE 52,31 L\nPRIX/L 1,739\nMONTANT 90,97 EUR\nTVA 20% 15,16', '2026-10-17');
  assert.deepStrictEqual([c.montantTTC, c.date, c.tauxTVA, c.categorie], [90.97, '2026-10-14', 20, 'Carburant']);
  const p = NoteFrais.analyserTicket('APRR\nGare de péage de Villefranche\nCLASSE 2\n16/10/2026 18:03\nMONTANT TTC 7.90 EUR\ndont TVA 1.32', '2026-10-17');
  assert.deepStrictEqual([p.montantTTC, p.tauxTVA, p.categorie, p.enseigne], [7.9, 20, 'Péage', 'APRR']);
  const h = NoteFrais.analyserTicket('HOTEL IBIS BUDGET\nNuitée du 13 oct. 2026\nChambre 1 pers 62,00\nSous-total 72,15\nNet à payer 72,15\nTVA 10 % 6,41', '2026-10-17');
  assert.deepStrictEqual([h.montantTTC, h.date, h.categorie, h.couverts], [72.15, '2026-10-13', 'Hôtel', null]);
  // Date future ou trop ancienne ignorée, ticket illisible sans erreur
  assert.strictEqual(NoteFrais.analyserTicket('01/01/2031 total 12,00', '2026-10-17').date, '');
  assert.strictEqual(NoteFrais.analyserTicket('', '2026-10-17').montantTTC, null);
});

test('restaurant : noms des personnes obligatoires', () => {
  assert.ok(NoteFrais.erreur({ categorie: 'Repas', convives: [] }));
  assert.ok(NoteFrais.erreur({ categorie: 'Repas', convives: [{ nom: '  ' }] }));
  assert.strictEqual(NoteFrais.erreur({ categorie: 'Repas', convives: [{ nom: 'Kevin Roux' }] }), null);
  assert.strictEqual(NoteFrais.erreur({ categorie: 'Péage' }), null);
  assert.strictEqual(NoteFrais.libelleConvives({ convives: [{ nom: 'Kevin Roux' }, { nom: 'T. Girard', societe: 'Laiterie' }] }), 'Kevin Roux, T. Girard (Laiterie)');
});

describeServeur();
function describeServeur() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-frais-'));
  process.env.DB_FILE = path.join(dir, 'test.db');
  process.env.ADMIN_PASSWORD = 'admin-test-pw';
  const { server } = require('../server/server');
  let base;
  before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
  after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
  const call = async (method, url, body, cookie) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  test('le serveur refuse une note de restaurant sans les noms', async () => {
    const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
    await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
    const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
    const note = { userId: 'o1', affaireId: 'af1', date: '2026-10-16', categorie: 'Repas', montantTTC: 49.3, tauxTVA: 10, statut: 'Soumise' };
    const refus = await call('PUT', '/api/records/frais/t1', { data: { ...note, convives: [] } }, k);
    assert.strictEqual(refus.status, 400);
    assert.match(refus.body.error, /nom des personnes/);
    const ok = await call('PUT', '/api/records/frais/t1', { data: { ...note, convives: [{ nom: 'Kevin Roux', userId: 'o1' }, { nom: 'Thomas Girard', societe: 'Laiterie des Alpes' }] } }, k);
    assert.strictEqual(ok.status, 200);
    // Validation par le bureau d'une ancienne note sans noms : autorisée (la règle porte sur l'envoi)
    assert.strictEqual((await call('PUT', '/api/records/frais/t2', { data: { ...note, statut: 'Validée', convives: [] } }, admin)).status, 200);
  });
}
