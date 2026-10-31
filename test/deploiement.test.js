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

test('application Études dans tous les modes d\'installation (pack, Linux, Docker, Windows, sauvegarde)', () => {
  const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(lire('deploy/pack.sh'), /cp -r server public doe etudes /);
  assert.match(lire('deploy/linux/pipefit-etudes.service'), /\/opt\/pipefit\/etudes\/server\.js/);
  const inst = lire('deploy/linux/installer.sh');
  assert.ok(inst.includes('"$PACK/etudes"') && inst.includes('pipefit-etudes.service') && inst.includes('--domaine-etudes'));
  assert.match(lire('deploy/linux/pipefit.env.exemple'), /^ETUDES_DB_FILE=/m);
  assert.match(lire('deploy/docker/docker-compose.yml'), /etudes\/server\.js/);
  assert.match(lire('deploy/docker/Caddyfile'), /reverse_proxy etudes:3200/);
  assert.match(lire('Dockerfile'), /COPY etudes \.\/etudes/);
  assert.match(lire('installer/build.sh'), /\.\.\/etudes /);
  assert.match(lire('installer/PipeFitCRM.nsi'), /files\/start-etudes\.cmd/);
  assert.match(lire('installer/files/service.ps1'), /start-etudes\.cmd/);
  assert.match(lire('installer/files/start-etudes.cmd'), /app\\etudes\\server\.js/);
  assert.ok(lire('installer/files/start-etudes.cmd').includes('\r\n'), 'fichier de commandes Windows en CRLF');
  assert.match(lire('server/server.js'), /prefixe: 'etudes', fichier: process\.env\.ETUDES_DB_FILE/);
});

test('fichiers Windows de l\'installateur : au plus une marque BOM en tête (makensis refuse un BOM doublé)', () => {
  const dir = path.join(__dirname, '..');
  const fichiers = ['installer/PipeFitCRM.nsi', ...fs.readdirSync(path.join(dir, 'installer/files')).filter(f => /\.(cmd|ps1|txt)$/.test(f)).map(f => `installer/files/${f}`),
    ...['deploy/windows', 'deploy/microsoft365'].flatMap(d => fs.readdirSync(path.join(dir, d)).filter(f => f.endsWith('.ps1')).map(f => `${d}/${f}`))];
  for (const f of fichiers) {
    const b = fs.readFileSync(path.join(dir, f));
    assert.ok(!(b[0] === 0xef && b[3] === 0xef && b[4] === 0xbb && b[5] === 0xbf), `${f} : BOM doublé`);
    assert.ok(!b.subarray(3).toString('utf8').includes('﻿'), `${f} : marque BOM au milieu du fichier`);
  }
});
