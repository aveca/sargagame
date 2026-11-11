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
const selfHealing = require('./lib/self-healing.cjs');
const multiRepoBridge = require('./multi-repo-bridge.cjs');
const lifecycle = require('./lib/mission-lifecycle.cjs');
const missionPublisher = require('./lib/mission-publisher.cjs');
const safetyGuard = require('./lib/safety-guard.cjs');
const finalScope = require('./lib/final-scope.cjs');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';
const HEADED = process.env.SARGA_AUTOPILOT_HEADED === '1';

const t0 = Date.now();
let cfg, report, log, lastProgress = Date.now();

/**
 * Nombre maximal de REPRISES après un bug interne du pont (ReferenceError,
 * exception inattendue). Au-delà, la mission est PARQUÉE avec son
 * diagnostic : jamais abandonnée en silence, jamais relancée en boucle.
 */
const MAX_BRIDGE_ERROR_RETRIES = 3;

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

/**
 * Publie un statut de cycle de vie de la mission sur SON issue source.
 *
 * Règles :
 *  - JAMAIS bloquant : une publication ratée ne doit pas arrêter la factory
 *    (le statut manquant est journalisé, jamais avalé) ;
 *  - JAMAIS en mode DRY : un dry-run n'a aucun effet de bord ;
 *  - silence explicite pour les opportunités sans issue source (les
 *    opportunités de découverte locale n'ont pas d'issue GitHub) ;
 *  - dépôt hors allowlist : refus (fail-closed).
 *
 * @param {string} oppId    identifiant de mission
 * @param {string} status   état (imported/started/heartbeat/completed/blocked/failed/retrying)
 * @param {string} detail   détail lisible
 * @param {object} evidence preuves {branch, agent, model, startedAt, commit, tests, pr, reason}
 */
function publishMissionStatus(oppId, status, detail, evidence = {}) {
  return missionPublisher.publishMissionStatus(oppId, status, detail, evidence, {
    mem, multiRepoBridge, lifecycle, log, dry: DRY,
  });
}

/**
 * Branche de la mission — calculée UNE SEULE fois pour que le statut publié
 * sur l'issue (`started`) porte exactement la branche qui sera poussée.
 */
function branchFor(opp) {
  const slug = String((opp && (opp.recipe || opp.title)) || 'mission')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${cfg.git.branchPrefix}${report.id}-${slug}`;
}

/**
 * Heartbeat de mission : publication périodique sur l'issue pendant que
 * l'agent travaille. Sans lui, une mission longue est MUETTE (le fondateur ne
 * sait pas si elle avance) et le watchdog n'a aucun signal de vie.
 */
function startMissionHeartbeat(opp) {
  const seconds = Number(cfg.mission && cfg.mission.heartbeatSeconds) || 300;
  if (!seconds || seconds <= 0) return null;
  const timer = setInterval(() => {
    try {
      publishMissionStatus(opp.id, 'heartbeat', `agent en cours (heartbeat ${Math.round(seconds / 60)} min)`, {
        branch: branchFor(opp),
        startedAt: opp.missionStartedAt || undefined,
        lastHeartbeatAt: C.nowIso(),
      });
    } catch (e) {
      if (typeof log === 'function') log(`[mission-heartbeat] publication échouée: ${e.message}`);
    }
  }, seconds * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

/** Statut de mission correspondant à un état de parking local. */
function missionStatusForPark(status) {
  if (status === 'ready-to-merge' || status === 'done') return 'completed';
  if (status === 'rejected') return 'failed';
  return 'blocked';
}

/** Park a single task (HUMAN GATE, READY TO MERGE, blocked) - factory continues */
function parkTask(oppId, reason, status = 'blocked', evidence = {}) {
  // Garde-fou mémoire : seuls les statuts VALID_STATES sont persistables.
  // Les codes fins (blocked-preview, parked…) restent dans blockReason.
  const VALID = new Set(['new', 'picked', 'in_progress', 'blocked', 'validation', 'ready-to-merge', 'done', 'rejected']);
  const safe = VALID.has(status) ? status : 'blocked';
  const msg = `TASK PARKED: ${oppId} — ${reason}`;
  log('🅿️  ' + msg);
  S('PARKED', `${oppId} — ${reason}`);
  mem.updateOpportunity(oppId, { status: safe, blockReason: (`[${status}] ` + reason).slice(0, 200), parkedAt: C.nowIso() });
  // Statut corrélé sur l'issue source : `completed` = travail terminé (PR prête
  // à merge humain), `failed` = tâche rejetée, `blocked` = parkée.
  publishMissionStatus(oppId, missionStatusForPark(safe), reason, { reason, ...evidence });
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

/** Watchdog — surveille l'absence de progression > 120s + auto self-healing */
function startWatchdog() {
  if (!LIVE) return null;
  return setInterval(async () => {
    const idle = Date.now() - lastProgress;
    if (idle > 120000) {
      log(`[WATCHDOG] No progress for ${Math.round(idle/1000)}s`);
      log(`[WATCHDOG] Initiating self-healing diagnosis...`);
      await diagnoseAndSelfHeal();
    }
  }, 30000);
}

/** Diagnose stuck phase and attempt self-healing */
async function diagnoseAndSelfHeal() {
  const elapsed = elapsedMin();
  log(`[WATCHDOG] Elapsed: ${elapsed.toFixed(1)}min / ${cfg.loop.maxRunMinutes}min budget`);
  if (budgetExceeded()) {
    log(`[WATCHDOG] Time budget exceeded — will stop at next checkpoint`);
  }

  // Capture current state as error context for self-healing
  const stuckError = new Error(`Watchdog: No progress for > 120s (elapsed ${elapsed.toFixed(1)}min)`);
  stuckError.name = 'WatchdogTimeout';

  const context = {
    phase: 'watchdog',
    taskId: report.currentTaskId || 'unknown',
    command: 'orchestrator cycle',
    exitCode: -1,
  };

  try {
    const result = await selfHealing.handleError(stuckError, context, cfg, (msg) => log(`[WATCHDOG-HEAL] ${msg}`));
    if (result.success) {
      log(`[WATCHDOG] Self-healing SUCCESS: ${result.classification.type} — resuming`);
      // Reset progress timer to allow continuation
      lastProgress = Date.now();
    } else {
      log(`[WATCHDOG] Self-healing attempted but failed: ${result.reason} — will retry next interval`);
    }
  } catch (e) {
    log(`[WATCHDOG] Self-healing error: ${e.message} — continuing watchdog`);
  }
}

/**
 * Health check des domaines de production.
 *
 * ⚠️ DÉFAUT RÉEL DU 2026-11-10 : UN SEUL timeout transitoire sur UN des
 * domaines déclenchait `FACTORY_STOP` et ARRETAIT toute la boucle 24/7
 * (dernier cycle observé : « STOP — production outage: sargazotulum.com
 * (timeout) » alors que le domaine répondait 200 en 86–457 ms sur les trois
 * chemins vérifiés `/`, `/premium/`, `/api/mollie-health`).
 *
 * Un timeout réseau isolé n'est PAS une panne de production : la décision
 * d'arrêt doit reposer sur une CONFIRMATION (plusieurs échecs consécutifs
 * sur le même domaine), sinon une micro-coupure réseau tue 24 h de boucle.
 *
 * `cfg.health.confirmAttempts` (défaut 3) = nombre de tentatives
 * consécutives exigées pour déclarer un domaine « down ». Les domaines
 * `warnDomains` ne déclenchent jamais l'arrêt : une seule tentative suffit.
 */
async function probeDomain(d, attempts) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), cfg.health.timeoutMs);
      const r = await fetch('https://' + d + '/', { signal: ctrl.signal, headers: { 'User-Agent': 'sargagame-autopilot-health' } });
      clearTimeout(t);
      if (r.status >= 500) last = `${d} (HTTP ${r.status})`;
      else return null; // 2xx/3xx/4xx = joignable
    } catch (e) {
      last = `${d} (${e.name === 'AbortError' ? 'timeout' : e.message})`;
    }
    // Petite pause entre deux tentatives : un timeout réseau transitoire
    // (DNS, socket saturé) ne se reproduit pas immédiatement.
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500));
  }
  return last;
}

async function healthCheck() {
  const down = [];
  const required = Array.isArray(cfg.health.requiredDomains) ? cfg.health.requiredDomains : [];
  const warn = Array.isArray(cfg.health.warnDomains) ? cfg.health.warnDomains : [];
  const confirmAttempts = Number(cfg.health.confirmAttempts) > 0 ? Number(cfg.health.confirmAttempts) : 3;
  for (const d of required) {
    const r = await probeDomain(d, confirmAttempts);
    if (r) down.push(r);
  }
  for (const d of warn) {
    const r = await probeDomain(d, 1);
    if (r) down.push(r);
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
    cwd: C.ROOT, encoding: 'utf8', timeout: 15 * 60000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
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

/**
 * Phase COMMIT & PUBLISH — extraction EXPLICITE du bloc post-gate.
 *
 * Pourquoi cette extraction (défaut réel du 2026-11-09, deux fois) :
 * le bloc de commit vivait APRÈS la boucle `while (attempt <= …)` de
 * `phaseImplementLocal`, alors que plusieurs de ses entrées étaient
 * DÉCLARÉES DANS la boucle (`allowedScope`) ou supprimées par une
 * modification de diff (`diff`). Résultat : `ReferenceError:
 * allowedScope is not defined` / `diff is not defined` au moment précis
 * du commit — après un gate VERT et un agent qui avait réellement
 * travaillé. La mission était perdue et l'orchestrateur crashait.
 *
 * Correction STRUCTURELLE (pas un simple déplacement de ligne) : toutes
 * les données nécessaires au commit sont désormais des PARAMÈTRES
 * EXPLICITES. Aucune variable implicite ne traverse la frontière de la
 * boucle : la famille de bugs est structurellement impossible.
 */
async function phaseCommitAndPublish({ opp, wt, branch, allowedScope, gateFiles, gate }) {
  // ── RE-VALIDATION POST-GATE (défaut réel corrigé le 2026-11-09) ────────
  //
  // Le gate de ship lance `npm run build`, qui RÉGÉNÈRE des artefacts
  // versionnés (`public/api/**`, `public/data/**`, `public/version.json`).
  // Le diff était RECALCULÉ ici, juste avant `commitAll`, alors que le scope
  // guard et la denylist n'avaient été validés que sur le diff ANTÉRIEUR au
  // gate. Conséquence observée : la PR #1374 (mission « documenter
  // `.ai/autopilot/README.md` ») contenait 4 fichiers — le README + 3 fichiers
  // `public/api/**` / `public/data/**` (denylist contournée).
  //
  // Correctif en 4 temps, fail-closed :
  //   1. restaurer tout fichier hors périmètre (artefacts de build compris) ;
  //   2. recalculer le diff RÉELLEMENT committé ;
  //   3. revalider scope + denylist + budget + secrets sur cette liste ;
  //   4. committer UNIQUEMENT cette liste.
  if (LIVE) progress('COMMIT      committing...');
  const restore = gitops.restoreOutOfScope(wt, allowedScope, m => log(m));
  if (restore.failed.length) {
    return parkTask(opp.id, `restore hors périmètre impossible: ${restore.failed.join(' ; ')}`, 'blocked', { branch });
  }
  const finalDiff = gitops.diffStats(wt);
  const finalCheck = finalScope.finalScopeCheck({
    changedFiles: finalDiff.files,
    allowedFiles: allowedScope,
    gateFiles,
  });
  if (!finalCheck.ok) {
    S('FAILED', `SCOPE VIOLATION (post-gate) — ${finalCheck.violations.join(' ; ')}`);
    return parkTask(opp.id, `scope violation (post-gate): ${finalCheck.violations.join(' ; ')}`, 'blocked', { branch });
  }
  const finalEv = policy.evaluateFiles(finalDiff.files, cfg);
  if (!finalEv.allowed) return parkTask(opp.id, `denylist: ${finalEv.denied.join(', ')}`, 'blocked', { branch });
  const finalBudget = policy.evaluateBudget(finalDiff, cfg);
  if (finalBudget.length) return parkTask(opp.id, `budget: ${finalBudget.join(' ; ')}`, 'blocked', { branch });
  const finalSecrets = policy.scanSecrets(finalDiff.diffText);
  if (finalSecrets.length) return parkTask(opp.id, `secrets: ${finalSecrets.join(', ')}`, 'blocked', { branch });

  const commitSha = gitops.commitAll(wt,
    `fix(autopilot): ${opp.title.slice(0, 90)}\n\nOpportunité ${opp.id}\nPreuve : ${(opp.evidence || '').slice(0, 200)}\nRollback : ${opp.rollback || 'revert'}\n\nCycle autopilot ${report.id}`,
    finalDiff.files);
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
    `- ${finalDiff.files.length} fichiers, +${finalDiff.insertions}/-${finalDiff.deletions} lignes`,
    `- périmètre strict : ${finalDiff.files.join(', ')}`,
    `- denylist money/secrets/api/régions : OK (revalidée APRÈS le gate)`,
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

  // PUBLICATION DES PREUVES dès l'ouverture de la PR.
  //
  // Pourquoi (défaut réel du 2026-11-09, mission #1376) : le commit SHA,
  // l'URL de PR et les tests n'étaient publiés qu'en fin de pipeline. Une
  // mission interrompue entre la PR et la fin (crash, redémarrage, PR
  // bloquante) ne laissait sur l'issue qu'un `heartbeat` : le fondateur ne
  // voyait NI le commit, NI la PR, NI les tests réellement exécutés.
  // On publie donc les preuves dès qu'elles existent.
  publishMissionStatus(opp.id, 'heartbeat', `PR ouverte — commit ${String(commitSha).slice(0, 8)} · ${finalDiff.files.length} fichier(s) · en attente de CI`, {
    branch,
    commit: commitSha,
    pr: pr.url,
    agent: (opp.agent && opp.agent.agent) || null,
    model: (opp.agent && opp.agent.model) || null,
    tests: gate.steps,
    reason: `PR ${pr.url} ouverte — gate vert, en attente de CI`,
  });

  return { pr, branch, commitSha, wt };
}

/** Implémentation locale avec self-repair ≤ 3 */
async function phaseImplementLocal(opp) {
  const branch = branchFor(opp);

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
  let attempt = 0, gate = null, impl = null, failureContext = null;
  // Fichiers soumis au gate (hors boucle) : la revalidation post-gate doit
  // pouvoir vérifier que chaque fichier committé a bien été contrôlé.
  let gateFiles = [];
  // Périmètre AUTORISÉ de la mission — INVARIANT de la boucle (il vient de
  // l'opportunité, jamais de l'agent). Déclaré HORS de la boucle parce
  // qu'il est consommé APRÈS la boucle (revalidation post-gate). Déclaré
  // dans la boucle, il était invisible après → `ReferenceError:
  // allowedScope is not defined` au moment du commit (observé en réel le
  // 2026-11-09 à 14:00:15, après un gate VERT et un agent qui avait
  // réellement travaillé : la mission a été perdue).
  const allowedScope = (opp.scope && opp.scope.files) || [];
  while (attempt <= cfg.loop.maxRepairAttempts) {
    attempt++;
    if (LIVE) progress(`OPENCODE    attempt ${attempt}/${cfg.loop.maxRepairAttempts}`);
    impl = await implementOpportunity(opp, wt, cfg, m => { if (LIVE) progress('IMPLEMENT   ' + m); else log('[implement] ' + m); }, failureContext);
    if (!impl.ok) {
      if (impl.blocked) return parkTask(opp.id, `blocked: ${impl.blocked}`, 'blocked', { branch });
      if (attempt > cfg.loop.maxRepairAttempts || impl.via === 'recipe') {
        return parkTask(opp.id, `impl failed after ${attempt} attempts: ${impl.summary}`, 'blocked', { branch });
      }
      // Reprise annoncée : l'issue doit montrer que la mission n'est pas
      // abandonnée mais en cours de nouvelle tentative.
      publishMissionStatus(opp.id, 'retrying', `nouvelle tentative ${attempt + 1}/${cfg.loop.maxRepairAttempts + 1}`, {
        branch,
        attempts: attempt + 1,
        reason: String(impl.summary || '').slice(0, 300),
      });
      failureContext = `Tentative ${attempt} : l'agent n'a pas produit de modification exploitable. ${String(impl.summary || '').slice(0, 500)}`;
      continue;
    }
    S('IMPLEMENTED', `${impl.via}: ${impl.summary} (${impl.files ? impl.files.join(', ') : 'diff agent'})`);

    const diff = gitops.diffStats(wt);

    // SCOPE GUARD — agent must only modify files explicitly allowed by opp.scope.files
    const scopeGuard = evaluateScopeGuard(allowedScope, diff.files);
    if (!scopeGuard.ok) {
      S('FAILED', `SCOPE — ${scopeGuard.reason}`);
      // DIAGNOSTIC : l'agent sort souvent en code 0 SANS toucher la cible —
      // cas reel observe le 2026-11-08 : le modele local (9B) a "ecrit" le
      // fichier mais avec un CHEMIN CORROMPU (`tests/u nit/...` au lieu de
      // `tests/unit/...`), donc le diff du worktree restait vide. Sans la
      // trace de l'agent, le parcage ne disait QUE « no files modified by
      // agent » : impossible a diagnostiquer sans repasser la main.
      // On joint donc les dernieres lignes de la trace de l'agent.
      //
      // Les sequences ANSI sont retirees : ce motif de parcage est PUBLIE
      // sur l'issue source, et les codes couleur y seraient illisibles
      // (verifie en reel : « [0m→ [0mRead .ai/current_state.md »).
      const agentTrace = impl && impl.agentLog
        ? String(impl.agentLog)
            .replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, '')
            .trim()
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(-4)
            .join(' / ')
            .slice(0, 160)
        : '';
      const hint = agentTrace ? ` [agent: ${agentTrace}]` : '';
      const failure = finalScope.classifyScopeFailure(scopeGuard);
      const outOfScope = failure.outOfScope;

      if (outOfScope.length) {
        // VIOLATION DE PÉRIMÈTRE RÉELLE : l'agent a touché des fichiers
        // interdits (denylist ou hors mission). On PARQUE immédiatement —
        // c'est un signal de sécurité, pas une maladresse de forme.
        return parkTask(opp.id, `scope violation: ${scopeGuard.reason}${hint}`, 'blocked', { branch });
      }

      // AUCUNE MODIFICATION UTILE (fichier autorisé non touché, ou diff vide)
      // : ce n'est PAS une violation de périmètre, c'est un agent qui n'a pas
      // exécuté son outil d'édition. Constaté en réel le 2026-11-09 12:38 :
      // le modèle local 9B a Narré son intention (« Je lis le fichier… »)
      // puis a rendu la main sans modifier le fichier.
      //
      // On RELANCE l'agent (jusqu'à maxRepairAttempts) en lui transmettant le
      // motif exact + la trace : c'est ce que `failureContext` sert. Le
      // statut `retrying` est publié sur l'issue : la mission n'est ni
      // abandonnée, ni marquée « done » à tort.
      const retryHint = `Tentative ${attempt} sans modification exploitable : ${scopeGuard.reason}. Tu dois APPELER l'outil d'édition (read puis edit) sur le fichier autorisé, puis t'arrêter. N'écris pas la commande shell : appelle l'outil.${hint}`;
      if (attempt > cfg.loop.maxRepairAttempts) {
        return parkTask(opp.id, `scope violation: ${scopeGuard.reason}${hint}`, 'blocked', { branch });
      }
      S('FAILED', `AUCUNE MODIFICATION UTILE — relance de l'agent (${scopeGuard.reason})`);
      publishMissionStatus(opp.id, 'retrying', `nouvelle tentative ${attempt + 1}/${cfg.loop.maxRepairAttempts + 1} (l'agent n'a modifié aucun fichier autorisé)`, {
        branch,
        attempts: attempt + 1,
        // La trace de l'agent est PUBLIEE : sans elle, l'issue ne dit que
        // « no files modified by agent » — impossible à diagnostiquer sans
        // repasser la main. Les codes ANSI sont retirés (illisibles).
        reason: `${String(scopeGuard.reason).slice(0, 200)}${hint}`.slice(0, 400),
      });
      // Worktree remis à zéro : la tentative suivante repart d'une base propre
      // (les brouillons de la tentative échouée ne doivent pas s'accumuler).
      try {
        gitops.restoreOutOfScope(wt, [], () => {});
      } catch (e) {
        log(`reset worktree avant relance : ${e.message}`);
      }
      failureContext = retryHint;
      continue;
    }

    const ev = policy.evaluateFiles(diff.files, cfg);
    if (!ev.allowed) return parkTask(opp.id, `denylist: ${ev.denied.join(', ')}`);
    const budgetErrs = policy.evaluateBudget(diff, cfg);
    if (budgetErrs.length) return parkTask(opp.id, `budget: ${budgetErrs.join(' ; ')}`);
    const secrets = policy.scanSecrets(diff.diffText);
    if (secrets.length) return parkTask(opp.id, `secrets: ${secrets.join(', ')}`);

    if (LIVE) progress('GATE        running...');
    gateFiles = diff.files.slice();
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

  // Commit & push — la phase est une FONCTION à paramètres EXPLICITES
  // (`phaseCommitAndPublish`). Aucune variable de la boucle n’est
  // accessible implicitement : c’est la correction STRUCTURELLE des deux
  // ReferenceError observés en réel (`diff is not defined` le 2026-11-09
  // à 12:59:19, `allowedScope is not defined` le même jour à 14:00:15).
  return phaseCommitAndPublish({ opp, wt, branch, allowedScope, gateFiles, gate });
}

/** Self-repair using self-healing supervisor — classify error and attempt targeted fix */
async function attemptRepair(opp, phase, error, log) {
  const errorMsg = String(error.message || error).slice(0, 500);
  log(`REPAIR      ${phase}: initiating self-healing for: ${errorMsg.slice(0, 120)}`);

  const context = {
    phase,
    taskId: opp.id,
    branch: opp.branch,
    worktree: opp.worktree,
  };

  try {
    const result = await selfHealing.handleError(error, context, cfg, (msg) => log(`REPAIR      ${msg}`));
    if (result.success) {
      log(`REPAIR      ${phase}: self-healing SUCCESS — ${result.classification.type} fixed`);
      return { attempted: true, type: result.classification.type, action: 'self-healed', detail: result.repairPlan?.analysis };
    } else {
      log(`REPAIR      ${phase}: self-healing attempted but failed: ${result.reason}`);
      return { attempted: true, type: result.classification?.type || 'unknown', action: 'failed', detail: result.reason };
    }
  } catch (e) {
    log(`REPAIR      ${phase}: self-healing error: ${e.message}`);
    return { attempted: false, reason: `self-healing crashed: ${e.message}` };
  }
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
/**
 * Re-évalue la sécurité d'une opportunité AVANT son exécution.
 *
 * Deux sources de vérité, combinées (fail-closed) :
 *   1. le verdict figé à l'import (`opp.safety`) ;
 *   2. une nouvelle évaluation du texte intégral (`opp.mission.text`).
 *
 * Si l'une des deux dit « bloqué », l'opportunité est bloquée.
 * @returns {{blocked:boolean, reason:string}}
 */
function evaluateOpportunitySafety(opp) {
  if (!opp) return { blocked: false, reason: '' };
  // 1. Verdict d'import.
  if (opp.safety && opp.safety.blocked) {
    return { blocked: true, reason: String(opp.safety.reason || 'mission interdite à l\'import') };
  }
  // 2. Nouvelle évaluation sur le texte intégral (mission + commentaires).
  try {
    const mission = opp.mission || {};
    const task = opp.task || {};
    const verdict = safetyGuard.evaluateMissionSafety({
      title: (opp.sourceIssue && opp.sourceIssue.title) || opp.title || '',
      body: mission.body || task.description || '',
      comments: Array.isArray(mission.comments) ? mission.comments.map(c => c && c.body).join('\n') : '',
      task,
    });
    if (verdict && verdict.blocked) {
      return { blocked: true, reason: verdict.reason };
    }
  } catch (e) {
    // Fail-closed : une erreur d'évaluation ne doit JAMAIS autoriser.
    return { blocked: true, reason: `évaluation de sécurité impossible (fail-closed): ${e.message}` };
  }
  return { blocked: false, reason: '' };
}

async function processOpportunity(opp) {
  progress(`SELECT      ${(opp && opp.id) || 'unknown'}`);
  S('SELECTED', `${(opp && opp.id) || 'unknown'} (score ${(opp && opp._score) || '?'})`);

  // PERSISTANCE AVANT TOUT PARCAGE — correction d'une BOUCLE INFINIE.
  //
  // Les opportunites issues de l'ANALYSE (observations) et de la DECOUVERTE
  // autonome n'existaient qu'en memoire : elles n'etaient jamais ecrites dans
  // `queue.json`. Or `parkTask()` appelle `mem.updateOpportunity()`, qui
  // renvoie `null` sur une opportunite absente de la queue : le parcage etait
  // donc un NO-OP. Consequence observee le 2026-11-08 sur le PC du fondateur :
  // la factory consommait un cycle toutes les 30 s, re-selectionnait le MEME
  // candidat, le re-parquait, et ne produisait AUCUN travail — indefiniment.
  //
  // Ecrit dans la queue, le parcage devient effectif : le candidat passe a
  // `blocked` et les deux sources de candidats l'ignorent au cycle suivant
  // (deduplication par `fingerprint` deja en place dans `analyze.cjs` et
  // `discover.cjs`).
  //
  // Le mode `--dry` n'ecrit RIEN : un dry-run ne doit jamais muter l'etat.
  if (!DRY) {
    try { mem.upsertOpportunity(opp); } catch (e) {
      log(`queue persist failed (non-fatal): ${String(e.message).slice(0, 120)}`);
    }
  }

  // Garde-contrat : parquer avec diagnostic au lieu de crasher la factory
  // (TypeError .includes sur opp.type undefined → exit 1, jamais dispatched).
  const contract = validateOpportunityContract(opp);
  if (!contract.valid) {
    progress(`CONTRACT    invalide: ${contract.missing.join(', ')} manquant`);
    return parkTask((opp && opp.id) || 'unknown', contract.reason, 'blocked');
  }

  // ── GARDE-FOU DE SÉCURITÉ — RE-VÉRIFICATION AVANT EXÉCUTION (fail-closed)
  //
  // Le verdict du pont est figé à l'import, mais l'opportunité peut être
  // entrée dans la queue AVANT l'existence du garde-fou, ou par une autre
  // voie. On re-contrôle donc ici, sur le texte intégral de la mission :
  // une mission interdite n'est JAMAIS exécutée, même si elle traîne en
  // queue. Le verdict d'import sert de filtre amont ; celui-ci est le
  // verrou de sortie.
  const safetyVerdict = evaluateOpportunitySafety(opp);
  if (safetyVerdict && safetyVerdict.blocked) {
    progress(`SAFETY      BLOQUÉ: ${safetyVerdict.reason}`);
    return parkTask((opp && opp.id) || 'unknown', `blocked (sécurité): ${safetyVerdict.reason}`, 'blocked', {
      reason: safetyVerdict.reason,
    });
  }

  // Statut corrélé `started` : la mission est prise en charge par le runner.
  // Le commentaire porte la branche, l'agent routé et l'heure de début.
  const missionStartedAt = C.nowIso();
  opp.missionStartedAt = missionStartedAt;
  publishMissionStatus(opp.id, 'started', `exécution locale par le runner Factory (${opp.actionable || 'agent'})`, {
    branch: branchFor(opp),
    agent: (opp.agent && opp.agent.agent) || null,
    model: (opp.agent && opp.agent.model) || null,
    startedAt: missionStartedAt,
    reason: (opp.agent && opp.agent.reason) || null,
  });
  // Heartbeat périodique publié sur l'issue pendant toute l'exécution.
  const heartbeatTimer = startMissionHeartbeat(opp);
  try {

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
  // Le statut `completed` n'est publié qu'APRÈS les gates : un `completed`
  // sans commit, sans tests et sans PR serait un faux succès.
  const gateSteps = (report.sections.TESTED || []).slice();
  return parkTask(opp.id, 'READY TO MERGE — all gates green, awaiting human merge', 'ready-to-merge', {
    branch,
    commit: commitSha,
    pr: pr && pr.url ? pr.url : null,
    agent: (opp.agent && opp.agent.agent) || null,
    model: (opp.agent && opp.agent.model) || null,
    startedAt: missionStartedAt,
    tests: gateSteps.length ? gateSteps : ['gate de ship exécuté (voir PR)'],
  });
  } finally {
    try { if (heartbeatTimer) clearInterval(heartbeatTimer); } catch (_) {}
  }
}

/**
 * Exécute une opportunité et publie le statut `failed` si l'exécution
 * explose.
 *
 * LE PONT NE CRASHE PLUS (défaut réel du 2026-11-09) :
 * avant, toute exception non rattrapée tuait l'orchestrateur (exit 1) et
 * le cycle entier — donc le travail déjà fait par l'agent (agent OK + gate
 * VERT) était perdu, et le service devait redémarrer. Le service est 24/7 :
 * un bug interne ne doit pas arrêter les cycles suivants.
 *
 * Comportement retenu (fail-closed, borné, publié) :
 *  1. `failed` publié sur l'issue avec le message EXACT de l'erreur ;
 *  2. reprise programmée (`retrying`) tant que le budget de reprises n'est
 *     pas atteint — l'opportunité reste sélectionnable, sans doublon ;
 *  3. au-delà du budget : mission PARQUÉE (`blocked`) avec son diagnostic,
 *     pour qu'un humain intervienne. Jamais de boucle infinie, jamais de
 *     statut silencieusement avalé.
 */
async function dispatchOpportunity(opp) {
  try {
    return await processOpportunity(opp);
  } catch (e) {
    const detail = String((e && e.message) || e).split('\n').slice(0, 2).join(' / ').slice(0, 240);
    const errors = (Number(opp && opp.bridgeErrors) || 0) + 1;
    log(`❌ erreur du pont (${errors}/${MAX_BRIDGE_ERROR_RETRIES}) : ${detail}`);

    if (!opp || !opp.id) throw e;

    if (errors > MAX_BRIDGE_ERROR_RETRIES) {
      publishMissionStatus(opp.id, 'failed', `erreur d'exécution (${errors} fois) : ${detail}`, {
        attempts: errors,
        reason: detail,
      });
      publishMissionStatus(opp.id, 'blocked', `mission parquée après ${errors} erreurs du pont : ${detail}`, {
        attempts: errors,
        reason: detail,
      });
      mem.updateOpportunity(opp.id, {
        status: 'blocked',
        blockReason: `[failed] erreur du pont (${errors} fois) : ${detail}`.slice(0, 200),
        parkedAt: C.nowIso(),
        bridgeErrors: errors,
      });
      return { parked: true, reason: detail };
    }

    publishMissionStatus(opp.id, 'failed', `erreur d'exécution : ${detail}`, {
      attempts: errors,
      reason: detail,
    });
    publishMissionStatus(opp.id, 'retrying', `nouvelle tentative après erreur du pont (${errors}/${MAX_BRIDGE_ERROR_RETRIES})`, {
      attempts: errors,
      reason: detail,
    });
    // `picked` → sélectionnable au prochain cycle (reprise sans doublon).
    // On ne réécrit le statut que s'il faut le remettre sélectionnable :
    // éviter une transition `picked → picked` inutile dans le journal.
    const current = (mem.loadQueue().opportunities || []).find(o => o && o.id === opp.id);
    const patch = { bridgeErrors: errors };
    if (current && current.status !== 'picked') patch.status = 'picked';
    mem.updateOpportunity(opp.id, patch);
    return { parked: true, reason: detail };
  }
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
      //
      // PUBLICATION de l'état final sur l'issue source (défaut réel du
      // 2026-11-09, mission #1376) : la mission produisait une PR et une CI
      // verte, mais l'issue ne recevait AUCUN statut final — dernier
      // commentaire : un `heartbeat`. Le fondateur ne pouvait pas savoir que
      // le travail était fini et qu'une PR l'attendait.
      //
      // Deux cas :
      //  - une opportunistic est sélectionnée → on parque et on publie ;
      //  - aucune sélection (opportunité déjà parquée) → on retrouve la
      //    mission d'origine de la PR (durable) et on publie quand même.
      const prEvidence = {
        branch: prDetail && prDetail.headRefName ? prDetail.headRefName : null,
        commit: prDetail && prDetail.headRefOid ? prDetail.headRefOid : null,
        pr: prDetail && prDetail.url ? prDetail.url : null,
      };
      // Anti-spam : on ne republie pas le statut final à chaque cycle.
      // Le marqueur `finalPublishedFor` (durable) dit « l'état final de
      // CETTE PR a déjà été publié ».
      const linkedMission = lifecycle.findByPr(prDetail && prDetail.number);
      const targetMissionId = selected ? selected.id : (linkedMission ? linkedMission.taskId : null);
      const alreadyPublished = linkedMission && linkedMission.finalPublishedFor && prEvidence.pr
        && linkedMission.finalPublishedFor === prEvidence.pr;
      const isFinalSuccess = linkedMission && ['completed', 'failed'].includes(linkedMission.state);
      if (selected) {
        // Parquer l'opportunité dans la queue (status='blocked') pour éviter la re-sélection
        // au cycle suivant. Le scheduler garde l'état 'blocked-by-pr' pour le diagnostic.
        const parkReason = `blocked by PR #${prDetail.number} (${prBlocking.code}): ${prBlocking.reason}`;
        scheduler.persistSelected(selected, report.id, prBlocking);
        // Mettre à jour le statut dans la queue pour éviter la re-sélection via restoreSelected
        mem.updateOpportunity(selected.id, { status: 'blocked', blockReason: parkReason, parkedAt: C.nowIso() });
        log(scheduler.stateLine('selected', 'persisted', `${selected.id} persisté (${prBlocking.code})`));
        if (!alreadyPublished && !isFinalSuccess) {
          const res = publishMissionStatus(selected.id, 'blocked', parkReason, {
            ...prEvidence,
            agent: (selected.agent && selected.agent.agent) || null,
            model: (selected.agent && selected.agent.model) || null,
            reason: parkReason,
          });
          if (res && res.published && prEvidence.pr) {
            try { lifecycle.patch(selected.id, selected.repository_full_name, selected.issue_number, { finalPublishedFor: prEvidence.pr }); } catch (_) {}
          }
        }
      } else if (linkedMission && !alreadyPublished && !isFinalSuccess) {
        // Aucune sélection : la mission d'origine de la PR porte encore un
        // état non terminal → on publie l'état final dessus.
        const parkReason = `blocked by PR #${prDetail.number} (${prBlocking.code}): ${prBlocking.reason}`;
        const res = publishMissionStatus(linkedMission.taskId, 'blocked', parkReason, {
          branch: prEvidence.branch || linkedMission.branch || null,
          commit: prEvidence.commit || linkedMission.commit || null,
          pr: prEvidence.pr || linkedMission.pr || null,
          agent: linkedMission.agent || null,
          model: linkedMission.model || null,
          tests: linkedMission.tests && linkedMission.tests.length ? linkedMission.tests : undefined,
          reason: parkReason,
        });
        if (res && res.published && prEvidence.pr) {
          try { lifecycle.patch(linkedMission.taskId, linkedMission.repo, linkedMission.issue, { finalPublishedFor: prEvidence.pr }); } catch (_) {}
        }
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
      const result = await dispatchOpportunity(fresh);
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
              const result2 = await dispatchOpportunity(fresh2);
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

/**
 * SCOPE GUARD — evaluates if agent modifications are strictly within opp.scope.files.
 * 
 * Rules:
 * - Every modified file must be explicitly listed in opp.scope.files
 * - Empty diff → FAIL_TARGET_UNCHANGED
 * - Any file outside scope → FAIL_SCOPE
 * - Target file (first in scope) must be modified → FAIL_TARGET_UNCHANGED
 * - Returns {ok: boolean, reason: string, details: {expected, modified, outOfScope}}
 */
function evaluateScopeGuard(allowedScope, modifiedFiles) {
  if (!modifiedFiles || modifiedFiles.length === 0) {
    return {
      ok: false,
      reason: 'FAIL_TARGET_UNCHANGED: no files modified by agent',
      details: { expected: allowedScope, modified: [], outOfScope: [] }
    };
  }

  // Normalize paths for comparison (relative to worktree root)
  const normalize = (f) => f
    .replace(/^\.\/+/, '')        // remove leading ./
    .replace(/^\/+/, '')          // remove leading /
    .replace(/^\\+/, '')          // remove leading \
    .replace(/\\/g, '/');         // convert all backslashes to forward slashes
  const allowed = new Set(allowedScope.map(normalize));
  const modified = modifiedFiles.map(normalize);
  const outOfScope = modified.filter(f => !allowed.has(f));

  if (outOfScope.length > 0) {
    return {
      ok: false,
      reason: `FAIL_SCOPE: modified files outside scope — Expected: [${allowedScope.join(', ')}] | Modified: [${modified.join(', ')}]`,
      details: { expected: allowedScope, modified: modifiedFiles, outOfScope }
    };
  }

  // Also verify that the TARGET file (first in scope) was actually changed
  // if scope is non-empty. This catches "fake" changes like timestamp bumps.
  if (allowedScope.length > 0) {
    const targetFile = allowedScope[0];
    const targetModified = modified.some(f => f === normalize(targetFile));
    if (!targetModified) {
      return {
        ok: false,
        reason: `FAIL_TARGET_UNCHANGED: target file ${targetFile} not modified (only ${modified.length} other file(s) changed)`,
        details: { expected: allowedScope, modified: modifiedFiles, outOfScope }
      };
    }
  }

  return { ok: true, reason: 'SCOPE_GUARD = PASS', details: { expected: allowedScope, modified: modifiedFiles, outOfScope: [] } };
}

module.exports = { validateOpportunityContract, needsBrowserRecon, evaluateScopeGuard, evaluateOpportunitySafety };