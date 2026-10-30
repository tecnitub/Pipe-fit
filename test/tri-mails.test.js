// Agent IA de tri des e-mails : Microsoft Graph et API Anthropic simulés. Chantier reconnu -> brouillon de réponse,
// e-mail et pièce jointe enregistrés dans le chantier, message catégorisé et rangé ; publicité rangée sans réponse ;
// e-mail sans chantier laissé dans la boîte ; chaque e-mail n'est trié qu'une fois ; erreurs de l'API reprises.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const Y = new Date().getFullYear(), CH1 = `CH-${Y}-001`;
const recent = min => new Date(Date.now() - min * 60000).toISOString();
const BOITE = 'c.vert@tecnitub.example';
const b64 = s => Buffer.from(s).toString('base64');
const corps = t => ({ contentType: 'html', content: `<html><body><p>${t}</p></body></html>` });
const inbox = [
  { id: 'm1', internetMessageId: '<m1@x>', subject: 'Fuite sur la ligne NEP', from: { emailAddress: { name: 'Thomas Girard', address: 't.girard@laiterie-alpes.example' } }, toRecipients: [{ emailAddress: { address: BOITE } }],
    receivedDateTime: recent(30), body: corps('Bonjour,<br>nous avons une fuite sur la ligne NEP depuis ce matin. Pouvez-vous passer ?'), hasAttachments: true, categories: [],
    pj: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'photo-fuite.jpg', contentBytes: b64('jpeg') }, { '@odata.type': '#microsoft.graph.fileAttachment', name: 'logo.png', isInline: true, contentBytes: b64('png') }] },
  { id: 'm2', internetMessageId: '<m2@x>', subject: 'Promo -30 % sur les raccords', from: { emailAddress: { name: 'Négoce', address: 'promo@negoce.example' } }, toRecipients: [], receivedDateTime: recent(20), body: corps('Profitez-en !'), hasAttachments: false, categories: [] },
  { id: 'm3', internetMessageId: '<m3@x>', subject: 'Question', from: { emailAddress: { name: 'Inconnu', address: 'x@exemple.fr' } }, toRecipients: [], receivedDateTime: recent(10), body: corps('Vous faites des devis ?'), hasAttachments: false, categories: [] },
  { id: 'm4', internetMessageId: '<m4@x>', subject: 'Mon envoi', from: { emailAddress: { name: 'Moi', address: BOITE } }, toRecipients: [], receivedDateTime: recent(5), body: corps('copie'), hasAttachments: false, categories: [] },
];
const appels = [], dossiers = [], deplaces = new Set();
let panneIA = 0;
const graph = http.createServer((req, res) => {
  let b = ''; req.on('data', c => { b += c; });
  req.on('end', () => {
    const u = decodeURIComponent(req.url);
    appels.push({ m: req.method, u, b: b.startsWith('{') ? JSON.parse(b) : null });
    res.setHeader('Content-Type', 'application/json');
    if (u.includes('/oauth2/v2.0/token')) return res.end(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }));
    if (u.includes('/mailFolders/inbox/messages')) return res.end(JSON.stringify({ value: inbox.filter(m => !deplaces.has(m.id)).map(({ pj, ...m }) => m).reverse() }));
    let m = /\/mailFolders\/([^/]+)\/childFolders/.exec(u);
    if (m && req.method === 'GET') { const nom = /displayName eq '(.*)'/.exec(u)[1]; return res.end(JSON.stringify({ value: dossiers.filter(d => d.parent === m[1] && d.displayName === nom) })); }
    if (m && req.method === 'POST') { const d = { id: `dos${dossiers.length + 1}`, parent: m[1], displayName: JSON.parse(b).displayName }; dossiers.push(d); return res.end(JSON.stringify(d)); }
    if ((m = /\/messages\/(\w+)\/\$value$/.exec(u))) { res.setHeader('Content-Type', 'message/rfc822'); return res.end(`Subject: ${inbox.find(x => x.id === m[1]).subject}\r\n\r\ncorps`); }
    if ((m = /\/messages\/(\w+)\/attachments$/.exec(u))) return res.end(JSON.stringify({ value: inbox.find(x => x.id === m[1]).pj }));
    if (/\/createReply$/.test(u)) return res.end(JSON.stringify({ id: 'brouillon1' }));
    if ((m = /\/messages\/(\w+)\/move$/.exec(u))) { deplaces.add(m[1]); return res.end('{}'); }
    if (/\/messages\/\w+$/.test(u) && req.method === 'PATCH') return res.end('{}');
    res.statusCode = 404; return res.end('{}');
  });
});
const requetesIA = [];
const ia = http.createServer((req, res) => {
  let b = ''; req.on('data', c => { b += c; });
  req.on('end', () => {
    const r = JSON.parse(b), texte = r.messages[0].content.map(x => x.text).join('\n');
    requetesIA.push({ entetes: req.headers, r, texte });
    res.setHeader('Content-Type', 'application/json');
    if (panneIA) { panneIA--; res.statusCode = 401; return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); }
    const a = /Fuite/.test(texte) ? { chantier: CH1, confiance: 'haute', categorie: 'Réclamation / SAV', resume: 'Fuite sur la ligne NEP, demande d\'intervention.', urgent: true, reponseNecessaire: true, reponse: 'Bonjour Monsieur Girard,\n\nNous intervenons [date à confirmer].\n\nCordialement,' }
      : /Promo/.test(texte) ? { chantier: '', confiance: 'haute', categorie: 'Publicité / newsletter', resume: 'Publicité.', urgent: false, reponseNecessaire: false, reponse: '' }
        : { chantier: 'CH-1999-999', confiance: 'faible', categorie: 'Demande client', resume: 'Demande de devis.', urgent: false, reponseNecessaire: true, reponse: 'Bonjour,\n\nOui.\n\nCordialement,' };
    res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: r.model, content: [{ type: 'text', text: JSON.stringify(a) }], stop_reason: 'end_turn', usage: {} }));
  });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-tri-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
delete process.env.ANTHROPIC_API_KEY;
let base, server;
before(async () => {
  await new Promise(r => graph.listen(0, '127.0.0.1', r));
  await new Promise(r => ia.listen(0, '127.0.0.1', r));
  process.env.M365_LOGIN_URL = process.env.M365_GRAPH_URL = `http://127.0.0.1:${graph.address().port}`;
  process.env.ANTHROPIC_URL = `http://127.0.0.1:${ia.address().port}`;
  ({ server } = require('../server/server'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); server.closeAllConnections(); graph.close(); ia.close(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('tri des e-mails : rangement par chantier, documents, brouillons de réponse, une seule fois par e-mail', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  // Configuration : boîte requise, clé requise, jamais renvoyée
  assert.match((await call('PUT', '/api/tri-mails', { actif: true, boites: '' }, admin)).body.error, /au moins une boîte/);
  assert.match((await call('PUT', '/api/tri-mails', { actif: true, boites: BOITE }, admin)).body.error, /clé d'API/);
  const cfgR = await call('PUT', '/api/tri-mails', { actif: true, boites: ` ${BOITE.toUpperCase()} `, cleApi: 'sk-ant-test', modele: 'claude-opus-5-5', reponses: true, enregistrer: true, ranger: true, dossierRacine: 'Chantiers', consignes: 'Vouvoyer.' }, admin);
  assert.strictEqual(cfgR.status, 200, JSON.stringify(cfgR.body));
  const cfg = cfgR.body;
  assert.deepStrictEqual([cfg.config.actif, cfg.config.boites, cfg.config.cleDefinie, cfg.config.cleApi, !!cfg.config.depuis], [true, [BOITE], true, undefined, true]);
  assert.ok(!JSON.stringify(cfg).includes('sk-ant-test'));
  // Sans Microsoft 365 : erreur explicite
  assert.match((await call('POST', '/api/tri-mails/relever', {}, admin)).body.error, /Microsoft 365 non configurée/);
  await call('PUT', '/api/m365', { tenantId: 't', clientId: 'c', clientSecret: 's', actif: true }, admin);

  // Clé refusée : erreur notée, e-mail repris au passage suivant
  panneIA = 1;
  const r0 = (await call('POST', '/api/tri-mails/relever', {}, admin)).body;
  assert.deepStrictEqual([r0.resultat.messages, r0.resultat.classes, r0.resultat.erreurs.length], [1, 0, 1]);
  assert.match(r0.journal[0].erreur, /Clé d'API Anthropic refusée/);

  const r = (await call('POST', '/api/tri-mails/relever', {}, admin)).body;
  assert.deepStrictEqual([r.resultat.messages, r.resultat.chantiers, r.resultat.aTrier, r.resultat.brouillons, r.resultat.erreurs], [3, 1, 2, 2, []]);
  // Requête à l'API : modèle, version, sortie JSON imposée, liste des chantiers, indices sur l'expéditeur, consignes
  const q = requetesIA.find(x => /Fuite/.test(x.texte));
  assert.deepStrictEqual([q.entetes['x-api-key'], q.entetes['anthropic-version'], q.r.model, q.r.output_config.format.type, q.r.fallbacks], ['sk-ant-test', '2026-10-21', 'claude-opus-5-5', 'json_schema', 'default']);
  assert.ok(q.texte.includes(`${CH1} | Ligne NEP inox`) && q.texte.includes(`chantiers ouverts de cette entreprise : ${CH1}`) && q.texte.includes('Vouvoyer.'));
  assert.ok(!q.texte.includes('<p>') && q.texte.includes('nous avons une fuite'));
  assert.ok(!requetesIA.some(x => /Mon envoi/.test(x.texte)), 'les messages envoyés par la boîte elle-même ne sont pas triés');

  // m1 : brouillon de réponse signé, catégories + drapeau, rangé dans Chantiers/<code> - <nom>
  const rep = appels.find(a => a.u.endsWith('/messages/m1/createReply'));
  assert.ok(rep.u.includes(`/users/${BOITE}/`));
  assert.match(rep.b.comment, /^<p>Bonjour Monsieur Girard,<\/p><p>Nous intervenons \[date à confirmer\]\.<\/p>/);
  assert.match(rep.b.comment, /<p>Cordialement,<\/p><p>Pipe-Fit Industrie<\/p>$/); // signature : société (et nom du compte qui a cette adresse)
  const patch = appels.find(a => a.m === 'PATCH' && a.u.endsWith('/messages/m1'));
  assert.deepStrictEqual(patch.b, { categories: ['Pipe-Fit · Réclamation / SAV', CH1], flag: { flagStatus: 'flagged' } });
  assert.deepStrictEqual(dossiers.map(d => [d.parent, d.displayName]), [['inbox', 'Chantiers'], ['dos1', `${CH1} - Ligne NEP inox – Usine de Rumilly`], ['inbox', 'Publicités']]);
  assert.deepStrictEqual(appels.filter(a => /\/move$/.test(a.u)).map(a => [a.u.split('/messages/')[1], a.b.destinationId]), [['m1/move', 'dos2'], ['m2/move', 'dos3']]);
  // Ordre : réponse et documents avant le déplacement (l'identifiant change après)
  const i = s => appels.findIndex(a => a.u.endsWith(s));
  assert.ok(i('/messages/m1/createReply') < i('/messages/m1/move') && i('/messages/m1/$value') < i('/messages/m1/move'));
  // m2 : publicité, ni réponse ni document ; m3 : chantier inconnu -> reste dans la boîte, brouillon quand même
  assert.ok(!appels.some(a => a.u.endsWith('/messages/m2/createReply')));
  assert.ok(appels.some(a => a.u.endsWith('/messages/m3/createReply')) && !appels.some(a => a.u.endsWith('/messages/m3/move')));

  // Documents du chantier : l'e-mail (dossier « E-mails ») et la pièce jointe, pas l'image intégrée
  const af = (await call('GET', '/api/data', null, admin)).body.affaires.find(a => a.code === CH1);
  const docs = af.documents.filter(d => d.par === 'Tri des e-mails');
  assert.deepStrictEqual(docs.map(d => [d.nom.replace(/^\d{4}-\d\d-\d\d/, 'J'), d.categorie, d.dossier || '', d.mime]), [['J - Thomas Girard - Fuite sur la ligne NEP.eml', 'Autre', 'E-mails', 'message/rfc822'], ['photo-fuite.jpg', 'Photo', '', 'image/jpeg']]);
  assert.deepStrictEqual([docs[0].mail.deEmail, docs[0].mail.resume, docs[0].visible], ['t.girard@laiterie-alpes.example', 'Fuite sur la ligne NEP, demande d\'intervention.', false]);

  // Journal ; un second passage ne retraite rien (m3 est resté dans la boîte)
  const j = r.journal;
  assert.deepStrictEqual(j.map(x => [x.objet, x.statut, x.urgent, x.brouillon]), [['Question', 'à trier', false, true], ['Promo -30 % sur les raccords', 'à trier', false, false], ['Fuite sur la ligne NEP', 'classé', true, true]]);
  assert.strictEqual(j[2].affaireId, af.id);
  const n = requetesIA.length;
  assert.strictEqual((await call('POST', '/api/tri-mails/relever', {}, admin)).body.resultat.messages, 0);
  assert.strictEqual(requetesIA.length, n);
});
