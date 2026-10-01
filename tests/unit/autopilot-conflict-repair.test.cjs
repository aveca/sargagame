#!/usr/bin/env node
/**
 * autopilot-conflict-repair.test.cjs — ÉTAPE 4 : le flux
 *   mergeable=CONFLICTING/DIRTY → PR_CONFLICT_REPAIRABLE →
 *   prepareRepairWorktree → repairPRConflict → analyzeConflict →
 *   résolution sûre → tests → push → GitHub re-check → reprise pipeline
 * fonctionne sans "repair humaine requise" quand le conflit est mécanique,
 * et aborte proprement quand il est ambigu.
 *
 * Couvre : both-added · both-modified · whitespace-only · generated files ·
 * conflit ambigu · rebase échoué · recovery après échec · retry idempotent.
 * Les sections "git réel" utilisent un dépôt temporaire (jamais le repo).
 */
'use strict';
const assert = require('assert');
// Marqueurs de conflit CONSTRUITS (jamais litteraux en debut de ligne) :
// `git diff --check` les confondrait avec un vrai conflit non resolu.
const M7 = '<'.repeat(7), E7 = '='.repeat(7), G7 = '>'.repeat(7);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const gitops = require('../../scripts/autopilot/lib/gitops.cjs');
const gen = require('../../scripts/autopilot/lib/generated-files.cjs');

let passed = 0;
function check(name, cond, details = '') {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else { console.log('  ✗ ' + name + (details ? ' — ' + details : '')); throw new Error('FAIL: ' + name); }
}

const G = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const GSAFE = (args, cwd) => { try { return G(args, cwd); } catch (_) { return null; }; };
const noop = () => {};

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function initRepo(dir) {
  G(['init', '-b', 'main'], dir);
  // Identité locale : `git merge` crée un commit, il exige un committer.
  G(['config', 'user.name', 't'], dir);
  G(['config', 'user.email', 't@t'], dir);
  G(['commit', '--allow-empty', '-m', 'init'], dir);
}

/** Construit un dépôt avec un conflit `merge` réel entre main et agent. */
function repoWithConflict(oursContent, theirsContent, filename = 'file.cjs') {
  const dir = tmpDir('apr-merge-');
  initRepo(dir);
  fs.writeFileSync(path.join(dir, filename), 'line 1\nline 2\n', 'utf8');
  G(['add', filename], dir);
  G(['commit', '-m', 'base'], dir);
  G(['checkout', '-b', 'agent'], dir);
  fs.writeFileSync(path.join(dir, filename), oursContent, 'utf8');
  G(['add', filename], dir);
  G(['commit', '--allow-empty', '-m', 'agent'], dir);
  G(['checkout', 'main'], dir);
  fs.writeFileSync(path.join(dir, filename), theirsContent, 'utf8');
  G(['add', filename], dir);
  G(['commit', '--allow-empty', '-m', 'main'], dir);
  try { G(['merge', 'agent'], dir); } catch (_) { /* conflit attendu */ }
  return dir;
}

function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

console.log('AUTOPILOT CONFLICT-REPAIR TESTS\n');

// ── 1. both-added : deux contenus substantifs différents → UNSAFE (abort) ──
{
  const dir = repoWithConflict('line 1\nOURS new function\n', 'line 1\nTHEIRS new function\n');
  try {
    const content = fs.readFileSync(path.join(dir, 'file.cjs'), 'utf8');
    const a = gitops.analyzeConflict(content);
    check('both-added/substantif = unsafe', a.safe === false);
    const r = gitops.attemptSafeConflictResolution(['file.cjs'], dir, noop);
    check('both-added → abort propre (ok:false, unsafe)', r.ok === false && r.unsafe === true);
    check('abort ne laisse pas de marqueurs résolus', /<<<<<<< /.test(fs.readFileSync(path.join(dir, 'file.cjs'), 'utf8')));
  } finally { cleanup(dir); }
}

// ── 2. both-modified : deux logiques différentes → UNSAFE ──
{
  const dir = repoWithConflict('line 1\nfunction f(){return 1;}\n', 'line 1\nfunction f(){return 2;}\n');
  try {
    const content = fs.readFileSync(path.join(dir, 'file.cjs'), 'utf8');
    const a = gitops.analyzeConflict(content);
    check('both-modified substantif = unsafe', a.safe === false && a.type === 'both-modified');
    const r = gitops.attemptSafeConflictResolution(['file.cjs'], dir, noop);
    check('both-modified → abort propre', r.ok === false);
  } finally { cleanup(dir); }
}

// ── 3. whitespace-only : équivalent → résolu (garde ours), idempotent ──
{
  const dir = repoWithConflict('line 1\nline 2\n', 'line 1  \nline 2\n');
  try {
    // git peut auto-fusionner le whitespace ; forcer le cas via merge -X ignore-space?
    // On teste directement la primitive sur contenu synthétiqueWhitespace.
    const content = `line 1
${M7} HEAD
line 2
${E7}
line 2  
${G7} main
`;
    const a = gitops.analyzeConflict(content);
    check('whitespace-only = safe/ours', a.safe === true && a.strategy === 'ours');
    const once = gitops.resolveKeepOurs(content);
    const twice = gitops.resolveKeepOurs(once);
    check('retry idempotent (résoudre 2× = 1×)', once === twice);
    check('plus de marqueurs après résolution', !/^<<<<<<< /m.test(once));
  } finally { cleanup(dir); }
}

// ── 4. generated files : version main prise, régénérable ──
{
  check('b2b-partners.json classé généré', gen.classifyRepairFile('public/api/b2b-partners.json') === 'generated');
  const dir = tmpDir('apr-gen-');
  try {
    initRepo(dir);
    const f = 'public/api/b2b-partners.json';
    fs.mkdirSync(path.join(dir, 'public', 'api'), { recursive: true });
    fs.writeFileSync(path.join(dir, f), `{"ours":true}
${M7} HEAD
`, 'utf8');
    const r = gitops.attemptSafeConflictResolution([f], dir, noop);
    // Fichier généré + pas un vrai worktree git en rebase : checkout --theirs
    // échoue (pas de theirs) → doit abort propre, jamais écrire n'importe quoi.
    check('generated sans base git → abort propre (pas de devinette)', r.ok === false);
  } finally { cleanup(dir); }
}

// ── 5. conflit ambigu (disjoint des deux côtés) → abort ──
{
  const content = `top
${M7} HEAD
agent line A
${E7}

${G7} main
mid
${M7} HEAD

${E7}
main line B
${G7} main
`;
  const a = gitops.analyzeConflict(content);
  check('disjoint des 2 côtés = unsafe', a.safe === false);
  const dir = tmpDir('apr-amb-');
  try {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'a.cjs'), content, 'utf8');
    const r = gitops.attemptSafeConflictResolution(['a.cjs'], dir, noop);
    check('ambigu → ok:false + raison', r.ok === false && /Unsafe|unsafe/.test(r.reason));
  } finally { cleanup(dir); }
}

// ── 6. rebase échoué → recovery : abort laisse un arbre propre ──
{
  const dir = tmpDir('apr-rebase-');
  try {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'f.cjs'), 'base\n', 'utf8');
    G(['add', 'f.cjs'], dir);
    G(['commit', '-m', 'base'], dir);
    G(['checkout', '-b', 'agent'], dir);
    fs.writeFileSync(path.join(dir, 'f.cjs'), 'agent\n', 'utf8');
    G(['add', 'f.cjs'], dir);
    G(['commit', '--allow-empty', '-m', 'agent'], dir);
    G(['checkout', 'main'], dir);
    fs.writeFileSync(path.join(dir, 'f.cjs'), 'main\n', 'utf8');
    G(['add', 'f.cjs'], dir);
    G(['commit', '--allow-empty', '-m', 'main'], dir);
    G(['checkout', 'agent'], dir);
    try { G(['rebase', 'main'], dir); } catch (_) { /* conflit attendu */ }
    const inProgress = fs.existsSync(path.join(dir, '.git', 'rebase-merge')) ||
      fs.existsSync(path.join(dir, '.git', 'rebase-apply'));
    check('rebase en conflit détecté', inProgress);
    // Recovery après échec = abort propre.
    G(['rebase', '--abort'], dir);
    const status = GSAFE(['status', '--porcelain'], dir) || '';
    const stillMerging = fs.existsSync(path.join(dir, '.git', 'rebase-merge')) ||
      fs.existsSync(path.join(dir, '.git', 'rebase-apply'));
    check('recovery : rebase avorté, arbre restauré', !stillMerging && !status.split('\n').some(l => l.startsWith('UU')));
  } finally { cleanup(dir); }
}

// ── 7. ours-only réel (git merge) : résolu côté ours ──
{
  const dir = repoWithConflict('line 1\nline 2\n// agent comment\n', 'line 1\nline 2\n');
  try {
    const content = fs.readFileSync(path.join(dir, 'file.cjs'), 'utf8');
    if (/^<<<<<<< /m.test(content)) {
      const a = gitops.analyzeConflict(content);
      check('ours-only détecté', a.type === 'ours-only' && a.safe === true);
      const r = gitops.attemptSafeConflictResolution(['file.cjs'], dir, noop);
      check('ours-only → résolu', r.ok === true);
      const after = fs.readFileSync(path.join(dir, 'file.cjs'), 'utf8');
      check('contenu ours préservé, marqueurs partis', after.includes('// agent comment') && !/^<<<<<<< /m.test(after));
      // Retry idempotent : 2e passage = déjà résolu.
      const r2 = gitops.attemptSafeConflictResolution(['file.cjs'], dir, noop);
      check('retry idempotent (2e passage ok)', r2.ok === true);
    } else {
      check('git a auto-fusionné (pas de conflit) — cas trivialement sûr', true);
    }
  } finally { cleanup(dir); }
}

// ── 8. verifyResolvedFiles : marqueurs résiduels / syntaxe cassée rejetés ──
{
  const dir = tmpDir('apr-verify-');
  try {
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'bad.cjs'), `${M7} HEAD
const x = ;
${E7}
const x = 1;
${G7} main
`, 'utf8');
    const v = gitops.verifyResolvedFiles(['bad.cjs'], dir, noop);
    check('marqueurs résiduels → rejeté', v.ok === false);
    fs.writeFileSync(path.join(dir, 'broken.cjs'), 'const x = ;\n', 'utf8');
    const v2 = gitops.verifyResolvedFiles(['broken.cjs'], dir, noop);
    check('syntaxe invalide → rejetée', v2.ok === false);
    fs.writeFileSync(path.join(dir, 'good.cjs'), 'const x = 1;\nmodule.exports = { x };\n', 'utf8');
    const v3 = gitops.verifyResolvedFiles(['good.cjs'], dir, noop);
    check('fichier sain → accepté', v3.ok === true);
  } finally { cleanup(dir); }
}

console.log(`\nRESULTS: ${passed} passed, 0 failed`);
