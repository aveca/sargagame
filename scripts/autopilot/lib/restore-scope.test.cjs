#!/usr/bin/env node
/**
 * restore-scope.test.cjs — test d'INTÉGRATION git de `restoreOutOfScope`.
 *
 * Rejoue, dans un dépôt git jetable, le défaut réel du 2026-11-09 (PR #1374) :
 * après un gate qui regénère des artefacts versionnés, le commit embarquait
 * des fichiers hors périmètre (dont `public/api/**`, denylist).
 *
 * Vérifie :
 *   1. un fichier suivi hors périmètre est restauré à sa version HEAD ;
 *   2. un fichier non suivi hors périmètre est supprimé ;
 *   3. un fichier DANS le périmètre n'est PAS touché ;
 *   4. `git status` ne signale plus que les fichiers du périmètre.
 *
 * Aucun réseau, aucun accès au dépôt de travail : dépôt temporaire jetable.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const gitops = require('./gitops.cjs');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + ' ' + detail);
  }
}

const GIT = process.platform === 'win32'
  ? (process.env.GIT_EXE || 'C:\\Program Files\\Git\\mingw64\\bin\\git.exe')
  : 'git';

function git(args, cwd) {
  return execFileSync(GIT, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000, windowsHide: true,
    env: process.env,
  });
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-scope-'));
try {
  git(['init', '-q'], repo);
  git(['config', 'user.email', 'test@sargagame.local'], repo);
  git(['config', 'user.name', 'autopilot-test'], repo);

  fs.mkdirSync(path.join(repo, '.ai', 'autopilot'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'public', 'api', 'copernicus'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.ai', 'autopilot', 'README.md'), '# original\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'public', 'api', 'copernicus', 'sargassum.json'), '{"v":1}\n', 'utf8');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'base'], repo);

  // État « après gate » : le README est modifié (voulu), l'artefact API est
  // régénéré (non voulu), un fichier non suivi apparaît (non voulu).
  fs.writeFileSync(path.join(repo, '.ai', 'autopilot', 'README.md'), '# original\n+ section\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'public', 'api', 'copernicus', 'sargassum.json'), '{"v":2}\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'public', 'api', 'b2b-partners.json'), '{"x":1}\n', 'utf8');

  console.log('=== restauration hors périmètre ===');
  const res = gitops.restoreOutOfScope(repo, ['.ai/autopilot/README.md'], () => {});

  // Contenu de référence = ce que git a dans HEAD (le worktree peut avoir des
  // fins de ligne CRLF après checkout sur Windows : on compare normalisé).
  const headVersion = git(['show', 'HEAD:public/api/copernicus/sargassum.json'], repo).replace(/\r\n/g, '\n');
  const worktreeVersion = fs.readFileSync(path.join(repo, 'public', 'api', 'copernicus', 'sargassum.json'), 'utf8').replace(/\r\n/g, '\n');
  check('le fichier hors périmètre suivi est restauré à sa version HEAD', worktreeVersion === headVersion, `${worktreeVersion} != ${headVersion}`);
  check('le fichier non suivi hors périmètre est supprimé', !fs.existsSync(path.join(repo, 'public', 'api', 'b2b-partners.json')));
  check('le fichier du périmètre est conservé', fs.readFileSync(path.join(repo, '.ai', 'autopilot', 'README.md'), 'utf8').includes('+ section'));
  check('aucune restauration en échec', res.failed.length === 0, JSON.stringify(res.failed));

  const status = git(['status', '--porcelain=v1'], repo).trim().split('\n').filter(Boolean);
  check('git status ne liste QUE le fichier du périmètre', status.length === 1 && status[0].includes('.ai/autopilot/README.md'), JSON.stringify(status));
  check('la liste de restauration est tracée', res.restored.length === 2, JSON.stringify(res.restored));
} finally {
  try { fs.rmSync(repo, { recursive: true, force: true }); } catch (_) {}
}

console.log(failures === 0 ? 'RESTORE-SCOPE TESTS : OK (0 échec)' : `RESTORE-SCOPE TESTS : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
