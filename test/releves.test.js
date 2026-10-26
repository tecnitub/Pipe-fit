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
  assert.strictEqual(q('Tube Acier P235GH DN80 (Ø88,9 × 3,2)'), 3.3);
  assert.strictEqual(q('Tube Acier P235GH DN50 (Ø60,3 × 2,9)'), 1.1);
  assert.strictEqual(q('Bride à collerette DN80 PN16'), 2);
  assert.strictEqual(q('Joint plat DN80 PN16'), 2);
  assert.strictEqual(q('Té réduit Acier P235GH DN80 × DN50'), 1);
  assert.strictEqual(q('Réduction excentrique Acier P235GH DN80 × DN50'), 1);
  assert.deepStrictEqual(T.manques({ affaireId: 'af1', userId: 'o1', date: '2026-10-25', ligne: ' ', cotes: [{ valeur: '' }] }), ['repère de la ligne', 'au moins une cote ou un élément de tuyauterie']);
});

test('cotes à l\'axe nœud à nœud, brides à collerette ou tournantes, points des assemblages', () => {
  const p = T.placer({ ...ligne(), noteDepart: 'Départ sur existant' });
  assert.deepStrictEqual(p.cotes.map(c => [c.chemin, c.valeur]), [['', 1500], ['', 2000], ['4.b.', 800], ['4.b.', 414], ['', 875]], 'les cotes saisies se retrouvent à l\'axe');
  assert.strictEqual(p.depart.note, 'Départ sur existant');
  assert.strictEqual(p.pieces.find(x => x.id === '1').joints.length, 2, 'vanne à brides : deux assemblages');
  const r = { dnDepart: 50, dirDepart: 'E', typeBride: 'tournante', pn: 'PN16', matiere: 'Inox 316L', elements: [{ t: 'tube', dn: 50, l: 500 }, { t: 'brides', dn: 50 }, { t: 'brides', dn: 50, typeBride: 'mixte' }, { t: 'vanne', dn: 50, rac: 'bride', typeBride: 'collerette' }] };
  const nom = T.nomenclature(r), q = d => (nom.find(l => l.designation === d) || {}).quantite;
  assert.deepStrictEqual([q('Bride tournante DN50 PN16'), q('Collet à souder DN50 PN16'), q('Bride à collerette DN50 PN16'), q('Joint plat DN50 PN16')], [3, 3, 3, 4]);
  assert.deepStrictEqual(T.lignesChiffrage(r).filter(l => /Bride|Collet/.test(l.famille)).map(l => [l.famille, l.qte]), [['Bride tournante', 3], ['Collet à souder', 3], ['Bride à collerette', 3]]);
});

test('dévoiements simple et double (triangles, coupe de l\'oblique), vanne 3 voies avec voie B, nouvelle robinetterie', () => {
  const r = { dnDepart: 50, dirDepart: 'E', pn: 'PN16', matiere: 'Acier P235GH', elements: [{ t: 'tube', dn: 50, auto: true, cote: 1000 }, { t: 'devoie', dn: 50, angle: 45, vers: 'H', dec: 400 },
    { t: 'tube', dn: 50, auto: true, cote: 800 }, { t: 'devoie', dn: 50, angle: 45, vers: 'N', dec: 300, vers2: 'B', dec2: 200 },
    { t: 'v3v', dn: 50, vers: 'S', branche: [{ t: 'tube', dn: 50, auto: true, cote: 500 }] }, { t: 'vanne', dn: 50, type: 'dilatation', rac: 'bride' }] };
  const p = T.placer(r);
  assert.deepStrictEqual(p.erreurs, []);
  // coude 45° DN50 : axe-face 76 × tan 22,5° = 31,5 ; oblique 400 √2 = 565,7
  assert.deepStrictEqual(T.debit(p).map(d => [d.id, d.coupe]), [['0', 968.5], ['1', 502.7], ['2', 737], ['3', 446.9], ['4.b.0', 338]]);
  assert.deepStrictEqual(p.triangles.map(t => t.chemin), ['1', '3', '3'], 'un triangle pour le dévoiement simple, deux pour le double');
  assert.ok(proche(p.pieces.filter(x => x.id === '1')[2].centre, [1400, 0, 400]), 'second coude : avance 400 (45°), 400 plus haut');
  assert.strictEqual(T.nomenclature(r, p).find(l => /^Coude 45/.test(l.designation)).quantite, 4);
  assert.strictEqual(p.pieces.find(x => x.t === 'v3v').joints.length, 3, 'trois voies à brides');
  assert.match(T.placer({ dnDepart: 50, dirDepart: 'E', elements: [{ t: 'devoie', dn: 50, angle: 45, vers: 'H', dec: 30 }] }).erreurs[0].msg, /décalage trop court/);
  assert.match(T.placer({ dnDepart: 50, dirDepart: 'E', elements: [{ t: 'devoie', dn: 50, vers: 'E', dec: 300 }] }).erreurs[0].msg, /perpendiculaire/);
  assert.deepStrictEqual(['equilibrage', 'v2v', 'dilatation', 'clapet', 'papillon', 'boisseau'].map(k => !!T.VANNES[k]), [true, true, true, true, true, true]);
  assert.ok(T.lignesChiffrage(r).some(l => l.famille === 'Manchon de dilatation') && T.lignesChiffrage(r).some(l => l.famille === 'Vanne 3 voies motorisée'));
});

test('soudures bout à bout : raccords, brides, tube contre tube, départ sur l\'existant ; rien sur le fileté', () => {
  const s = r => T.bilanSoudures(T.placer({ dnDepart: 50, dirDepart: 'E', ...r }));
  assert.deepStrictEqual(s({ elements: [{ t: 'tube', dn: 50, l: 500 }, { t: 'coude', dn: 50, vers: 'N' }, { t: 'tube', dn: 50, l: 300 }, { t: 'tube', dn: 50, l: 300 }, { t: 'brides', dn: 50 }] }),
    { nombre: 6, parDN: { 50: 6 }, pouces: 12 }, 'départ, 2 extrémités du coude, tube contre tube, 2 brides');
  assert.strictEqual(s({ elements: [{ t: 'tube', dn: 50, l: 500 }, { t: 'vanne', dn: 50, rac: 'taraude' }, { t: 'tube', dn: 50, l: 300 }] }).nombre, 1, 'vanne taraudée : seulement le départ');
  assert.deepStrictEqual(s({ elements: [{ t: 'reduc', dn: 50, dn2: 25 }, { t: 'tube', dn: 25, l: 300 }] }).parDN, { 25: 1, 50: 1 });
  const p = T.placer(ligne());
  assert.strictEqual(T.bilanSoudures(p).nombre, p.soudures.length);
});

test('types de tube : acier T10, inox soudé, inox à sertir (diamètres, cotes des raccords, sertissages sans soudure)', () => {
  const ligneS = systeme => ({ systeme, dnDepart: 50, dirDepart: 'E', matiere: T.SYSTEMES[systeme].matiere, elements: [{ t: 'tube', dn: 50, auto: true, cote: 1000 }, { t: 'coude', dn: 50, vers: 'N' }, { t: 'tube', dn: 50, l: 500 }, { t: 'raccord', dn: 50, type: 'manchon' }] });
  const s = T.placer(ligneS('inoxSertir'));
  assert.strictEqual(s.pieces[0].de, 54, 'DN50 à sertir = Ø54');
  assert.strictEqual(T.debit(s)[0].coupe, 1000 - 58, 'coude à sertir Ø54 : cote axe – butée 58');
  assert.deepStrictEqual([s.soudures.length, s.sertissages.length], [0, 4], 'coude et manchon : deux sertissages chacun, aucune soudure');
  assert.match(T.nomenclature(ligneS('inoxSertir')).find(l => l.unite === 'm').designation, /à sertir Ø54 × 1,5/);
  assert.ok(T.lignesChiffrage(ligneS('inoxSertir')).some(l => l.famille === 'Coude à sertir' && l.taille === 'Ø54 DN50'));
  const t10 = T.placer(ligneS('t10'));
  assert.deepStrictEqual([t10.pieces[0].de, T.debit(t10)[0].coupe, t10.soudures.length], [60.3, 1000 - 76, 3], 'T10 : coude 3D à souder');
  assert.match(T.nomenclature(ligneS('t10')).find(l => l.unite === 'm').designation, /T10 DN50 \(Ø60,3 × 2,9\)/);
  assert.strictEqual(T.lignesChiffrage(ligneS('inoxSoude'))[0].famille, 'Tube inox soudé');
  assert.strictEqual(T.cleSysteme({ matiere: 'Inox 316L' }), 'inoxSoude', 'ancien relevé inox : inox soudé');
  const af = T.placer({ dnDepart: 50, dirDepart: 'E', elements: [{ t: 'tube', dn: 50, auto: true, cote: 1000 }, { t: 'coude', dn: 50, vers: 'N', af: '90' }, { t: 'tube', dn: 50, l: 100 }] });
  assert.deepStrictEqual([T.debit(af)[0].coupe, af.pieces[1].axeFace], [910, 90], 'cote axe-face du fabricant saisie sur le coude');
  assert.deepStrictEqual(T.manques({ userId: 'u1', date: '2026-10-25', ligne: 'L1', clientLibre: 'Prospect', cotes: [{ valeur: '100' }] }), [], 'visite commerciale : client sans chantier');
});

test('accessoires : thermomètre et sondes sur piquage, disconnecteur, filtre à tamis taraudé FF ou à brides selon le DN', () => {
  const r = { dnDepart: 25, dirDepart: 'E', matiere: 'Acier P235GH', elements: [{ t: 'tube', dn: 25, auto: true, cote: 1000 }, { t: 'instrument', dn: 25, type: 'thermometre', plage: '0-120 °C' },
    { t: 'vanne', dn: 25, type: 'filtre', rac: 'taraude' }, { t: 'vanne', dn: 25, type: 'disconnecteur', rac: 'taraude' }, { t: 'tube', dn: 25, l: 300 }, { t: 'instrument', dn: 25, type: 'sonde_p' }] };
  const p = T.placer(r);
  assert.deepStrictEqual(p.erreurs, []);
  assert.strictEqual(T.debit(p)[0].coupe, 1000 - 95 - 200 - 300, 'instrument sans encombrement ; filtre FF 95, disconnecteur 200, tube 300 du même tronçon');
  assert.deepStrictEqual(T.bilanSoudures(p).parDN, { 15: 2, 25: 1 }, 'deux piquages ½" soudés et le départ ; rien sur le taraudé');
  const nom = T.nomenclature(r, p).map(l => l.designation);
  assert.ok(nom.includes('Filtre à tamis en Y taraudé FF DN25 PN16') && nom.includes('Thermomètre à cadran avec doigt de gant 0-120 °C') && nom.includes('Manchon à souder ½" (piquage)'));
  const err = (type, rac, dn) => T.placer({ dnDepart: dn, dirDepart: 'E', elements: [{ t: 'vanne', dn, type, rac }] }).erreurs.map(e => e.msg);
  assert.deepStrictEqual([err('filtre', 'taraude', 80), err('filtre', 'bride', 25), err('filtre', 'bride', 50), err('filtre', 'taraude', 50)],
    [['Filtre à tamis en Y taraudé FF : du DN15 au DN50'], ['Filtre à tamis en Y à brides : du DN50 au DN300'], [], []]);
  assert.strictEqual(err('filtre', 'souder', 50)[0], 'Filtre à tamis en Y : taraudé FF DN15 à DN50, à brides DN50 à DN300');
  const l = T.lignesChiffrage(r).map(x => x.famille);
  assert.ok(['Thermomètre', 'Doigt de gant', 'Sonde de pression', 'Piquage ½"', 'Disconnecteur BA', 'Filtre à tamis en Y'].every(f => l.includes(f)));
});

test('changement de diamètre : réduction concentrique ISO ajoutée et déduite des coupes', () => {
  const r = { dnDepart: 80, dirDepart: 'E', matiere: 'Acier P235GH', elements: [{ t: 'tube', dn: 80, auto: true, cote: 1500 }, { t: 'coude', dn: 80, vers: 'N' },
    { t: 'tube', dn: 50, auto: true, cote: 1000 }, { t: 'vanne', dn: 50, rac: 'bride' }, { t: 'tube', dn: 80, l: 300 }] };
  const p = T.placer(r);
  assert.deepStrictEqual(p.pieces.filter(x => x.t === 'reduc').map(x => [x.id, x.dn, x.dn2, x.L]), [['2-r', 80, 50, 89], ['4-r', 50, 80, 89]]);
  // 1000 - coude DN80 114 - réduction 89 - vanne à brides DN50 324 - réduction 89 - tube 300
  assert.strictEqual(T.debit(p).find(d => d.id === '2').coupe, 84);
  assert.strictEqual(T.nomenclature(r, p).find(l => /^Réduction concentrique/.test(l.designation)).quantite, 2);
  assert.strictEqual(T.placer({ ...r, elements: [{ t: 'tube', dn: 80, l: 100 }, { t: 'reduc', dn: 80, dn2: 50 }, { t: 'tube', dn: 50, l: 100 }] }).pieces.filter(x => x.t === 'reduc').length, 1, 'réduction saisie : pas de doublon');
  assert.strictEqual(T.placer({ dnDepart: 50, dirDepart: 'E', systeme: 'inoxSertir', elements: [{ t: 'tube', dn: 50, l: 100 }, { t: 'tube', dn: 40, l: 100 }] }).pieces[1].L, 40, 'réduction à sertir Ø54 × Ø42');
});

test('changement de direction d\'un tube : coude 3D automatique, avant la réduction ; demi-tour refusé', () => {
  const r = { dnDepart: 80, dirDepart: 'E', elements: [{ t: 'tube', dn: 80, auto: true, cote: 1500 }, { t: 'tube', dn: 80, auto: true, cote: 1000, vers: 'N' }, { t: 'tube', dn: 50, l: 300, vers: 'H' }] };
  const p = T.placer(r);
  assert.deepStrictEqual(p.erreurs, []);
  assert.deepStrictEqual(p.pieces.map(x => x.id), ['0', '1-c', '1', '2-c', '2-r', '2']);
  assert.deepStrictEqual(T.debit(p).map(d => d.coupe), [1500 - 114, 1000 - 114 - 114, 300]);
  assert.deepStrictEqual(p.cotes.map(c => c.valeur).slice(0, 2), [1500, 1000], 'les cotes saisies se retrouvent à l\'axe des coudes automatiques');
  const rien = T.placer({ ...r, elements: [{ t: 'tube', dn: 80, l: 500, vers: 'E' }, { t: 'coude', dn: 80, vers: 'N' }, { t: 'tube', dn: 80, l: 500, vers: 'N' }] });
  assert.ok(!rien.pieces.some(x => /-c$/.test(x.id)), 'même direction ou coude déjà saisi : rien d\'ajouté');
  const qt = T.placer({ ...r, elements: [{ t: 'coude', dn: 80, angle: 45, vers: 'N' }, { t: 'tube', dn: 80, l: 500, vers: 'N' }] });
  assert.strictEqual(qt.pieces.find(x => x.id === '1-c').el.angle, 45, 'depuis une oblique à 45° : coude à 45°');
  assert.match(T.placer({ ...r, elements: [{ t: 'tube', dn: 80, l: 500, vers: 'O' }] }).erreurs[0].msg, /Demi-tour/);
  const te = T.placer({ ...r, elements: [{ t: 'tube', dn: 80, l: 500 }, { t: 'te', dn: 80, vers: 'N', branche: [{ t: 'tube', dn: 80, l: 400, vers: 'N' }] }] });
  assert.ok(!te.pieces.some(x => /-c$/.test(x.id)), 'tube dans la direction de la dérivation : pas de coude');
});

test('liste du matériel pour le chiffrage : familles CAO, tube en mètres par DN, brides des vannes, CSV', () => {
  const l = T.lignesChiffrage({ ...ligne(), ligne: 'EG-01' }), q = (f, dn) => l.filter(x => x.famille === f && x.dn === dn);
  assert.deepStrictEqual(q('Tube acier', 80).map(x => [x.longueur, x.qte, x.systeme]), [[3.272, 1, 'EG-01']]);
  assert.deepStrictEqual([q('Coude acier', 80)[0].qte, q('Bride à collerette', 80)[0].qte, q('Joint plat', 80)[0].qte], [1, 2, 2]);
  assert.deepStrictEqual(q('Réduction acier', 80).map(x => x.taille), ['DN80-DN50']);
  assert.ok(q('Vanne à boisseau sphérique', 80).length, 'famille sans l\'abréviation (BS)');
  const csv = T.csvChiffrage(l).split('\r\n');
  assert.strictEqual(csv[0], 'Réseau;Famille;Type;Taille;Longueur (m);Nombre');
  assert.ok(csv.includes('EG-01;Tube acier;Acier P235GH;DN80;3,272;1'));
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
