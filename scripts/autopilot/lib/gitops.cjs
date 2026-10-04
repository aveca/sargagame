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
    windowsHide: true,
  });
  return (out ?? '').trim();
}
function gitSafe(args, cwd, opts = {}) { try { return git(args, cwd, opts); } catch (_) { return null; } }
function run(cmd, cwd, opts = {}) {
  return execSync(cmd, { cwd: cwd || ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: opts.timeoutMs || 600000, windowsHide: true });
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

  // Créer worktree frais depuis origin/main — avec auto-réparation SÛRE :
  // si le chemin est occupé mais NON enregistré (résidu de crash / rmSync
  // partiel), mise de côté horodatée (récupérable, jamais supprimée) + UNE
  // seule tentative. Tout autre échec remonte (fail-closed).
  try {
    git(['worktree', 'add', '-b', branchName, wt, 'origin/' + cfg.git.baseBranch]);
  } catch (e) {
    // État FRAIS (le force-remove a pu déréférencer le worktree entre-temps).
    const fresh = gitSafe(['worktree', 'list', '--porcelain']) || '';
    const stillRegistered = fresh.split('\n').some(l => l.startsWith('worktree ') && l.slice(9).trim().replace(/\\/g, '/') === wtNormalized);
    const decision = worktreeAddRecovery({ pathExists: fs.existsSync(wt), registered: stillRegistered });
    if (decision !== 'retry-aside') throw e;
    const aside = `${wt}-stale-${Date.now().toString(36)}`;
    log(`worktree orphelin détecté, mise de côté (récupérable) : ${wt} → ${aside}`);
    fs.renameSync(wt, aside);
    git(['worktree', 'add', '-b', branchName, wt, 'origin/' + cfg.git.baseBranch]);
  }
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

/**
 * Décision PURE de reprise après échec de `git worktree add`
 * (testable sans I/O) :
 *  - chemin occupé MAIS non enregistré comme worktree → 'retry-aside'
 *    (résidu de crash / rmSync partiel : mise de côté horodatée, récupérable)
 *  - tout autre cas → 'throw' (fail-closed : collision réelle ou erreur
 *    inconnue, jamais masquée — l'orchestrateur parque avec diagnostic).
 */
function worktreeAddRecovery({ pathExists, registered }) {
  if (pathExists && !registered) return 'retry-aside';
  return 'throw';
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

/** gh pr create. Retourne {url} ou lève.
 * Le corps est écrit dans un tmpdir (jamais dans `<wt>/.git/` : dans un
 * worktree lié, `.git` est un FICHIER `gitdir:` — writeFileSync lève ENOENT).
 */
function createPR(wt, { title, body, base }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-pr-'));
  const bodyFile = path.join(dir, 'body.md');
  try {
    fs.writeFileSync(bodyFile, body, 'utf8');
    const out = run(`gh pr create --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}" --base ${base}`, wt, { timeoutMs: 120000 });
    const m = out.match(/https:\/\/github\.com\/[^\s]+/);
    return { url: m ? m[0] : out };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
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

/** Détail d'une PR ouverte (draft / mergeable / fichiers) — null si gh indisponible.
 *  Ne lève jamais : en cas de doute l'appelant doit traiter comme bloquant. */
function getPrDetail(number) {
  try {
    const bin = process.platform === 'win32' ? 'gh.exe' : 'gh';
    const out = execFileSync(bin, ['pr', 'view', String(number), '--json', 'number,title,headRefName,baseRefName,isDraft,mergeable,mergeStateStatus,headRefOid,files'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    }).trim();
    const j = JSON.parse(out || '{}');
    return {
      number: j.number != null ? j.number : number,
      title: j.title || null,
      headRefName: j.headRefName || null,
      baseRefName: j.baseRefName || null,
      isDraft: !!j.isDraft,
      mergeable: j.mergeable || null,
      mergeStateStatus: j.mergeStateStatus || null,
      headRefOid: j.headRefOid || null,
      files: Array.isArray(j.files) ? j.files.map(f => (typeof f === 'string' ? f : f.path)).filter(Boolean) : [],
    };
  } catch (_) { return null; }
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

/**
 * Tente de réparer automatiquement un PR en conflit (mergeable=CONFLICTING).
 * Stratégie : rebase sur origin/main + résolution déterministe sûre.
 * Retourne {ok: true, rebased: true, commitSha, method} ou {ok: false, reason, unsafe: boolean}.
 * Ne JAMAIS écraser main. Abort propre si conflit ambigu/dangereux.
 * Idempotent : already-up-to-date = success (method: 'already-up-to-date').
 */
async function repairPRConflict(prNumber, cfg, log = console.log) {
  log(`REPAIR_PR   attempting auto-rebase for PR #${prNumber}`);
  
  try {
    // 1. Fetch latest origin
    git(['fetch', 'origin', cfg.git.baseBranch, '--quiet']);
    log('REPAIR_PR   fetched origin/' + cfg.git.baseBranch);
    
    // 2. Get PR details to find the branch name
    const prDetail = getPrDetail(prNumber);
    if (!prDetail || !prDetail.headRefName) {
      return { ok: false, reason: 'PR detail unavailable or no headRefName', unsafe: false };
    }
    const branch = prDetail.headRefName;
    log(`REPAIR_PR   PR branch: ${branch}`);
    
    // 3. Check if this is an autopilot branch
    if (!branch.startsWith(cfg.git.branchPrefix || 'agent/autopilot/')) {
      return { ok: false, reason: `Not an autopilot branch (${branch})`, unsafe: true };
    }
    
    // 4. Use the autopilot worktree for the rebase
    const wt = worktreePath(cfg);
    
    // 4.5 FIRST: Ensure we're on the PR branch BEFORE preparing worktree
    // This is critical - prepareRepairWorktree must run on the PR branch,
    // not on main, so it sees the correct state.
    const currentBranch = gitSafe(['rev-parse', '--abbrev-ref', 'HEAD'], wt) || '';
    if (currentBranch !== branch) {
      log(`REPAIR_PR   switching to PR branch ${branch} (was on ${currentBranch})`);
      // Switch to the branch if it exists locally, or fetch it
      const hasBranch = gitSafe(['rev-parse', '--verify', branch], wt);
      if (hasBranch) {
        // Try to checkout, but first stash any local changes that would block it
        const checkoutResult = gitSafe(['checkout', branch], wt);
        if (checkoutResult === null) {
          // Checkout failed - likely due to local changes. Prepare worktree first, then retry.
          log('REPAIR_PR   checkout blocked by local changes, preparing worktree first');
          const prepResult = prepareRepairWorktree(wt, log);
          if (!prepResult.ok) {
            return { ok: false, reason: prepResult.reason, unsafe: prepResult.unsafe };
          }
          // Retry checkout after preparation
          git(['checkout', branch], wt);
        }
      } else {
        // Branch doesn't exist locally - fetch it from origin
        git(['fetch', 'origin', branch + ':' + branch], wt);
        git(['checkout', branch], wt);
      }
    }
    
    // 5. NOW prepare worktree (on the PR branch)
    const prepResult = prepareRepairWorktree(wt, log);
    if (!prepResult.ok) {
      return { ok: false, reason: prepResult.reason, unsafe: prepResult.unsafe };
    }
    
    // Verify we're on the correct branch
    const verifyBranch = gitSafe(['rev-parse', '--abbrev-ref', 'HEAD'], wt) || '';
    if (verifyBranch !== branch) {
      return { ok: false, reason: `Failed to switch to PR branch (still on ${verifyBranch})`, unsafe: true };
    }
    log(`REPAIR_PR   on PR branch ${branch}, ready for rebase`);
    
    // 6. Check if branch is already based on origin/main (fast-forward check)
    // If HEAD is already an ancestor of origin/main, no rebase needed
    const mergeBase = gitSafe(['merge-base', 'HEAD', 'origin/' + cfg.git.baseBranch], wt);
    const headSha = gitSafe(['rev-parse', 'HEAD'], wt);
    if (mergeBase && mergeBase.trim() === headSha && mergeBase.trim()) {
      log('REPAIR_PR   branch already up to date with origin/' + cfg.git.baseBranch);
      // Still push to ensure remote is in sync (force-push in case of remote divergence)
      const commitSha = git(['rev-parse', '--short', 'HEAD'], wt);
      git(['push', '-f', cfg.git.remote, branch], wt, { timeoutMs: 180000 });
      log('REPAIR_PR   force-pushed (already up to date)');
      return { ok: true, rebased: false, commitSha, method: 'already-up-to-date' };
    }
    
    // 7. Rebase onto origin/main with explicit output capture
    log('REPAIR_PR   rebasing onto origin/' + cfg.git.baseBranch + '...');
    const rebaseResult = runRebaseWithOutput(wt, cfg.git.baseBranch, log);
    
    if (rebaseResult.success) {
      // Rebase succeeded (either with commits or already up to date)
      if (rebaseResult.alreadyUpToDate) {
        log('REPAIR_PR   rebase: already up to date');
        const commitSha = git(['rev-parse', '--short', 'HEAD'], wt);
        git(['push', '-f', cfg.git.remote, branch], wt, { timeoutMs: 180000 });
        return { ok: true, rebased: false, commitSha, method: 'already-up-to-date' };
      } else {
        log('REPAIR_PR   rebase successful (commits replayed)');
        const commitSha = git(['rev-parse', '--short', 'HEAD'], wt);
        git(['push', '-f', cfg.git.remote, branch], wt, { timeoutMs: 180000 });
        log('REPAIR_PR   force-pushed rebased branch');
        return { ok: true, rebased: true, commitSha, method: 'rebase-clean' };
      }
    }
    
    // 8. Rebase failed - check if it's a conflict
    const status = gitSafe(['status', '--porcelain'], wt) || '';
    const conflictedFiles = status.split('\n').filter(l => l.startsWith('UU') || l.startsWith('AA') || l.startsWith('DD')).map(parsePorcelainLine);
    
    // Only abort if rebase is actually in progress
    const rebaseInProgress = fs.existsSync(path.join(wt, '.git', 'rebase-merge')) || 
                             fs.existsSync(path.join(wt, '.git', 'rebase-apply'));
    
    if (conflictedFiles.length === 0) {
      // No conflicts but rebase failed for other reason
      if (rebaseInProgress) {
        git(['rebase', '--abort'], wt);
      }
      return { ok: false, reason: rebaseResult.output || 'rebase failed without conflicts', unsafe: true };
    }
    
    log(`REPAIR_PR   conflicts detected in: ${conflictedFiles.join(', ')}`);
    
    // 9. Attempt safe deterministic resolution
    const resolution = attemptSafeConflictResolution(conflictedFiles, wt, log);
    
    if (!resolution.ok) {
      if (rebaseInProgress) {
        git(['rebase', '--abort'], wt);
      }
      return { ok: false, reason: resolution.reason, unsafe: resolution.unsafe };
    }
    
    // 10. Continue rebase
    const continueResult = runGitWithOutput(['rebase', '--continue'], wt);
    if (!continueResult.success) {
      if (rebaseInProgress) {
        git(['rebase', '--abort'], wt);
      }
      return { ok: false, reason: continueResult.output || 'rebase --continue failed', unsafe: true };
    }
    log('REPAIR_PR   rebase continued after conflict resolution');
    
    // 11. Verify rebase completed
    const finalStatus = gitSafe(['status', '--porcelain'], wt) || '';
    if (finalStatus.trim()) {
      if (rebaseInProgress) {
        git(['rebase', '--abort'], wt);
      }
      return { ok: false, reason: 'rebase left uncommitted changes', unsafe: true };
    }
    
    const commitSha = git(['rev-parse', '--short', 'HEAD'], wt);
    git(['push', '-f', cfg.git.remote, branch], wt, { timeoutMs: 180000 });
    log('REPAIR_PR   force-pushed rebased branch with resolved conflicts');
    
    return { ok: true, rebased: true, commitSha, method: 'rebase-with-resolution', resolvedFiles: conflictedFiles };
    
  } catch (e) {
    log(`REPAIR_PR   error: ${e.message}`);
    // Try to abort any in-progress rebase
    try { 
      const wt = worktreePath(cfg);
      const rebaseInProgress = fs.existsSync(path.join(wt, '.git', 'rebase-merge')) || 
                               fs.existsSync(path.join(wt, '.git', 'rebase-apply'));
      if (rebaseInProgress) {
        gitSafe(['rebase', '--abort'], wt);
      }
    } catch (_) {}
    return { ok: false, reason: e.message, unsafe: true };
  }
}

/**
 * Exécute git rebase avec capture de sortie pour distinguer les cas.
 * Retourne {success: boolean, alreadyUpToDate: boolean, output: string}.
 */
function runRebaseWithOutput(wt, baseBranch, log) {
  try {
    const out = run(`git rebase origin/${baseBranch}`, wt, { timeoutMs: 180000 });
    const output = out.trim();
    log(`REPAIR_PR   rebase output: ${output.slice(0, 200)}`);
    
    // Check for "already up to date" message
    if (/already up to date|Current branch .+ is up to date/i.test(output)) {
      return { success: true, alreadyUpToDate: true, output };
    }
    // Any other successful output (commits replayed, etc.)
    return { success: true, alreadyUpToDate: false, output };
  } catch (e) {
    // Rebase failed - could be conflicts or other error
    return { success: false, alreadyUpToDate: false, output: (e.stdout || '') + '\n' + (e.stderr || '') + '\n' + e.message };
  }
}

/**
 * Exécute une commande git et capture stdout/stderr sans lever d'exception.
 * Retourne {success: boolean, output: string}.
 */
function runGitWithOutput(args, wt) {
  try {
    const out = run('git ' + args.join(' '), wt, { timeoutMs: 120000 });
    return { success: true, output: out.trim() };
  } catch (e) {
    return { success: false, output: (e.stdout || '') + '\n' + (e.stderr || '') + '\n' + e.message };
  }
}

/**
 * Tente une résolution déterministe et SÛRE des conflits.
 * Ne résout QUE les cas où la branche autopilot a des changements
 * et main n'a pas touché aux mêmes lignes (ajout vs ajout, ou notre côté gagne).
 * Retourne {ok: true} ou {ok: false, reason, unsafe: boolean}.
 */
function attemptSafeConflictResolution(conflictedFiles, wt, log) {
  // Stratégie sûre : pour chaque fichier en conflit,
  // on ne garde QUE nos changements (branche agent) si :
  // - Le conflit est un "both added" (AA) → on garde notre version
  // - Le conflit est "both modified" (UU) mais main n'a changé que des lignes
  //   différentes de nos changements (heuristique : diff court, pas de logique métier)
  
  for (const file of conflictedFiles) {
    const fullPath = path.join(wt, file);
    if (!fs.existsSync(fullPath)) continue;
    
    const content = fs.readFileSync(fullPath, 'utf8');
    const conflictMarkers = (content.match(/^<<<<<<< /gm) || []).length;
    
    if (conflictMarkers === 0) continue; // Already resolved
    
    // Analyze the conflict
    const analysis = analyzeConflict(content);
    
    // SAFE CASE 1: "both added" (AA) - keep our version (agent branch)
    if (analysis.type === 'both-added') {
      log(`REPAIR_PR   ${file}: both-added conflict → keeping agent version`);
      const resolved = resolveKeepOurs(content);
      fs.writeFileSync(fullPath, resolved, 'utf8');
      git(['add', file], wt);
      continue;
    }
    
    // SAFE CASE 2: "both modified" but our changes are purely additive (new lines only)
    // and main's changes don't overlap with ours
    if (analysis.type === 'both-modified' && analysis.safeToKeepOurs) {
      log(`REPAIR_PR   ${file}: both-modified (safe) → keeping agent version`);
      const resolved = resolveKeepOurs(content);
      fs.writeFileSync(fullPath, resolved);
      git(['add', file], wt);
      continue;
    }
    
    // UNSAFE: any other conflict type
    log(`REPAIR_PR   ${file}: UNSAFE conflict type=${analysis.type}, markers=${conflictMarkers}`);
    return { ok: false, reason: `Unsafe conflict in ${file}: ${analysis.type}`, unsafe: true };
  }
  
  return { ok: true };
}

/**
 * Analyse un conflit git pour déterminer s'il est résoluble de façon sûre.
 */
function analyzeConflict(content) {
  // Find the conflict sections using a more robust approach
  const lines = content.split('\n');
  let inOurs = false, inTheirs = false;
  const oursLines = [];
  const theirsLines = [];
  
  for (const line of lines) {
    if (line.startsWith('<<<<<<< ')) {
      inOurs = true;
      continue;
    }
    if (line === '=======') {
      inOurs = false;
      inTheirs = true;
      continue;
    }
    if (line.startsWith('>>>>>>> ')) {
      inTheirs = false;
      continue;
    }
    if (inOurs) oursLines.push(line);
    if (inTheirs) theirsLines.push(line);
  }
  
  const ours = oursLines.join('\n');
  const theirs = theirsLines.join('\n');
  
  const oursCount = oursLines.filter(l => l.trim()).length;
  const theirsCount = theirsLines.filter(l => l.trim()).length;
  
  // Both added: both sides have content, base was empty
  if (oursCount > 0 && theirsCount > 0) {
    // Check if one side is purely additive (only new lines, no modifications to existing)
    // For simplicity, if both have content, we consider it "both-modified"
    // but allow keeping ours if theirs looks like whitespace/formatting only
    const theirsOnlyWhitespace = theirsLines.every(l => !l.trim() || l.trim().startsWith('//') || l.trim().startsWith('/*'));
    const oursOnlyWhitespace = oursLines.every(l => !l.trim() || l.trim().startsWith('//') || l.trim().startsWith('/*'));
    
    if (theirsOnlyWhitespace && !oursOnlyWhitespace) {
      return { type: 'both-modified', safeToKeepOurs: true, reason: 'theirs is whitespace only' };
    }
    if (oursOnlyWhitespace && !theirsOnlyWhitespace) {
      return { type: 'both-modified', safeToKeepOurs: false, reason: 'ours is whitespace only' };
    }
    return { type: 'both-modified', safeToKeepOurs: false, reason: 'both have substantive changes' };
  }
  
  if (oursCount > 0 && theirsCount === 0) {
    return { type: 'ours-only', safeToKeepOurs: true }; // Actually not a conflict
  }
  
  if (oursCount === 0 && theirsCount > 0) {
    return { type: 'theirs-only', safeToKeepOurs: false }; // Should take theirs
  }
  
  return { type: 'both-added', safeToKeepOurs: true };
}

/**
 * Résout un conflit en gardant notre version (HEAD = agent branch).
 */
function resolveKeepOurs(content) {
  const lines = content.split('\n');
  const result = [];
  let inOurs = false;
  let inTheirs = false;
  
  for (const line of lines) {
    if (line.startsWith('<<<<<<< ')) {
      inOurs = true;
      continue;
    }
    if (line === '=======') {
      inOurs = false;
      inTheirs = true;
      continue;
    }
    if (line.startsWith('>>>>>>> ')) {
      inTheirs = false;
      continue;
    }
    if (inOurs) {
      result.push(line);
    } else if (!inTheirs) {
      result.push(line);
    }
    // Skip lines in theirs section
  }
  
  return result.join('\n');
}

/**
 * Prépare le worktree pour la réparation de PR.
 * Gère les modifications locales générées par le build (ex: public/data/media-manifest.json)
 * sans détruire les vrais changements développeur.
 * Retourne {ok: true, stashedFiles[], cleanedFiles[]} ou {ok: false, reason, unsafe: boolean}.
 */
function prepareRepairWorktree(wt, log = console.log) {
  const status = gitSafe(['status', '--short'], wt) || '';
  if (!status.trim()) {
    log('REPAIR_PR   worktree clean');
    return { ok: true, stashedFiles: [], cleanedFiles: [] };
  }
  
  log('REPAIR_PR   worktree dirty — analyzing local changes');
  
  // Fichiers générés/artefacts de build connus (sûrs à nettoyer)
  const GENERATED_FILES = new Set([
    'public/data/media-manifest.json',
    'public/api/copernicus/sargassum.json',
    'public/version.json',
    'dist/',
    'node_modules/',
  ]);
  
  // Fichiers de config autopilot qui peuvent être modifiés par le cycle (sûrs à stash)
  const AUTOPILOT_TEMP_FILES = new Set([
    '.ai/autopilot/observations/latest.json',
    '.ai/autopilot/queue.json',
    '.ai/autopilot/scheduler.json',
    '.ai/autopilot/latest.md',
    '.ai/autopilot/runs/',
    '.ai/autopilot/regressions/',
  ]);
  
  const lines = status.split('\n').filter(Boolean);
  const stashedFiles = [];
  const cleanedFiles = [];
  const preservedFiles = [];
  let hasUnsafeChanges = false;
  let unsafeDetails = [];
  
  for (const line of lines) {
    const file = line.slice(3).trim(); // Format: "XY filename"
    const isGenerated = Array.from(GENERATED_FILES).some(g => file === g || file.startsWith(g));
    const isAutopilotTemp = Array.from(AUTOPILOT_TEMP_FILES).some(g => file === g || file.startsWith(g));
    
    if (isGenerated) {
      // Generated files: safe to discard (will be regenerated by next build)
      try {
        git(['checkout', '--', file], wt);
        cleanedFiles.push(file);
        log(`REPAIR_PR   cleaned generated file: ${file}`);
      } catch (e) {
        log(`REPAIR_PR   WARN: failed to clean ${file}: ${e.message}`);
        // Try rm + checkout
        try {
          const fullPath = path.join(wt, file);
          if (fs.existsSync(fullPath)) fs.rmSync(fullPath, { force: true });
          git(['checkout', '--', file], wt);
          cleanedFiles.push(file);
          log(`REPAIR_PR   cleaned generated file (via rm): ${file}`);
        } catch (e2) {
          unsafeDetails.push(`${file}: ${e2.message}`);
          hasUnsafeChanges = true;
        }
      }
    } else if (isAutopilotTemp) {
      // Autopilot temp files: stash them (preserve for later)
      try {
        git(['stash', 'push', '-m', `autopilot-repair-${Date.now()}`, '--', file], wt);
        stashedFiles.push(file);
        log(`REPAIR_PR   stashed autopilot temp file: ${file}`);
      } catch (e) {
        // If stash fails, try to checkout clean version
        try {
          git(['checkout', '--', file], wt);
          cleanedFiles.push(file);
          log(`REPAIR_PR   cleaned autopilot temp file (fallback): ${file}`);
        } catch (e2) {
          unsafeDetails.push(`${file}: ${e2.message}`);
          hasUnsafeChanges = true;
        }
      }
    } else {
      // Unknown file - could be real developer work, preserve it
      preservedFiles.push(file);
      log(`REPAIR_PR   preserved unknown change: ${file}`);
    }
  }
  
  if (hasUnsafeChanges) {
    const msg = `Cannot safely prepare worktree: ${unsafeDetails.join('; ')}`;
    log(`REPAIR_PR   UNSAFE: ${msg}`);
    return { ok: false, reason: msg, unsafe: true, stashedFiles, cleanedFiles, preservedFiles };
  }
  
  // Verify worktree is now clean enough for checkout
  const verifyStatus = gitSafe(['status', '--short'], wt) || '';
  if (verifyStatus.trim()) {
    log('REPAIR_PR   worktree still has changes after preparation');
    const remaining = verifyStatus.split('\n').filter(Boolean).map(l => l.slice(3).trim());
    log(`REPAIR_PR   remaining: ${remaining.join(', ')}`);
    // Not necessarily fatal - checkout might still work if changes don't conflict
  }
  
  log(`REPAIR_PR   worktree prepared: ${cleanedFiles.length} cleaned, ${stashedFiles.length} stashed, ${preservedFiles.length} preserved`);
  return { ok: true, stashedFiles, cleanedFiles, preservedFiles };
}

module.exports = {
  worktreePath, founderTreeState, prepareWorktree, diffStats, worktreeAddRecovery,
  commitAll, pushBranch, createPR, openAutopilotPR, getPrDetail, enableAutoMerge, cleanupWorktree,
  prState, prodFingerprint, repairPRConflict, analyzeConflict, resolveKeepOurs, prepareRepairWorktree,
  git, gitSafe, run,
};
