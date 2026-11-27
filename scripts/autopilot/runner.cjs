#!/usr/bin/env node
/**
 * runner.cjs — RUNNER 24/7 AUTONOMOUS
 *
 * Processus long-lived unique. Un seul runner à la fois via lock PID.
 * Ne s'arrête QUE sur : STOP file, crash non récupérable, sécurité, corruption Git,
 * blocage infrastructure critique.
 *
 * Architecture :
 *   while ACTIVE:
 *     observe → discover → revenue → prioritize → implement → verify → deliver → park/finish → cleanup → cooldown → repeat
 *
 * Exit codes:
 *   0 = normal shutdown (STOP file)
 *   1 = crash
 *   3 = lock held by another runner
 *   4 = STOP file at startup
 *   5 = critical infrastructure failure
 */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const C = require('./lib/common.cjs');
const lock = require('./lib/lock.cjs');
// Pont multi-dépôt (allowlist fermée, routage strict, idempotence inter-ponts,
// statuts corrélés publiés sur l'issue source). Il REMPLACE le pont mono-dépôt
// `bridge.cjs` dans la boucle : ce dernier n'est plus appelé par le runner
// (il reste dans le dépôt comme contrat mono-dépôt historique).
const multiRepoBridge = require('./multi-repo-bridge.cjs');
const lifecycle = require('./lib/mission-lifecycle.cjs');
const missionWatchdog = require('./lib/mission-watchdog.cjs');
const mem = require('./lib/memory.cjs');
const notify = require('./lib/notify.cjs');

function rlog(msg) {
  const line = `${new Date().toISOString()} [runner] ${msg}`;
  console.log(line);
  // La trace du runner ne doit JAMAIS devenir un point muet : si le log
  // principal est verrouille (EBUSY sous Windows quand un wrapper redirige
  // stdout vers le meme fichier), on bascule vers le log console, puis vers
  // stderr. Un catch silencieux ici a deja fait perdre des cycles entiers.
  try { fs.mkdirSync(path.dirname(C.paths.runnerLog), { recursive: true }); fs.appendFileSync(C.paths.runnerLog, line + '\n'); return; } catch (_) {}
  try { fs.mkdirSync(path.dirname(C.paths.runnerConsoleLog), { recursive: true }); fs.appendFileSync(C.paths.runnerConsoleLog, line + '\n'); return; } catch (_) {}
  try { console.error(`[runner][log-unavailable] ${line}`); } catch (_) {}
}

/**
 * WATCHDOG DE MISSIONS — reprise sans doublon.
 *
 * La logique vit dans `lib/mission-watchdog.cjs` (module pur, testable
 * hors-ligne) ; le runner ne fait que l'appeler avec ses dépendances.
 */
function runMissionWatchdog(cfg) {
  return missionWatchdog.runMissionWatchdog({
    cfg,
    log: rlog,
    publish: (repo, issue, status, detail, options) =>
      multiRepoBridge.publishStatus(repo, issue, status, detail, options),
  });
}

const CONTINUOUS = process.env.SARGA_AUTOPILOT_CONTINUOUS === '1';
const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';
const HEADED = process.env.SARGA_AUTOPILOT_HEADED === '1' || LIVE;
const WAIT_INTERVAL_MS = (process.env.SARGA_AUTOPILOT_WAIT_MS || '60000') | 0;
const COOLDOWN_MS = (process.env.SARGA_AUTOPILOT_COOLDOWN_MS || '30000') | 0;

let orchestratorProcess = null;
let isShuttingDown = false;

function setupSignalHandlers() {
  const handleSignal = (sig) => {
    rlog(`signal ${sig} received — graceful shutdown`);
    isShuttingDown = true;
    if (orchestratorProcess) {
      try {
        if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore', windowsHide: true });
        else orchestratorProcess.kill('SIGKILL');
      } catch (_) {}
    }
    // Don't exit immediately - let main loop handle cleanup
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  if (process.platform === 'win32') {
    process.on('exit', () => { if (orchestratorProcess) { try { execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore', windowsHide: true }); } catch (_) {} } });
  }
}

async function main() {
  C.ensureDirs();
  setupSignalHandlers();
  
  const cfg = C.loadConfig();

  if (fs.existsSync(C.paths.stopFile)) { rlog('STOP file présent — arrêt propre'); process.exit(4); }

  const freeMB = Math.round(os.freemem() / 1048576);
  if (freeMB < cfg.resources.minFreeMemoryMB) {
    rlog(`mémoire libre ${freeMB} Mo < ${cfg.resources.minFreeMemoryMB} Mo — pause 60s`);
    await sleep(60000);
    // Don't exit - just wait and retry
  }

  // Priorité douce — jamais 100 % CPU aux dépens du fondateur
  if (process.platform === 'win32') {
    try { execSync(`wmic process where ProcessId=${process.pid} CALL setpriority 16384`, { stdio: 'ignore', windowsHide: true }); } catch (_) {}
    try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${process.pid}).PriorityClass='BelowNormal'"`, { stdio: 'ignore', windowsHide: true }); } catch (_) {}
  } else { try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {} }

  rlog(`═══════════════════════════════════════════`);
  rlog(`SARGAGAME AUTOPILOT 24/7`);
  rlog(`═══════════════════════════════════════════`);
  rlog(`free ${freeMB} Mo · live=${LIVE} · headed=${HEADED} · continuous=${CONTINUOUS} · pid ${process.pid}`);
  if (HEADED) rlog(`HEADED BROWSER MODE ENABLED`);

  // Acquire lock ONCE for the entire session (atomique : un seul runner gagne ;
  // le perdant sort en code 3 — jamais deux runners actifs sur le même repo).
  const acq = lock.acquire({ staleAfterMs: 24 * 60 * 60 * 1000 }); // 24h stale for long-lived
  if (!acq.ok) { rlog(`REFUSÉ second runner — ${acq.reason} (code ${acq.code || 'LOCKED'}) — arrêt propre`); process.exit(3); }
  rlog(`lock acquired — single runner active (pid ${process.pid}, token ${acq.entry.token.slice(0, 6)}…)`);

  // Notification externe : démarrage du runner (Discord + ping /start healthchecks)
  // Le routeur utilise en priorité les modèles FREE OpenCode (zéro quota NVIDIA) ;
  // la clé NVIDIA n'est consommée qu'en fallback (429 sur tous les modèles free).
  const modelSource = 'opencode-free → nvidia-fallback → ollama-local';
  notify.runnerStarted(process.pid, modelSource);
  notify.pingHealthchecks('/start');

  let cycleCount = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 5;
  const notifiedPrs = new Map(); // anti-spam : une PR signalée une seule fois par cycle
  let lastCycleError = '';
  // Issue du DERNIER cycle TERMINE. `cycleSuccess` est reinitialise a chaque
  // tour de boucle ET l'instantane d'etat est ecrit au DEMARRAGE du cycle :
  // sans cette variable, le champ `cycleSuccess` de status.json valait
  // TOUJOURS false, meme quand tous les cycles reussissaient (constate le
  // 2026-11-08 : 14 cycles "completed successfully" dans runner.log, et un
  // status.json qui annoncait cycleSuccess=false en boucle).
  let lastCycleSuccess = false;

  /**
   * Ecrit l'instantane d'etat externe (monitoring sans intervention humaine).
   * Facteurise pour pouvoir le reecrire PENDANT un cycle long : voir le
   * "gardien de vie" plus bas.
   */
  function writeStatusSnapshot() {
    try {
      const ls = lock.status();
      const manualSession = require('./local-model-router.cjs').manualOpencodeSessionActive();
      fs.writeFileSync(C.paths.statusFile, JSON.stringify({
        alive: true,
        pid: process.pid,
        lockPid: ls.lock?.pid,
        startedAt: ls.lock?.startedAt,
        lastHeartbeat: ls.lock?.heartbeatAt,
        cycleCount,
        // Issue du DERNIER cycle TERMINE (le cycle en cours n'est pas fini).
        cycleSuccess: lastCycleSuccess,
        consecutiveErrors,
        // Issue de la CONFIG EFFECTIVE, jamais une constante : la valeur
        // precedente etait codee en dur a `true` alors que
        // .ai/autopilot/config.json porte autoMergeEnabled=false. Un
        // operateur lisant status.json croyait donc que la factory
        // auto-mergeait les PR — alors que la politique REPRODUIT
        // (`lib/policy.cjs`) refuse justement l'auto-merge.
        autoMergeEnabled: Boolean(cfg.policy && cfg.policy.autoMergeEnabled),
        modelRouting: {
          mode: manualSession ? 'quota-protect' : 'perf',
          detail: manualSession
            ? 'session OpenCode manuelle détectée → free/local (quota NVIDIA préservé)'
            : 'aucune session manuelle → NVIDIA cloud (perf max)',
          nvidiaKey: process.env.NVIDIA_API_KEY ? 'SET' : 'NOT SET',
          openaiKey: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
          openrouterKey: process.env.OPENROUTER_API_KEY ? 'SET' : 'NOT SET',
        },
        notify: notify.channelsStatus(),
        timestamp: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      // Une erreur d'ecriture du snapshot d'etat ne doit pas tuer le cycle,
      // mais elle ne doit pas non plus disparaitre sans trace.
      rlog(`status write failed (non-fatal): ${e.message}`);
    }
  }

  // MAIN 24/7 LOOP
  while (!isShuttingDown && !fs.existsSync(C.paths.stopFile)) {
    cycleCount++;
    const cycleStart = Date.now();
    let cycleSuccess = false;
    // Gardien de vie du cycle (heartbeat continu) — declare hors du `try`
    // pour pouvoir etre arrete dans le `finally`.
    let guardian = null;

    try {
      rlog(`\n┌─ CYCLE ${cycleCount} ──────────────────────────────`);

      // Heartbeat : prouve « encore utilisé » (un lock sans heartbeat frais +
      // pid mort = stale récupérable ; pid vivant = jamais préempté).
      const hb = lock.heartbeat();
      if (!hb.ok) {
        rlog(`lock perdu (${hb.reason}) — un autre runner a pris le relais ? arrêt propre`);
        break;
      }

      // Statut externe (monitoring sans intervention humaine)
      writeStatusSnapshot();

      // GARDIEN DE VIE — le heartbeat doit battre PENDANT le cycle, pas
      // seulement a son debut.
      //
      // Constat reel (2026-11-08, sur le PC du fondateur) : un cycle qui
      // execute l'agent local dure jusqu'a `policy.agentMaxMinutes` = 25 min.
      // Le heartbeat (lock) et l'instantane d'etat n'etaient rafraichis
      // qu'AU DEBUT du cycle : pendant 25 minutes, `status.json` affichait
      // un `lastHeartbeat` vieux de 25 min alors que le runner faisait
      // reellement tourner un agent. Un operateur (ou un dead-man's switch
      // externe) concluait a une panne et pouvait arreter le runner AU
      // MOMENT ou il produisait enfin du travail. Le ping healthchecks
      // n'etait emis qu'aux frontiers de cycle : idem, silence pendant le
      // travail.
      //
      // Le pid vivant reste la source de verite pour le lock (fail-closed :
      // jamais preempte), mais le signalement doit etre HONNETE et
      // CONTINU : on rafraichit heartbeat + instantane + ping toutes les
      // 60 s pendant le cycle.
      guardian = setInterval(() => {
        try {
          const h = lock.heartbeat();
          if (!h.ok) {
            rlog(`guardian: heartbeat KO (${h.reason})`);
            return;
          }
          writeStatusSnapshot();
          notify.pingHealthchecks();
        } catch (e) {
          rlog(`guardian failed (non-fatal): ${String(e.message).slice(0, 120)}`);
        }
      }, 60 * 1000);
      if (typeof guardian.unref === 'function') guardian.unref();

      // 0. WATCHDOG DE MISSIONS — reprise des missions abandonnées (crash du
      //    runner, agent mort, heartbeat expiré) SANS doublon. Doit tourner
      //    AVANT l'import : une mission reprise peut être une mission déjà
      //    connue du pont (elle ne sera donc pas réimportée).
      try {
        const wd = runMissionWatchdog(cfg);
        if (wd.resumed > 0) rlog(`watchdog missions : ${wd.resumed}/${wd.checked} mission(s) reprise(s)`);
      } catch (e) {
        rlog(`watchdog missions (non-fatal): ${e.message}`);
      }

      // 1. BRIDGE: Import des missions GitHub (multi-dépôt) — non-bloquant.
      //    Le pont multi-dépôt est le SEUL point d'entrée de la boucle :
      //    allowlist fermée (aveca/bot-wow, aveca/sargagame), routage strict
      //    (une mission d'un autre dépôt autorisé est RELAYÉE, jamais exécutée
      //    ici), idempotence avec l'ancien pont mono-dépôt (une tâche déjà
      //    connue n'est jamais réimportée) et publication du statut
      //    `imported` sur l'issue source de la mission.
      try {
        const bridgeResult = multiRepoBridge.ingestMultiRepo({ dry: process.argv.includes('--dry'), log: rlog });
        rlog(`bridge: ${bridgeResult.imported} imported, ${bridgeResult.relayed} relayed, ${bridgeResult.blocked} blocked, ${bridgeResult.ignored} ignored, ${bridgeResult.rejected} rejected (local=${bridgeResult.localRepo})`);
        if (bridgeResult.statusFailures > 0) {
          rlog(`bridge: ${bridgeResult.statusFailures} publication(s) de statut en échec — accuser le silence est interdit`);
        }
      } catch (e) {
        rlog(`bridge failed (non-fatal): ${e.message}`);
      }

      // 1.5 GSC SEO watch (P0.7) — toutes les 16 cycles (~8 h), lecture seule,
      //     émet des opportunités dans la queue avec preuve + scope. Non-fatal.
      if (cycleCount % 16 === 2) {
        try {
          execFileSync(process.execPath, [path.join(__dirname, 'gsc-seo-watch.cjs')], {
            timeout: 120000, windowsHide: true, stdio: 'pipe',
          });
          rlog('gsc-seo-watch: opportunités SEO GSC vérifiées');
        } catch (e) {
          rlog(`gsc-seo-watch failed (non-fatal): ${String(e.message).slice(0, 80)}`);
        }
        // Funnel GA4 (P0.7/V4) : mesure de conversion 5 régions (dont hors GSC),
        // persistée dans ga4-funnel-latest.json. Étape "Mesurer" de la boucle.
        try {
          execFileSync(process.execPath, [path.join(__dirname, 'gsc-seo-watch.cjs'), '--funnel'], {
            timeout: 120000, windowsHide: true, stdio: 'pipe',
          });
          rlog('gsc-seo-watch --funnel: funnel GA4 mesuré (5 régions)');
        } catch (e) {
          rlog(`gsc-seo-watch --funnel failed (non-fatal): ${String(e.message).slice(0, 80)}`);
        }
      }

      // 2. RUN ORCHESTRATOR
      const orchestratorCode = await runOrchestrator(cfg);
      
      if (orchestratorCode === 0) {
        cycleSuccess = true;
        consecutiveErrors = 0;
        rlog(`cycle ${cycleCount} completed successfully`);

        // Monitoring externe : ping healthchecks (dead man's switch) + Discord si PR
        notify.pingHealthchecks();
        try {
          const report = fs.readFileSync(C.paths.latestMd, 'utf8');
          const pr = notify.detectPrInReport(report);
          if (pr) {
            const prKey = `cycle:${cycleCount}:pr:${pr.number}`;
            if (notifiedPrs.get(prKey) !== true) {
              notifiedPrs.set(prKey, true);
              notify.prDetected(pr.number, pr.line);
              rlog(`[notify] PR #${pr.number} signalée sur Discord`);
            }
          }
        } catch (_) {}
      } else if (orchestratorCode === 2) {
        // Stop condition (STOP file, prod down, etc.) - clean exit
        rlog(`orchestrator stop-condition (code 2) — graceful shutdown`);
        break;
      } else {
        // Error or non-fatal failure
        rlog(`orchestrator exited with code ${orchestratorCode}`);
        cycleSuccess = false;
        // Un code de sortie non nul DOIT compter comme un echec consecutif.
        // Avant ce correctif, seul le `catch` incrementait consecutiveErrors :
        // un orchestrateur qui sortait en erreur a chaque cycle laissait
        // consecutiveErrors a 0, donc JAMAIS d'alerte Discord
        // (`cycleFailed`, seuil 2) et JAMAIS de pause de securite
        // (`maxConsecutiveErrors`, seuil 5). La factory pouvait boucler
        // indefiniment en echec, silencieusement.
        consecutiveErrors++;
        lastCycleError = `orchestrator exited with code ${orchestratorCode}`;
      }

    } catch (e) {
      rlog(`cycle ${cycleCount} ERROR: ${e.message}`);
      rlog(e.stack);
      cycleSuccess = false;
      consecutiveErrors++;
      lastCycleError = e.message;
    } finally {
      // Le gardien de vie est strictement lie au cycle : il doit s'arreter
      // quand le cycle se termine (succes, erreur ou arret), sinon il
      // continuerait de rafraichir un etat qui n'avance plus.
      try { if (guardian) clearInterval(guardian); } catch (_) {}
      guardian = null;
    }

    // Memorise l'issue du cycle qui vient de se terminer : c'est elle que le
    // prochain instantane d'etat doit annoncer.
    lastCycleSuccess = cycleSuccess;

    // Alerte Discord sur échecs consécutifs (throttlé : à partir de 2) + ping /fail
    if (!cycleSuccess && consecutiveErrors >= 2) {
      notify.cycleFailed(cycleCount, consecutiveErrors, lastCycleError);
      notify.pingHealthchecks('/fail');
    }

    // Cooldown between cycles
    if (!isShuttingDown) {
      const elapsed = Date.now() - cycleStart;
      const remainingCooldown = Math.max(0, COOLDOWN_MS - elapsed);
      
      if (remainingCooldown > 0) {
        rlog(`cooldown ${remainingCooldown}ms...`);
        await sleep(remainingCooldown);
      }

      // Handle consecutive errors
      if (consecutiveErrors >= maxConsecutiveErrors) {
        rlog(`max consecutive errors (${maxConsecutiveErrors}) reached — pausing 5 min`);
        await sleep(5 * 60 * 1000);
        consecutiveErrors = 0;
      }
    }

    if (cycleSuccess) consecutiveErrors = 0;
  }

  // GRACEFUL SHUTDOWN
  rlog('shutdown initiated...');
  if (orchestratorProcess) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore', windowsHide: true });
      else orchestratorProcess.kill('SIGKILL');
    } catch (_) {}
  }
  const stopReason = fs.existsSync(C.paths.stopFile) ? 'STOP file détecté — arrêt propre demandé' : (isShuttingDown ? 'Signal d\'arrêt reçu (SIGINT/SIGTERM)' : `Condition d'arrêt orchestrator (dernier cycle ${cycleCount}, erreurs consécutives ${consecutiveErrors})`);
  notify.runnerStopped(stopReason);
  lock.release();
  rlog('AUTOPILOT 24/7 STOPPED');
  process.exit(0);
}

async function runOrchestrator(cfg) {
  return new Promise((resolve) => {
    const args = process.argv.slice(2).filter(a => !['--live', '--continuous', '--headed'].includes(a));
    const env = { ...process.env, PATH: process.env.PATH || 'C:\\Program Files\\Git\\cmd;C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem' };
    orchestratorProcess = spawn(process.execPath, [path.join(__dirname, 'orchestrator.cjs'), ...args], {
      cwd: C.ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      env,
    });
    
    let stdout = '', stderr = '';
    orchestratorProcess.stdout.on('data', d => { process.stdout.write(d); tee(d); });
    orchestratorProcess.stderr.on('data', d => { process.stderr.write(d); tee(d); });
    function tee(buf) { try { fs.appendFileSync(C.paths.runnerLog, buf.toString()); } catch (_) {} }

    const hardTimeout = setTimeout(() => {
      rlog(`TIMEBOX ${cfg.loop.maxRunMinutes + 5} min exceeded — killing orchestrator`);
      try {
        if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore', windowsHide: true });
        else orchestratorProcess.kill('SIGKILL');
      } catch (_) {}
    }, (cfg.loop.maxRunMinutes + 5) * 60000);

    orchestratorProcess.on('exit', (code, signal) => {
      clearTimeout(hardTimeout);
      if (code === 0 || code === 2) {
        resolve(code); // 0=success, 2=stop-condition
      } else {
        resolve(1); // error but continue
      }
    });
    orchestratorProcess.on('error', e => {
      clearTimeout(hardTimeout);
      rlog('orchestrator spawn error: ' + e.message);
      resolve(1);
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => {
  rlog('runner fatal: ' + e.message);
  rlog(e.stack);
  if (!isShuttingDown) lock.release();
  process.exit(1);
});