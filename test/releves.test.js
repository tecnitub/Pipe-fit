// Prise de cotes tuyauterie : dimensions normalisées, longueurs de coupe, placement 3D, nomenclature, règles du serveur.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const T = require('../public/js/tuyauterie');

const ligne = () => ({ dnDepart: 80, dirDepart: 'E', pn: 'PN16', matiere: 'Acier P235GH', elements: [
  { t: 'tube', dn: 80, auto: true, cote: 1500 }, { t: 'vanne', dn: 80, type: 'boisseau', rac: 'bride' }, { t: 'coude', dn: 80, angle: 90, vers: 'N' },
  { t: 'tube', dn: 80, auto: true, cote: 2000 },
  { t: 'te', dn: 80, vers: 'H', dnB: 50, branche: [{ t: 'tube', dn: 50, auto: true, cote: 800 }, { t: 'coude', dn: 50, vers: 'E' }, { t: 'tube', dn: 50, l: 300 }, { t: 'fond', dn: 50 }] },
  { t: 'tube', dn: 80, l: 500 }, { t: 'reduc', dn: 80, dn2: 50, exc: 'haut' }, { t: 'tube', l: 200 }] });
const proche = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.05);

test('dimensions normalisées : tubes ISO 4200, coudes 3D, tés, brides, robinetterie EN 558', () => {
  assert.deepStrictEqual([T.DE[50], T.DE[80], T.DE[100]], [60.3, 88.9, 114.3]);
  assert.deepStrictEqual([T.axeFaceCoude({ dn: 80, angle: 90 }), T.axeFaceCoude({ dn: 80, angle: 45 })], [114, 47.2], 'coude 45° : R × tan 22,5°');
  assert.strictEqual(T.axeFaceTe({ dn: 80 }), 86);
  assert.strictEqual(T.longueur({ t: 'vanne', dn: 80, type: 'boisseau', rac: 'bride' }), 310 + 2 * (50 + 2), 'face à face série 1 + contre-brides et joints');
  assert.strictEqual(T.longueur({ t: 'vanne', dn: 80, type: 'papillon', rac: 'souder' }), 46);
  assert.strictEqual(T.longueur({ t: 'vanne', dn: 80, type: 'boisseau', rac: 'souder', l: '250' }), 250, 'longueur saisie prioritaire');
  assert.deepStrictEqual(T.lire(T.VANNES.opercule.table, 25), { v: 150, approx: true }, 'DN hors série : valeur la plus proche, à vérifier');
});

test('longueurs de coupe : cote axe à axe moins les accessoires du tronçon', () => {
  const p = T.placer(ligne());
  assert.deepStrictEqual(p.erreurs, []);
  assert.deepStrictEqual(T.debit(p).map(d => [d.id, d.coupe]), [['0', 972], ['3', 1800], ['4.b.0', 638], ['4.b.2', 300], ['5', 500], ['7', 200]]);
  // 1500 - 414 (vanne à brides) - 114 (coude) ; 2000 - 114 - 86 (té) ; dérivation : 800 - 86 - 76 (coude DN50)
  const r = ligne();
  r.elements[0].cote = 400;
  assert.match(T.placer(r).erreurs[0].msg, /Cote trop courte/);
  r.elements[0].cote = '';
  assert.deepStrictEqual(T.placer(r).erreurs.map(e => [e.chemin, e.msg]), [['0', 'Cote axe à axe à saisir']]);
  r.elements.splice(1, 0, { t: 'tube', dn: 80, auto: true, cote: 100 });
  assert.ok(T.placer(r).erreurs.some(e => /Un seul tube/.test(e.msg)));
});

test('placement 3D : directions, dérivation du té, réduction excentrique, erreurs de saisie', () => {
  const p = T.placer(ligne()), at = id => p.pieces.find(x => x.id === id);
  assert.ok(proche(at('2').p1, [1500, 114, 0]), 'coude vers le nord');
  assert.ok(proche(at('4.b.1').centre, [1500, 2000, 800]), 'coude de la dérivation à 800 mm au-dessus du té');
  assert.ok(proche(at('6').p1, [1500, 2675, -14.3]), 'excentrique plat dessus : axe aval abaissé');
  assert.strictEqual(at('7').dn, 50, 'DN repris après la réduction');
  const r = { dnDepart: 50, dirDepart: 'E', elements: [{ t: 'coude', dn: 50, vers: 'O' }, { t: 'fond', dn: 50 }, { t: 'tube', dn: 50, l: 100 }] };
  assert.deepStrictEqual(T.placer(r).erreurs.map(e => e.chemin), ['0', '2']);
  const c45 = T.placer({ dnDepart: 50, dirDepart: 'E', elements: [{ t: 'coude', dn: 50, angle: 45, vers: 'N' }, { t: 'coude', dn: 50, angle: 45, vers: 'N' }] });
  assert.ok(proche(c45.fin.d, [0, 1, 0]), 'deux coudes à 45° font un quart de tour');
  assert.strictEqual(T.trouver(ligne(), '4.b.2').el.l, 300);
  assert.strictEqual(T.listeDe(ligne(), '4').length, 4);
});

test('nomenclature : tubes au mètre par DN, accessoires, brides et joints des vannes à brides', () => {
  const nom = T.nomenclature(ligne()), q = d => (nom.find(l => l.designation === d) || {}).quantite;
  assert.strictEqual(q('Tube Acier P235GH DN80 (Ø88.9)'), 3.3);
  assert.strictEqual(q('Tube Acier P235GH DN50 (Ø60.3)'), 1.1);
  assert.strictEqual(q('Bride à collerette DN80 PN16'), 2);
  assert.strictEqual(q('Joint plat DN80 PN16'), 2);
  assert.strictEqual(q('Té réduit Acier P235GH DN80 × DN50'), 1);
  assert.strictEqual(q('Réduction excentrique Acier P235GH DN80 × DN50'), 1);
  assert.deepStrictEqual(T.manques({ affaireId: 'af1', userId: 'o1', date: '2026-10-25', ligne: ' ', cotes: [{ valeur: '' }] }), ['repère de la ligne', 'au moins une cote ou un élément de tuyauterie']);
});

test('liste du matériel pour le chiffrage : familles CAO, tube en mètres par DN, brides des vannes, CSV', () => {
  const l = T.lignesChiffrage({ ...ligne(), ligne: 'EG-01' }), q = (f, dn) => l.filter(x => x.famille === f && x.dn === dn);
  assert.deepStrictEqual(q('Tuyau', 80).map(x => [x.longueur, x.qte, x.systeme]), [[3.272, 1, 'EG-01']]);
  assert.deepStrictEqual([q('Coude', 80)[0].qte, q('Bride à collerette', 80)[0].qte, q('Joint plat', 80)[0].qte], [1, 2, 2]);
  assert.deepStrictEqual(q('Réduction', 80).map(x => x.taille), ['DN80-DN50']);
  assert.ok(q('Robinet à tournant sphérique', 80).length);
  const csv = T.csvChiffrage(l).split('\r\n');
  assert.strictEqual(csv[0], 'Réseau;Famille;Type;Taille;Longueur (m);Nombre');
  assert.ok(csv.includes('EG-01;Tuyau;Acier P235GH;DN80;3,272;1'));
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-releves-'));
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

test('serveur : le technicien fait sa prise de cotes, numérotée, complète pour être validée', async () => {
  const admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
  await call('POST', '/api/accounts', { login: 'kevin', password: 'motdepasse1', role: 'atelier', nom: 'Kevin', userId: 'o1' }, admin);
  const kevin = (await call('POST', '/api/login', { login: 'kevin', password: 'motdepasse1' })).cookie;
  assert.ok((await call('GET', '/api/data', null, kevin)).body.releves.some(r => r.id === 'rc1'), 'relevé de démonstration visible');
  const r = { affaireId: 'af1', userId: 'o1', date: '2026-10-25', ligne: '', statut: 'Brouillon', elements: ligne().elements, cotes: [], photosAvant: [], photosApres: [] };
  const brouillon = await call('PUT', '/api/records/releves/rc-t', { data: r }, kevin);
  assert.strictEqual(brouillon.status, 200);
  assert.match(brouillon.body.numero, /^RC-\d{4}-\d{4}$/);
  assert.strictEqual((await call('PUT', '/api/records/releves/rc-u', { data: { ...r, userId: 'o2' } }, kevin)).status, 403, 'pour soi seulement');
  const inc = await call('PUT', '/api/records/releves/rc-t', { data: { ...r, statut: 'Relevé' }, version: brouillon.body._v }, kevin);
  assert.strictEqual(inc.status, 400);
  assert.match(inc.body.error, /repère de la ligne/);
  const ok = await call('PUT', '/api/records/releves/rc-t', { data: { ...r, ligne: 'EG-DN80-012', statut: 'Relevé' }, version: brouillon.body._v }, kevin);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.numero, brouillon.body.numero, 'numéro conservé');
});
