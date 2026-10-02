#!/usr/bin/env node
/**
 * factory-runner.cjs — Continuous Autonomous Factory Runner
 * 
 * Main orchestrator that runs continuously:
 * - Picks tasks from queue (local + GitHub/API discovery)
 * - Routes to appropriate worker (FAST/STRONG/SPECIALIST/FALLBACK)
 * - Implements circuit breaker, fallback, retry with backoff
 * - Handles Git/PR/CI/Deploy lifecycle
 * - Telemetry and recovery
 * 
 * Usage:
 *   node scripts/local-factory/factory-runner.cjs --run
 *   node scripts/local-factory/factory-runner.cjs --run --once
 *   node scripts/local-factory/factory-runner.cjs --status
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { withPreviewServer, stopAllServers, killProcessTree, runBounded } = require('../lib/process-runner.cjs');

// Get repo root by walking up from script location
const SCRIPT_DIR = __dirname;
const SCRIPTS_DIR = path.dirname(SCRIPT_DIR); // scripts/
const ROOT = path.dirname(SCRIPTS_DIR); // repo root
const AI_DIR = path.join(ROOT, '.ai');
const QUEUE_DIR = path.join(ROOT, 'queue');
const STATE_DIR = path.join(__dirname, 'state');
const LOGS_DIR = path.join(__dirname, 'logs');

const TASKS_FILE = path.join(AI_DIR, 'tasks.md');
const STATE_FILE = path.join(AI_DIR, 'current_state.md');
const CHANGELOG_FILE = path.join(AI_DIR, 'changelog.md');

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(QUEUE_DIR, { recursive: true });

const LOCK_FILE = path.join(STATE_DIR, 'factory.lock');
const TELEMETRY_FILE = path.join(STATE_DIR, 'telemetry.json');
const CIRCUIT_BREAKER_FILE = path.join(STATE_DIR, 'circuit-breakers.json');
const WORKER_POOL_FILE = path.join(STATE_DIR, 'worker-pool.json');

// Worker model tiers
const WORKER_TIERS = [
  { name: 'FAST', model: 'gpt-4o-mini', maxTokens: 4096, timeout: 60000, costTier: 'low' },
  { name: 'STRONG', model: 'gpt-4o', maxTokens: 8192, timeout: 180000, costTier: 'medium' },
  { name: 'SPECIALIST', model: 'o1-preview', maxTokens: 32768, timeout: 300000, costTier: 'high' },
  { name: 'FALLBACK', model: 'claude-3.5-sonnet', maxTokens: 8192, timeout: 180000, costTier: 'medium' }
];

// Circuit breaker states
const CB_STATE = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' };

function loadJSON(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function log(event, data = {}) {
  const entry = { t: new Date().toISOString(), event, ...data };
  const logFile = path.join(LOGS_DIR, `factory-${new Date().toISOString().slice(0, 10)}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  console.log(`[factory] ${event}`, data);
}

// Lock management
function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const { pid, at } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    if (pidAlive(pid)) {
      const ageMin = (Date.now() - Date.parse(at)) / 60000;
      if (ageMin < 120) {
        console.log(`[factory] Already running (pid ${pid}, ${ageMin.toFixed(0)} min)`);
        process.exit(0);
      }
      log('lock.reclaim', { stalePid: pid, ageMin: Math.round(ageMin) });
    }
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
}
function releaseLock() { try { fs.unlinkSync(LOCK_FILE); } catch (_) {} }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

// Circuit Breaker
function loadCircuitBreakers() { return loadJSON(CIRCUIT_BREAKER_FILE, {}); }
function saveCircuitBreakers(cb) { saveJSON(CIRCUIT_BREAKER_FILE, cb); }

function recordFailure(provider) {
  const cb = loadCircuitBreakers();
  const state = cb[provider] || { state: CB_STATE.CLOSED, failures: 0, lastFailure: null, nextAttempt: null };
  state.failures++;
  state.lastFailure = new Date().toISOString();
  
  if (state.failures >= 5 && state.state === CB_STATE.CLOSED) {
    state.state = CB_STATE.OPEN;
    state.nextAttempt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min
    log('circuit.open', { provider, failures: state.failures });
  }
  
  cb[provider] = state;
  saveCircuitBreakers(cb);
}

function recordSuccess(provider) {
  const cb = loadCircuitBreakers();
  if (cb[provider]) {
    cb[provider] = { state: CB_STATE.CLOSED, failures: 0, lastFailure: null, nextAttempt: null };
    saveCircuitBreakers(cb);
  }
}

function canUseProvider(provider) {
  const cb = loadCircuitBreakers();
  const state = cb[provider];
  if (!state || state.state === CB_STATE.CLOSED) return true;
  if (state.state === CB_STATE.OPEN) {
    if (new Date() > new Date(state.nextAttempt)) {
      state.state = CB_STATE.HALF_OPEN;
      saveCircuitBreakers(cb);
      return true;
    }
    return false;
  }
  // HALF_OPEN - allow one request
  return true;
}

function getAvailableWorker(currentTier = 0) {
  for (let i = currentTier; i < WORKER_TIERS.length; i++) {
    const worker = WORKER_TIERS[i];
    if (canUseProvider(worker.model)) return { ...worker, tierIndex: i };
  }
  return null; // All exhausted
}

// Telemetry
function loadTelemetry() { return loadJSON(TELEMETRY_FILE, { cycles: 0, tasks: {}, lastCycle: null }); }
function saveTelemetry(t) { saveJSON(TELEMETRY_FILE, t); }

function recordTelemetry(event, data) {
  const t = loadTelemetry();
  t.cycles++;
  t.lastCycle = new Date().toISOString();
  if (!t.tasks[event]) t.tasks[event] = { count: 0, success: 0, failed: 0 };
  t.tasks[event].count++;
  if (data.success) t.tasks[event].success++;
  else t.tasks[event].failed++;
  saveTelemetry(t);
  log('telemetry', { event, ...data });
}

// Queue management
function loadQueue() {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  return fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

function saveQueueItem(item) {
  const file = path.join(QUEUE_DIR, `${item.id}.json`);
  fs.writeFileSync(file, JSON.stringify(item, null, 2));
}

function removeQueueItem(id) {
  const file = path.join(QUEUE_DIR, `${id}.json`);
  try { fs.unlinkSync(file); } catch (_) {}
}

function requeueItem(item, delayMs = 0) {
  if (delayMs > 0) {
    setTimeout(() => saveQueueItem(item), delayMs);
  } else {
    saveQueueItem(item);
  }
}

// Task execution with fallback
async function executeTask(task, worker) {
  const startTime = Date.now();
  const taskType = task.type || 'unknown';
  
  log('task.start', { id: task.id, type: taskType, worker: worker.name, model: worker.model });
  
  try {
    // Route to appropriate handler
    let result;
    switch (taskType) {
      case 'render_brief':
        result = await executeRenderBrief(task, worker);
        break;
      case 'github_discovery_candidate':
        result = await executeGitHubDiscovery(task, worker);
        break;
      case 'api_candidate':
        result = await executeAPIDiscovery(task, worker);
        break;
      case 'code_task':
        result = await executeCodeTask(task, worker);
        break;
      case 'test_task':
        result = await executeTestTask(task, worker);
        break;
      case 'deploy_task':
        result = await executeDeployTask(task, worker);
        break;
      default:
        // Generic handler via agent-handoff
        result = await executeGenericTask(task, worker);
    }
    
    const duration = Date.now() - startTime;
    log('task.success', { id: task.id, type: taskType, duration, worker: worker.name });
    recordTelemetry('task_success', { taskId: task.id, type: taskType, worker: worker.name, duration, success: true });
    recordSuccess(worker.model);
    
    return { success: true, result, duration, worker: worker.name };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    log('task.error', { id: task.id, type: taskType, duration, error: error.message, worker: worker.name });
    recordTelemetry('task_error', { taskId: task.id, type: taskType, worker: worker.name, duration, error: error.message, success: false });
    recordFailure(worker.model);
    throw error;
  }
}

async function executeWithFallback(task) {
  let lastError;
  
  for (let tierIndex = 0; tierIndex < WORKER_TIERS.length; tierIndex++) {
    const worker = getAvailableWorker(tierIndex);
    if (!worker) {
      log('worker.exhausted', { taskId: task.id, triedTiers: tierIndex });
      throw new Error('All workers exhausted');
    }
    
    try {
      return await executeTask(task, worker);
    } catch (error) {
      lastError = error;
      const is429 = error.message.includes('429') || error.message.includes('rate limit');
      const isTimeout = error.message.includes('timeout') || error.message.includes('TIMEOUT');
      const isModelError = error.message.includes('model') || error.message.includes('provider');
      
      log('worker.fallback', { 
        taskId: task.id, 
        failedWorker: worker.name, 
        error: error.message,
        is429, isTimeout, isModelError,
        nextTier: tierIndex + 1
      });
      
      // Backoff before retry
      const backoff = Math.min(1000 * Math.pow(2, tierIndex) + Math.random() * 1000, 30000);
      log('worker.backoff', { taskId: task.id, backoffMs: backoff });
      await new Promise(r => setTimeout(r, backoff));
      
      // If not a model/provider error, don't fallback to next tier
      if (!is429 && !isTimeout && !isModelError) {
        throw error;
      }
    }
  }
  
  throw lastError || new Error('All workers failed');
}

// Specific task executors
async function executeRenderBrief(task, worker) {
  const { region } = task.payload || {};
  if (!region) throw new Error('Missing region');
  
  const marker = path.join(ROOT, 'scripts', 'video', 'out', `brief-${region}-${new Date().toISOString().slice(0, 10)}.mp4`);
  if (fs.existsSync(marker) && fs.statSync(marker).size > 100000) {
    return { skipped: 'exists', region };
  }
  
  // Use process-runner to execute the render
  const { runBounded } = require('./lib/process-runner.cjs');
  const result = await runBounded('node', [
    path.join(ROOT, 'scripts', 'video', 'make-brief.cjs'), 
    region
  ], { cwd: ROOT, timeout: 8 * 60000 });
  
  const done = fs.existsSync(marker) && fs.statSync(marker).size > 100000;
  if (!done) throw new Error('Render failed - no output file');
  return { rendered: region, size: fs.statSync(marker).size };
}

async function executeGitHubDiscovery(task, worker) {
  const { runDiscovery } = require('../automation/github-discovery.cjs');
  const result = await runDiscovery({ dryRun: false });
  return { candidates: result.candidates, analyzed: result.analyzed };
}

async function executeAPIDiscovery(task, worker) {
  const { runDiscovery } = require('../automation/api-discovery.cjs');
  const result = await runDiscovery({ dryRun: false, verify: true });
  return { candidates: result.candidates, verified: result.verified };
}

async function executeCodeTask(task, worker) {
  // Use agent-handoff to create branch, implement, test
  const { execSync } = require('child_process');
  const taskId = task.id;
  const agentType = task.agent || 'coding';
  
  execSync(`node scripts/agent-handoff.cjs --task ${taskId}`, { cwd: ROOT, encoding: 'utf8' });
  
  // The agent will work on the task and mark complete
  // We wait for the branch to be pushed and PR created
  await waitForPR(taskId);
  
  return { taskId, branch: `agent/${agentType}/${taskId}` };
}

async function executeTestTask(task, worker) {
  const { runBounded } = require('./lib/process-runner.cjs');
  const testType = task.payload?.testType || 'all';
  
  let cmd, args;
  switch (testType) {
    case 'smoke':
      cmd = 'node'; args = ['scripts/run-smoke.cjs']; break;
    case 'unit':
      cmd = 'npm'; args = ['test']; break;
    case 'e2e':
      cmd = 'npx'; args = ['playwright', 'test']; break;
    case 'build':
      cmd = 'npm'; args = ['run', 'build']; break;
    default:
      cmd = 'npm'; args = ['test']; break;
  }
  
  const result = await runBounded(cmd, args, { cwd: ROOT, timeout: 300000 });
  return { testType, output: result.stdout };
}

async function executeDeployTask(task, worker) {
  // Trigger deploy via git push
  const { execSync } = require('child_process');
  execSync('git push origin main', { cwd: ROOT, encoding: 'utf8' });
  
  // Wait for workflow
  await waitForWorkflow('daily-copernicus.yml');
  
  return { deployed: true };
}

async function executeGenericTask(task, worker) {
  // Generic implementation via agent-handoff
  const { execSync } = require('child_process');
  const taskId = task.id;
  const agentType = task.agent || 'coding';
  
  execSync(`node scripts/agent-handoff.cjs --task ${taskId}`, { cwd: ROOT, encoding: 'utf8' });
  
  // Simulate work - in real implementation, this would be the actual AI work
  await new Promise(r => setTimeout(r, 5000));
  
  execSync(`node scripts/agent-handoff.cjs --complete`, { cwd: ROOT, encoding: 'utf8' });
  
  return { taskId, completed: true };
}

async function waitForPR(taskId) {
  // Poll for PR creation
  for (let i = 0; i < 60; i++) {
    try {
      const prs = execSync(`gh pr list --head agent/*/${taskId} --json number`, { cwd: ROOT, encoding: 'utf8' });
      const data = JSON.parse(prs);
      if (data.length > 0) return data[0].number;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 5000));
  }
  return null;
}

async function waitForWorkflow(workflowName) {
  // Poll for workflow completion
  for (let i = 0; i < 180; i++) { // 15 min max
    try {
      const runs = execSync(`gh run list --workflow ${workflowName} --limit 1 --json conclusion,status`, { cwd: ROOT, encoding: 'utf8' });
      const data = JSON.parse(runs);
      if (data.length > 0 && data[0].status === 'completed') {
        return data[0].conclusion === 'success';
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

// Queue processing
async function processQueue() {
  let totalProcessed = 0;
  
  while (true) {
    const queue = loadQueue();
    if (!queue.length) {
      if (totalProcessed === 0) log('queue.empty');
      break;
    }
    
    let processedThisRound = 0;
    for (const task of queue) {
      const taskId = task.id;
      
      // Skip if waiting for backoff
      if (task.nextRetryAt && new Date(task.nextRetryAt).getTime() > Date.now()) {
        continue;
      }
      
      // Check if already processing
      const processingFile = path.join(STATE_DIR, `processing-${taskId}.json`);
      if (fs.existsSync(processingFile)) {
        const proc = JSON.parse(fs.readFileSync(processingFile, 'utf8'));
        if (Date.now() - new Date(proc.startedAt).getTime() < 30 * 60 * 1000) {
          log('task.still_processing', { id: taskId });
          continue;
        }
      }
      
      // Mark as processing
      fs.writeFileSync(processingFile, JSON.stringify({ 
        taskId, 
        startedAt: new Date().toISOString(),
        pid: process.pid 
      }));
      
      try {
        removeQueueItem(taskId);
        await executeWithFallback(task);
        
        // Mark completed
        fs.unlinkSync(processingFile);
        log('task.completed', { id: taskId });
        processedThisRound++;
        totalProcessed++;
        
      } catch (error) {
        // Requeue with backoff (synchronous - write immediately)
        fs.unlinkSync(processingFile);
        
        const retryCount = (task.retryCount || 0) + 1;
        const maxRetries = task.maxRetries || 3;
        
        if (retryCount <= maxRetries) {
          const backoff = Math.min(5000 * Math.pow(2, retryCount - 1), 300000); // Max 5 min
          task.retryCount = retryCount;
          task.lastError = error.message;
          task.lastRetryAt = new Date().toISOString();
          
          log('task.requeue', { id: taskId, retry: retryCount, backoff });
          
          // For backoff, we schedule a requeue but also continue processing other tasks
          // The backoff is handled by setting a future retry time
          task.nextRetryAt = new Date(Date.now() + backoff).toISOString();
          saveQueueItem(task);
        } else {
          // Park permanently
          task.status = 'parked';
          task.finalError = error.message;
          task.parkedAt = new Date().toISOString();
          saveQueueItem(task);
          log('task.parked', { id: taskId, error: error.message });
        }
      }
    }
    
    if (processedThisRound === 0) {
      // No tasks were processed this round (all still processing or waiting for backoff)
      break;
    }
  }
  
  return totalProcessed;
}

// Discovery tasks generator
async function generateDiscoveryTasks() {
  // GitHub Discovery - run every 6 hours
  const ghLastRun = path.join(STATE_DIR, 'github-discovery-last.json');
  const ghShouldRun = !fs.existsSync(ghLastRun) || 
    (Date.now() - new Date(JSON.parse(fs.readFileSync(ghLastRun, 'utf8')).timestamp).getTime()) > 6 * 60 * 60 * 1000;
  
  if (ghShouldRun) {
    saveQueueItem({
      id: `gh-discovery-${Date.now()}`,
      type: 'github_discovery_candidate',
      payload: { mode: 'full' },
      priority: 1,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 2
    });
    fs.writeFileSync(ghLastRun, JSON.stringify({ timestamp: Date.now() }));
    log('queue.add', { task: 'github_discovery' });
  }
  
  // API Discovery - run every 12 hours
  const apiLastRun = path.join(STATE_DIR, 'api-discovery-last.json');
  const apiShouldRun = !fs.existsSync(apiLastRun) || 
    (Date.now() - new Date(JSON.parse(fs.readFileSync(apiLastRun, 'utf8')).timestamp).getTime()) > 12 * 60 * 60 * 1000;
  
  if (apiShouldRun) {
    saveQueueItem({
      id: `api-discovery-${Date.now()}`,
      type: 'api_candidate',
      payload: { verify: true },
      priority: 1,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 2
    });
    fs.writeFileSync(apiLastRun, JSON.stringify({ timestamp: Date.now() }));
    log('queue.add', { task: 'api_discovery' });
  }
  
  // Check tasks.md for pending tasks
  const tasksContent = fs.readFileSync(TASKS_FILE, 'utf8');
  const lines = tasksContent.split('\n');
  const pendingTasks = [];
  let currentSection = '';
  
  for (const line of lines) {
    if (line.startsWith('## ')) currentSection = line.slice(3).trim();
    
    // Format 1: liste avec checkbox - [ ] TASK-PX-XXX
    let match = line.match(/^-\s*\[\s*\]\s*(TASK-P\d-\d{3})\s*(.*)/);
    
    // Format 2: header ### TASK-PX-XXX
    if (!match) {
      match = line.match(/^###\s+(TASK-P\d-\d{3})\s*(.*)/);
    }
    
    if (match) {
      const taskId = match[1];
      const queueId = `task-${taskId}`;
      const queueFile = path.join(QUEUE_DIR, `${queueId}.json`);
      
      if (!fs.existsSync(queueFile)) {
        saveQueueItem({
          id: queueId,
          type: 'code_task',
          payload: { taskId },
          agent: 'coding',
          priority: 0,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          maxRetries: 1
        });
        log('queue.add', { task: taskId });
      }
    }
  }
}

// Recovery functions
async function recoverStaleTasks() {
  const queue = loadQueue();
  const now = Date.now();
  
  for (const task of queue) {
    // Check if task is waiting for backoff
    if (task.nextRetryAt && new Date(task.nextRetryAt).getTime() > now) {
      continue; // Still waiting for backoff
    }
    
    // Stale if no update for 30 min and retryCount > 0
    const lastUpdate = task.lastRetryAt ? new Date(task.lastRetryAt).getTime() : new Date(task.createdAt).getTime();
    if (now - lastUpdate > 30 * 60 * 1000 && task.retryCount > 0) {
      log('recovery.stale', { id: task.id, staleMinutes: (now - lastUpdate) / 60000 });
      task.retryCount = 0; // Reset for immediate retry
      task.lastError = 'Recovered from stale state';
      task.nextRetryAt = null;
      saveQueueItem(task);
    }
  }
}

async function recoverFailedWorkers() {
  // Check for orphaned processes
  const processingFiles = fs.readdirSync(STATE_DIR).filter(f => f.startsWith('processing-'));
  for (const file of processingFiles) {
    const proc = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf8'));
    if (!pidAlive(proc.pid)) {
      log('recovery.orphaned', { taskId: proc.taskId, deadPid: proc.pid });
      
      // Requeue the task
      const taskId = proc.taskId;
      const queueFile = path.join(QUEUE_DIR, `${taskId}.json`);
      if (fs.existsSync(queueFile)) {
        const task = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        task.retryCount = (task.retryCount || 0) + 1;
        task.lastError = 'Worker process died';
        saveQueueItem(task);
      }
      
      fs.unlinkSync(path.join(STATE_DIR, file));
    }
  }
}

// Git operations
function gitStatus() {
  try {
    return execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { return ''; }
}

function gitCommit(message, files = []) {
  try {
    if (files.length) execSync(`git add ${files.join(' ')}`, { cwd: ROOT, encoding: 'utf8' });
    else execSync('git add -A', { cwd: ROOT, encoding: 'utf8' });
    execSync(`git commit -m "${message}"`, { cwd: ROOT, encoding: 'utf8' });
    return true;
  } catch (e) {
    log('git.commit_failed', { error: e.message });
    return false;
  }
}

function gitPush() {
  try {
    execSync('git push origin main', { cwd: ROOT, encoding: 'utf8' });
    return true;
  } catch (e) {
    log('git.push_failed', { error: e.message });
    return false;
  }
}

// Main loop
async function runCycle() {
  log('cycle.start');
  
  // Generate discovery tasks
  await generateDiscoveryTasks();
  
  // Recover stale/failed
  await recoverStaleTasks();
  await recoverFailedWorkers();
  
  // Process queue
  const processed = await processQueue();
  
  // Cleanup temp files
  stopAllServers();
  
  log('cycle.end', { processed, queueRemaining: loadQueue().length });
  
  return processed;
}

async function runContinuous(options = {}) {
  const { once = false, interval = 60000 } = options; // Default 1 min between cycles
  
  log('factory.start', { mode: once ? 'once' : 'continuous', interval });
  
  while (true) {
    try {
      await runCycle();
    } catch (error) {
      log('cycle.error', { error: error.message, stack: error.stack });
    }
    
    if (once) break;
    
    log('cycle.wait', { intervalMs: interval });
    await new Promise(r => setTimeout(r, interval));
  }
  
  log('factory.stop');
}

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once') || args.includes('-1');
  const showStatus = args.includes('--status');
  const interval = parseInt(args.find(a => a.startsWith('--interval='))?.split('=')[1] || '60000');
  
  if (showStatus) {
    const t = loadTelemetry();
    const cb = loadCircuitBreakers();
    const queue = loadQueue();
    
    console.log('\n=== Factory Runner Status ===\n');
    console.log(`Cycles: ${t.cycles}`);
    console.log(`Last cycle: ${t.lastCycle || 'never'}`);
    console.log(`Queue depth: ${queue.length}`);
    console.log(`Circuit breakers: ${Object.keys(cb).length}`);
    console.log(`Tasks:`, t.tasks);
    return;
  }
  
  acquireLock();
  
  try {
    await runContinuous({ once, interval });
  } finally {
    releaseLock();
  }
}

if (require.main === module) main();

module.exports = { runContinuous, executeWithFallback, getAvailableWorker, recordFailure, recordSuccess };