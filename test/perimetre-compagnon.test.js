// Compagnon limité à ses chantiers et à ceux de son équipe (périmètre calculé par le serveur) : lecture et écriture
// refusées hors périmètre, autorisées dans le périmètre, équipe incluse (même chef d'équipe), réglages de l'administrateur.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Compagnon = require('../public/js/compagnon');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-perimetre-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.SEED_DEMO = '0';
const pf = require('../server/server').server;
let base, admin;
const C = {};

async function call(method, url, body, cookie) {
  const res = await fetch(base + url, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : null, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ecrire = async (col, data, cookie = admin) => {
  const ex = await call('GET', `/api/records/${col}/${data.id}`, null, admin);
  return call('PUT', `/api/records/${col}/${data.id}`, { data, version: ex.status === 200 ? ex.body._v : undefined }, cookie);
};
const ids = l => l.map(x => x.id).sort();

before(async () => {
  await new Promise(r => pf.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${pf.address().port}`;
  admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  // Équipe : Lucas (chef) dirige Romain et l'intérimaire Ivan ; Kevin et Zoé travaillent seuls
  for (const u of [{ id: 'k', nom: 'Kevin' }, { id: 'l', nom: 'Lucas' }, { id: 'r', nom: 'Romain', chefId: 'l' }, { id: 'i', nom: 'Ivan', chefId: 'l', type: 'interimaire' }, { id: 'z', nom: 'Zoé' }])
    assert.strictEqual((await ecrire('users', { role: 'atelier', ...u })).status, 200);
  assert.strictEqual((await ecrire('users', { id: 'c1', nom: 'Chargée', role: 'charge' })).status, 200);
  for (const [id, code, extra] of [['A1', 'CH-1'], ['A2', 'CH-2'], ['A3', 'CH-3'], ['A4', 'CH-4'], ['A5', 'HD-5', { type: 'horsDevis', ouvertePar: 'l', statut: 'Ouvert' }], ['A6', 'CH-6']])
    assert.strictEqual((await ecrire('affaires', { id, code, nom: `Chantier ${code}`, statut: 'En cours', chargeId: 'c1', ...(extra || {}) })).status, 200);
  // Planning : Kevin aujourd'hui sur A1, Romain dans 10 jours sur A2, Zoé aujourd'hui sur A3, Kevin dans 60 jours sur A4
  for (const [id, userId, affaireId, d] of [['p1', 'k', 'A1', 0], ['p2', 'r', 'A2', 10], ['p3', 'z', 'A3', 0], ['p4', 'k', 'A4', 60]])
    assert.strictEqual((await ecrire('planning', { id, userId, affaireId, date: jour(d), heuresPrevues: 8 })).status, 200);
  // Réserve à lever affectée à Kevin sur A6 ; réserve de Zoé sur A3
  assert.strictEqual((await ecrire('reserves', { id: 'rs1', affaireId: 'A6', description: 'Calorifuge', statut: 'Ouverte', assigneA: 'k' })).status, 200);
  assert.strictEqual((await ecrire('reserves', { id: 'rs2', affaireId: 'A3', description: 'Fuite', statut: 'Ouverte', assigneA: 'z' })).status, 200);
  assert.strictEqual((await ecrire('rapports', { id: 'ri3', affaireId: 'A3', userId: 'z', date: jour(-1), intervenants: ['z'], statut: 'Brouillon' })).status, 200);
  assert.strictEqual((await ecrire('devis', { id: 'dv3', affaireId: 'A3', statut: 'Accepté', lignes: [] })).status, 200);
  for (const [login, userId] of [['kevin', 'k'], ['lucas', 'l'], ['romain', 'r'], ['ivan', 'i'], ['zoe', 'z']]) {
    assert.strictEqual((await call('POST', '/api/accounts', { login, password: 'motdepasse1', role: 'atelier', nom: login, userId }, admin)).status, 200);
    C[login] = (await call('POST', '/api/login', { login, password: 'motdepasse1' })).cookie;
  }
  assert.strictEqual((await call('POST', '/api/accounts', { login: 'jacky', password: 'motdepasse1', role: 'charge', nom: 'Jacky', userId: 'c1' }, admin)).status, 200);
  C.jacky = (await call('POST', '/api/login', { login: 'jacky', password: 'motdepasse1' })).cookie;
});
after(() => { pf.close(); pf.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

test('équipe : le compagnon, son chef, l\'équipe qu\'il dirige et les membres du même chef', () => {
  const users = [{ id: 'k' }, { id: 'l' }, { id: 'r', chefId: 'l' }, { id: 'i', chefId: 'l' }, { id: 'z' }];
  assert.deepStrictEqual(Compagnon.equipeDe('l', users).sort(), ['i', 'l', 'r']);
  assert.deepStrictEqual(Compagnon.equipeDe('r', users).sort(), ['i', 'l', 'r']);
  assert.deepStrictEqual(Compagnon.equipeDe('k', users), ['k']);
  assert.strictEqual(Compagnon.lundiSemaine('2026-W01'), '2025-12-29');
  // Semaine du planning dans la période ; date hors période ; réglage « accès à tous »
  const d = { users, affaires: [], planning: [{ userId: 'k', affaireId: 'X', semaine: '2026-W03' }, { userId: 'k', affaireId: 'Y', date: '2026-03-01' }] };
  assert.deepStrictEqual([...Compagnon.perimetre('k', d, Compagnon.regles({}), '2026-01-20').keys()], ['X']);
  assert.strictEqual(Compagnon.perimetre('k', d, Compagnon.regles({ compagnon: { tousChantiers: true } }), '2026-01-20'), null);
  assert.strictEqual(Compagnon.regles({ compagnon: { perimetreJours: 9999 } }).perimetreJours, 365);
  assert.strictEqual(Compagnon.regles({ compagnon: { perimetreJours: 'x' } }).perimetreJours, Compagnon.PERIMETRE_DEFAUT);
});

test('liste des chantiers : les siens et ceux de son équipe, rien d\'autre ; le bureau voit tout', async () => {
  const data = async c => (await call('GET', '/api/data', null, c)).body;
  const k = await data(C.kevin);
  assert.deepStrictEqual(ids(k.affaires), ['A1', 'A6']); // planning du jour, réserve affectée ; pas A4 (dans 60 jours)
  assert.strictEqual(k.affaires.find(a => a.id === 'A1').perimetre, 'moi');
  assert.deepStrictEqual(ids((await data(C.lucas)).affaires), ['A2', 'A5']); // équipe (Romain) et hors devis ouvert
  assert.strictEqual((await data(C.lucas)).affaires.find(a => a.id === 'A2').perimetre, 'equipe');
  assert.deepStrictEqual(ids((await data(C.romain)).affaires), ['A2', 'A5']);
  assert.deepStrictEqual(ids((await data(C.ivan)).affaires), ['A2', 'A5']); // même chef d'équipe
  assert.deepStrictEqual(ids((await data(C.zoe)).affaires), ['A3']);
  assert.strictEqual((await data(C.jacky)).affaires.length, 6);
  // Fiches rattachées aux chantiers : retirées hors périmètre (réserve, bon, devis, planning des collègues)
  assert.deepStrictEqual(ids(k.reserves), ['rs1']);
  assert.deepStrictEqual(k.rapports, []);
  assert.deepStrictEqual(k.devis, []);
  assert.ok(!k.planning.some(p => p.affaireId === 'A3'), 'planning de Zoé sur A3 envoyé à Kevin');
  assert.ok(k.planning.some(p => p.id === 'p4'), 'son propre planning (même futur) reste visible');
  const z = await data(C.zoe);
  assert.deepStrictEqual(ids(z.rapports), ['ri3']);
  assert.deepStrictEqual(ids(z.devis), ['dv3']);
});

test('fiche chantier et fiches d\'un chantier lues par identifiant : 403 hors périmètre, 200 dans le périmètre', async () => {
  const r = await call('GET', '/api/records/affaires/A3', null, C.kevin);
  assert.strictEqual(r.status, 403);
  assert.ok(r.body.horsPerimetre);
  assert.match(r.body.error, /ne fait pas partie de vos chantiers/);
  assert.strictEqual((await call('GET', '/api/records/affaires/A1', null, C.kevin)).status, 200);
  assert.strictEqual((await call('GET', '/api/records/affaires/A2', null, C.lucas)).status, 200);
  assert.strictEqual((await call('GET', '/api/records/rapports/ri3', null, C.kevin)).status, 403);
  assert.strictEqual((await call('GET', '/api/records/reserves/rs2', null, C.kevin)).status, 403);
  assert.strictEqual((await call('GET', '/api/records/reserves/rs1', null, C.kevin)).status, 200);
  assert.strictEqual((await call('GET', '/api/records/affaires/A3', null, C.jacky)).status, 200);
  // Liste par l'API : filtrée de la même façon
  assert.deepStrictEqual(ids((await call('GET', '/api/records/affaires', null, C.kevin)).body), ['A1', 'A6']);
});

test('matériel retenu, débits, points de mise en service, valeurs réglées, pressions des CTA : chantier du périmètre seulement', async () => {
  for (const route of ['materiel', 'debits', 'plan-mes', 'valeurs-reglees', 'pressions-cta']) {
    const hors = await call('GET', `/api/liens/${route}?affaireId=A3`, null, C.kevin);
    assert.strictEqual(hors.status, 403, route);
    assert.strictEqual((await call('GET', `/api/liens/${route}?affaireId=A1`, null, C.kevin)).status, 200, route);
    assert.strictEqual((await call('GET', `/api/liens/${route}?affaireId=A2`, null, C.ivan)).status, 200, `${route} (équipe)`);
    assert.strictEqual((await call('GET', `/api/liens/${route}?affaireId=A3`, null, C.jacky)).status, 200, `${route} (bureau)`);
  }
  // Pose / photo du matériel : refusée hors périmètre avant tout autre contrôle ; dans le périmètre, contrôle habituel
  const hors = await call('POST', '/api/liens/materiel/suivi', { affaireId: 'A3', action: 'pose', etudeId: 'e1', cle: 'x' }, C.kevin);
  assert.strictEqual(hors.status, 403);
  assert.match(hors.body.error, /vos chantiers/);
  const dans = await call('POST', '/api/liens/materiel/suivi', { affaireId: 'A1', action: 'pose', etudeId: 'e1', cle: 'x' }, C.kevin);
  assert.strictEqual(dans.status, 400); // étude non reliée à ce chantier : le périmètre est passé
});

test('écritures : bon d\'intervention, heures, consommation, levée de réserve — refusées hors périmètre, acceptées dedans', async () => {
  const bon = (id, affaireId) => ({ id, affaireId, userId: 'k', date: jour(0), intervenants: ['k'], statut: 'Brouillon' });
  const hors = await call('PUT', '/api/records/rapports/rk1', { data: bon('rk1', 'A3') }, C.kevin);
  assert.strictEqual(hors.status, 403);
  assert.match(hors.body.error, /vos chantiers/);
  assert.strictEqual((await call('PUT', '/api/records/rapports/rk2', { data: bon('rk2', 'A1') }, C.kevin)).status, 200);
  // Équipe : Ivan saisit sur le chantier de Romain
  assert.strictEqual((await call('PUT', '/api/records/rapports/ri9', { data: { ...bon('ri9', 'A2'), userId: 'i', intervenants: ['i'] } }, C.ivan)).status, 200);
  const h = (id, affaireId) => ({ id, userId: 'k', affaireId, date: jour(0), heures: 7, statut: 'Saisi' });
  assert.strictEqual((await call('PUT', '/api/records/temps/t1', { data: h('t1', 'A3') }, C.kevin)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/temps/t2', { data: h('t2', 'A1') }, C.kevin)).status, 200);
  // Un pointage existant ne peut pas être déplacé vers un chantier hors périmètre
  const t2 = (await call('GET', '/api/records/temps/t2', null, C.kevin)).body;
  assert.strictEqual((await call('PUT', '/api/records/temps/t2', { data: { ...h('t2', 'A3') }, version: t2._v }, C.kevin)).status, 403);
  const cs = (id, affaireId) => ({ id, userId: 'k', affaireId, date: jour(0), designation: 'Joints', qte: 2 });
  assert.strictEqual((await call('PUT', '/api/records/consommations/cs1', { data: cs('cs1', 'A3') }, C.kevin)).status, 403);
  assert.strictEqual((await call('PUT', '/api/records/consommations/cs2', { data: cs('cs2', 'A1') }, C.kevin)).status, 200);
  // Suppression d'une fiche d'un chantier hors périmètre (consommation saisie par le bureau pour Kevin sur A3)
  assert.strictEqual((await ecrire('consommations', cs('cs3', 'A3'))).status, 200);
  const del = await call('DELETE', '/api/records/consommations/cs3', {}, C.kevin);
  assert.strictEqual(del.status, 403);
  assert.match(del.body.error, /vos chantiers/);
  // Réserve affectée : levée possible ; chantier hors périmètre modifié (hors devis d'un autre) : refusé
  const rs1 = (await call('GET', '/api/records/reserves/rs1', null, C.kevin)).body;
  assert.strictEqual((await call('PUT', '/api/records/reserves/rs1', { data: { ...rs1, statut: 'Levée', commentaireLevee: 'Refait' }, version: rs1._v }, C.kevin)).status, 200);
  const a5 = (await call('GET', '/api/records/affaires/A5', null, admin)).body;
  assert.strictEqual((await call('PUT', '/api/records/affaires/A5', { data: { ...a5, nom: 'Renommé' }, version: a5._v }, C.kevin)).status, 403);
});

test('scan d\'un outil pour un chantier, demande de matériel du terrain : chantier du périmètre seulement', async () => {
  assert.strictEqual((await ecrire('materiels', { id: 'm1', designation: 'Perceuse', scan: true, categorie: 'Outillage' })).status, 200);
  const hors = await call('POST', '/api/parc/scan', { materielId: 'm1', action: 'prendre', affaireId: 'A3' }, C.kevin);
  assert.strictEqual(hors.status, 403);
  assert.strictEqual((await call('POST', '/api/parc/scan', { materielId: 'm1', action: 'prendre', affaireId: 'A1' }, C.kevin)).status, 200);
  const dem = await call('POST', '/api/consultations/terrain', { affaireId: 'A3', lignes: [{ designation: 'Tube', qte: 2, unite: 'ml' }] }, C.kevin);
  assert.strictEqual(dem.status, 403);
  assert.notStrictEqual((await call('POST', '/api/consultations/terrain', { affaireId: 'A1', lignes: [{ designation: 'Tube', qte: 2, unite: 'ml' }] }, C.kevin)).status, 403);
});

test('planning modifié par le bureau : le chantier entre dans le périmètre, le compagnon connecté recharge ses données', async () => {
  const ac = new AbortController();
  const flux = await fetch(`${base}/api/events`, { headers: { Cookie: C.zoe }, signal: ac.signal });
  await call('GET', '/api/data', null, C.zoe); // périmètre envoyé
  const lecteur = flux.body.getReader(), dec = new TextDecoder();
  let recu = '';
  const attente = (async () => { const fin = Date.now() + 5000; while (Date.now() < fin && !/event: reload\ndata: [^\n]*"perimetre":true/.test(recu)) { const { value, done } = await lecteur.read(); if (done) break; recu += dec.decode(value); } })();
  assert.strictEqual((await ecrire('planning', { id: 'p5', userId: 'z', affaireId: 'A4', date: jour(1), heuresPrevues: 8 })).status, 200);
  await attente;
  ac.abort();
  assert.match(recu, /event: reload\ndata: [^\n]*"perimetre":true/);
  assert.deepStrictEqual(ids((await call('GET', '/api/data', null, C.zoe)).body.affaires), ['A3', 'A4']);
  assert.strictEqual((await call('GET', '/api/records/affaires/A4', null, C.zoe)).status, 200);
});

test('réglages de l\'administrateur : période du planning et accès à tous les chantiers', async () => {
  const s = (await call('GET', '/api/data', null, admin)).body.settings;
  const regler = async compagnon => assert.strictEqual((await call('PUT', '/api/settings', { ...s, compagnon }, admin)).status, 200);
  // Période de 90 jours : le planning de Kevin dans 60 jours compte (sa réserve de A6 est levée : A6 n'en fait plus partie)
  await regler({ perimetreJours: 90 });
  assert.deepStrictEqual(ids((await call('GET', '/api/data', null, C.kevin)).body.affaires), ['A1', 'A4']);
  // Accès à tous les chantiers : ancien comportement
  await regler({ tousChantiers: true });
  assert.strictEqual((await call('GET', '/api/data', null, C.kevin)).body.affaires.length, 6);
  assert.strictEqual((await call('GET', '/api/liens/materiel?affaireId=A3', null, C.kevin)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/t9', { data: { id: 't9', userId: 'k', affaireId: 'A3', date: jour(0), heures: 1, statut: 'Saisi' } }, C.kevin)).status, 200);
  // Un chargé d'affaires ne règle pas les compagnons
  assert.strictEqual((await call('PUT', '/api/settings', { ...s, compagnon: { tousChantiers: true } }, C.jacky)).status, 403);
  // Retour au périmètre : les heures pointées entre-temps sur A3 le gardent dans les chantiers de Kevin (il y a travaillé)
  await regler({});
  assert.deepStrictEqual(ids((await call('GET', '/api/data', null, C.kevin)).body.affaires), ['A1', 'A3']);
});
