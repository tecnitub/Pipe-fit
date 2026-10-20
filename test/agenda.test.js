// Planning dans les agendas : événements Outlook (Microsoft Graph simulé) et lien d'abonnement iCal.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Agenda = require('../server/agenda-format');

test('format des événements : journée avec horaires, absence, iCal', () => {
  const ctx = { affaire: () => ({ code: 'CH-1', nom: 'Ligne NEP', clientId: 'e', siteId: 's', contactId: 'k' }), entreprise: () => ({ nom: 'Laiterie' }),
    contact: () => ({ prenom: 'Thomas', nom: 'Girard', mobile: '06 10' }), site: () => ({ libelle: 'Usine', adresse: 'ZI', cp: '74150', ville: 'Rumilly', acces: 'Badge au poste de garde' }) };
  const e = Agenda.evenement({ id: 'p1', userId: 'o1', date: '2026-10-21', affaireId: 'a', tache: 'Soudure', debut: '07:30', fin: '16:30', pause: 60, note: 'Permis de feu' }, ctx);
  assert.strictEqual(e.titre, 'CH-1 Ligne NEP – Soudure'); assert.strictEqual(e.journee, true); assert.match(e.lieu, /Usine – ZI, 74150 Rumilly/);
  assert.match(e.description, /Accès : Badge/); assert.match(e.description, /Consigne : Permis de feu/);
  const g = Agenda.graph(e, { categorie: 'Pipe-Fit', rappel: 30 });
  assert.deepStrictEqual([g.start.dateTime, g.end.dateTime, g.isAllDay, g.start.timeZone], ['2026-10-21T07:30:00', '2026-10-21T16:30:00', false, 'Europe/Paris']);
  const abs = Agenda.graph(Agenda.evenement({ id: 'p2', userId: 'o1', date: '2026-10-31', absence: 'Congés' }, ctx));
  assert.deepStrictEqual([abs.isAllDay, abs.showAs, abs.end.dateTime], [true, 'oof', '2026-11-01T00:00:00']);
  const ics = Agenda.ical([e, Agenda.evenement({ id: 'p2', userId: 'o1', date: '2026-10-31', absence: 'Congés' }, ctx)], { maintenant: new Date('2026-10-20T10:00:00Z') });
  assert.match(ics, /DTSTART;TZID=Europe\/Paris:20261021T073000\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101/);
  assert.ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'lignes pliées à 75 octets');
  assert.match(ics, /LOCATION:Usine – ZI\\, 74150 Rumilly/);
});

// Faux Microsoft 365 : jeton et calendrier
const appels = [];
const graph = http.createServer((req, res) => {
  let corps = ''; req.on('data', c => { corps += c; });
  req.on('end', () => {
    appels.push({ m: req.method, u: req.url, b: corps ? JSON.parse(corps.startsWith('{') ? corps : '{}') : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/oauth2/v2.0/token')) return res.end(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }));
    if (req.method === 'POST') return res.end(JSON.stringify({ id: `ev-${appels.length}` }));
    if (req.method === 'DELETE') { res.statusCode = 204; return res.end(); }
    return res.end('{}');
  });
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-agenda-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
let base, server, AGENDA;
before(async () => {
  await new Promise(r => graph.listen(0, '127.0.0.1', r));
  process.env.M365_LOGIN_URL = process.env.M365_GRAPH_URL = `http://127.0.0.1:${graph.address().port}`;
  ({ server, AGENDA } = require('../server/server'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); server.closeAllConnections(); graph.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('planning envoyé dans Outlook : création, mise à jour, suppression', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'kevin', password: 'tuyau-inox-316L', role: 'atelier', userId: 'o1', email: 'kevin.roux@tecnitub.example' }, admin);
  assert.strictEqual((await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', clientSecret: 's', actif: true }, admin)).status, 200);
  let r = await call('PUT', '/api/agenda/outlook', { actif: true, categorie: 'Pipe-Fit', rappel: 30 }, admin);
  assert.strictEqual(r.body.config.actif, true);
  const kevin = (await call('POST', '/api/login', { login: 'kevin', password: 'tuyau-inox-316L' })).cookie;
  assert.strictEqual((await call('PUT', '/api/agenda/outlook', { actif: false }, kevin)).status, 403);
  appels.length = 0;
  r = await AGENDA.synchroniser();
  const posts = appels.filter(a => a.m === 'POST' && a.u.includes('/events'));
  assert.ok(posts.length >= 5, `événements créés : ${posts.length}`);
  assert.ok(posts.every(a => a.u.includes(encodeURIComponent('kevin.roux@tecnitub.example'))), 'dans la boîte de Kevin uniquement');
  assert.match(posts[0].b.subject, /CH-\d{4}-001/); assert.strictEqual(posts[0].b.reminderMinutesBeforeStart, 30);
  assert.strictEqual(r.crees, posts.length);
  // Rien n'a changé : aucun appel
  appels.length = 0; await AGENDA.synchroniser();
  assert.strictEqual(appels.filter(a => a.u.includes('/events')).length, 0);
  // Une journée modifiée, une supprimée
  const d = (await call('GET', '/api/data', null, admin)).body.planning.filter(p => p.userId === 'o1' && p.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date));
  await call('PUT', `/api/records/planning/${d[0].id}`, { data: { ...d[0], debut: '06:00', note: 'Arrivée avancée' }, version: d[0]._v }, admin);
  await call('DELETE', `/api/records/planning/${d[1].id}`, {}, admin);
  appels.length = 0; r = await AGENDA.synchroniser();
  assert.deepStrictEqual([r.modifies, r.supprimes, r.crees], [1, 1, 0]);
  const patch = appels.find(a => a.m === 'PATCH');
  assert.match(patch.b.start.dateTime, /T06:00:00$/); assert.match(patch.b.body.content, /Arrivée avancée/);
});

test('lien d\'abonnement iCal personnel, révocable', async () => {
  const kevin = (await call('POST', '/api/login', { login: 'kevin', password: 'tuyau-inox-316L' })).cookie;
  const l = (await call('POST', '/api/agenda/lien', {}, kevin)).body;
  assert.match(l.webcal, /^webcal:/);
  const rep = await fetch(l.url);
  assert.strictEqual(rep.status, 200); assert.match(rep.headers.get('content-type'), /text\/calendar/);
  const ics = await rep.text();
  assert.match(ics, /BEGIN:VCALENDAR/); assert.ok((ics.match(/BEGIN:VEVENT/g) || []).length >= 5);
  assert.strictEqual((await fetch(`${base}/api/agenda/${'x'.repeat(32)}.ics`)).status, 404);
  await call('DELETE', '/api/agenda/lien', {}, kevin);
  assert.strictEqual((await fetch(l.url)).status, 404, 'lien révoqué');
});
