// Journée d'un compagnon : plusieurs chantiers (prévus ou non), journée prévue remplacée, intérimaire pointé par le
// compagnon avec qui il a travaillé, déclaré s'il n'est pas encore connu.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const J = require('../public/js/journee');
const R = require('../public/js/pointage-regles');

test('lignes de départ : déjà pointé, sinon le planning, sinon une ligne à remplir', () => {
  const plan = [{ affaireId: 'af1', tache: 'Montage', heuresPrevues: 4 }, { affaireId: 'af2', tache: 'Soudure', heuresPrevues: 4 }];
  const l = J.lignesInitiales({ plan });
  assert.deepStrictEqual(l.map(x => [x.affaireId, x.debut, x.fin, x.pause]), [['af1', '07:30', '11:30', 0], ['af2', '11:30', '15:30', 0]]);
  assert.deepStrictEqual(J.lignesInitiales({ plan: [{ affaireId: 'af1', heuresPrevues: 8 }] }).map(x => [x.debut, x.fin, x.pause]), [['07:30', '16:30', 60]]);
  const reel = [{ id: 't2', affaireId: 'af3', debut: '13:00', fin: '17:00', statut: 'Validé' }, { id: 't1', affaireId: 'af1', debut: '07:30', fin: '' }];
  const r = J.lignesInitiales({ plan, reel });
  assert.deepStrictEqual(r.map(x => [x.tid, x.bloque, x.enCours]), [['t1', false, true], ['t2', true, false]]);
  assert.deepStrictEqual(J.lignesInitiales({ defaut: { affaireId: 'af9', tache: 'Soudure' } }).map(x => [x.affaireId, x.tache]), [['af9', 'Soudure']]);
});

test('contrôles : chantier, horaires, lignes qui se chevauchent', () => {
  assert.match(J.erreur([{ affaireId: '', debut: '07:30', fin: '12:00' }]), /chantier/);
  assert.match(J.erreur([{ affaireId: 'a', debut: '07:30', fin: '' }]), /départ/);
  assert.strictEqual(J.erreur([{ affaireId: 'a', debut: '07:30', fin: '', enCours: true }], { aujourdhui: true }), null);
  assert.match(J.erreur([{ affaireId: 'a', debut: '07:30', fin: '12:00' }, { affaireId: 'b', debut: '11:00', fin: '16:00' }]), /chevauchent/);
  assert.strictEqual(J.erreur([{ affaireId: 'a', debut: '07:30', fin: '12:00' }, { affaireId: 'b', debut: '12:00', fin: '16:00' }]), null);
});

test('enregistrement : journée remplacée, chantiers hors planning, un seul panier, pointage validé intact', () => {
  const existants = [{ id: 't1', userId: 'o1', date: '2026-10-29', affaireId: 'af1', debut: '07:30', fin: '16:30', statut: '' }, { id: 'tv', userId: 'o1', date: '2026-10-29', affaireId: 'af1', debut: '17:00', fin: '18:00', statut: 'Validé' }];
  const lignes = [{ affaireId: 'hd1', tache: 'Dépannage', debut: '13:00', fin: '16:30', pause: 0 }, { tid: 't1', affaireId: 'af2', tache: 'Montage', debut: '07:30', fin: '12:00', pause: 0 }, { tid: 'tv', bloque: true, affaireId: 'af1' }];
  const r = J.aEnregistrer({ userId: 'o1', date: '2026-10-29', lignes, panier: true, existants, prevus: ['af1'], saisiPar: 'o1' });
  assert.deepStrictEqual(r.upserts.map(o => [o.id, o.affaireId, o.heures, o.panier, !!o.horsPlanning]), [['t1', 'af2', 4.5, true, true], [undefined, 'hd1', 3.5, false, true]]);
  assert.deepStrictEqual(r.suppressions, []);
  assert.strictEqual(r.total, 8);
  assert.ok(J.remplacee(lignes.filter(l => !l.bloque), ['af1']));
  // Ligne retirée : pointage supprimé (jamais un validé)
  const r2 = J.aEnregistrer({ userId: 'o1', date: '2026-10-29', lignes: [{ affaireId: 'af1', debut: '07:30', fin: '11:30' }], panier: false, existants, prevus: ['af1'], saisiPar: 'o1' });
  assert.deepStrictEqual(r2.suppressions, ['t1']);
  assert.strictEqual(r2.upserts[0].horsPlanning, undefined);
});

test('intérimaire déclaré : fiche sans accès et mission à compléter', () => {
  const d = R.interimaireDeclare({ nom: ' Yanis Morel ', agenceLibre: 'Adecco Annecy', qualification: 'Tuyauteur', affaireId: 'af1', date: '2026-10-29' }, { user: 'u9', mission: 'm9' }, 'Kevin', '2026-10-29');
  assert.deepStrictEqual([d.user.id, d.user.type, d.user.nom, d.user.agenceLibre, d.user.aCompleter], ['u9', 'interimaire', 'Yanis Morel', 'Adecco Annecy', true]);
  assert.deepStrictEqual([d.mission.userId, d.mission.dateEntree, d.mission.affaireIds, d.mission.aCompleter], ['u9', '2026-10-29', ['af1'], true]);
  assert.match(R.interimaireDeclare({ nom: 'Yo' }, {}, 'K', '2026-10-29').refus, /nom/);
  assert.match(R.interimaireDeclare({ nom: 'Yanis Morel' }, {}, 'K', '2026-10-29').refus, /agence/);
  assert.strictEqual(R.interimaireDeclare({ nom: 'Yanis Morel', agenceId: 'e8', date: '2027-01-01' }, { user: 'u', mission: 'm' }, 'K', '2026-10-29').mission.dateEntree, '2026-10-29');
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-journee-'));
process.env.DB_FILE = path.join(dir, 'test.db');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
process.env.NOTIF_DELAI_MS = '0';
const { server } = require('../server/server');
let base;
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (method, url, body, cookie) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

test('serveur : le compagnon pointe un intérimaire hors de son équipe, en déclare un nouveau, bureau prévenu', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  await call('POST', '/api/accounts', { login: 'claire', password: 'motdepasse1', role: 'charge', nom: 'Claire', userId: 'u1' }, admin);
  const k = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  const auj = R.jourIso(new Date());
  // Intérimaire connu (équipe de Lucas) : Kevin peut le pointer ; un salarié d'une autre équipe : non
  assert.strictEqual((await call('PUT', '/api/records/temps/tj1', { data: { userId: 'i1', affaireId: 'af1', date: auj, debut: '07:30', fin: '12:00', heures: 4.5, saisiPar: 'o1' } }, k)).status, 200);
  assert.strictEqual((await call('PUT', '/api/records/temps/tj2', { data: { userId: 'o2', affaireId: 'af1', date: auj, debut: '07:30', fin: '12:00', heures: 4.5 } }, k)).status, 403);
  // Nouvel intérimaire déclaré, puis pointé
  assert.strictEqual((await call('POST', '/api/pointage/interimaire', { nom: 'Lu' }, k)).status, 400);
  const d = await call('POST', '/api/pointage/interimaire', { nom: 'Sami Benali', agenceLibre: 'Adecco Annecy', qualification: 'Soudeur', affaireId: 'af1' }, k);
  assert.strictEqual(d.status, 200);
  assert.strictEqual(d.body.user.type, 'interimaire');
  assert.strictEqual(d.body.mission, null, 'le compagnon ne reçoit pas le dossier de mission');
  assert.strictEqual((await call('PUT', '/api/records/temps/tj3', { data: { userId: d.body.user.id, affaireId: 'af1', date: auj, debut: '13:00', fin: '16:30', heures: 3.5 } }, k)).status, 200);
  const c = (await call('POST', '/api/login', { login: 'claire', password: 'motdepasse1' })).cookie;
  const data = (await call('GET', '/api/data', null, c)).body;
  const m = data.missions.find(x => x.userId === d.body.user.id);
  assert.ok(m && m.aCompleter && m.dateEntree === auj && m.affaireIds[0] === 'af1');
  const n = data.notifications.filter(x => x.type === 'interim' && x.userId === 'u1');
  assert.strictEqual(n.length, 1);
  assert.match(n[0].texte, /Kevin l'a pointé avec lui \(agence Adecco Annecy\)/);
  // Sans accès : l'intérimaire déclaré n'a pas de compte
  assert.ok(!(await call('GET', '/api/accounts', null, admin)).body.some(a => a.userId === d.body.user.id));
});
