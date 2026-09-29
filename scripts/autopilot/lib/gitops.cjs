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
const os = require('os');
const { ROOT } = require('./common.cjs');

function git(args, cwd, opts = {}) {
  const pipeOut = opts.pipeOut !== false;
  const out = execFileSync('git', args, {
    cwd: cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', pipeOut ? 'pipe' : 'ignore', opts.pipeErr ? 'pipe' : 'pipe'],
    timeout: opts.timeoutMs || 120000,
  });
  return (out ?? '').trim();
}
function gitSafe(args, cwd, opts = {}) { try { return git(args, cwd, opts); } catch (_) { return null; } }
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
 * Toujours force-remove si existant pour éviter les collisions.
 */
function prepareWorktree(cfg, branchName, log = console.log) {
  const wt = worktreePath(cfg);
  const wtNormalized = wt.replace(/\\/g, '/');
  git(['fetch', 'origin', cfg.git.baseBranch, '--quiet']);

  // Vérification robuste : liste les worktrees et cherche le chemin exact (normalisé)
  const existing = gitSafe(['worktree', 'list', '--porcelain']) || '';
  const has = existing.split('\n').some(l => l.startsWith('worktree ') && l.slice(9).trim().replace(/\\/g, '/') === wtNormalized);

  // Force remove si existant (propre ou crashé)
  if (has) {
    log(`worktree existant détecté, suppression forcée : ${wt}`);
    try { git(['worktree', 'remove', '--force', wt]); } catch (e) {
      log(`worktree remove warning: ${e.message.split('\n')[0]}`);
      // Tentative de nettoyage manuel si git worktree remove échoue
      try { fs.rmSync(wt, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Créer worktree frais depuis origin/main
  git(['worktree', 'add', '-b', branchName, wt, 'origin/' + cfg.git.baseBranch]);
  log(`worktree créé : ${wt} (${branchName})`);

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

/** Parse une ligne git status --porcelain=v1 de façon robuste.
 * Format attendu: XY<space>PATH où X=index status, Y=worktree status.
 * Mais quand Y=' ' (unchanged), git peut omettre le séparateur -> X<space>PATH.
 * On détecte : si ligne[2] est espace -> path commence à 3, sinon à 2.
 */
function parsePorcelainLine(l) {
  if (l.length < 3) return l.trim();
  // Cas standard: XY<space>PATH (ligne[2] === ' ')
  if (l[2] === ' ') return l.slice(3).trim().replace(/^"|"$/g, '');
  // Cas compact: X<space>PATH (Y=' ' omis, ligne[1] === ' ', ligne[2] !== ' ')
  if (l[1] === ' ') return l.slice(2).trim().replace(/^"|"$/g, '');
  // Fallback: split sur premier espace après position 2
  const i = l.indexOf(' ', 2);
  return i >= 0 ? l.slice(i + 1).trim().replace(/^"|"$/g, '') : l.slice(3).trim().replace(/^"|"$/g, '');
}

/** Analyse du diff de travail (avant commit) : fichiers + statistiques. */
function diffStats(wt) {
  const nameOut = gitSafe(['status', '--porcelain=v1'], wt) || '';
  const files = nameOut.split('\n').filter(Boolean).map(parsePorcelainLine);
  const numstat = gitSafe(['diff', '--numstat', 'HEAD'], wt) || '';
  let ins = 0, del = 0;
  for (const l of numstat.split('\n').filter(Boolean)) {
    const [a, d] = l.split('\t');
    ins += parseInt(a, 10) || 0; del += parseInt(d, 10) || 0;
  }
  const statusLines = nameOut.split('\n').filter(Boolean);
  const untracked = statusLines
    .filter(l => l.startsWith('?? '))
    .map(parsePorcelainLine);
  let untrackedText = '';
  for (const f of untracked.slice(0, 20)) {
    try {
      const buf = fs.readFileSync(path.join(wt, f));
      // Les untracked files sont hors git diff : compter leur contenu dans le budget
      // afin qu'un binaire volumineux ne contourne jamais maxDiffLines.
      ins += Math.max(1, Math.ceil(buf.length / 80));
      if (buf.length <= 50000) untrackedText += '\n' + buf.toString('utf8');
    } catch (_) {}
  }
  const diffText = gitSafe(['diff', 'HEAD'], wt) || '';
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
    const bin = process.platform === 'win32' ? 'gh.exe' : 'gh';
    const out = execFileSync(bin, ['pr', 'list', '--state', 'open', '--limit', '20', '--json', 'number,title,headRefName'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    }).trim();
    const prs = JSON.parse(out || '[]');
    return prs.filter(p => (p.headRefName || '').startsWith('agent/autopilot/'))[0] || null;
  } catch (_) { return null; }
}

/** Active l'auto-merge squash sur la PR (uniquement si policy.canAutoMerge). */
function enableAutoMerge(wt, prUrl) {
  const bin = process.platform === 'win32' ? 'gh.exe' : 'gh';
  execFileSync(bin, ['pr', 'merge', prUrl, '--auto', '--squash'], {
    cwd: wt, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  });
}

/** Retire le worktree (fin de cycle ou échec définitif). */
function cleanupWorktree(cfg, log = console.log) {
  const wt = worktreePath(cfg);
  try { git(['worktree', 'remove', '--force', wt]); log('worktree retiré'); }
  catch (e) { log(`worktree remove ignoré : ${e.message.split('\n')[0]}`); }
  try { git(['worktree', 'prune']); } catch (_) {}
}

/** État d'une PR (vérification post-ship) : {state, mergeCommit, mergedAt} ou null. */
function prState(prUrl) {
  try {
    const bin = process.platform === 'win32' ? 'gh.exe' : 'gh';
    const out = execFileSync(bin, ['pr', 'view', prUrl, '--json', 'state,mergeCommit,mergedAt'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    }).trim();
    const j = JSON.parse(out || '{}');
    return { state: j.state, mergeCommit: (j.mergeCommit && j.mergeCommit.oid) || null, mergedAt: j.mergedAt || null };
  } catch (_) { return null; }
}

/** Fingerprint de prod (version.json) d'un domaine — preuve de déploiement. */
async function prodFingerprint(domain, timeoutMs = 10000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`https://${domain}/version.json`, { signal: ctrl.signal, headers: { 'User-Agent': 'sargagame-autopilot-verify' } });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return { b: j.b || null, v: j.v || null };
  } catch (_) { return null; }
}

module.exports = {
  worktreePath, founderTreeState, prepareWorktree, diffStats,
  commitAll, pushBranch, createPR, openAutopilotPR, enableAutoMerge, cleanupWorktree,
  prState, prodFingerprint,
  git, gitSafe, run,
};
