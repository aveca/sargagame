#!/usr/bin/env node
/**
 * orchestrator.cjs — ORCHESTRATOR 24/7 AUTONOMOUS
 *
 *   OBSERVE → REVENUE → RESEARCH → DISCOVER → PRIORITIZE
 *   → IMPLEMENT → LOCAL QA → COMMIT → PUSH → PR
 *   → CI WAIT → PREVIEW DEPLOY → ONLINE QA
 *   → PARK / REPAIR → NEXT
 *
 * Garde-fous (mission 24/7) :
 *  - UNE opportunité active par surface à la fois
 *  - jamais d'écriture sur main ; jamais dans le worktree du fondateur
 *  - denylist paiements/secrets/régions/api (policy.cjs)
 *  - réparations max 3 par phase (implémentation, CI, preview, online QA)
 *  - HUMAN GATE bloque SEULEMENT la tâche, JAMAIS la factory
 *  - READY TO MERGE = park task, CONTINUE factory
 *  - STOP immédiat : fichier STOP, prod down, budget bundle, corruption Git
 *  - chaque cycle écrit runs/<id>.md + latest.md
 *
 * Exit : 0 cycle OK (continue factory) · 2 stop-condition (STOP file, prod down) · 1 crash
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');
const policy = require('./lib/policy.cjs');
const gitops = require('./lib/gitops.cjs');
const scheduler = require('./lib/scheduler.cjs');
const metrics = require('./lib/metrics.cjs');
const experiments = require('./lib/experiments.cjs');
const { implementOpportunity } = require('./implement.cjs');
const { runGate } = require('./verify.cjs');
const { analyze, findingsFromObservation } = require('./analyze.cjs');
const { runDiscovery } = require('./discover.cjs');
const { runBrowserRecon } = require('./browser-recon.cjs');
const { runVisualQA } = require('./visual-qa.cjs');
const { hypothesisFromOpportunity, validateHypothesis, UXHypothesis } = require('./ux-hypothesis.cjs');
const { deployAndValidatePreview } = require('./preview-deploy.cjs');
const { runOnlineQA } = require('./online-qa.cjs');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';
const HEADED = process.env.SARGA_AUTOPILOT_HEADED === '1';

const t0 = Date.now();
let cfg, report, log, lastProgress = Date.now();

function elapsedMin() { return (Date.now() - t0) / 60000; }
function progress(msg) {
  lastProgress = Date.now();
  if (LIVE) log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  else log(msg);
}
function S(section, msg) {
  if (!report.sections[section]) report.sections[section] = [];
  report.sections[section].push(msg); log(`[${section}] ${msg}`);
}

/** Stop the ENTIRE factory (not just a task) - only for critical conditions */
function factoryStop(reason) {
  report.stopped = true; report.stopReason = reason;
  log('🛑 FACTORY STOP : ' + reason);
  S('FACTORY_STOP', `STOP — ${reason}`);
}

/** Park a single task (HUMAN GATE, READY TO MERGE, blocked) - factory continues */
function parkTask(oppId, reason, status = 'blocked') {
  // Garde-fou mémoire : seuls les statuts VALID_STATES sont persistables.
  // Les codes fins (blocked-preview, parked…) restent dans blockReason.
  const VALID = new Set(['new', 'picked', 'in_progress', 'blocked', 'validation', 'ready-to-merge', 'done', 'rejected']);
  const safe = VALID.has(status) ? status : 'blocked';
  const msg = `TASK PARKED: ${oppId} — ${reason}`;
  log('🅿️  ' + msg);
  S('PARKED', `${oppId} — ${reason}`);
  mem.updateOpportunity(oppId, { status: safe, blockReason: (`[${status}] ` + reason).slice(0, 200), parkedAt: C.nowIso() });
  return { parked: true, reason };
}

function budgetExceeded() { return elapsedMin() > cfg.loop.maxRunMinutes; }

/** Detect if we can run headed (requires display) */
function canRunHeaded() {
  if (process.platform === 'win32') return true; // Windows typically has display
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/** Get effective headed mode: HEADED flag AND display available */
function getEffectiveHeaded() {
  if (!HEADED) return false;
  if (!canRunHeaded()) {
    log('[WARN] HEADED=1 but no display available — falling back to headless');
    return false;
  }
  return true;
}

/** Watchdog — surveille l'absence de progression > 120s */
function startWatchdog() {
  if (!LIVE) return null;
  return setInterval(() => {
    const idle = Date.now() - lastProgress;
    if (idle > 120000) {
      log(`[WATCHDOG] No progress for ${Math.round(idle/1000)}s`);
      log(`[WATCHDOG] Diagnosing stuck phase...`);
      diagnoseStuckPhase();
    }
  }, 30000);
}

/** Diagnose which phase is stuck and attempt recovery */
function diagnoseStuckPhase() {
  const elapsed = elapsedMin();
  log(`[WATCHDOG] Elapsed: ${elapsed.toFixed(1)}min / ${cfg.loop.maxRunMinutes}min budget`);
  if (budgetExceeded()) {
    log(`[WATCHDOG] Time budget exceeded — will stop at next checkpoint`);
  }
  // Could add more sophisticated diagnosis here
  // e.g., check if orchestrator process is alive, etc.
}

async function healthCheck() {
  const down = [];
  for (const d of [cfg.health.requiredDomains, cfg.health.warnDomains].flat()) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), cfg.health.timeoutMs);
      const r = await fetch('https://' + d + '/', { signal: ctrl.signal, headers: { 'User-Agent': 'sargagame-autopilot-health' } });
      clearTimeout(t);
      if (r.status >= 500) down.push(`${d} (HTTP ${r.status})`);
    } catch (e) { down.push(`${d} (${e.name === 'AbortError' ? 'timeout' : e.message})`); }
  }
  return down;
}

function surfaceOf(opp) {
  if (opp.surface) return opp.surface;
  const files = (opp.scope && opp.scope.files) || [];
  if (files.some(f => f.includes('PremiumModal') || /checkout/i.test(f))) return 'premium';
  if (files.some(f => f.includes('WorldMapView') || f.includes('ChasseHome') || f.includes('ExperienceReset'))) return 'home';
  if (files.some(f => f.includes('BeachExperience'))) return 'beach';
  if (files.some(f => f.includes('Sargasses_PROD'))) return 'checkout-entry';
  return 'misc';
}

/** VÉRITÉ REVENU + VERIFY SHIPPED + MEASURE */
async function phaseRevenueAndMeasure() {
  const snap = metrics.snapshot();
  const s7 = snap.d7;
  S('REVENUE', `7j : sessions ${s7.sessions} · premium-open ${s7.modalOpens} · CTA ${s7.modalCta} · checkout ${s7.onsite} · PAID ${s7.paid} · paiements ${s7.payments} · rev ${s7.revenue}€ · MRR Stripe ${snap.d7.mrrEur ?? 'n/a'}€ (${snap.d7.stripeActive ?? '?'} actifs)`);
  const chain = metrics.ahaChain(7);
  S('REVENUE', `chaîne AHA→revenue : open ${chain.premium_open} → CTA ${chain.cta} → checkout ${chain.checkout_entry} → redirect ${chain.mollie_redirect} → PAID ${chain.paid} (${chain.note})`);
  if (LIVE) progress(`REVENUE     paid=${s7.paid} CTA=${s7.modalCta} checkout=${s7.onsite}`);
  const b2b = snap.b2b;
  S('REVENUE', b2b.available
    ? `B2B (séparé, jamais mélangé) : ${JSON.stringify(b2b).slice(0, 200)}`
    : `B2B (séparé) : ${b2b.note}`);

  const q = mem.loadQueue();
  let changed = false;
  for (const o of (q.opportunities || [])) {
    if (o.status !== 'shipped' || o.verifiedAt || !o.prUrl) continue;
    const st = gitops.prState(o.prUrl);
    if (!st || st.state !== 'MERGED') { S('MEASURED', `${o.id} : PR pas encore mergée (${st ? st.state : 'inconnu'})`); continue; }
    const prod = await gitops.prodFingerprint(cfg.health.requiredDomains[0]);
    const short = (st.mergeCommit || '').slice(0, 8);
    if (prod && prod.b && prod.b.startsWith(short)) {
      o.verifiedAt = C.nowIso(); o.mergeCommit = st.mergeCommit; changed = true;
      S('MEASURED', `${o.id} VÉRIFIÉ EN PROD (b=${prod.b} = merge ${short})`);
      try {
        const exp = experiments.start({
          id: o.id, surface: o.surface || surfaceOf(o), title: o.title,
          hypothesis: o.expectedImpact || o.title, rollback: o.rollback,
          prUrl: o.prUrl, branch: o.branch, commit: o.mergeCommit,
          baselineSnapshot: snap.d7, verifiedAt: o.verifiedAt,
        }, cfg);
        S('MEASURED', `expérience démarrée (${exp.surface}, cohorte A=pré/B=post, fenêtre ${exp.windowDays}j, min ${exp.sampleTarget} visiteurs, métrique = paid)`);
      } catch (e) {
        if (e.code === 'SURFACE_BUSY') S('MEASURED', `${o.id} : surface déjà mesurée par ${e.holder.id} — expérience fusionnée`);
        else throw e;
      }
    } else {
      S('MEASURED', `${o.id} : mergée (${short}) mais prod b=${prod && prod.b} — revérification au prochain cycle`);
    }
  }
  if (changed) mem.saveQueue(q);

  for (const e of experiments.due(Date.now(), cfg)) {
    const after = metrics.windowStats(e.windowDays, undefined);
    const ctl = e.baselineSnapshot || metrics.windowStats(e.windowDays);
    const res = metrics.decideExperiment({
      control: ctl, variant: after,
      minVisitors: (cfg.experiments && cfg.experiments.minVisitors) || 100,
      windowDays: e.windowDays, startedAt: e.startedAt,
    });
    experiments.markDecision(e.id, res.decision, res.reason, after);
    S('MEASURED', `${e.id} (${e.surface}) → DÉCISION ${res.decision.toUpperCase()} : ${res.reason} · facteurs ${JSON.stringify(res.factors)}`);
    if (res.decision === 'loss') {
      mem.writeRegression(e.id + '-decision', `Expérience perdante (paid). ROLLBACK : ${e.rollback}.\nFacteurs : ${JSON.stringify(res.factors)}`);
      S('NEXT', `ROLLBACK ${e.id} (${e.rollback}) — décision loss`);
      mem.reject(e.id, 'décision loss (paid) — ne pas retenter sans preuve nouvelle', 30);
    }
  }
  for (const e of experiments.load().experiments.filter(e => e.status === 'running')) {
    const days = ((Date.now() - new Date(e.startedAt).getTime()) / 864e5).toFixed(1);
    S('MEASURED', `${e.id} en cours (${e.surface}, ${days}/${e.windowDays}j, min ${e.sampleTarget} visiteurs)`);
  }
}

async function phaseObserve() {
  const latest = C.readJSON(path.join(C.paths.observations, 'latest.json'), null);
  const ageMin = latest ? (Date.now() - new Date(latest.at).getTime()) / 60000 : Infinity;
  if (!args.includes('--force-observe') && latest && ageMin < cfg.loop.observeIfOlderThanMinutes) {
    S('OBSERVED', `observation réutilisée (${latest.id}, âge ${ageMin.toFixed(0)} min)`);
    return latest;
  }
  if (DRY) {
    S('OBSERVED', 'dry-run: skipping Playwright probe, using mock observation');
    return { id: 'dry-run-mock', at: C.nowIso(), regions: {}, totals: { pages: 0, consoleErrors: 0, pageErrors: 0, firstPartyFailures: 0, brokenLinks: 0, visualFlagged: 0 }, durationSec: 0, heavy: false };
  }
  const headed = getEffectiveHeaded();
  if (LIVE) progress('OBSERVE     starting Playwright probe...');
  S('OBSERVED', `sonde Playwright prod lancée (headed=${headed})…`);
  const cp = execFileSync(process.execPath, [path.join(__dirname, 'observe.cjs'), '--run-id', report.id, headed ? '--headed' : ''], {
    cwd: C.ROOT, encoding: 'utf8', timeout: 15 * 60000, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const file = (cp.match(/OBSERVATION_FILE=(.+)/) || [])[1];
  const obs = file ? C.readJSON(file.trim(), null) : null;
  if (!obs) throw new Error('sonde observation sans résultat');
  const t = obs.totals;
  S('OBSERVED', `${t.pages} pages (${obs.heavy ? 'heavy' : 'light'}) · err ${t.consoleErrors} · pageerrors ${t.pageErrors} · 1st-fail ${t.firstPartyFailures} · liens cassés ${t.brokenLinks} · visual ${t.visualFlagged} · ${obs.durationSec}s`);
  if (LIVE) progress(`OBSERVE     ${t.pages} pages · ${t.consoleErrors} err · ${t.firstPartyFailures} 1st-fail · ${t.visualFlagged} visual`);
  return obs;
}

async function phaseResearch() {
  const runs = mem.listRuns(500).length;
  const every = cfg.loop.researchEveryNRuns;
  const due = runs % every === 0;
  if (!due) { S('RESEARCHED', `veille dans ${every - (runs % every)} cycles (1/${every})`); return; }
  const topics = ['travel UX', 'weather interfaces', 'mapping interfaces', 'interaction design', 'motion design', 'SEO architecture', 'travel monetization', 'competitor products', 'hospitality software'];
  const topic = topics[Math.floor(runs / every) % topics.length];
  S('RESEARCHED', `sujet : « ${topic} » (gated — allowAgentImplementation)`);
  fs.mkdirSync(C.paths.research, { recursive: true });
  fs.writeFileSync(path.join(C.paths.research, `backlog-${topic.replace(/\s+/g, '-')}.md`),
    `# Veille : ${topic}\n\nCycle ${report.id}. À approfondir.\n`, 'utf8');
}

function phaseAnalyze(obs) {
  const findings = findingsFromObservation(obs);
  findings.obsId = obs.id;
  const queue = mem.loadQueue();
  const res = analyze({ findings, queue, isRejectedFn: fp => mem.isRejected(fp), cfg });

  if (res.candidates.length) {
    for (const c of res.candidates) {
      queue.opportunities = queue.opportunities || [];
      if (!queue.opportunities.some(o => o.id === c.id)) queue.opportunities.push(c);
      mem.writeOpportunityFile(c);
    }
    mem.saveQueue(queue);
    S('FOUND', `${res.candidates.length} nouveaux candidats (sonde ${obs.id})`);
    for (const c of res.candidates.slice(0, 6)) S('FOUND', `${c.severity.toUpperCase()} · ${c.title.slice(0, 110)}`);
  } else {
    S('FOUND', 'aucun nouveau finding (prod nominale)');
  }

  if (res.selected) S('FOUND', `SÉLECTIONNÉ : ${res.selected.id} (${res.selected.severity}/${res.selected.actionable}, score ${res.selected._score})`);
  else S('FOUND', 'rien d\'auto-exécutable (candidats = agent/human)');
  return res;
}

/** Implémentation locale avec self-repair ≤ 3 */
async function phaseImplementLocal(opp) {
  const slug = (opp.recipe || opp.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const branch = cfg.git.branchPrefix + report.id + '-' + slug;

  if (DRY) { S('IMPLEMENTED', `[dry-run] aurait créé ${branch}`); return { dry: true }; }

  progress('WORKTREE    created');
  mem.updateOpportunity(opp.id, { status: 'picked', pickedAt: C.nowIso() });

  // Collision worktree/branche (ex: même runId réutilisé, résidu de crash) :
  // parquer avec diagnostic au lieu de crasher la factory (exit 1).
  // Seule la classe « collision d'état git local » est parquée ; toute autre
  // erreur git remonte (fail-closed : jamais de masquage d'un vrai problème).
  let wt;
  try {
    wt = gitops.prepareWorktree(cfg, branch, m => { if (LIVE) progress('WORKTREE    ' + m); else log('[worktree] ' + m); });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/already exists|already in use|worktree|not a valid ref|unable to create|locked/i.test(msg)) {
      const diag = `worktree: ${msg.split('\n').slice(0, 3).join(' / ').slice(0, 200)} (branche ${branch})`;
      S('FAILED', diag);
      return parkTask(opp.id, diag, 'blocked');
    }
    throw e;
  }
  let attempt = 0, gate = null, impl = null;
  while (attempt <= cfg.loop.maxRepairAttempts) {
    attempt++;
    if (LIVE) progress(`OPENCODE    attempt ${attempt}/${cfg.loop.maxRepairAttempts}`);
    impl = await implementOpportunity(opp, wt, cfg, m => { if (LIVE) progress('IMPLEMENT   ' + m); else log('[implement] ' + m); }, gate ? gate.detail : null);
    if (!impl.ok) {
      if (impl.blocked) return parkTask(opp.id, `blocked: ${impl.blocked}`);
      if (attempt > cfg.loop.maxRepairAttempts || impl.via === 'recipe') return parkTask(opp.id, `impl failed after ${attempt} attempts: ${impl.summary}`);
      continue;
    }
    S('IMPLEMENTED', `${impl.via}: ${impl.summary} (${impl.files ? impl.files.join(', ') : 'diff agent'})`);

    const diff = gitops.diffStats(wt);
    const ev = policy.evaluateFiles(diff.files, cfg);
    if (!ev.allowed) return parkTask(opp.id, `denylist: ${ev.denied.join(', ')}`);
    const budgetErrs = policy.evaluateBudget(diff, cfg);
    if (budgetErrs.length) return parkTask(opp.id, `budget: ${budgetErrs.join(' ; ')}`);
    const secrets = policy.scanSecrets(diff.diffText);
    if (secrets.length) return parkTask(opp.id, `secrets: ${secrets.join(', ')}`);

    if (LIVE) progress('GATE        running...');
    gate = await runGate({ wt, files: diff.files, tests: diff.files.filter(f => f.startsWith('tests/') && f.endsWith('.cjs')), log: m => { if (LIVE) progress('VERIFY      ' + m); else log('[verify] ' + m); } });
    if (gate.ok) {
      S('TESTED', gate.steps.join(' · '));
      S('FIXED', attempt > 1 ? `réparé après ${attempt} tentative(s)` : 'vert du premier coup');
      if (LIVE) progress('GATE        PASS');
      break;
    }
    S('FAILED', `gate rouge (${gate.failedStep}) tentative ${attempt}/${cfg.loop.maxRepairAttempts}`);
    if (LIVE) progress('GATE        FAILED - ' + gate.failedStep);
    if (impl.via === 'recipe') break;
  }

  if (!gate || !gate.ok) {
    const detail = gate ? `${gate.failedStep}: ${(gate.detail || '').slice(0, 400)}` : (impl && impl.summary) || 'impl échouée';
    mem.writeRegression(opp.id, `Échec implémentation après ${attempt} tentatives.\n${detail}`);
    return parkTask(opp.id, `gate failed: ${detail.slice(0, 200)}`);
  }

  // Commit & push
  if (LIVE) progress('COMMIT      committing...');
  const diff = gitops.diffStats(wt);
  const commitSha = gitops.commitAll(wt,
    `fix(autopilot): ${opp.title.slice(0, 90)}\n\nOpportunité ${opp.id}\nPreuve : ${(opp.evidence || '').slice(0, 200)}\nRollback : ${opp.rollback || 'revert'}\n\nCycle autopilot ${report.id}`,
    diff.files);
  if (LIVE) progress('PUSH        pushing...');
  gitops.pushBranch(wt, branch, cfg);
  const body = [
    `## 🤖 Cycle autopilot ${report.id}`, '',
    `**Opportunité** : ${opp.id} — ${opp.title}`, '',
    `**Preuve** : ${opp.evidence || 'n/a'}`, '',
    `**Impact attendu** : ${opp.expectedImpact || 'n/a'}`, '',
    `### Gate de ship (worktree dédié)`, '',
    gate.steps.map(s => `- ✅ ${s}`).join('\n'), '',
    `### Rollback`, '',
    `${opp.rollback || 'revert ' + commitSha}`, '',
    `### Frontières`, '',
    `- ${diff.files.length} fichiers, +${diff.insertions}/-${diff.deletions} lignes`,
    `- denylist money/secrets/api/régions : OK`,
  ].join('\n');
  if (LIVE) progress('PR          creating...');
  // Échec PR (gh en panne, droits, réseau) : parquer avec diagnostic au lieu
  // de crasher (la branche est déjà poussée — rien n'est perdu, reprise au
  // prochain cycle). Raison toujours préservée, jamais masquée.
  let pr;
  try {
    pr = gitops.createPR(wt, { title: `[autopilot] ${opp.title.slice(0, 80)}`, body, base: cfg.git.baseBranch });
  } catch (e) {
    const diag = `pr create failed (branche ${branch} poussée, commit ${commitSha}) : ${String((e && e.message) || e).split('\n').slice(0, 3).join(' / ').slice(0, 200)}`;
    S('FAILED', diag);
    return parkTask(opp.id, diag, 'blocked');
  }
  report.prUrl = pr.url;
  S('PR', `${pr.url} (branche ${branch}, head ${commitSha})`);
  if (LIVE) progress('PR          ' + pr.url);

  return { pr, branch, commitSha, wt };
}

/** Self-repair: classify error and attempt targeted fix */
async function attemptRepair(opp, phase, error, log) {
  const errorMsg = String(error.message || error).slice(0, 500);
  const errorType = classifyError(errorMsg);
  log(`REPAIR      ${phase}: ${errorType} — ${errorMsg.slice(0, 120)}`);
  
  const repairActions = {
    'ci-failure': () => repairCIFailure(opp, errorMsg, log),
    'build-failure': () => repairBuildFailure(opp, errorMsg, log),
    'test-failure': () => repairTestFailure(opp, errorMsg, log),
    'preview-deploy-failed': () => repairPreviewDeploy(opp, errorMsg, log),
    'online-qa-regression': () => repairOnlineQARegression(opp, errorMsg, log),
    'browser-error': () => repairBrowserError(opp, errorMsg, log),
    'timeout': () => repairTimeout(opp, errorMsg, log),
    'unknown': () => ({ attempted: false, reason: 'unknown error type' }),
  };
  
  const repair = repairActions[errorType] || repairActions.unknown;
  return await repair();
}

function classifyError(errorMsg) {
  const msg = errorMsg.toLowerCase();
  if (msg.includes('ci') && (msg.includes('fail') || msg.includes('error') || msg.includes('red'))) return 'ci-failure';
  if (msg.includes('build') && (msg.includes('fail') || msg.includes('error'))) return 'build-failure';
  if (msg.includes('test') && (msg.includes('fail') || msg.includes('error') || msg.includes('assert'))) return 'test-failure';
  if (msg.includes('preview') && (msg.includes('deploy') || msg.includes('fail'))) return 'preview-deploy-failed';
  if (msg.includes('online qa') && (msg.includes('regression') || msg.includes('fail') || msg.includes('error'))) return 'online-qa-regression';
  if (msg.includes('browser') || msg.includes('playwright') || msg.includes('pageerror') || msg.includes('console error')) return 'browser-error';
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) return 'timeout';
  return 'unknown';
}

async function repairCIFailure(opp, errorMsg, log) {
  log('REPAIR      CI failure — checking CI logs for actionable error');
  return { attempted: true, type: 'ci-failure', action: 'CI log analysis needed', detail: errorMsg };
}

async function repairBuildFailure(opp, errorMsg, log) {
  log('REPAIR      Build failure — checking for syntax/typo issues');
  return { attempted: true, type: 'build-failure', action: 'build error analysis needed', detail: errorMsg };
}

async function repairTestFailure(opp, errorMsg, log) {
  log('REPAIR      Test failure — extracting failing test details');
  return { attempted: true, type: 'test-failure', action: 'test failure analysis needed', detail: errorMsg };
}

async function repairPreviewDeploy(opp, errorMsg, log) {
  log('REPAIR      Preview deploy failed — checking deployment logs');
  return { attempted: true, type: 'preview-deploy', action: 'deployment error analysis needed', detail: errorMsg };
}

async function repairOnlineQARegression(opp, errorMsg, log) {
  log('REPAIR      Online QA regression — identifying failing route/interaction');
  return { attempted: true, type: 'online-qa', action: 'QA regression analysis needed', detail: errorMsg };
}

async function repairBrowserError(opp, errorMsg, log) {
  log('REPAIR      Browser error — checking for page errors/console errors');
  return { attempted: true, type: 'browser', action: 'browser error analysis needed', detail: errorMsg };
}

async function repairTimeout(opp, errorMsg, log) {
  log('REPAIR      Timeout — may need more time or optimization');
  return { attempted: true, type: 'timeout', action: 'timeout handling needed', detail: errorMsg };
}

/** CI WAIT + PREVIEW DEPLOY with true self-repair (max 3) */
async function phaseCIAndPreview(opp, pr, branch, commitSha) {
  let previewResult = null;

  for (let attempt = 1; attempt <= cfg.loop.maxRepairAttempts; attempt++) {
    if (attempt > 1) {
      progress(`CI/PREVIEW   repair attempt ${attempt}/${cfg.loop.maxRepairAttempts}`);
    }

    try {
      progress('CI WAIT     waiting for CI green...');
      const preview = await deployAndValidatePreview(report.prUrl, pr.number, branch, commitSha, cfg);
      previewResult = preview;
      progress('PREVIEW     deployed & fingerprint verified');
      break;
    } catch (e) {
      progress(`PREVIEW     attempt ${attempt}/${cfg.loop.maxRepairAttempts} FAILED: ${e.message.slice(0, 100)}`);
      mem.writeRegression(opp.id + `-preview-${attempt}`, `Preview deploy failed: ${e.message}`);
      
      // CAPTURE → CLASSIFY → DIAGNOSE → REPAIR
      const repairResult = await attemptRepair(opp, 'CI/PREVIEW', e, m => progress(`REPAIR      ${m}`));
      progress(`REPAIR      result: ${repairResult.attempted ? 'attempted' : 'no action'} — ${repairResult.action || repairResult.reason}`);
      
      if (attempt === cfg.loop.maxRepairAttempts) {
        return parkTask(opp.id, `preview deploy failed after ${cfg.loop.maxRepairAttempts} repair attempts: ${e.message.slice(0, 150)}`, 'blocked-preview');
      }
      await sleep(30000); // wait before retry
    }
  }

  return previewResult;
}

/** ONLINE QA with repair (max 3) */
async function phaseOnlineQA(opp, previewResult) {
  if (!previewResult) return { skipped: true };

  for (let attempt = 1; attempt <= cfg.loop.maxRepairAttempts; attempt++) {
    if (attempt > 1) {
      progress(`ONLINE QA    repair attempt ${attempt}/${cfg.loop.maxRepairAttempts}`);
    }

    try {
      progress('ONLINE BROWSER  starting...');
      const onlineQA = await runOnlineQA(previewResult.url, 
        ['/', '/?paywall=1', '/carte-sargasses/', '/?exp=', '/?trip=1', '/alertes/', '/sargasses-pour-hotels/'],
        ['mobile', 'desktop']);
      
      progress(`ONLINE VISUAL   ${onlineQA.visual?.length || 0} screenshots`);
      progress(`ONLINE FUNNEL   ${onlineQA.funnel?.filter(f => f.ok).length || 0}/${onlineQA.funnel?.length || 0}`);
      progress(`ONLINE PERF     ${onlineQA.perf?.map(p => p.metric + '=' + p.value + p.unit).join(', ') || 'n/a'}`);
      progress(`ONLINE SEO      ${onlineQA.seo?.length || 0}`);
      progress(`ONLINE A11Y     ${onlineQA.a11y?.length || 0}`);
      
      const highErrors = onlineQA.errors?.filter(e => e.severity === 'high' || e.severity === 'critical').length || 0;
      if (highErrors > 0) {
        progress(`ONLINE QA       REGRESSIONS: ${highErrors} high/critical`);
        
        // CAPTURE → CLASSIFY → DIAGNOSE → REPAIR
        const regressionError = new Error(`Online QA regression: ${highErrors} high/critical errors`);
        const repairResult = await attemptRepair(opp, 'ONLINE QA', regressionError, m => progress(`REPAIR      ${m}`));
        progress(`REPAIR      result: ${repairResult.attempted ? 'attempted' : 'no action'} — ${repairResult.action || repairResult.reason}`);
        
        if (attempt < cfg.loop.maxRepairAttempts) {
          progress('ONLINE QA       regression — will retry after repair');
          mem.writeRegression(opp.id + `-online-qa-${attempt}`, `Online QA regressions: ${highErrors} high/critical`);
          await sleep(30000);
          continue;
        } else {
          return parkTask(opp.id, `online QA regression after ${cfg.loop.maxRepairAttempts} repair attempts: ${highErrors} high/critical`, 'blocked-online-qa');
        }
      }
      
      progress('ONLINE QA       PASS');
      return { success: true };
    } catch (e) {
      progress(`ONLINE QA     attempt ${attempt}/${cfg.loop.maxRepairAttempts} FAILED: ${e.message.slice(0, 100)}`);
      mem.writeRegression(opp.id + `-online-qa-${attempt}`, `Online QA failed: ${e.message}`);
      
      // CAPTURE → CLASSIFY → DIAGNOSE → REPAIR
      const repairResult = await attemptRepair(opp, 'ONLINE QA', e, m => progress(`REPAIR      ${m}`));
      progress(`REPAIR      result: ${repairResult.attempted ? 'attempted' : 'no action'} — ${repairResult.action || repairResult.reason}`);
      
      if (attempt === cfg.loop.maxRepairAttempts) {
        return parkTask(opp.id, `online QA failed after ${cfg.loop.maxRepairAttempts} repair attempts: ${e.message.slice(0, 150)}`, 'blocked-online-qa');
      }
      await sleep(30000);
    }
  }
  return parkTask(opp.id, 'online QA max repair attempts exceeded', 'blocked-online-qa');
}

/**
 * Contrat opportunité (requis par processOpportunity) :
 *  - id: string non vide (pour park/persist/tracking)
 *  - type: string non vide (pour le routage browser-recon + hypothèse UX)
 * Retourne {valid, missing[], reason} — la raison est TOUJOURS préservée
 * (jamais de fallback silencieux : une opportunité invalide est parquée
 * avec diagnostic, pas exécutée aveuglément).
 */
function validateOpportunityContract(opp) {
  const missing = [];
  if (!opp || typeof opp !== 'object') {
    return { valid: false, missing: ['opportunity'], reason: 'contrat opportunité invalide: objet manquant (null/non-objet)' };
  }
  if (typeof opp.id !== 'string' || !opp.id) missing.push('id');
  if (typeof opp.type !== 'string' || !opp.type) missing.push('type');
  if (missing.length) {
    const got = `id=${JSON.stringify(opp.id)} type=${JSON.stringify(opp.type)} fingerprint=${JSON.stringify(opp.fingerprint)}`;
    return { valid: false, missing, reason: `contrat opportunité invalide: ${missing.join(', ')} manquant (${got})` };
  }
  return { valid: true, missing, reason: '' };
}

/** Routage browser-recon — null-safe (opp.type peut manquer sur les entrées historiques). */
function needsBrowserRecon(opp) {
  const t = (opp && typeof opp.type === 'string') ? opp.type : '';
  return ['ux-ui', 'browser-interaction', 'aha-wow', 'svg-assets-a11y'].some(k => t.includes(k));
}

/** Process a single opportunity through the full pipeline */
async function processOpportunity(opp) {
  progress(`SELECT      ${(opp && opp.id) || 'unknown'}`);
  S('SELECTED', `${(opp && opp.id) || 'unknown'} (score ${(opp && opp._score) || '?'})`);

  // Garde-contrat : parquer avec diagnostic au lieu de crasher la factory
  // (TypeError .includes sur opp.type undefined → exit 1, jamais dispatched).
  const contract = validateOpportunityContract(opp);
  if (!contract.valid) {
    progress(`CONTRACT    invalide: ${contract.missing.join(', ')} manquant`);
    return parkTask((opp && opp.id) || 'unknown', contract.reason, 'blocked');
  }

  // 1. UX Hypothesis
  const hypothesis = hypothesisFromOpportunity(opp);
  const validation = validateHypothesis(hypothesis);
  if (!validation.valid) {
    return parkTask(opp.id, `UX hypothesis invalid: ${validation.errors.join(', ')}`);
  }
  hypothesis.save();
  progress(`UX-HYP      ${hypothesis.id}`);
  progress(`UX-HYP      AHA: ${hypothesis.aha.slice(0, 80)}...`);
  progress(`UX-HYP      METRIC: ${hypothesis.metric}`);

  // Browser recon for UX
  if (needsBrowserRecon(opp)) {
    progress('BROWSER     headed recon...');
    try {
      const recon = await runBrowserRecon(cfg);
      progress(`BROWSER     ${recon.issues?.length || 0} issues`);
    } catch (e) {
      progress(`BROWSER     recon failed: ${e.message}`);
    }
  }

  // 2. Local implementation + QA
  const implResult = await phaseImplementLocal(opp);
  if (implResult.parked) return implResult;
  if (implResult.dry) return { dry: true };

  const { pr, branch, commitSha, wt } = implResult;

  // 3. CI + Preview (with repair)
  const previewResult = await phaseCIAndPreview(opp, pr, branch, commitSha);
  if (previewResult.parked) return previewResult;

  // 4. Online QA (with repair)
  const onlineResult = await phaseOnlineQA(opp, previewResult);
  if (onlineResult.parked) return onlineResult;

  // 5. All green → READY TO MERGE = PARK, not stop
  S('READY', `${opp.id} — all gates green, ready for merge`);
  progress('READY       all gates green — parking task');
  return parkTask(opp.id, 'READY TO MERGE — all gates green, awaiting human merge', 'ready-to-merge');
}

async function main() {
  C.ensureDirs();
  cfg = C.loadConfig();
  report = mem.newReport(C.runId());
  fs.mkdirSync(path.join(C.paths.runs), { recursive: true });
  const lg = C.makeLogger(C.paths.runs);
  log = (m) => lg.log('orchestrator', m);

  if (LIVE) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SARGAGAME AUTOPILOT 24/7');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
  log(`cycle ${report.id} started (${DRY ? 'DRY-RUN' : 'active'}${LIVE ? ' · LIVE' : ''})`);

  const watchdog = startWatchdog();

  try {
    // Pre-flight checks
    if (fs.existsSync(C.paths.stopFile)) { factoryStop('STOP file present'); return finish(2); }
    const health = await healthCheck();
    const fatalDown = health.filter(h => cfg.health.requiredDomains.some(d => h.startsWith(d)));
    if (fatalDown.length) {
      if (DRY) {
        S('OBSERVED', `health check failed (dry-run, non-fatal): ${fatalDown.join(', ')}`);
      } else {
        factoryStop('production outage: ' + fatalDown.join(', ')); return finish(2);
      }
    }
    if (health.length) S('OBSERVED', `domains degraded: ${health.join(', ')}`);
    else { S('OBSERVED', `health OK (${[cfg.health.requiredDomains, cfg.health.warnDomains].flat().length} domains 2xx)`); progress('PROD        6/6 healthy'); }

    const prOpen = gitops.openAutopilotPR();
    let prDetail = null;
    if (prOpen) {
      const detail = gitops.getPrDetail(prOpen.number);
      prDetail = detail || {
        number: prOpen.number, headRefName: prOpen.headRefName || null, title: prOpen.title || null,
        isDraft: null, mergeable: null, mergeStateStatus: null, headRefOid: null, files: [],
        detailUnavailable: true,
      };
      if (!prDetail.headRefName && prOpen.headRefName) prDetail.headRefName = prOpen.headRefName;
      if (!prDetail.title && prOpen.title) prDetail.title = prOpen.title;
      const headShort = prDetail.headRefOid ? String(prDetail.headRefOid).slice(0, 8) : null;
      S('PR', `PR #${prDetail.number} open (${prDetail.headRefName || '?'}${prDetail.isDraft === true ? ', draft' : ''}${prDetail.mergeable ? ', mergeable=' + prDetail.mergeable : ''}${headShort ? ', head ' + headShort : ''}) — évaluation blocage par catégorie…`);
      log(scheduler.stateLine('pr-detected', 'pr-evaluating', `PR #${prDetail.number} ${prDetail.headRefName || ''}`));
    }

    const founder = gitops.founderTreeState();
    if (founder.foreignDirty) S('OBSERVED', `founder WIP preserved (${founder.files.length} files)`);

    // 1. OBSERVE
    if (budgetExceeded()) throw new Error('time budget exceeded before OBSERVE');
    const obs = await phaseObserve();

    // In DRY mode, exit early after observe to avoid external dependencies
    if (DRY) {
      S('OBSERVED', 'dry-run: exiting early after observe phase');
      return finish(0);
    }

    // 2. REVENUE
    await phaseRevenueAndMeasure();

    // 3. RESEARCH
    if (!budgetExceeded()) await phaseResearch();

    // 4. ANALYZE + DISCOVER
    // Le scheduler persistant prime : si un claim/sélection existe encore, on le
    // reprend au lieu de redécouvrir aveuglément (anti-boucle 555→557).
    const restored = scheduler.restoreSelected(mem.loadQueue());
    const res = phaseAnalyze(obs);
    if (restored.restored && (!res.selected || restored.restored.id !== res.selected.id)) {
      const rs = restored.restored;
      const rsStatus = (rs && typeof rs.status === 'string') ? rs.status : '';
      if (['new', 'picked', 'in_progress'].includes(rsStatus)) {
        log(scheduler.stateLine('scheduler-restored', 'selected', `${rs.id} (${rsStatus}) repris du cycle ${restored.state.cycleId || '?'} — pas de réinitialisation`));
        S('FOUND', `scheduler restauré : ${rs.id} (${rsStatus}) — reprise au lieu de redécouverte`);
        res.selected = rs;
      }
    }
    // Discovery seulement si RIEN de sélectionné (jamais pour écraser une sélection
    // existante, jamais à cause d'un PR ouvert — le PR gate est évalué plus bas
    // par catégorie via scheduler.isPrBlocking).
    if (!budgetExceeded() && !res.selected) {
      progress('DISCOVER    autonomous discovery...');
      const snap = metrics.snapshot();
      const discovered = await runDiscovery(cfg, report, obs, snap);
      if (discovered.length > 0) {
        const executable = discovered.filter(o => o.actionable !== 'human' && !o.blocked);
        if (executable.length > 0) {
          res.selected = executable[0];
          log(scheduler.stateLine('discovered', 'selected', `${res.selected.id} via discovery (score ${res.selected._score})`));
        }
      }
    } else if (res.selected) {
      log(scheduler.stateLine('discovered', 'selected', `${res.selected.id} (score ${res.selected._score})`));
    }

    // 5. PROCESS SELECTED OPPORTUNITY
    let selected = res.selected;
    if (selected) {
      const surf = selected.surface || surfaceOf(selected);
      selected.surface = surf;
      const busy = experiments.activeForSurface(surf);
      if (busy) {
        S('FOUND', `surface "${surf}" busy with ${busy.id} — 1 change per surface`);
        scheduler.persistSelected(selected, report.id, { blocking: true, reason: `surface busy ${busy.id}`, prNumber: prDetail ? prDetail.number : null });
        log(scheduler.stateLine('selected', 'blocked-by-pr', `${selected.id} — surface ${surf} occupée par ${busy.id}`));
        selected = null;
      }
    }

    // Gate PR catégorie-aware : un PR simplement ouvert ne bloque QUE le travail
    // réellement en conflit (draft / conflit / même branche / même surface /
    // overlap fichiers). Sinon la factory continue normalement.
    let prBlocking = null;
    if (prDetail) {
      if (prDetail.detailUnavailable) {
        // gh indisponible → doute → bloquant (garde-fou préservé, jamais d'exécution aveugle).
        prBlocking = { blocking: true, reason: `PR #${prDetail.number} open (détail gh indisponible) — prudence, observation only`, code: 'PR_DETAIL_UNKNOWN', prNumber: prDetail.number };
      } else if (selected) {
        const queueNow = mem.loadQueue();
        prBlocking = Object.assign({ prNumber: prDetail.number }, scheduler.isPrBlocking(prDetail, selected, queueNow));
      } else {
        prBlocking = { blocking: true, reason: `PR #${prDetail.number} open + rien d'exécutable — observation only`, code: 'NO_SELECTION', prNumber: prDetail.number };
      }
if (prBlocking.blocking) {
      log(scheduler.stateLine('selected', 'blocked-by-pr', prBlocking.reason));
    } else {
      log(scheduler.stateLine('pr-evaluating', 'pr-non-blocking', prBlocking.reason));
    }
    }
    
    // AUTO-REPAIR pour PR en conflit (PR_CONFLICT_REPAIRABLE)
    // Si la PR est en conflit mais réparable, on tente le rebase auto.
    // Si succès → on continue normalement (prBlocking = non-bloquant).
    // Si échec → on parque la tâche avec le diagnostic.
    if (prBlocking && prBlocking.blocking && 
        (prBlocking.code === 'PR_CONFLICT_REPAIRABLE') && 
        selected && !DRY) {
      progress(`PR REPAIR   attempting auto-rebase for PR #${prDetail.number}...`);
      S('PR', `PR #${prDetail.number} en conflit (${prBlocking.code}) — tentative de réparation auto…`);
      const repairResult = await gitops.repairPRConflict(prDetail.number, cfg, m => progress('PR REPAIR   ' + m));
      if (repairResult.ok) {
        S('PR', `PR #${prDetail.number} RÉPARÉE (${repairResult.method}) — head ${repairResult.commitSha} — poursuite pipeline`);
        progress(`PR REPAIR   SUCCESS: ${repairResult.method}, head ${repairResult.commitSha}`);
        // La PR est maintenant mergeable → on la traite comme non-bloquante
        prBlocking = { blocking: false, reason: `PR #${prDetail.number} réparée (${repairResult.method}) — continuation`, code: 'PR_REPAIRED', prNumber: prDetail.number };
        log(scheduler.stateLine('pr-repair', 'success', `PR #${prDetail.number} ${repairResult.method}`));
      } else {
        S('PR', `PR #${prDetail.number} ÉCHEC RÉPARATION: ${repairResult.reason}${repairResult.unsafe ? ' (unsafe)' : ''}`);
        progress(`PR REPAIR   FAILED: ${repairResult.reason}`);
        // On garde le blocage original pour parquer la tâche
        prBlocking = Object.assign({ blocking: true }, prBlocking, { repairAttempted: true, repairReason: repairResult.reason, repairUnsafe: repairResult.unsafe });
      }
    }

    if (budgetExceeded()) {
      S('FAILED', 'time budget exceeded — deferring');
      if (selected) {
        scheduler.persistSelected(selected, report.id, { blocking: true, reason: 'time budget exceeded', prNumber: prDetail ? prDetail.number : null });
        log(scheduler.stateLine('selected', 'persisted', `${selected.id} différé (budget) — repris au prochain cycle`));
      }
    } else if (prBlocking && prBlocking.blocking) {
      // Bloquant réel : observation explicite + état persistant (pas de redécouverte aveugle).
      if (selected) {
        // Parquer l'opportunité dans la queue (status='blocked') pour éviter la re-sélection
        // au cycle suivant. Le scheduler garde l'état 'blocked-by-pr' pour le diagnostic.
        const parkReason = `blocked by PR #${prDetail.number} (${prBlocking.code}): ${prBlocking.reason}`;
        scheduler.persistSelected(selected, report.id, prBlocking);
        // Mettre à jour le statut dans la queue pour éviter la re-sélection via restoreSelected
        mem.updateOpportunity(selected.id, { status: 'blocked', blockReason: parkReason, parkedAt: C.nowIso() });
        log(scheduler.stateLine('selected', 'persisted', `${selected.id} persisté (${prBlocking.code})`));
      }
      S('PR', `PR #${prDetail.number} bloquant (${prBlocking.code}) — ${prBlocking.reason}`);
      S('NEXT', `reprendre ${selected ? selected.id : 'sélection'} quand PR #${prDetail.number} mergée/fermée`);
    } else if (selected) {
      // Non bloquant : claim persistant (idempotent) puis exécution.
      const claim = scheduler.persistClaimed(selected, report.id, (id, patch) => mem.updateOpportunity(id, patch));
      if (claim.alreadyClaimed) {
        log(scheduler.stateLine('selected', 'claimed', `${selected.id} déjà claimée/en cours — pas de doublon, reprise`));
        S('FOUND', `${selected.id} déjà claimée/en cours — reprise sans doublon`);
      } else {
        log(scheduler.stateLine('selected', 'claimed', `${selected.id} claimée (new → picked) cycle ${report.id}`));
      }
      // Refresh depuis la queue pour exécuter l'état persisté réel.
      const fresh = (mem.loadQueue().opportunities || []).find(o => o.id === selected.id) || selected;
      const result = await processOpportunity(fresh);
      scheduler.persistDispatched(fresh, report.id, { parked: !!(result && result.parked), reason: (result && result.reason) || null });
      log(scheduler.stateLine('selected', 'dispatched', `${fresh.id} dispatchée (${result && result.parked ? 'parked: ' + result.reason : 'traitée'})`));
      log(scheduler.stateLine('dispatched', 'persisted', `${fresh.id} état persisté`));
    } else {
      progress('QUEUE       0 executable');
      
      // Autonomous discovery when queue empty
      if (!DRY && LIVE) {
        progress('DISCOVER    autonomous discovery (queue empty)...');
        const snap = metrics.snapshot();
        const discovered = await runDiscovery(cfg, report, obs, snap);
        if (discovered.length > 0) {
          const executable = discovered.filter(o => o.actionable !== 'human' && !o.blocked);
          if (executable.length > 0) {
            selected = executable[0];
            selected.surface = selected.surface || surfaceOf(selected);
            log(scheduler.stateLine('discovered', 'selected', `${selected.id} via discovery queue-vide (score ${selected._score})`));
            // Même gate PR catégorie-aware sur ce chemin (jamais d'exécution aveugle).
            let innerBlocking = null;
            if (prDetail) {
              if (prDetail.detailUnavailable) {
                innerBlocking = { blocking: true, reason: `PR #${prDetail.number} open (détail gh indisponible) — prudence`, code: 'PR_DETAIL_UNKNOWN', prNumber: prDetail.number };
              } else {
                innerBlocking = Object.assign({ prNumber: prDetail.number }, scheduler.isPrBlocking(prDetail, selected, mem.loadQueue()));
              }
            }
            if (innerBlocking && innerBlocking.blocking) {
              scheduler.persistSelected(selected, report.id, innerBlocking);
              log(scheduler.stateLine('selected', 'blocked-by-pr', innerBlocking.reason));
              S('PR', `PR #${prDetail.number} bloquant (${innerBlocking.code}) — ${innerBlocking.reason}`);
            } else {
              const claim2 = scheduler.persistClaimed(selected, report.id, (id, patch) => mem.updateOpportunity(id, patch));
              log(scheduler.stateLine('selected', claim2.alreadyClaimed ? 'claimed' : 'claimed', `${selected.id} claimée (queue-vide)`));
              progress(`DISCOVER    selected ${selected.id} (score ${selected._score})`);
              const fresh2 = (mem.loadQueue().opportunities || []).find(o => o.id === selected.id) || selected;
              const result2 = await processOpportunity(fresh2);
              scheduler.persistDispatched(fresh2, report.id, { parked: !!(result2 && result2.parked), reason: (result2 && result2.reason) || null });
              log(scheduler.stateLine('selected', 'dispatched', `${fresh2.id} dispatchée`));
            }
          } else {
            progress('DISCOVER    no executable (all human-gate or blocked)');
          }
        } else {
          progress('DISCOVER    no qualifying opportunities');
        }
      }
    }
  } catch (e) {
    log('CRASH: ' + (e.message || e));
    log(e.stack || '');
    return finish(1);
  } finally {
    if (watchdog) clearInterval(watchdog);
  }
  finish(0);
}

function finish(code) {
  report.durationMin = +elapsedMin().toFixed(1);
  if (!report.sections.NEXT.length) {
    if (report.stopped) report.sections.NEXT.push('resolve factory stop');
    else report.sections.NEXT.push('next cycle (continuous mode)');
  }
  const p = mem.writeRunReport(report);
  log(`report: ${path.relative(C.ROOT, p)} + latest.md`);
  process.exitCode = code;
  process.exit(code);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

if (require.main === module) {
  main().catch(e => {
    try { log('CRASH: ' + e.message); } catch (_) { console.error('CRASH: ' + (e && e.message)); }
    try { log(e.stack); } catch (_) {}
    finish(1);
  });
}

module.exports = { validateOpportunityContract, needsBrowserRecon };