#!/usr/bin/env node
/**
 * gitops.cjs — opérations git de l'autopilot.
 *
 * Architecture : l'autopilot ne touche JAMAIS le worktree du fondateur.
 * Il possède SON worktree dédié (sibling `../sargagame-autopilot-wt`), créé
 * depuis origin/main frais à chaque cycle. node_modules y est conservé entre
 * les cycles (npm ci seulement si package-lock change).
 *
 * Jamais de push sur main : branche agent/autopilot/<id> → push → PR via gh.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { ROOT } = require('./common.cjs');

function git(args, cwd, opts = {}) {
  return execFileSync('git', args, {
    cwd: cwd || ROOT, encoding: 'utf8',
    stdio: ['ignore', opts.pipeErr ? 'pipe' : 'ignore', 'pipe'],
    timeout: opts.timeoutMs || 120000,
  }).trim();
}
function gitSafe(args, cwd) { try { return git(args, cwd); } catch (_) { return null; } }
function run(cmd, cwd, opts = {}) {
  return execSync(cmd, { cwd: cwd || ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: opts.timeoutMs || 600000 });
}

function worktreePath(cfg) {
  return path.resolve(ROOT, '..', cfg.git.worktreeSibling || 'sargagame-autopilot-wt');
}

/** Détecte les modifications NON-autopilot dans le worktree du fondateur (info seule, jamais bloquant pour nous). */
function founderTreeState() {
  const st = gitSafe(['status', '--porcelain']) || '';
  const lines = st.split('\n').filter(Boolean);
  const foreign = lines.filter(l => !l.includes('.ai/autopilot'));
  return { dirty: lines.length > 0, foreignDirty: foreign.length > 0, files: foreign.slice(0, 10) };
}

/**
 * Prépare le worktree de cycle : fetch origin, worktree add/refresh sur branche neuve.
 * Idempotent : un worktree sale d'un cycle crashé est réarmé (reset --hard + clean).
 */
function prepareWorktree(cfg, branchName, log = console.log) {
  const wt = worktreePath(cfg);
  git(['fetch', 'origin', cfg.git.baseBranch, '--quiet']);

  const existing = gitSafe(['worktree', 'list', '--porcelain']) || '';
  const has = existing.split('\n').some(l => l.startsWith('worktree ') && l.slice(9) === wt);

  if (has && fs.existsSync(path.join(wt, 'package.json'))) {
    log(`worktree existant réarmé : ${wt}`);
    git(['reset', '--hard', 'origin/' + cfg.git.baseBranch], wt);
    git(['clean', '-fd', '-e', 'node_modules'], wt);
    git(['checkout', '-B', branchName, 'origin/' + cfg.git.baseBranch], wt);
  } else {
    if (has) { try { git(['worktree', 'remove', '--force', wt]); } catch (_) {} }
    git(['worktree', 'add', '-b', branchName, wt, 'origin/' + cfg.git.baseBranch]);
    log(`worktree créé : ${wt} (${branchName})`);
  }

  // node_modules : npm ci seulement si absent ou lock plus récent
  const nm = path.join(wt, 'node_modules');
  const lock = path.join(wt, 'package-lock.json');
  const nmStamp = path.join(nm, '.package-lock.json');
  const needCi = !fs.existsSync(nm) ||
    (fs.existsSync(nmStamp) && fs.existsSync(lock) && fs.statSync(lock).mtimeMs > fs.statSync(nmStamp).mtimeMs);
  if (needCi) {
    log('npm ci (worktree)…');
    run(process.platform === 'win32' ? 'npm.cmd ci --no-audit --no-fund' : 'npm ci --no-audit --no-fund', wt, { timeoutMs: 600000 });
  } else {
    log('node_modules réutilisé (inchangé)');
  }
  return wt;
}

/** Analyse du diff de travail (avant commit) : fichiers + statistiques. */
function diffStats(wt) {
  const nameOut = gitSafe(['status', '--porcelain'], wt) || '';
  const files = nameOut.split('\n').filter(Boolean).map(l => l.slice(3).trim().replace(/^"|"$/g, ''));
  const numstat = gitSafe(['diff', '--numstat', 'HEAD'], wt) || '';
  let ins = 0, del = 0;
  for (const l of numstat.split('\n').filter(Boolean)) {
    const [a, d] = l.split('\t');
    ins += parseInt(a, 10) || 0; del += parseInt(d, 10) || 0;
  }
  const diffText = gitSafe(['diff', 'HEAD'], wt) || '';
  // Les fichiers non-trackés ne sont pas dans `git diff` — lire leur contenu pour le scan secrets.
  const untracked = files.filter((f, i) => nameOut.split('\n').filter(Boolean)[i]?.startsWith('??'));
  let untrackedText = '';
  for (const f of untracked.slice(0, 20)) {
    try { untrackedText += '\n' + fs.readFileSync(path.join(wt, f), 'utf8').slice(0, 50000); } catch (_) {}
  }
  return { files, insertions: ins, deletions: del, diffText: diffText + untrackedText };
}

function commitAll(wt, message, files) {
  for (const f of files) git(['add', '--', f], wt);
  git(['-c', 'user.name=sargagame-autopilot', '-c', 'user.email=autopilot@sargagame.local',
       'commit', '-m', message], wt);
  return git(['rev-parse', '--short', 'HEAD'], wt);
}

function pushBranch(wt, branch, cfg) {
  git(['push', '-u', cfg.git.remote, branch], wt, { timeoutMs: 180000 });
}

/** gh pr create. Retourne {url} ou lève. */
function createPR(wt, { title, body, base }) {
  const bodyFile = path.join(wt, '.git', 'autopilot-pr-body.md');
  fs.writeFileSync(bodyFile, body, 'utf8');
  const out = run(`gh pr create --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}" --base ${base}`, wt, { timeoutMs: 120000 });
  const m = out.match(/https:\/\/github\.com\/[^\s]+/);
  return { url: m ? m[0] : out };
}

/** PR autopilot déjà ouverte ? (sérialisation : une seule à la fois) */
function openAutopilotPR() {
  try {
    const out = run('gh pr list --state open --limit 20 --json number,title,headRefName', ROOT, { timeoutMs: 60000 });
    const prs = JSON.parse(out);
    return prs.filter(p => (p.headRefName || '').startsWith('agent/autopilot/'))[0] || null;
  } catch (_) { return null; }
}

/** Active l'auto-merge squash sur la PR (uniquement si policy.canAutoMerge). */
function enableAutoMerge(wt, prUrl) {
  run(`gh pr merge "${prUrl}" --auto --squash`, wt, { timeoutMs: 60000 });
}

/** Retire le worktree (fin de cycle ou échec définitif). */
function cleanupWorktree(cfg, log = console.log) {
  const wt = worktreePath(cfg);
  try { git(['worktree', 'remove', '--force', wt]); log('worktree retiré'); }
  catch (e) { log(`worktree remove ignoré : ${e.message.split('\n')[0]}`); }
  try { git(['worktree', 'prune']); } catch (_) {}
}

module.exports = {
  worktreePath, founderTreeState, prepareWorktree, diffStats,
  commitAll, pushBranch, createPR, openAutopilotPR, enableAutoMerge, cleanupWorktree,
  git, gitSafe, run,
};
