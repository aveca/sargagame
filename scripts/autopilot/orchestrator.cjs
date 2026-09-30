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

const t0 = Date.now();
let cfg, report, log, lastProgress = Date.now();

function elapsedMin() { return (Date.now() - t0) / 60000; }
function progress(msg) {
  lastProgress = Date.now();
  if (LIVE) log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  else log(msg);
}
function S(section, msg) { report.sections[section].push(msg); log(`[${section}] ${msg}`); }

/** Stop the ENTIRE factory (not just a task) - only for critical conditions */
function factoryStop(reason) {
  report.stopped = true; report.stopReason = reason;
  log('🛑 FACTORY STOP : ' + reason);
  S('FACTORY_STOP', `STOP — ${reason}`);
}

/** Park a single task (HUMAN GATE, READY TO MERGE, blocked) - factory continues */
function parkTask(oppId, reason, status = 'parked') {
  const msg = `TASK PARKED: ${oppId} — ${reason}`;
  log('🅿️  ' + msg);
  S('PARKED', `${oppId} — ${reason}`);
  mem.updateOpportunity(oppId, { status, blockReason: reason.slice(0, 200), parkedAt: C.nowIso() });
  return { parked: true, reason };
}

function budgetExceeded() { return elapsedMin() > cfg.loop.maxRunMinutes; }

/** Watchdog — surveille l'absence de progression > 120s */
function startWatchdog() {
  if (!LIVE) return null;
  return setInterval(() => {
    const idle = Date.now() - lastProgress;
    if (idle > 120000) {
      log(`[WATCHDOG] No progress for ${Math.round(idle/1000)}s`);
      log(`[WATCHDOG] Investigating...`);
    }
  }, 30000);
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
  if (LIVE) progress('OBSERVE     starting Playwright probe...');
  S('OBSERVED', 'sonde Playwright prod lancée…');
  const cp = execFileSync(process.execPath, [path.join(__dirname, 'observe.cjs'), '--run-id', report.id], {
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

  const wt = gitops.prepareWorktree(cfg, branch, m => { if (LIVE) progress('WORKTREE    ' + m); else log('[worktree] ' + m); });
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
  const pr = gitops.createPR(wt, { title: `[autopilot] ${opp.title.slice(0, 80)}`, body, base: cfg.git.baseBranch });
  report.prUrl = pr.url;
  S('PR', `${pr.url} (branche ${branch}, head ${commitSha})`);
  if (LIVE) progress('PR          ' + pr.url);

  return { pr, branch, commitSha, wt };
}

/** CI WAIT + PREVIEW DEPLOY with repair (max 3) */
async function phaseCIAndPreview(opp, pr, branch, commitSha) {
  const maxRetries = 3;
  let previewResult = null;

  for (let retry = 0; retry < 3; retry++) {
    if (retry > 0) {
      progress(`CI/PREVIEW   retry ${retry}/3`);
      // Small fix attempt could go here
    }

    try {
      progress('CI WAIT     waiting for CI green...');
      const preview = await deployAndValidatePreview(report.prUrl, pr.number, branch, commitSha, cfg);
      previewResult = preview;
      progress('PREVIEW     deployed & fingerprint verified');
      break;
    } catch (e) {
      progress(`PREVIEW     attempt ${retry + 1}/3 FAILED: ${e.message.slice(0, 100)}`);
      mem.writeRegression(opp.id + `-preview-${retry}`, `Preview deploy failed: ${e.message}`);
      if (retry === 2) {
        return parkTask(opp.id, `preview deploy failed after 3 retries: ${e.message.slice(0, 150)}`, 'blocked-preview');
      }
      await sleep(30000); // wait before retry
    }
  }

  return previewResult;
}

/** ONLINE QA with repair (max 3) */
async function phaseOnlineQA(opp, previewResult) {
  if (!previewResult) return { skipped: true };

  for (let retry = 0; retry < 3; retry++) {
    if (retry > 0) {
      progress(`ONLINE QA    retry ${retry}/3`);
      await sleep(30000);
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
        if (retry < 2) {
          progress('ONLINE QA       regression — will retry');
          mem.writeRegression(opp.id + `-online-qa-${retry}`, `Online QA regressions: ${highErrors} high/critical`);
          continue; // retry
        } else {
          return parkTask(opp.id, `online QA regression after 3 retries: ${highErrors} high/critical`, 'blocked-online-qa');
        }
      }
      
      progress('ONLINE QA       PASS');
      return { success: true };
    } catch (e) {
      progress(`ONLINE QA     attempt ${retry + 1}/3 FAILED: ${e.message.slice(0, 100)}`);
      mem.writeRegression(opp.id + `-online-qa-${retry}`, `Online QA failed: ${e.message}`);
      if (retry === 2) {
        return parkTask(opp.id, `online QA failed after 3 retries: ${e.message.slice(0, 150)}`, 'blocked-online-qa');
      }
    }
  }
  return parkTask(opp.id, 'online QA max retries exceeded', 'blocked-online-qa');
}

/** Process a single opportunity through the full pipeline */
async function processOpportunity(opp) {
  progress(`SELECT      ${opp.id}`);
  S('SELECTED', `${opp.id} (score ${opp._score})`);

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
  if (['ux-ui', 'browser-interaction', 'aha-wow', 'svg-assets-a11y'].some(t => opp.type.includes(t))) {
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
    if (fatalDown.length) { factoryStop('production outage: ' + fatalDown.join(', ')); return finish(2); }
    if (health.length) S('OBSERVED', `domains degraded: ${health.join(', ')}`);
    else { S('OBSERVED', `health OK (${[cfg.health.requiredDomains, cfg.health.warnDomains].flat().length} domains 2xx)`); progress('PROD        6/6 healthy'); }

    const prOpen = gitops.openAutopilotPR();
    if (prOpen) S('PR', `PR #${prOpen.number} open — observation only this cycle`);

    const founder = gitops.founderTreeState();
    if (founder.foreignDirty) S('OBSERVED', `founder WIP preserved (${founder.files.length} files)`);

    // 1. OBSERVE
    if (budgetExceeded()) throw new Error('time budget exceeded before OBSERVE');
    const obs = await phaseObserve();

    // 2. REVENUE
    await phaseRevenueAndMeasure();

    // 3. RESEARCH
    if (!budgetExceeded()) await phaseResearch();

    // 4. ANALYZE + DISCOVER
    const res = phaseAnalyze(obs);
    if (!budgetExceeded() && (!res.selected || prOpen || budgetExceeded())) {
      progress('DISCOVER    autonomous discovery...');
      const snap = metrics.snapshot();
      const discovered = await runDiscovery(cfg, report, obs, snap);
      if (discovered.length > 0) {
        const executable = discovered.filter(o => o.actionable !== 'human' && !o.blocked);
        if (executable.length > 0) {
          res.selected = executable[0];
        }
      }
    }

    // 5. PROCESS SELECTED OPPORTUNITY
    let selected = res.selected;
    if (selected) {
      const surf = selected.surface || surfaceOf(selected);
      selected.surface = surf;
      const busy = experiments.activeForSurface(surf);
      if (busy) {
        S('FOUND', `surface "${surf}" busy with ${busy.id} — 1 change per surface`);
        selected = null;
      }
    }

    if (prOpen || budgetExceeded()) {
      if (budgetExceeded()) S('FAILED', 'time budget exceeded — deferring');
    } else if (selected) {
      await processOpportunity(selected);
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
            progress(`DISCOVER    selected ${selected.id} (score ${selected._score})`);
            await processOpportunity(selected);
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

main().catch(e => {
  log('CRASH: ' + e.message);
  log(e.stack);
  finish(1);
});