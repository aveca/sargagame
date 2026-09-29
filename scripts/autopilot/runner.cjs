#!/usr/bin/env node
/**
 * runner.cjs — enveloppe UNATTENDED de l'orchestrateur.
 *
 * Destiné à Windows Task Scheduler (ou cron WSL). Chaque invocation = UN tick.
 *  - verrou PID (.ai/autopilot/orchestrator.lock) : 1 orchestrateur à la fois,
 *    stale-récupéré après crash/reboot (PID mort ou âge > 2 h)
 *  - kill-switch : .ai/autopilot/STOP présent → sortie immédiate
 *  - ressources : free-mem minimum, timebox maxRunMinutes (kill tree au-delà),
 *    priorité process abaissée (Windows : BELOW_NORMAL)
 *  - crash de l'orchestrateur → note dans runner.log + exit 1 (le scheduler
 *    relance au prochain tick ; aucune boucle infinie)
 *  - mode CONTINUOUS : SARGA_AUTOPILOT_CONTINUOUS=1 — boucle sans fin avec WAITING
 *
 * Exit : 0 cycle terminé · 3 déjà en cours (ignoré) · 4 STOP file · 1 erreur
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
const WAIT_INTERVAL_MS = (process.env.SARGA_AUTOPILOT_WAIT_MS || '60000') | 0;

function main() {
  C.ensureDirs();
  const cfg = C.loadConfig();

  if (fs.existsSync(C.paths.stopFile)) { rlog('STOP file présent — arrêt propre'); process.exit(4); }

  const freeMB = Math.round(os.freemem() / 1048576);
  if (freeMB < cfg.resources.minFreeMemoryMB) {
    rlog(`mémoire libre ${freeMB} Mo < ${cfg.resources.minFreeMemoryMB} Mo — tick sauté (protège la machine)`);
    process.exit(0);
  }

  const acq = lock.acquire({ staleAfterMs: (cfg.loop.maxRunMinutes + 30) * 60000 });
  if (!acq.ok) { rlog('skip : ' + acq.reason); process.exit(3); }

  // Priorité douce — jamais 100 % CPU aux dépens du fondateur
  if (process.platform === 'win32') {
    try { execSync(`wmic process where ProcessId=${process.pid} CALL setpriority 16384`, { stdio: 'ignore' }); } catch (_) {}
    try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${process.pid}).PriorityClass='BelowNormal'"`, { stdio: 'ignore' }); } catch (_) {}
  } else { try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) {} }

  rlog(`tick — free ${freeMB} Mo · unattended=${C.isUnattendedWindow(cfg)} · pid ${process.pid} · continuous=${CONTINUOUS} · live=${LIVE}`);

  // Continuous loop
  let cycleCount = 0;
  const runCycle = async () => {
    cycleCount++;
    
    // Bridge GitHub → queue locale (one-time per cycle)
    try {
      const bridgeResult = bridge.ingestOpenIssues({ dry: process.argv.includes('--dry'), log: rlog });
      rlog('bridge : ' + bridgeResult.imported + ' tâche(s) importée(s) · ' + bridgeResult.ignored + ' ignorée(s)');
    } catch (e) {
      rlog('bridge indisponible — cycle local poursuivi : ' + e.message);
    }

    const child = spawn(process.execPath, [path.join(__dirname, 'orchestrator.cjs'), ...process.argv.slice(2)], {
      cwd: C.ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    child.stdout.on('data', d => { process.stdout.write(d); tee(d); });
    child.stderr.on('data', d => { process.stderr.write(d); tee(d); });
    function tee(buf) { try { fs.appendFileSync(C.paths.runnerLog, buf.toString()); } catch (_) {} }

    const hardTimeout = setTimeout(() => {
      rlog(`TIMEBOX ${cfg.loop.maxRunMinutes + 5} min dépassée — kill de l'orchestrateur`);
      try {
        if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' });
        else child.kill('SIGKILL');
      } catch (_) {}
    }, (cfg.loop.maxRunMinutes + 5) * 60000);

    return new Promise((resolve) => {
      child.on('exit', (code, signal) => {
        clearTimeout(hardTimeout);
        rlog(`orchestrateur terminé (cycle ${cycleCount}, code ${code}${signal ? ' / ' + signal : ''})`);
        resolve(code);
      });
      child.on('error', e => {
        clearTimeout(hardTimeout);
        rlog('spawn orchestrateur impossible : ' + e.message);
        resolve(1);
      });
    });
  };

  // Run at least one cycle
  await runCycle();

  if (!CONTINUOUS) {
    lock.release();
    rlog('mode single-run terminé');
    process.exit(0);
  }

  // Continuous mode: WAITING loop
  rlog('CONTINUOUS MODE ACTIVE — entering WAITING loop');
  while (!fs.existsSync(C.paths.stopFile)) {
    rlog(`WAITING — next scan in ${WAIT_INTERVAL_MS}ms (cycle ${cycleCount} completed)`);
    
    // Check for STOP file periodically
    await new Promise(r => setTimeout(r, WAIT_INTERVAL_MS));
    
    if (fs.existsSync(C.paths.stopFile)) {
      rlog('STOP file détecté — arrêt propre du mode continuous');
      break;
    }

    // Refresh lock (extend stale window)
    // Note: we don't release/reacquire to avoid race conditions
    // The lock was acquired for the whole continuous session
    
    // Check if there are new executable opportunities
    const queue = C.readJSON(C.paths.queue, { opportunities: [] });
    const hasNew = (queue.opportunities || []).some(o => 
      o.status === 'new' && o.actionable !== 'human'
    );
    
    if (!hasNew) {
      // Also check GitHub for new issues
      try {
        const bridgeResult = bridge.ingestOpenIssues({ dry: true, log: () => {} });
        if (bridgeResult.imported === 0) {
          rlog('WAITING — no new executable opportunities, continuing wait');
          continue;
        }
      } catch (e) {
        rlog('WAITING — bridge check failed, continuing wait: ' + e.message);
        continue;
      }
    }

    rlog('WAITING — new opportunity detected, starting next cycle');
    await runCycle();
  }

  lock.release();
  rlog('CONTINUOUS MODE STOPPED');
  process.exit(0);
}

main();
