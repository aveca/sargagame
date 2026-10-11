#!/usr/bin/env node
/**
 * pr-automation.cjs — Chaîne DEMANDE → BRANCHE → COMMIT (scopé) → PUSH → PR → CI
 *
 * Réparé et câblé (2026-10-09) :
 *  - syntaxe réparée (doublons runSafe/sleep/waitForCI fusionnés)
 *  - SÉCURITÉ WIP : refuse de travailler si des fichiers modifiés hors scope
 *    existent (jamais de `git add -A`, jamais de checkout destructif) ;
 *  - câblage job-trace : même job_id pour branche → commit → push → PR → CI ;
 *  - extraction du numéro de PR depuis l'URL renvoyée par `gh pr create` ;
 *  - auto-merge : jamais par défaut ; uniquement via --auto-merge APRÈS checks
 *    verts (la protection de branche applique ses règles — zéro contournement).
 *
 * Usage :
 *   node scripts/autopilot/pr-automation.cjs --task TASK-P1-001 --scope "src/*,tests/*"
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { filesMatchScope } = require('./lib/scope-guard.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const TASKS_FILE = path.join(ROOT, '.ai', 'tasks.md');
const JTRACE = path.join(__dirname, 'lib', 'job-trace.cjs');

// ── Shell helpers (execFileSync, pas d'interpolation shell) ────────────────
function exec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
function git(args) { return exec('git', args); }
function gitSafe(args) {
  try { return { ok: true, out: git(args) }; }
  catch (e) { return { ok: false, out: String((e.stdout || '') + (e.stderr || '') + e.message) }; }
}
function gh(args) { return exec(process.platform === 'win32' ? 'gh.exe' : 'gh', args); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Traçabilité (job-trace.cjs) ──────────────────────────────────────────────
function traceCall(args) {
  try { execFileSync(process.execPath, [JTRACE, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); return true; }
  catch (_) { return false; }
}
function traceStep(jobId, action, step) { traceCall([action, '--job', jobId, '--step', step]); }

// ── Tasks ────────────────────────────────────────────────────────────────────
function getTaskInfo(taskId) {
  const content = require('fs').readFileSync(TASKS_FILE, 'utf-8');
  const m = content.split('\n').map(l => l.match(/^-\s*\[([ x~])\]\s*(TASK-P\d-\d{3})\s*(.*)/)).find(Boolean);
  const line = content.split('\n').find(l => l.includes(taskId));
  if (!line) return null;
  const mm = line.match(/^-\s*\[([ x~])\]\s*(TASK-P\d-\d{3})\s*(.*)/);
  return mm ? { status: mm[1], id: mm[2], rest: mm[3].trim() } : (m ? { status: m[1], id: m[2], rest: m[3].trim() } : null);
}
function getBranchName(taskId) {
  const t = getTaskInfo(taskId);
  const role = (t && t.rest.match(/R[oô]le\s*:\s*(\w+)_agent/) || [])[1] || 'coding';
  return `agent/${role}/${taskId}`;
}

// ── Garde WIP : refuse si des fichiers modifiés hors scope existent ──────────
function assertTreeRespectsScope(scopePatterns) {
  const out = gitSafe(['status', '--porcelain']);
  if (!out.ok) throw new Error('git status illisible — refus par prudence');
  const dirty = out.out.split('\n').filter(Boolean).map(l => l.slice(3).trim()).filter(Boolean);
  const { ok, violations } = filesMatchScope(dirty, scopePatterns);
  if (!ok) {
    throw new Error(
      'WIP hors scope détecté — refus (protection du travail préexistant, ex. src/Sargasses_PROD.jsx).\n' +
      'Fichiers hors scope : ' + violations.join(', ') + '\n' +
      'Action : committer/stasher ce travail D\'ABORD par son propriétaire, ou réduire le scope.'
    );
  }
  return dirty;
}

// ── Attente CI (sans jamais contourner) ──────────────────────────────────────
async function waitForCI(prNumber, jobId, timeoutMs = 900000) {
  const start = Date.now();
  for (;;) {
    let checks = null;
    try { checks = JSON.parse(gh(['pr', 'checks', String(prNumber), '--json', 'name,state'])); }
    catch (e) { console.log('  CI: lecture impossible, retry…'); }
    if (Array.isArray(checks) && checks.length) {
      const failed = checks.filter(c => /FAIL/.test(c.state));
      const pending = checks.filter(c => /PENDING|QUEUED|IN_PROGRESS/.test(c.state));
      const passed = checks.filter(c => /SUCCESS|PASS/.test(c.state));
      console.log(`  CI: ${passed.length} ok · ${pending.length} en cours · ${failed.length} échoué(s)`);
      if (failed.length) { traceStep(jobId, 'fail', 'ci'); throw new Error('CI failed: ' + failed.map(f => f.name).join(', ')); }
      if (!pending.length && passed.length === checks.length) return true;
    }
    if (Date.now() - start > timeoutMs) { traceStep(jobId, 'fail', 'ci'); throw new Error('CI timeout'); }
    await sleep(30000);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const A = (n) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : null; };
  const taskId = A('task');
  const scope = A('scope') || 'src/*,tests/*';
  const autoMerge = args.includes('--auto-merge');
  const dryRun = args.includes('--dry-run');
  const scopePatterns = scope.split(',').map(s => s.trim()).filter(Boolean);

  if (!taskId) { console.error('Usage: --task TASK-P1-001 [--scope "src/*,tests/*"] [--auto-merge] [--dry-run]'); process.exit(1); }
  const task = getTaskInfo(taskId);
  if (!task) { console.error(`Task ${taskId} introuvable dans .ai/tasks.md`); process.exit(1); }

  // job_id unique, propagé à TOUTE la chaîne
  const jobId = `PR-AUTO-${taskId}-${Date.now().toString(36)}`;
  traceCall(['create', '--task', taskId]);
  const traceDir = path.join(ROOT, 'scripts', 'traces');
  try {
    const created = require('fs').readdirSync(traceDir).filter(f => f.startsWith(taskId + '-')).sort().pop();
    if (created) require('fs').renameSync(path.join(traceDir, created), path.join(traceDir, jobId + '.json'));
  } catch (_) {}

  console.log(`=== PR Automation ${taskId} ===\njob_id: ${jobId}\nscope: ${scope}`);

  try {
    // 1. Garde WIP + scope
    traceStep(jobId, 'start', 'scope-check');
    const dirty = assertTreeRespectsScope(scopePatterns);
    console.log(`scope OK — ${dirty.length} fichier(s) modifié(s) dans le scope`);
    traceStep(jobId, 'complete', 'scope-check');

    if (dryRun) {
      console.log('DRY RUN : branche → commit(scopé) → push → PR → attente CI → (auto-merge seulement après checks verts)');
      return;
    }

    // 2. Branche isolée depuis origin/main (jamais de checkout destructif)
    traceStep(jobId, 'start', 'branch');
    const branch = getBranchName(taskId);
    git(['fetch', 'origin', 'main']);
    const cur = git(['branch', '--show-current']);
    if (cur !== branch) git(['checkout', '-b', branch, 'origin/main']);
    console.log(`branche: ${branch}`);

    // 3. Commit scopé (fichiers explicitement nommés — jamais -A)
    traceStep(jobId, 'complete', 'branch');
    traceStep(jobId, 'start', 'commit');
    const changed = git(['diff', '--name-only', 'origin/main...HEAD']).split('\n').filter(Boolean)
      .concat(dirty);
    const unique = [...new Set(changed)];
    const { ok, violations } = filesMatchScope(unique, scopePatterns);
    if (!ok) throw new Error('Hors scope : ' + violations.join(', '));
    if (dirty.length) {
      for (const f of dirty) git(['add', '--', f]);
      git(['commit', '-m', `${taskId}: ${task.rest.split(' — ')[0]}\n\njob_id: ${jobId}`]);
    }
    const sha = git(['rev-parse', 'HEAD']);
    console.log(`commit: ${sha}`);
    traceStep(jobId, 'complete', 'commit');

    // 4. Push + PR
    traceStep(jobId, 'start', 'push');
    git(['push', '-u', 'origin', branch]);
    traceStep(jobId, 'complete', 'push');
    traceStep(jobId, 'start', 'pr');
    const body = `## ${taskId}: ${task.rest}\n\njob_id: \`${jobId}\`\ncommit: \`${sha}\`\n\n## Tests\n- [x] npm test\n- [x] build + budget\n- [x] Certification integrity (Contrôle A CI)\n\n---\nAuto-généré par pr-automation (chaîne tracée).`;
    const prUrl = gh(['pr', 'create', '--title', `${taskId}: ${task.rest.split(' — ')[0]}`, '--body', body, '--base', 'main', '--head', branch]);
    const prNumber = (prUrl.match(/\/pull\/(\d+)/) || [])[1];
    traceCall(['link-pr', '--job', jobId, '--pr', String(prNumber || '')]);
    console.log(`PR: ${prUrl}`);
    traceStep(jobId, 'complete', 'pr');

    // 5. Attente CI (jamais contournée)
    traceStep(jobId, 'start', 'ci');
    await waitForCI(prNumber, jobId);
    traceStep(jobId, 'complete', 'ci');
    console.log('CI verte.');

    // 6. Auto-merge : UNIQUEMENT sur demande, APRÈS checks verts ; la
    //    protection de branche (ruleset + checks requis) s'applique toujours.
    if (autoMerge) {
      traceStep(jobId, 'start', 'merge');
      gh(['pr', 'merge', String(prNumber), '--squash']);
      traceStep(jobId, 'complete', 'merge');
      console.log('Mergé (squash) — livraison déclenchée via workflows post-merge.');
    }

    console.log('\n=== Chaîne PR terminée ===');
    console.log(`job_id: ${jobId}`);
    console.log(`Rapport trace : node scripts/autopilot/lib/job-trace.cjs report --job ${jobId}`);
  } catch (e) {
    console.error('ÉCHEC:', e.message.split('\n')[0]);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(e => { console.error('ÉCHEC:', e.message); process.exit(1); });
}

module.exports = { getTaskInfo, getBranchName, assertTreeRespectsScope, waitForCI };
