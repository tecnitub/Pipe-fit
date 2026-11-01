// Bibliothèque des fiches techniques : lecture (fabricant, références, date), recherche, versions ; dossier du serveur
// lu (PDF réel), dépôt, recherche par les autres applications, fiche jointe au matériel retenu du chantier
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const F = require('../public/js/fiches-tech');

// PDF minimal (une page, texte en Helvetica) : assez pour pdf.js
function pdf(lignes) {
  const flux = `BT /F1 12 Tf 50 750 Td 14 TL ${lignes.map(l => `(${l.replace(/[()\\]/g, '')}) '`).join(' ')} ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

test('lecture d\'une fiche : fabricant (dossier, nom connu), références, date, famille', () => {
  const a = F.analyser({ nom: 'diffuseurs_plafonnier_2024.pdf', chemin: 'Aldes/Diffusion/diffuseurs_plafonnier_2024.pdf', texte: 'Diffuseur plafonnier carré\nRéférence : DFC 160\nÉdition 03/2024\nNorme EN 1886, DN 160, R32' });
  assert.deepStrictEqual([a.fabricant, a.references, a.date, a.famille], ['Aldes', ['DFC 160'], '2024-03-01', 'bouche']);
  const b = F.analyser({ nom: 'PWE-N-511-KR.pdf', chemin: 'Fiches techniques/PWE-N-511-KR.pdf', texte: 'Groupe EMICON\nVersion du 12/01/2023', fabricants: ['Emicon', 'Aldes'] });
  assert.deepStrictEqual([b.fabricant, F.cle(b.references[0]), b.date], ['Emicon', 'PWEN511KR', '2023-01-12']);
  assert.deepStrictEqual(F.referencesDans('Modèle : CAD HR 3000 ; ISO 9001 ; 2024 ; 230 V ; type TEDV F400'), ['CAD HR 3000', 'TEDV F400']);
});

test('recherche : référence exacte écrite autrement, fiche de gamme, autre fabricant écarté, version à la date de pose', () => {
  const l = [{ id: 'a', fabricant: 'Aldes', references: ['DFC 160'], date: '2022-01-01' }, { id: 'b', fabricant: 'ALDES', references: ['DFC-160'], date: '2024-03-01' },
    { id: 'c', fabricant: 'France Air', references: ['DFC'], date: '2024-01-01' }, { id: 'd', fabricant: 'Aldes', references: ['DFC160'], date: '2025-01-01', absente: true }];
  assert.strictEqual(F.chercher(l, { fabricant: 'Aldes', reference: 'dfc160' }).fiche.id, 'b');
  assert.strictEqual(F.chercher(l, { fabricant: 'Aldes', reference: 'DFC 160', date: '2023-06-01' }).fiche.id, 'a', 'posé en 2023 : la version de 2022');
  const g = F.chercher(l, { fabricant: 'France Air', reference: 'DFC 250 B' });
  assert.deepStrictEqual([g.fiche.id, g.exacte], ['c', false]);
  assert.strictEqual(F.chercher(l, { fabricant: 'Atlantic', reference: 'DFC 160' }), null);
  assert.deepStrictEqual(F.versions(l), [{ id: 'a', remplaceePar: 'b' }]);
  assert.deepStrictEqual(F.lireCatalogue([['Fabricant', 'Référence', 'Désignation', 'Fiche technique'], ['Aldes', 'DFC 160', 'Diffuseur', 'https://exemple.fr/dfc.pdf'], ['Aldes', 'X', '', 'pas un lien']]).lignes.map(x => x.reference), ['DFC 160']);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-fiches-'));
process.env.DB_FILE = path.join(dir, 'pf.db');
process.env.FICHES_DIR = path.join(dir, 'Fiches techniques');
process.env.ADMIN_PASSWORD = 'admin-test-pw';
let srv, base, admin;
async function call(method, url, body, headers = {}) {
  const brut = Buffer.isBuffer(body);
  const r = await fetch(base + url, { method, headers: { ...(method !== 'GET' && !brut ? { 'Content-Type': 'application/json' } : {}), Cookie: admin || '', ...headers }, body: method === 'GET' ? undefined : brut ? body : JSON.stringify(body || {}) });
  const t = r.headers.get('content-type') || '';
  return { status: r.status, body: t.includes('json') ? await r.json() : null, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
before(async () => {
  fs.mkdirSync(path.join(dir, 'Fiches techniques', 'Aldes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Fiches techniques', 'Aldes', 'DFC-160_diffuseur.pdf'), pdf(['Diffuseur plafonnier DFC 160', 'Edition 03/2024']));
  srv = require('../server/server').server;
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  admin = (await call('POST', '/api/login', { login: 'admin', password: 'admin-test-pw' })).cookie;
});
after(() => { srv.close(); srv.closeAllConnections(); fs.rmSync(dir, { recursive: true, force: true }); });

test('serveur : dossier lu, dépôt écrit dans le dossier du fabricant, recherche, versions', async () => {
  const s = (await call('POST', '/api/fiches/synchro')).body;
  assert.strictEqual(s.ajoutees, 1, JSON.stringify(s));
  let t = (await call('POST', '/api/fiches/trouver', { demandes: [{ cle: 'x', fabricant: 'ALDES', reference: 'DFC160' }, { cle: 'y', fabricant: 'Aldes', reference: 'ZZZ 999' }] })).body;
  assert.deepStrictEqual([t[0].fiche.nom, t[0].fiche.date, t[0].fiche.exacte, t[1].fiche], ['DFC-160_diffuseur.pdf', '2024-03-01', true, null]);
  // Dépôt d'une version plus récente : fichier envoyé, lu, validé ; écrit dans <dossier>/Aldes ; l'ancienne est remplacée
  const up = await call('POST', '/api/documents/fichier', pdf(['Diffuseur DFC 160', 'Edition 01/2025']), { 'X-PipeFit-Upload': '1', 'X-Filename': 'dfc160-2025.pdf', 'Content-Type': 'application/pdf' });
  assert.strictEqual(up.status, 200, JSON.stringify(up.body));
  const a = (await call('POST', '/api/fiches/analyser', { fichierId: up.body.id, nom: 'dfc160-2025.pdf' })).body;
  assert.deepStrictEqual([a.date, !!a.existe], ['2025-01-01', true], 'fiche déjà connue signalée');
  const d = (await call('POST', '/api/fiches/depot', { fiches: [{ fichierId: up.body.id, nom: 'dfc160-2025.pdf', fabricant: 'Aldes', references: 'DFC 160', date: a.date }] })).body;
  assert.ok(fs.existsSync(path.join(dir, 'Fiches techniques', 'Aldes', 'dfc160-2025.pdf')));
  assert.strictEqual(d[0].chemin, 'Aldes/dfc160-2025.pdf');
  await call('POST', '/api/fiches/synchro'); // le fichier écrit n'est pas relu comme une nouvelle fiche
  const toutes = (await call('GET', '/api/data')).body.fichesTech.filter(f => !/^ftd/.test(f.id)); // hors fiches de la démonstration
  assert.strictEqual(toutes.length, 2, JSON.stringify(toutes));
  assert.strictEqual(toutes.find(f => f.nom === 'DFC-160_diffuseur.pdf').remplaceePar, d[0].id, JSON.stringify(toutes.map(f => [f.nom, f.fabricant, f.references, f.date, f.remplaceePar])));
  t = (await call('POST', '/api/fiches/trouver', { demandes: [{ cle: 'x', fabricant: 'Aldes', reference: 'DFC 160' }, { cle: 'z', fabricant: 'Aldes', reference: 'DFC 160', date: '2024-06-01' }] })).body;
  assert.deepStrictEqual([t[0].fiche.date, t[1].fiche.date], ['2025-01-01', '2024-03-01'], 'posé en juin 2024 : la version de mars 2024');
  // Fichier retiré du dossier : gardé, marqué absent
  fs.unlinkSync(path.join(dir, 'Fiches techniques', 'Aldes', 'DFC-160_diffuseur.pdf'));
  assert.strictEqual((await call('POST', '/api/fiches/synchro')).body.absentes, 1);
  // Lien de catalogue cassé : signalé
  const c = (await call('POST', '/api/fiches/catalogue', { lignes: [{ fabricant: 'Aldes', reference: 'BOUCHE 1', url: 'http://127.0.0.1:1/absent.pdf' }] })).body;
  assert.strictEqual(c.total, 1);
  for (let i = 0; i < 100 && (await call('GET', '/api/fiches/etat')).body.catalogue.enCours; i++) await new Promise(r => setTimeout(r, 50));
  assert.strictEqual((await call('GET', '/api/fiches/etat')).body.catalogue.erreurs.length, 1);
});
