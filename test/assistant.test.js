// Assistant : boucle d'outils avec un faux service Anthropic (réponses scriptées), commande préparée en brouillon,
// droits du bureau et des compagnons (coches des Paramètres), clé jamais renvoyée, erreurs du service.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

// Faux service : chaque requête reçue est gardée, la réponse suivante du script est renvoyée
const recues = [], script = [];
const tour = (content, stop = 'tool_use') => ({ id: `msg_${recues.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stop, stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 } });
const appel = (name, input, id = `tu_${name}`) => ({ type: 'tool_use', id, name, input });
const faux = http.createServer((req, res) => {
  let corps = ''; req.on('data', c => { corps += c; });
  req.on('end', () => {
    recues.push({ url: req.url, headers: req.headers, body: JSON.parse(corps || '{}') });
    const r = script.shift();
    if (r && r.status) { res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r || tour([{ type: 'text', text: 'Fin.' }], 'end_turn')));
  });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-assistant-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
let base, server;
before(async () => {
  await new Promise(r => faux.listen(0, '127.0.0.1', r));
  process.env.ASSISTANT_API_URL = `http://127.0.0.1:${faux.address().port}`;
  ({ server } = require('../server/server'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); server.closeAllConnections(); faux.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};
let admin, claire, kevin;

test('réglages : clé obligatoire pour activer, jamais renvoyée ; compagnons fermés par défaut', async () => {
  admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire Martin', userId: 'u1' }, admin);
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin Roux', userId: 'o1' }, admin);
  claire = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  kevin = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  assert.strictEqual((await call('GET', '/api/me', null, claire)).body.assistant.actif, false);
  assert.strictEqual((await call('PUT', '/api/assistant/config', { actif: true }, admin)).status, 400);
  assert.strictEqual((await call('PUT', '/api/assistant/config', { actif: true, cleApi: 'sk-ant-test' }, claire)).status, 403);
  const c = (await call('PUT', '/api/assistant/config', { actif: true, cleApi: 'sk-ant-test' }, admin)).body;
  assert.deepStrictEqual([c.actif, c.cleDefinie, c.modele, c.compagnons.actif, JSON.stringify(c).includes('sk-ant-test')], [true, true, 'claude-opus-5-5', false, false]);
  assert.deepStrictEqual((await call('GET', '/api/me', null, claire)).body.assistant, { actif: true, bureau: true, droits: ['bureau'] });
  assert.strictEqual((await call('GET', '/api/me', null, kevin)).body.assistant.actif, false);
  assert.strictEqual((await call('POST', '/api/assistant/message', { texte: 'Mon planning ?' }, kevin)).status, 403);
});

test('bureau : chantier, fournisseur et articles retrouvés, commande préparée en brouillon (rien d\'envoyé)', async () => {
  script.push(
    tour([{ type: 'text', text: 'Je cherche.' }, appel('chercher_chantiers', { texte: 'Rumilly' }), appel('chercher_fournisseurs', { texte: 'Téréva' })]),
    tour([appel('chercher_articles', { texte: 'coude 3D inox 316L DN50', fournisseurId: 'e12' })]),
    tour([appel('preparer_commande', { fournisseurId: 'e12', affaireId: 'af1', lignes: [{ articleId: 'a4', designation: 'Coude', qte: 20 }, { designation: 'Joint spirale DN50', qte: 10, unite: 'u' }], dateLivraison: '2026-11-05' })]),
    tour([{ type: 'text', text: 'Brouillon prêt : à valider puis envoyer.' }], 'end_turn'));
  const r = await call('POST', '/api/assistant/message', { texte: 'Commande chez Téréva pour Rumilly : 20 coudes 3D inox DN50 et 10 joints spirale DN50, livraison jeudi 5' }, claire);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const a = r.body.actions[0];
  assert.deepStrictEqual([a.type, a.fournisseur, a.lignes, a.total], ['commande', 'Téréva', 2, 420]);
  const cmd = (await call('GET', '/api/data', null, claire)).body.commandes.find(c => c.id === a.id);
  assert.deepStrictEqual([cmd.statut, cmd.affaireId, cmd.dateLivraison, cmd.origine, cmd.lignes[0].pu, cmd.lignes[1].articleId], ['Brouillon', 'af1', '2026-11-05', 'assistant', 21, '']);
  assert.match(r.body.fil.at(-1).texte, /Brouillon prêt/);
  // Requêtes envoyées : modèle, fallbacks, outils du bureau seulement, conversation complète
  const premiere = recues[0].body, derniere = recues[3].body;
  assert.deepStrictEqual([premiere.model, premiere.fallbacks, premiere.output_config.effort, /server-side-fallback-2026-07-01/.test(recues[0].headers['anthropic-beta'])], ['claude-opus-5-5', 'default', 'medium', true]);
  const noms = premiere.tools.map(t => t.name);
  assert.ok(noms.includes('preparer_commande') && !noms.includes('demander_materiel') && premiere.tools.every(t => t.strict === true && t.input_schema.additionalProperties === false));
  assert.strictEqual(derniere.messages.length, 7, 'question, 3 tours d\'outils avec leurs résultats');
  const resultats = derniere.messages[2].content;
  assert.ok(resultats.length === 2 && resultats.every(x => x.type === 'tool_result') && JSON.parse(resultats[0].content)[0].id === 'af1');
  assert.ok(!/sk-ant/.test(JSON.stringify(derniere)));
  // Suite de la même conversation : historique renvoyé tel quel
  script.push(tour([{ type: 'text', text: 'Rien d\'autre.' }], 'end_turn'));
  recues.length = 0;
  const suite = await call('POST', '/api/assistant/message', { conversationId: r.body.conversationId, texte: 'Merci' }, claire);
  assert.deepStrictEqual([suite.body.fil.length, recues[0].body.messages.length], [4, 9]);
  assert.strictEqual((await call('GET', `/api/assistant/conversations/${r.body.conversationId}`, null, kevin)).body.id, undefined, 'conversation d\'un autre compte');
});

test('compagnons : seules les actions cochées ; demande de matériel transmise au chargé d\'affaires, sans prix', async () => {
  await call('PUT', '/api/assistant/config', { actif: true, compagnons: { actif: true, droits: { materiel: true, planning: true } } }, admin);
  assert.deepStrictEqual((await call('GET', '/api/me', null, kevin)).body.assistant, { actif: true, bureau: false, droits: ['materiel', 'planning'] });
  recues.length = 0;
  script.push(
    tour([appel('preparer_commande', { fournisseurId: 'e12', lignes: [{ designation: 'x', qte: 1 }] }), appel('demander_materiel', { affaireId: 'af1', lignes: [{ articleId: 'a4', designation: 'Coude', qte: 6 }], note: 'Pour lundi' })]),
    tour([{ type: 'text', text: 'Demande transmise au bureau.' }], 'end_turn'));
  const r = await call('POST', '/api/assistant/message', { texte: 'Il me faut 6 coudes DN50 inox sur Rumilly pour lundi' }, kevin);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const noms = recues[0].body.tools.map(t => t.name);
  assert.deepStrictEqual(noms.sort(), ['chercher_chantiers', 'demander_materiel', 'planning']);
  const res = recues[1].body.messages.at(-1).content;
  assert.deepStrictEqual([res[0].is_error, res[0].content], [true, 'Action non autorisée pour ce compte']);
  assert.deepStrictEqual(r.body.actions.map(x => x.type), ['demande']);
  assert.ok(!/prix|pu|€/i.test(res[1].content));
  const notif = (await call('GET', '/api/data', null, admin)).body.notifications.find(n => n.type === 'assistant');
  assert.deepStrictEqual([notif.userId, notif.lien.startsWith('#/commandes/')], ['u1', true]);
});

test('erreur du service : message clair, la question reste dans le fil', async () => {
  script.push({ status: 401 });
  const r = await call('POST', '/api/assistant/message', { texte: 'Point sur Rumilly' }, claire);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.body.erreur, /Clé API Anthropic refusée/.test(r.body.fil.at(-1).texte)], [true, true]);
});
