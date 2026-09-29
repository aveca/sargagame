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
        if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore' });
        else orchestratorProcess.kill('SIGKILL');
      } catch (_) {}
    }
    // Don't exit immediately - let main loop handle cleanup
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  if (process.platform === 'win32') {
    process.on('exit', () => { if (orchestratorProcess) { try { execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore' }); } catch (_) {} } });
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
    try { execSync(`wmic process where ProcessId=${process.pid} CALL setpriority 16384`, { stdio: 'ignore' }); } catch (_) {}
    try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${process.pid}).PriorityClass='BelowNormal'"`, { stdio: 'ignore' }); } catch (_) {}
  } else { try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {} }

  rlog(`═══════════════════════════════════════════`);
  rlog(`SARGAGAME AUTOPILOT 24/7`);
  rlog(`═══════════════════════════════════════════`);
  rlog(`free ${freeMB} Mo · live=${LIVE} · headed=${HEADED} · continuous=${CONTINUOUS} · pid ${process.pid}`);
  if (HEADED) rlog(`HEADED BROWSER MODE ENABLED`);

  // Acquire lock ONCE for the entire session
  const acq = lock.acquire({ staleAfterMs: 24 * 60 * 60 * 1000 }); // 24h stale for long-lived
  if (!acq.ok) { rlog('skip : ' + acq.reason); process.exit(3); }
  rlog('lock acquired — single runner active');

  let cycleCount = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 5;

  // MAIN 24/7 LOOP
  while (!isShuttingDown && !fs.existsSync(C.paths.stopFile)) {
    cycleCount++;
    const cycleStart = Date.now();
    let cycleSuccess = false;

    try {
      rlog(`\n┌─ CYCLE ${cycleCount} ──────────────────────────────`);
      
      // 1. BRIDGE: Import GitHub issues (non-blocking)
      try {
        const bridgeResult = bridge.ingestOpenIssues({ dry: process.argv.includes('--dry'), log: rlog });
        rlog(`bridge: ${bridgeResult.imported} imported, ${bridgeResult.ignored} ignored`);
      } catch (e) {
        rlog(`bridge failed (non-fatal): ${e.message}`);
      }

      // 2. RUN ORCHESTRATOR
      const orchestratorCode = await runOrchestrator();
      
      if (orchestratorCode === 0) {
        cycleSuccess = true;
        consecutiveErrors = 0;
        rlog(`cycle ${cycleCount} completed successfully`);
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
      if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore' });
      else orchestratorProcess.kill('SIGKILL');
    } catch (_) {}
  }
  lock.release();
  rlog('AUTOPILOT 24/7 STOPPED');
  process.exit(0);
}

async function runOrchestrator() {
  return new Promise((resolve) => {
    const args = process.argv.slice(2).filter(a => !['--live', '--continuous', '--headed'].includes(a));
    orchestratorProcess = spawn(process.execPath, [path.join(__dirname, 'orchestrator.cjs'), ...args], {
      cwd: C.ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stdout = '', stderr = '';
    orchestratorProcess.stdout.on('data', d => { process.stdout.write(d); tee(d); });
    orchestratorProcess.stderr.on('data', d => { process.stderr.write(d); tee(d); });
    function tee(buf) { try { fs.appendFileSync(C.paths.runnerLog, buf.toString()); } catch (_) {} }

    const hardTimeout = setTimeout(() => {
      rlog(`TIMEBOX ${cfg.loop.maxRunMinutes + 5} min exceeded — killing orchestrator`);
      try {
        if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${orchestratorProcess.pid}`, { stdio: 'ignore' });
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