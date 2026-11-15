// Suivi des étapes dans le CRM : résumé d'avancement envoyé par Études, portefeuille (bureau), « Mes étapes » d'un
// compagnon (les siennes seulement), étape faite sur le terrain (relue par Études), relances sans doublon.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-etapes-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
const { server, db, RELANCES } = require('../server/server');
const SE = require('../etudes/public/js/suivi-etapes');

let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
async function call(method, url, body, cookie) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function login(l, p) { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, password: p }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; }
const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('étapes : portefeuille, mes étapes du compagnon, fait sur le terrain, relances', async () => {
  const admin = await login('admin', 'admin-test-pw');
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse2', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  await call('POST', '/api/accounts', { login: 'lucas', password: 'motdepasse3', role: 'atelier', nom: 'Lucas', userId: 'o3' }, admin);
  const claire = await login('claire', 'motdepasse1'), kevin = await login('kevin', 'motdepasse2'), lucas = await login('lucas', 'motdepasse3');

  // Étude fictive : avancement mis en cache (comme l'application Études à l'enregistrement)
  const et = {};
  SE.affecter(et, 'pose', { responsable: { type: 'user', id: 'o1', nom: 'Kevin' }, echeance: jour(1) }, { nom: 'Claire', id: 'u1' });
  SE.affecter(et, 'commande', { responsable: { type: 'user', id: 'u1', nom: 'Claire' }, echeance: jour(-2) }, { nom: 'Claire', id: 'u1' });
  SE.mettreAJour(et, null, { etapes: [{ id: 'pose', phase: 'chantier', titre: 'Poser la CTA', fait: false, bloquePar: ['commande'] }, { id: 'commande', phase: 'achats', titre: 'Commander la CTA', fait: false }, { id: 'climat', titre: 'Climat', fait: true }] });
  assert.strictEqual((await call('PUT', '/api/liens/etudes/et1', { affaireId: 'af1', resume: { objet: 'Étude ACME', avancement: et.avancement } }, claire)).status, 200);

  // Portefeuille : bureau seulement
  assert.strictEqual((await call('GET', '/api/liens/etapes', null, kevin)).status, 403);
  const pf = (await call('GET', '/api/liens/etapes', null, claire)).body;
  assert.strictEqual(pf.length, 1);
  assert.deepStrictEqual([pf[0].etudeId, pf[0].avancement.total, pf[0].avancement.retards], ['et1', 3, 1]);

  // Mes étapes : Kevin voit la sienne seulement, Lucas rien
  const mes = (await call('GET', '/api/liens/etapes/mes', null, kevin)).body;
  assert.deepStrictEqual(mes.map(e => e.id), ['pose']);
  assert.ok(!('avancement' in mes[0]) && !('resume' in mes[0]));
  assert.deepStrictEqual((await call('GET', '/api/liens/etapes/mes', null, lucas)).body, []);
  // Un compagnon ne coche pas l'étape d'un autre ; photo ou commentaire obligatoire
  assert.strictEqual((await call('POST', '/api/liens/etapes/fait', { etudeId: 'et1', etapeId: 'commande', commentaire: 'x' }, kevin)).status, 403);
  assert.strictEqual((await call('POST', '/api/liens/etapes/fait', { etudeId: 'et1', etapeId: 'pose' }, kevin)).status, 400);
  const f = await call('POST', '/api/liens/etapes/fait', { etudeId: 'et1', etapeId: 'pose', commentaire: 'CTA posée' }, kevin);
  assert.strictEqual(f.status, 200);
  assert.strictEqual((await call('GET', '/api/liens/etapes/mes?affaireId=af1', null, kevin)).body[0].faitTerrain.commentaire, 'CTA posée');
  // Relu par l'application Études (bureau) et fusionné dans l'étude
  assert.strictEqual((await call('GET', '/api/liens/etapes/terrain?etudeId=et1', null, kevin)).status, 403);
  const t = (await call('GET', '/api/liens/etapes/terrain?etudeId=et1', null, claire)).body;
  assert.strictEqual(SE.fusionnerTerrain(et, t), 1);
  assert.strictEqual(SE.historique(et, 'pose').slice(-1)[0].action, 'fait-terrain');

  // Relances : commande en retard (Claire) ; pose déjà faite sur le terrain (ni relancée, ni bloquée) ; pas de doublon
  const n = await RELANCES.verifier();
  assert.strictEqual(n, 1);
  const notifs = db.prepare("SELECT data FROM records WHERE col = 'notifications'").all().map(r => JSON.parse(r.data)).filter(x => x.type === 'etape');
  assert.deepStrictEqual(notifs.map(x => x.userId), ['u1']);
  assert.match(notifs[0].texte, /Commander la CTA : échéance dépassée/);
  assert.doesNotMatch(notifs[0].texte, /bloque/);
  assert.strictEqual(await RELANCES.verifier(), 0);
});
