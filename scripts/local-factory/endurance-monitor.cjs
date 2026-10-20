#!/usr/bin/env node
/**
 * endurance-monitor.cjs — Surveille l'endurance du factory runner
 * Écrit un rapport périodique avec l'état du système
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STATE_DIR = path.join(__dirname, 'state');
const HEARTBEAT_FILE = path.join(STATE_DIR, 'heartbeat.json');
const TELEMETRY_FILE = path.join(STATE_DIR, 'telemetry.json');
const QUEUE_DIR = path.join(__dirname, 'queue');
const SUPERVISOR_LOG = path.join(STATE_DIR, 'supervisor.log');
const MONITOR_LOG = path.join(STATE_DIR, 'endurance-monitor.log');

const START_TIME = Date.now();
let checkNum = 0;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(MONITOR_LOG, line + '\n'); } catch (_) {}
}

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function getQueueDepth() {
  try {
    return fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).length;
  } catch (_) { return 0; }
}

function getProcessStatus(pid) {
  try {
    process.kill(pid, 0);
    return 'running';
  } catch (e) {
    return e.code === 'ESRCH' ? 'dead' : 'unknown';
  }
}

function check() {
  checkNum++;
  const elapsedMin = ((Date.now() - START_TIME) / 60000).toFixed(1);
  
  const hb = loadJSON(HEARTBEAT_FILE, null);
  const tel = loadJSON(TELEMETRY_FILE, { cycles: 0, tasks: {}, lastCycle: null });
  const queueDepth = getQueueDepth();
  
  let pidStatus = 'no heartbeat';
  let pid = null;
  if (hb && hb.pid) {
    pid = hb.pid;
    pidStatus = getProcessStatus(hb.pid);
  }
  
  const hbAgeMin = hb ? ((Date.now() - Date.parse(hb.at)) / 60000).toFixed(1) : 'N/A';
  const taskSuccess = tel.tasks?.task_success?.success || 0;
  const taskError = tel.tasks?.task_error?.failed || 0;
  const cycles = tel.cycles || 0;
  
  const line = `CHECK #${checkNum} | ${elapsedMin}min | cycles=${cycles} | queue=${queueDepth} | pid=${pid}(${pidStatus}) | hb_age=${hbAgeMin}min | tasks: ${taskSuccess}ok/${taskError}err`;
  log(line);
  
  return { checkNum, elapsedMin, cycles, queueDepth, pid, pidStatus, hbAgeMin, taskSuccess, taskError, heartbeat: hb };
}

// Run every 60 seconds
async function run() {
  log('=== ENDURANCE MONITOR STARTED ===');
  log(`PID monitor: ${process.pid}`);
  
  while (true) {
    try {
      check();
    } catch (e) {
      log(`Monitor error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 60000));
  }
}

run().catch(e => {
  console.error('Monitor fatal:', e);
  process.exit(1);
});
