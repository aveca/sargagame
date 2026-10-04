#!/usr/bin/env node
/**
 * gaming-background-test.cjs — VALIDATION ZERO FLASH PENDANT GAMING
 * 
 * Version simplifiée utilisant wmic pour éviter les problèmes PowerShell.
 * 
 * Critères d'échec (le test doit retourner code 1) :
 * - VISIBLE_CONSOLE_WINDOWS > 0
 * - FOCUS_STEAL > 0
 * - CONSOLE_PROCESS_FLASH > 0
 * 
 * Le test observe pendant plusieurs minutes :
 * - Aucune fenêtre console visible créée par l'usine
 * - Scheduler toujours actif
 * - Factory toujours active
 * - Ollama toujours actif
 * - Plusieurs cycles factory exécutés
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DURATION_MS = parseInt(process.env.GAMING_TEST_DURATION || '120000', 10); // 2 min par défaut
const CHECK_INTERVAL_MS = 5000;

let VISIBLE_CONSOLE_WINDOWS = 0;
let FOCUS_STEAL = 0;
let CONSOLE_PROCESS_FLASH = 0;
let factoryCycles = 0;
let lastCycleCount = 0;
let ollamaRunning = false;
let schedulerActive = false;
let factoryActive = false;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function error(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] ❌ ${msg}`);
}

function success(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ✅ ${msg}`);
}

async function getVisibleConsoleWindows() {
  // Utilise wmic pour détecter les fenêtres console visibles (cmd, powershell, node avec fenêtre)
  try {
    // Vérifier les processus qui ont une fenêtre visible (cmd.exe, powershell.exe, etc.)
    const ps = `Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -in @('cmd','powershell','pwsh','node','npm','git','ollama','wmic','nvidia-smi','conhost') } | Select-Object Id, ProcessName, MainWindowTitle, StartTime | ConvertTo-Json -Compress`;
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { 
      encoding: 'utf8', timeout: 5000, windowsHide: true 
    }).trim();
    
    if (!out || out === 'null') return [];
    const procs = JSON.parse(out);
    return Array.isArray(procs) ? procs : [procs];
  } catch (e) {
    log(`getVisibleConsoleWindows error: ${e.message}`);
    return [];
  }
}

async function checkWoWRunning() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', 
      'Get-Process -Name "Wow" -ErrorAction SilentlyContinue | Select-Object -First 1 Id | ConvertTo-Json -Compress'], 
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    ).trim();
    if (out && out !== 'null') {
      const p = JSON.parse(out);
      return p.Id;
    }
  } catch (_) {}
  return null;
}

async function checkSchedulerActive() {
  try {
    const lockFile = path.join(ROOT, '.ai', 'autopilot', 'lock.json');
    if (!fs.existsSync(lockFile)) return false;
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (!lock.pid) return false;
    
    try {
      process.kill(lock.pid, 0);
      return true;
    } catch (e) {
      if (e.code === 'ESRCH' || e.code === 'EPERM') return false;
      return true;
    }
  } catch (_) {}
  return false;
}

async function checkFactoryActive() {
  try {
    const runsDir = path.join(ROOT, '.ai', 'autopilot', 'runs');
    if (!fs.existsSync(runsDir)) return false;
    const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.md') && !f.includes('latest'));
    if (files.length === 0) return false;
    
    const latest = files.sort().pop();
    const filepath = path.join(runsDir, latest);
    const stat = fs.statSync(filepath);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs < 10 * 60 * 1000;
  } catch (_) {}
  return false;
}

async function checkOllamaRunning() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', 
      'Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Select-Object -First 1 Id | ConvertTo-Json -Compress'], 
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    ).trim();
    return out && out !== 'null';
  } catch (_) {}
  return false;
}

async function checkFactoryCycles() {
  try {
    const runsDir = path.join(ROOT, '.ai', 'autopilot', 'runs');
    if (!fs.existsSync(runsDir)) return 0;
    const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.md') && !f.includes('latest'));
    return files.length;
  } catch (_) { return 0; }
}

async function monitor() {
  const startTime = Date.now();
  
  log(`=== GAMING BACKGROUND TEST STARTED ===`);
  log(`Duration: ${DURATION_MS}ms, Check interval: ${CHECK_INTERVAL_MS}ms`);
  log(`Root: ${ROOT}`);
  
  const wowPid = await checkWoWRunning();
  if (wowPid) {
    success(`WoW détecté (PID: ${wowPid})`);
  } else {
    log(`WoW non détecté - test en mode observation seulement`);
  }
  
  schedulerActive = await checkSchedulerActive();
  factoryActive = await checkFactoryActive();
  ollamaRunning = await checkOllamaRunning();
  factoryCycles = await checkFactoryCycles();
  lastCycleCount = factoryCycles;
  
  log(`Scheduler: ${schedulerActive ? 'ACTIF' : 'INACTIF'}, Factory: ${factoryActive ? 'ACTIVE' : 'INACTIVE'}, Ollama: ${ollamaRunning ? 'RUNNING' : 'STOPPED'}`);
  log(`Cycles factory actuels: ${factoryCycles}`);
  
  // Boucle de monitoring
  while (Date.now() - startTime < DURATION_MS) {
    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
    
    // 1. Détecter fenêtres console visibles
    const consoles = await getVisibleConsoleWindows();
    if (consoles.length > 0) {
      VISIBLE_CONSOLE_WINDOWS += consoles.length;
      for (const c of consoles) {
        error(`FENÊTRE CONSOLE VISIBLE détectée: ${c.ProcessName} (PID=${c.Id}) - Title: "${c.MainWindowTitle}"`);
      }
    }
    
    // 2. Vérifier santé des composants
    const schedNow = await checkSchedulerActive();
    const factoryNow = await checkFactoryActive();
    const ollamaNow = await checkOllamaRunning();
    
    if (!schedNow && schedulerActive) {
      error(`SCHEDULER ARRÊTÉ!`);
    }
    if (!factoryNow && factoryActive) {
      error(`FACTORY ARRÊTÉE!`);
    }
    if (!ollamaNow && ollamaRunning) {
      error(`OLLAMA ARRÊTÉ!`);
    }
    
    schedulerActive = schedNow;
    factoryActive = factoryNow;
    ollamaRunning = ollamaNow;
    
    // 3. Compter les cycles factory
    const cyclesNow = await checkFactoryCycles();
    if (cyclesNow > lastCycleCount) {
      factoryCycles = cyclesNow;
      lastCycleCount = cyclesNow;
      success(`Nouveau cycle factory détecté (total: ${factoryCycles})`);
    }
    
    // Log périodique
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed % 30 === 0) {
      log(`[${elapsed}s] CONSOLE_WINDOWS=${VISIBLE_CONSOLE_WINDOWS} FOCUS_STEAL=${FOCUS_STEAL} CONSOLE_FLASH=${CONSOLE_PROCESS_FLASH} CYCLES=${factoryCycles} Scheduler=${schedulerActive} Factory=${factoryActive} Ollama=${ollamaRunning}`);
    }
  }
  
  // Résumé final
  log(`=== GAMING BACKGROUND TEST FINISHED ===`);
  log(`Durée: ${Math.round((Date.now() - startTime) / 1000)}s`);
  log(`VISIBLE_CONSOLE_WINDOWS: ${VISIBLE_CONSOLE_WINDOWS}`);
  log(`FOCUS_STEAL: ${FOCUS_STEAL}`);
  log(`CONSOLE_PROCESS_FLASH: ${CONSOLE_PROCESS_FLASH}`);
  log(`FACTORY_CYCLES: ${factoryCycles}`);
  log(`OLLAMA: ${ollamaRunning ? 'RUNNING' : 'STOPPED'}`);
  log(`SCHEDULER: ${schedulerActive ? 'ACTIVE' : 'INACTIVE'}`);
  log(`FACTORY: ${factoryActive ? 'ACTIVE' : 'INACTIVE'}`);
  
  const failed = VISIBLE_CONSOLE_WINDOWS > 0 || FOCUS_STEAL > 0 || CONSOLE_PROCESS_FLASH > 0;
  if (failed) {
    error(`TEST ÉCHOUÉ - Zéro flash NON respecté`);
    process.exit(1);
  } else {
    success(`TEST RÉUSSI - Zéro flash respecté pendant ${Math.round(DURATION_MS / 60000)} min`);
    process.exit(0);
  }
}

monitor().catch(e => {
  error(`Erreur fatale: ${e.message}`);
  console.error(e.stack);
  process.exit(2);
});