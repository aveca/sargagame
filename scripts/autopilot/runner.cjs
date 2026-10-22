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
const bridge = require('./bridge.cjs');
const notify = require('./lib/notify.cjs');

function rlog(msg) {
  const line = `${new Date().toISOString()} [runner] ${msg}`;
  console.log(line);
  try { fs.mkdirSync(path.dirname(C.paths.runnerLog), { recursive: true }); fs.appendFileSync(C.paths.runnerLog, line + '\n'); } catch (_) {}
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

  // MAIN 24/7 LOOP
  while (!isShuttingDown && !fs.existsSync(C.paths.stopFile)) {
    cycleCount++;
    const cycleStart = Date.now();
    let cycleSuccess = false;

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
          cycleSuccess,
          consecutiveErrors,
          autoMergeEnabled: true,
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
      } catch (_) {}

      // 1. BRIDGE: Import GitHub issues (non-blocking)
      try {
        const bridgeResult = bridge.ingestOpenIssues({ dry: process.argv.includes('--dry'), log: rlog });
        rlog(`bridge: ${bridgeResult.imported} imported, ${bridgeResult.ignored} ignored`);
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
      }

    } catch (e) {
      rlog(`cycle ${cycleCount} ERROR: ${e.message}`);
      rlog(e.stack);
      cycleSuccess = false;
      consecutiveErrors++;
      lastCycleError = e.message;
    }

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