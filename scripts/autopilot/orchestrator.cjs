#!/usr/bin/env node
/**
 * orchestrator.cjs — ORCHESTRATOR de la boucle autonome Sargagame.
 *
 *   OBSERVE → RESEARCH → ANALYZE → PRIORITIZE → IMPLEMENT → TEST
 *   → BROWSER QA → VISUAL QA → PERF QA → REVIEW → PR → (prochain cycle)
 *
 * Garde-fous (mission) :
 *  - UNE opportunité par cycle, UNE PR autopilot ouverte à la fois
 *  - jamais d'écriture sur main ; jamais dans le worktree du fondateur
 *  - denylist paiements/secrets/régions/api (policy.cjs)
 *  - réparations max 3, puis STOP opportunité + regressions/
 *  - STOP immédiat : fichier STOP, prod down, budget bundle, test regression,
 *    diff trop gros, secrets détectés dans le diff, PR déjà ouverte
 *  - chaque cycle écrit runs/<id>.md + latest.md (sections mission)
 *
 * Usage : node scripts/autopilot/orchestrator.cjs [--force-observe] [--dry]
 * Exit : 0 cycle OK · 2 stop-condition (propre) · 1 crash
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');
const policy = require('./lib/policy.cjs');
const gitops = require('./lib/gitops.cjs');
const { implementOpportunity } = require('./implement.cjs');
const { runGate } = require('./verify.cjs');
const { analyze, findingsFromObservation } = require('./analyze.cjs');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');

const t0 = Date.now();
let cfg, report, log;

function elapsedMin() { return (Date.now() - t0) / 60000; }
function S(section, msg) { report.sections[section].push(msg); log(`[${section}] ${msg}`); }
function stop(reason) {
  report.stopped = true; report.stopReason = reason;
  log('⛔ STOP : ' + reason);
  S('FAILED', `STOP — ${reason}`);
}
function budgetExceeded() { return elapsedMin() > cfg.loop.maxRunMinutes; }

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

async function phaseObserve() {
  const latest = C.readJSON(path.join(C.paths.observations, 'latest.json'), null);
  const ageMin = latest ? (Date.now() - new Date(latest.at).getTime()) / 60000 : Infinity;
  if (!args.includes('--force-observe') && latest && ageMin < cfg.loop.observeIfOlderThanMinutes) {
    S('OBSERVED', `observation récente réutilisée (${latest.id}, âge ${ageMin.toFixed(0)} min)`);
    return latest;
  }
  S('OBSERVED', 'sonde Playwright prod lancée…');
  const cp = execFileSync(process.execPath, [path.join(__dirname, 'observe.cjs'), '--run-id', report.id], {
    cwd: C.ROOT, encoding: 'utf8', timeout: 15 * 60000, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const file = (cp.match(/OBSERVATION_FILE=(.+)/) || [])[1];
  const obs = file ? C.readJSON(file.trim(), null) : null;
  if (!obs) throw new Error('sonde observation sans résultat');
  const t = obs.totals;
  S('OBSERVED', `${t.pages} pages sondées (${obs.heavy ? 'heavy' : 'light'}) · err console ${t.consoleErrors} · pageerrors ${t.pageErrors} · 1st-party fail ${t.firstPartyFailures} · liens cassés ${t.brokenLinks} · visual-flags ${t.visualFlagged} · ${obs.durationSec}s`);
  return obs;
}

async function phaseResearch() {
  // Tous les N runs seulement ; v1 = rotation documentée, creusement via agent
  // uniquement si explicitement permis (les findings d'observation priment).
  const runs = mem.listRuns(500).length;
  const every = cfg.loop.researchEveryNRuns;
  const due = runs % every === 0;
  if (!due) { S('RESEARCHED', `veille planifiée dans ${every - (runs % every)} cycles (1/${every})`); return; }
  const topics = ['travel UX', 'weather interfaces', 'mapping interfaces', 'interaction design',
    'motion design', 'SEO architecture', 'travel monetization', 'competitor products', 'hospitality software'];
  const topic = topics[Math.floor(runs / every) % topics.length];
  S('RESEARCHED', `sujet programmé : « ${topic} » (approfondissement agent gated — allowAgentImplementation)`);
  fs.mkdirSync(C.paths.research, { recursive: true });
  fs.writeFileSync(path.join(C.paths.research, `backlog-${topic.replace(/\s+/g, '-')}.md`),
    `# Veille programmée : ${topic}\n\nPlanifiée au cycle ${report.id}. À approfondir (agent ou humain) et persister ici.\n`, 'utf8');
}

function phaseAnalyze(obs) {
  const findings = findingsFromObservation(obs);
  findings.obsId = obs.id;
  const queue = mem.loadQueue();
  const res = analyze({ findings, queue, isRejectedFn: fp => mem.isRejected(fp), cfg });

  // Persiste les nouveaux candidats en queue (statut new, actionable agent/human)
  if (res.candidates.length) {
    for (const c of res.candidates) {
      queue.opportunities = queue.opportunities || [];
      if (!queue.opportunities.some(o => o.id === c.id)) queue.opportunities.push(c);
      mem.writeOpportunityFile(c);
    }
    mem.saveQueue(queue);
    S('FOUND', `${res.candidates.length} nouveau(x) candidat(s) ajouté(s) à la queue (depuis sonde ${obs.id})`);
    for (const c of res.candidates.slice(0, 6)) S('FOUND', `${c.severity.toUpperCase()} · ${c.title.slice(0, 110)}`);
  } else {
    S('FOUND', 'aucun nouveau finding (prod nominale sur la surface sondée)');
  }

  if (res.selected) {
    S('FOUND', `SÉLECTIONNÉ : ${res.selected.id} (${res.selected.severity}/${res.selected.actionable}, score ${res.selected._score})`);
  } else {
    S('FOUND', `rien d'auto-exécutable (candidats en attente = agent/human)`);
  }
  return res;
}

async function phaseImplementAndShip(opp) {
  const slug = (opp.recipe || opp.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const branch = cfg.git.branchPrefix + report.id + '-' + slug;

  if (DRY) {
    S('IMPLEMENTED', `[dry-run] aurait créé ${branch} et appliqué ${opp.recipe || 'agent'}`);
    return { dry: true };
  }

  mem.updateOpportunity(opp.id, { status: 'picked', pickedAt: C.nowIso() });

  // ── IMPLEMENT (avec self-repair ≤3) ──────────────────────────────────────
  const wt = gitops.prepareWorktree(cfg, branch, m => log('[worktree] ' + m));
  let attempt = 0, gate = null, impl = null;
  while (attempt <= cfg.loop.maxRepairAttempts) {
    attempt++;
    impl = await implementOpportunity(opp, wt, cfg, m => log('[implement] ' + m), gate ? gate.detail : null);
    if (!impl.ok) {
      if (impl.blocked) { stop(`opportunité non exécutable : ${impl.blocked}`); return { blocked: impl.blocked }; }
      if (attempt > cfg.loop.maxRepairAttempts || impl.via === 'recipe') break; // recette = déterministe : échec = stop sec
      continue;
    }
    S('IMPLEMENTED', `${impl.via}: ${impl.summary} (${impl.files ? impl.files.join(', ') : 'diff agent'})`);

    // ── REVIEW (policy sur le diff réel, y compris hallucinations agent) ────
    const diff = gitops.diffStats(wt);
    const ev = policy.evaluateFiles(diff.files, cfg);
    if (!ev.allowed) {
      stop(`diff touche la denylist : ${ev.denied.join(', ')}`);
      mem.writeRegression(opp.id + '-denylist', `Tentative de modification hors borne.\n\n${ev.reasons.join('\n')}`);
      return { blocked: 'denylist' };
    }
    const budgetErrs = policy.evaluateBudget(diff, cfg);
    if (budgetErrs.length) {
      stop(`explosion de diff : ${budgetErrs.join(' ; ')}`);
      mem.writeRegression(opp.id + '-explosion', budgetErrs.join('\n'));
      return { blocked: 'budget' };
    }
    const secrets = policy.scanSecrets(diff.diffText);
    if (secrets.length) {
      stop(`secret potentiel dans le diff : ${secrets.join(', ')}`);
      mem.writeRegression(opp.id + '-secret', secrets.join('\n'));
      return { blocked: 'secret-scan' };
    }

    // ── TEST / QA (Gate de ship complet dans le worktree) ──────────────────
    gate = await runGate({
      wt,
      files: diff.files,
      tests: diff.files.filter(f => f.startsWith('tests/') && f.endsWith('.cjs')),
      log: m => log('[verify] ' + m),
    });
    if (gate.ok) {
      S('TESTED', gate.steps.join(' · '));
      S('FIXED', attempt > 1 ? `réparé après ${attempt} tentative(s)` : 'vert du premier coup');
      break;
    }
    S('FAILED', `gate rouge (${gate.failedStep}) tentative ${attempt}/${cfg.loop.maxRepairAttempts}`);
    if (impl.via === 'recipe') break; // recette déterministe : réparer à l'aveugle n'a pas de sens
  }

  if (!gate || !gate.ok) {
    const detail = gate ? `${gate.failedStep}: ${(gate.detail || '').slice(0, 400)}` : (impl && impl.summary) || 'impl échouée';
    mem.writeRegression(opp.id, `Échec après ${attempt} tentative(s).\n\n${detail}`);
    mem.updateOpportunity(opp.id, { status: 'blocked', blockReason: detail.slice(0, 200) });
    stop(`opportunité abandonnée après ${attempt} tentative(s) — ${detail.split('\n')[0]}`);
    return { blocked: 'gate-failed', detail };
  }

  // ── PR ────────────────────────────────────────────────────────────────────
  const diff = gitops.diffStats(wt);
  const commitSha = gitops.commitAll(wt,
    `fix(autopilot): ${opp.title.slice(0, 90)}\n\nOpportunité ${opp.id}\nPreuve : ${(opp.evidence || '').slice(0, 200)}\nRollback : ${opp.rollback || 'revert'}\n\nCycle autopilot ${report.id}`,
    diff.files);
  gitops.pushBranch(wt, branch, cfg);
  const body = [
    `## 🤖 Cycle autopilot ${report.id}`, '',
    `**Opportunité** : ${opp.id} — ${opp.title}`, '',
    `**Preuve** : ${opp.evidence || 'n/a'}`, '',
    `**Impact attendu** : ${opp.expectedImpact || 'n/a'}`, '',
    `### Gate de ship (worktree dédié, build réel)`, '',
    gate.steps.map(s => `- ✅ ${s}`).join('\n'), '',
    `### Rollback`, '',
    `${opp.rollback || 'revert ' + commitSha}`, '',
    `### Frontières respectées`, '',
    `- ${diff.files.length} fichier(s), +${diff.insertions}/-${diff.deletions} lignes`,
    `- denylist money/secrets/api/régions : reposée sur le diff réel`,
    `- auto-merge : ${policy.canAutoMerge(diff.files, cfg) ? 'whitelisté' : 'NON (revue/merge fondateur ou convention CI-greens)'}`,
  ].join('\n');
  const pr = gitops.createPR(wt, { title: `[autopilot] ${opp.title.slice(0, 80)}`, body, base: cfg.git.baseBranch });
  report.prUrl = pr.url;
  S('PR', `${pr.url} (branche ${branch}, head ${commitSha})`);

  if (policy.canAutoMerge(diff.files, cfg)) {
    try { gitops.enableAutoMerge(wt, pr.url); S('PR', 'auto-merge activé (catégorie whitelistée)'); }
    catch (e) { S('PR', `auto-merge non activé : ${e.message.split('\n')[0]}`); }
  }

  mem.updateOpportunity(opp.id, { status: 'shipped', prUrl: pr.url, branch, commit: commitSha, shippedAt: C.nowIso() });
  fs.mkdirSync(C.paths.experiments, { recursive: true });
  fs.writeFileSync(path.join(C.paths.experiments, opp.id + '.md'),
    `# Expérience ${opp.id}\n\n- PR : ${pr.url}\n- branche : ${branch} · commit ${commitSha}\n- rollback : ${opp.rollback || 'revert'}\n- mesure attendue : ${opp.expectedImpact || 'n/a'}\n- livrée le ${C.nowIso()} — mesurer à J+7 (funnel events / dead-clicks stats.php).\n`, 'utf8');
  return { prUrl: pr.url, commitSha, branch };
}

async function main() {
  C.ensureDirs();
  cfg = C.loadConfig();
  report = mem.newReport(C.runId());
  fs.mkdirSync(path.join(C.paths.runs), { recursive: true });
  const lg = C.makeLogger(C.paths.runs);
  log = (m) => lg.log('orchestrator', m);

  log(`cycle ${report.id} démarré (${DRY ? 'DRY-RUN' : 'actif'})`);

  // ── STOP CONDITIONS pré-vol ───────────────────────────────────────────────
  if (fs.existsSync(C.paths.stopFile)) { stop('fichier STOP présent'); return finish(2); }
  const prOpen = gitops.openAutopilotPR();
  const health = await healthCheck();
  const fatalDown = health.filter(h => cfg.health.requiredDomains.some(d => h.startsWith(d)));
  if (fatalDown.length) { stop('production outage : ' + fatalDown.join(', ')); return finish(2); }
  if (health.length) S('OBSERVED', `⚠ domaines dégradés (non bloquants) : ${health.join(', ')}`);
  else S('OBSERVED', `health OK (${[cfg.health.requiredDomains, cfg.health.warnDomains].flat().length} domaines 2xx)`);
  if (prOpen) {
    S('PR', `PR précédente encore ouverte : #${prOpen.number} ${prOpen.title} — cycle = observation seule`);
    S('NEXT', `merger #${prOpen.number} pour débloquer l'implémentation au prochain cycle`);
  }

  const founder = gitops.founderTreeState();
  if (founder.foreignDirty) S('OBSERVED', `arbre fondateur WIP préservé (${founder.files.length} fichier(s) non-autopilot — jamais touchés) : ${founder.files.slice(0, 3).join(', ')}…`);

  try {
    if (budgetExceeded()) throw new Error('budget temps dépassé avant OBSERVE');
    const obs = await phaseObserve();

    if (!budgetExceeded()) await phaseResearch();

    const res = phaseAnalyze(obs);

    if (prOpen || budgetExceeded()) {
      if (budgetExceeded()) S('FAILED', 'budget temps atteint — implémentation reportée au prochain cycle');
    } else if (res.selected) {
      const r = await phaseImplementAndShip(res.selected);
      if (r && r.prUrl) {
        S('NEXT', `suivre CI de ${r.prUrl} puis merge (convention repo : CI verte)`);
        S('NEXT', 'mesurer l\'effet à J+7 (experiment file créé)');
      }
    }
  } catch (e) {
    stop('crash orchestrateur : ' + (e.message || e));
    log(e.stack || '');
    return finish(1);
  }
  finish(0);
}

function finish(code) {
  report.durationMin = +elapsedMin().toFixed(1);
  if (!report.sections.NEXT.length) {
    if (report.stopped) report.sections.NEXT.push('résoudre le stop indiqué puis relancer — l\'autopilot n\'a rien forcé');
    else report.sections.NEXT.push('prochain cycle au tick du scheduler (interval ' + cfg.loop.intervalMinutes + ' min)');
  }
  const p = mem.writeRunReport(report);
  log(`rapport : ${path.relative(C.ROOT, p)} + latest.md`);
  process.exitCode = code;
}

main();
