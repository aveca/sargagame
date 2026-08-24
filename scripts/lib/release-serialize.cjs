#!/usr/bin/env node
/**
 * release-serialize.cjs — Sérialisation RELEASE multi-agents
 *
 * Garantit :
 *  - fetch obligatoire avant claim
 *  - verrou de tâche (tasks.md sur origin/main)
 *  - base SHA enregistrée dans le claim
 *  - détection d'un correctif déjà mergé
 *  - une seule PR active (scope global agent/*)
 *  - arrêt si main a avancé de manière incompatible
 *  - aucun agent ne modifie le même worktree (.agent-workspace.lock)
 *  - après merge, les autres rebasent depuis le nouveau main
 *
 * Usage CLI:
 *   node scripts/lib/release-serialize.cjs --check --task TASK-P2-005d --agent coding --scope money
 *   node scripts/lib/release-serialize.cjs --fetch
 *   node scripts/lib/release-serialize.cjs --lock --task TASK-P2-005d --base abc123 --agent coding
 *   node scripts/lib/release-serialize.cjs --unlock
 *
 * Import:
 *   const { runReleaseGate, fetchOrigin, getOriginMainSha } = require('./release-serialize.cjs');
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCK_FILE = '.agent-workspace.lock';
const LOCK_TTL_MS = 90 * 60 * 1000; // 90 min timebox autonomie
const TASKS_FILE = '.ai/tasks.md';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts }).trim();
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    throw new Error(`cmd failed: ${cmd}\n${out}\n${e.message}`);
  }
}
function runSafe(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim(); } catch (_) { return ''; }
}

// 1. fetch obligatoire avant claim
function fetchOrigin() {
  run('git fetch origin --prune');
  const sha = run('git rev-parse origin/main');
  return sha;
}
function getOriginMainSha() {
  return run('git rev-parse origin/main');
}
function getLocalMainSha() {
  try { return run('git rev-parse main'); } catch (_) { return ''; }
}

// 2. worktree propre ? (aucun agent ne modifie le même worktree)
function checkWorktreeClean() {
  const status = runSafe('git status --porcelain');
  // ignorer les untracked purement temporaires ? on est strict : tout dirty = bloquant
  // Autoriser les fichiers untracked qui sont gitignored ? git status --porcelain inclut ?? pour untracked
  // On considère clean si aucune ligne M/M/D/R/C/U ou A non ignorée, mais on tolère les ?? qui sont hors git
  // Pour la sérialisation RELEASE, on exige un worktree strictement clean (hors untracked ignorés)
  // On filtre : si la seule chose est ?? (untracked) et que ces fichiers sont dans .gitignore, c'est OK.
  // Simplification : on appelle `git diff --stat` et `git diff --cached --stat` — si l'un a du contenu, c'est dirty
  const diff = runSafe('git diff --stat');
  const diffCached = runSafe('git diff --cached --stat');
  if (diff || diffCached) {
    return { ok: false, reason: `worktree dirty (git diff non vide) — un agent modifie déjà ce worktree. Commit ou stash d'abord.\n${status.slice(0, 500)}` };
  }
  // Vérifier aussi les fichiers modifiés non staged via status qui ne sont pas ?? (ex:  M, MM, A )
  const dirtyLines = status.split('\n').filter(l => l && !l.startsWith('??'));
  if (dirtyLines.length) {
    return { ok: false, reason: `worktree dirty — ${dirtyLines.slice(0, 5).join('; ')}` };
  }
  return { ok: true };
}

// verrou workspace exclusif
function checkWorkspaceLock() {
  if (!fs.existsSync(LOCK_FILE)) return { ok: true };
  try {
    const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const started = new Date(data.started).getTime();
    const age = Date.now() - started;
    if (age < LOCK_TTL_MS) {
      return { ok: false, reason: `workspace lock actif: ${data.agent} (${data.mission || data.task || ''}) depuis ${data.started} (age ${(age/60000).toFixed(1)}m < 90m). Un seul agent à la fois par worktree.` };
    }
    // expiré → on peut le reprendre
    return { ok: true, expired: true, data };
  } catch (_) {
    return { ok: false, reason: `workspace lock illisible (${LOCK_FILE}) — supprimer manuellement si stale` };
  }
}
function acquireWorkspaceLock({ task, agent, baseSha, mission }) {
  const payload = {
    mission: mission || `SHIP ${task}`,
    task,
    agent,
    baseSha,
    pid: process.pid,
    started: new Date().toISOString(),
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  return payload;
}
function releaseWorkspaceLock(expectedTask) {
  if (!fs.existsSync(LOCK_FILE)) return;
  try {
    const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (expectedTask && data.task !== expectedTask) {
      // ne pas supprimer le lock d'un autre agent
      return;
    }
    fs.unlinkSync(LOCK_FILE);
  } catch (_) {}
}

// 3. base SHA enregistrée — lecture du claim existant
function parseBaseShaFromClaim(taskId) {
  try {
    const content = fs.readFileSync(TASKS_FILE, 'utf-8');
    const m = content.match(new RegExp(`${taskId}[^\\n]*base:([0-9a-f]{7,40})`));
    return m ? m[1] : null;
  } catch (_) { return null; }
}

// 4. verrou de tâche + détection déjà mergé sur origin/main
function isTaskClaimedOrDoneOnMain(taskId) {
  const remoteTasks = runSafe(`git show origin/main:${TASKS_FILE}`);
  if (!remoteTasks) return { claimed: false, done: false };
  const lines = remoteTasks.split('\n');
  // Chercher header ### TASK-ID puis la ligne **Statut** associée (10 lignes suivantes)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(taskId)) continue;
    // Header format: ### TASK-PX-NNN ... -> chercher Statut dans les 12 lignes suivantes
    for (let j = i; j < Math.min(i + 12, lines.length); j++) {
      const l = lines[j];
      if (l.includes('**Statut**')) {
        if (l.includes('[~]')) return { claimed: true, done: false, line: l.trim() };
        if (l.includes('[x]')) return { claimed: false, done: true, line: l.trim() };
        if (l.includes('[ ]')) return { claimed: false, done: false, line: l.trim() };
        break;
      }
      // Si on croise un autre header TASK- avant de trouver Statut, on arrête
      if (j > i && l.startsWith('### TASK-')) break;
    }
    // Aussi vérifier si la ligne elle-même contient le statut (format checkbox)
    const cur = lines[i];
    if (cur.includes('[~]')) return { claimed: true, done: false, line: cur.trim() };
    if (cur.includes('[x]')) return { claimed: false, done: true, line: cur.trim() };
  }
  return { claimed: false, done: false };
}

// 5. une seule PR active par scope (sérialisation)
// scope = ex: "money", "infra", "docs", ou "agent" pour global
// Si scope fourni (ex: "money"), on ne bloque que les PR du même scope: agent/<scope>/* ou agent/<agentType>/*
// Sinon global agent/*
function hasActiveAgentPR(scopeOrTask, maybeScope) {
  // compat: hasActiveAgentPR(excludeTask) ou hasActiveAgentPR(scope, excludeTask)
  let scope = null;
  let excludeTask = null;
  if (maybeScope) { scope = scopeOrTask; excludeTask = maybeScope; }
  else if (scopeOrTask && scopeOrTask.startsWith('TASK-')) { excludeTask = scopeOrTask; }
  else { scope = scopeOrTask; }
  const json = runSafe(`gh pr list --state open --json headRefName,number,title --limit 50`);
  if (!json) return { has: false };
  try {
    const prs = JSON.parse(json);
    let agentPRs = prs.filter(p => p.headRefName && p.headRefName.startsWith('agent/'));
    if (scope && scope !== 'agent' && scope !== 'agent/*') {
      // filtre par scope: agent/<scope>/ ou agent/<agentType>/ (scope peut être "money" → agent/money/ ou agent/coding/ si scope==coding)
      // On considère scope comme un préfixe après agent/
      const prefix = `agent/${scope}/`;
      const altPrefix = scope.includes('/') ? scope : null;
      agentPRs = agentPRs.filter(p => p.headRefName.startsWith(prefix) || (altPrefix && p.headRefName.startsWith(altPrefix)));
      if (!agentPRs.length) return { has: false };
    }
    if (excludeTask) {
      const same = agentPRs.find(p => p.headRefName.includes(excludeTask));
      if (same && agentPRs.length === 1) return { has: false, same };
    }
    return { has: true, prs: agentPRs, count: agentPRs.length, scope: scope || 'agent/*' };
  } catch (_) {
    return { has: false };
  }
}

// 6. main a avancé de manière incompatible ?
function hasMainAdvanced(baseSha) {
  const cur = getOriginMainSha();
  if (!baseSha || baseSha === cur) return { advanced: false, cur, baseSha };
  return { advanced: true, cur, baseSha };
}
function getIncompatibleFiles(baseSha) {
  const cur = getOriginMainSha();
  if (!baseSha || baseSha === cur) return [];
  const diff = runSafe(`git diff --name-only ${baseSha}..${cur}`);
  return diff ? diff.split('\n').filter(Boolean) : [];
}
function checkIncompatibleAdvance(baseSha) {
  const adv = hasMainAdvanced(baseSha);
  if (!adv.advanced) return { ok: true, ...adv };
  const changedOnMain = getIncompatibleFiles(baseSha);
  // Fichiers modifiés localement (par rapport à baseSha) — ou par rapport à HEAD ?
  // On compare les fichiers touchés dans le worktree / branch actuelle vs main
  const localChanged = runSafe(`git diff --name-only ${baseSha}..HEAD`);
  const localList = localChanged ? localChanged.split('\n').filter(Boolean) : [];
  // Si on est encore sur main avant branche, localChanged sera vide — on prend `git status` files
  const overlap = changedOnMain.filter(f => localList.includes(f));
  // Si aucun fichier local encore, on considère que tout avancement de main est potentiellement incompatible
  // et on demande un rebase générique (arrêt automatique)
  if (!localList.length && changedOnMain.length) {
    return { ok: false, reason: `main a avancé ${baseSha.slice(0, 7)}..${adv.cur.slice(0, 7)} (${changedOnMain.length} fichiers: ${changedOnMain.slice(0, 5).join(', ')}) — rebase requis depuis le nouveau main avant claim`, changedOnMain, adv };
  }
  if (overlap.length) {
    return { ok: false, reason: `main a avancé de manière incompatible (fichiers en conflit: ${overlap.slice(0, 10).join(', ')}) — base ${baseSha.slice(0, 7)} → ${adv.cur.slice(0, 7)}. Rebase/abort requis`, overlap, changedOnMain, adv };
  }
  return { ok: true, adv, changedOnMain };
}

// 7. détection correctif déjà mergé (code présent sur main)
function isFixAlreadyOnMain(taskId) {
  // Vérif via tasks.md d'abord — source de vérité
  const st = isTaskClaimedOrDoneOnMain(taskId);
  if (st.done) return { already: true, reason: `tâche ${taskId} déjà marquée [x] done sur origin/main: ${st.line}` };
  if (st.claimed) return { already: false, claimed: true, reason: `tâche ${taskId} déjà [~] in_progress sur origin/main: ${st.line}` };
  // Vérif via git log uniquement pour les commits de fix (pas les commits d'ajout de tâche)
  // On exclut les commits "chore(tasks): add" qui ne sont que l'ajout de la tâche au backlog
  const log = runSafe(`git log origin/main --oneline --grep=${taskId} -i --grep="fix" --grep="feat"`);
  // Le log ci-dessus est OR par défaut; on filtre manuellement
  const allLogs = runSafe(`git log origin/main --oneline --grep=${taskId} -i`);
  if (allLogs) {
    const lines = allLogs.split('\n');
    // Ne considérer comme déjà mergé que si le commit contient fix/feat/docs et n'est pas juste l'ajout
    const fixLines = lines.filter(l => /fix|feat|docs\(/.test(l) && !/chore\(tasks\): add/.test(l));
    if (fixLines.length) return { already: true, reason: `commit déjà sur main avec grep ${taskId}: ${fixLines[0].slice(0, 120)}` };
  }
  return { already: false };
}

// Gate complet
function runReleaseGate({ taskId, agentType, scope }) {
  const out = { ok: true, steps: [], baseSha: null, reason: null };

  // 1. fetch obligatoire
  try {
    const sha = fetchOrigin();
    out.steps.push(`fetch origin/main → ${sha.slice(0, 7)}`);
    out.baseSha = sha;
  } catch (e) {
    return { ok: false, reason: `fetch origin a échoué: ${e.message}`, steps: out.steps };
  }

  // 2. worktree clean
  const wt = checkWorktreeClean();
  out.steps.push(`worktree clean: ${wt.ok ? 'OK' : 'FAIL'}`);
  if (!wt.ok) return { ok: false, reason: wt.reason, steps: out.steps };

  // 3. workspace lock
  const wl = checkWorkspaceLock();
  out.steps.push(`workspace lock: ${wl.ok ? (wl.expired ? 'expiré → OK' : 'OK') : 'LOCK'}`);
  if (!wl.ok) return { ok: false, reason: wl.reason, steps: out.steps };

  if (!taskId) return { ok: false, reason: 'taskId manquant', steps: out.steps };

  // 4. tâche déjà mergée / déjà claimée sur main ?
  const merged = isFixAlreadyOnMain(taskId);
  out.steps.push(`déjà mergé ? ${merged.already ? 'OUI → STOP' : merged.claimed ? 'claimé ailleurs → STOP' : 'non'}`);
  if (merged.already) return { ok: false, reason: merged.reason, steps: out.steps, code: 'ALREADY_MERGED' };
  if (merged.claimed) return { ok: false, reason: merged.reason, steps: out.steps, code: 'ALREADY_CLAIMED' };

  // 5. une seule PR active par scope (sérialisation)
  // scope = ex: money/infra/docs → on vérifie agent/<scope>/*, sinon global agent/*
  const prScope = scope && scope !== 'agent' ? scope : null;
  const pr = prScope ? hasActiveAgentPR(prScope, taskId) : hasActiveAgentPR(taskId);
  out.steps.push(`PR active scope ${prScope || 'agent/*'}: ${pr.has ? `OUI (${pr.count}) → STOP` : 'OK'}`);
  if (pr.has) {
    const titles = (pr.prs || []).map(p => `#${p.number} ${p.headRefName}`).join(', ');
    return { ok: false, reason: `une seule PR active par scope${prScope ? ` ${prScope}` : ''}: ${pr.count} PR(s) ouverte(s) ${titles} — terminer ou merger avant nouveau claim`, steps: out.steps, code: 'PR_ACTIVE' };
  }

  // 6. si un baseSha avait été enregistré précédemment (reprise), vérifier avancement incompatible
  const recordedBase = parseBaseShaFromClaim(taskId);
  if (recordedBase) {
    const inc = checkIncompatibleAdvance(recordedBase);
    out.steps.push(`main avancé depuis base ${recordedBase.slice(0, 7)} ? ${inc.ok ? 'non/propre' : 'INCOMPATIBLE → STOP'}`);
    if (!inc.ok) return { ok: false, reason: inc.reason, steps: out.steps, code: 'INCOMPATIBLE' };
    out.baseSha = recordedBase;
  }

  return out;
}

// Après merge/deploy, les autres agents rebasent
function rebaseDecisionFromNewMain() {
  // Appelé par un agent qui détecte que origin/main a avancé pendant son travail
  // Il doit fetch et re-évaluer PICK depuis le nouveau main
  try { run('git fetch origin'); } catch (_) {}
  const cur = getOriginMainSha();
  return { ok: true, newSha: cur, message: `rebase depuis nouveau main ${cur.slice(0, 7)} — relire .ai/tasks.md` };
}

function mainCLI() {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) {
    const sha = fetchOrigin();
    console.log(`✅ fetch origin/main → ${sha}`);
    return;
  }
  if (args.includes('--check-worktree')) {
    const r = checkWorktreeClean();
    console.log(r.ok ? '✅ worktree clean' : `❌ ${r.reason}`);
    process.exit(r.ok ? 0 : 1);
  }
  if (args.includes('--check-lock')) {
    const r = checkWorkspaceLock();
    console.log(r.ok ? '✅ workspace lock OK' : `❌ ${r.reason}`);
    process.exit(r.ok ? 0 : 1);
  }
  if (args.includes('--lock')) {
    const task = args.find(a => a.startsWith('--task='))?.split('=')[1] || (args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined);
    const base = args.find(a => a.startsWith('--base='))?.split('=')[1] || (args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined);
    const agent = args.find(a => a.startsWith('--agent='))?.split('=')[1] || (args.includes('--agent') ? args[args.indexOf('--agent') + 1] : 'unknown');
    if (!task || !base) { console.error('usage: --lock --task TASK --base SHA --agent coding'); process.exit(1); }
    const p = acquireWorkspaceLock({ task, baseSha: base, agent });
    console.log(`✅ lock acquis ${JSON.stringify(p)}`);
    return;
  }
  if (args.includes('--unlock')) {
    const task = args.find(a => a.startsWith('--task='))?.split('=')[1] || (args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined);
    releaseWorkspaceLock(task);
    console.log('✅ lock libéré');
    return;
  }
  if (args.includes('--check')) {
    const task = args.find(a => a.startsWith('--task='))?.split('=')[1] || (args.includes('--task') ? args[args.indexOf('--task') + 1] : undefined);
    const agent = args.find(a => a.startsWith('--agent='))?.split('=')[1] || (args.includes('--agent') ? args[args.indexOf('--agent') + 1] : 'coding');
    const scope = args.find(a => a.startsWith('--scope='))?.split('=')[1] || (args.includes('--scope') ? args[args.indexOf('--scope') + 1] : 'agent');
    if (!task) { console.error('usage: --check --task TASK --agent coding --scope money'); process.exit(1); }
    const r = runReleaseGate({ taskId: task, agentType: agent, scope });
    console.log(r.ok ? '✅ RELEASE GATE OK' : `❌ RELEASE GATE BLOQUÉ: ${r.reason}`);
    console.log('Steps:', r.steps.join(' | '));
    if (r.baseSha) console.log(`baseSha: ${r.baseSha}`);
    process.exit(r.ok ? 0 : 1);
  }
  if (args.includes('--rebase-check')) {
    const r = rebaseDecisionFromNewMain();
    console.log(`✅ ${r.message}`);
    return;
  }
  console.log(`release-serialize — sérialisation RELEASE
Usage:
  node scripts/lib/release-serialize.cjs --fetch
  node scripts/lib/release-serialize.cjs --check --task TASK-P2-005d --agent coding --scope money
  node scripts/lib/release-serialize.cjs --check-worktree
  node scripts/lib/release-serialize.cjs --check-lock
  node scripts/lib/release-serialize.cjs --lock --task TASK --base SHA --agent coding
  node scripts/lib/release-serialize.cjs --unlock [--task TASK]
  node scripts/lib/release-serialize.cjs --rebase-check
`);
}

if (require.main === module) mainCLI();

module.exports = {
  fetchOrigin,
  getOriginMainSha,
  checkWorktreeClean,
  checkWorkspaceLock,
  acquireWorkspaceLock,
  releaseWorkspaceLock,
  isTaskClaimedOrDoneOnMain,
  isFixAlreadyOnMain,
  hasActiveAgentPR,
  hasMainAdvanced,
  checkIncompatibleAdvance,
  runReleaseGate,
  rebaseDecisionFromNewMain,
};
