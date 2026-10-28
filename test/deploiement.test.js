// Pack de déploiement : mode d'emploi converti en page HTML, dossiers imposés par les variables d'environnement.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('mode d\'emploi : page HTML avec sommaire, étapes, vérifications et liste de recette', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefit-guide-'));
  try {
    const f = path.join(dir, 'guide.html');
    execFileSync(process.execPath, [path.join(__dirname, '../deploy/guide-html.js'), path.join(__dirname, '../docs/INSTALLATION.md'), f]);
    const html = fs.readFileSync(f, 'utf8');
    assert.match(html, /^<!doctype html>/);
    assert.ok((html.match(/<h2 id=/g) || []).length >= 10, 'une section par étape');
    assert.ok((html.match(/<a href="#[a-z0-9-]+">/g) || []).length >= 10, 'sommaire');
    assert.ok((html.match(/class="verif"/g) || []).length >= 8, 'vérification à la fin des étapes');
    assert.ok((html.match(/type="checkbox"/g) || []).length >= 10, 'liste de recette');
    assert.ok(!/\*\*|```/.test(html.replace(/<script>[\s\S]*?<\/script>/, '')), 'pas de Markdown resté brut');
    execFileSync(process.execPath, [path.join(__dirname, '../deploy/guide-html.js'), path.join(__dirname, '../docs/INSTALLATION.md'), f, '--fragment']);
    assert.match(fs.readFileSync(f, 'utf8'), /^<title>Installation Pipe-Fit<\/title>/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PJ_DIR et BACKUP_DIR imposent les dossiers (réglage des Paramètres ignoré)', () => {
  const conf = { 'pj-reseau': { actif: false, chemin: '/ailleurs' }, sauvegarde: { actif: false, chemin: '/ailleurs', heure: 3 } };
  const DB = { getConfig: (d, k) => conf[k], setConfig: (d, k, v) => { conf[k] = v; } };
  const db = { exec() {} };
  process.env.PJ_DIR = path.join(os.tmpdir(), 'pj'); process.env.BACKUP_DIR = path.join(os.tmpdir(), 'sv');
  try {
    const pj = require('../server/pj-reseau').creer({ DB, db, racineDocuments: () => '/docs' }).config();
    const sv = require('../server/sauvegarde').creer({ DB, db, dossierDefaut: '/defaut' }).config();
    assert.deepStrictEqual([pj.actif, pj.chemin, pj.impose], [true, process.env.PJ_DIR, true]);
    assert.deepStrictEqual([sv.actif, sv.chemin, sv.impose, sv.heure], [true, process.env.BACKUP_DIR, true, 3]);
  } finally { delete process.env.PJ_DIR; delete process.env.BACKUP_DIR; }
  const pj = require('../server/pj-reseau').creer({ DB, db, racineDocuments: () => path.join(path.sep, 'docs') }).config();
  assert.deepStrictEqual([pj.actif, pj.chemin], [false, path.resolve('/ailleurs')]);
});
