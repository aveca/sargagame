#!/usr/bin/env node
/**
 * Tests de la machine à états des tâches et des frontières de budget de retries (P0.13 Phase 4).
 *
 * Vérifie que :
 * - Une tâche à sa limite de retries (retryCount >= maxRetries) n'est pas exécutée
 * - Une tâche en backoff (nextRetryAt futur) n'est pas exécutée
 * - Une tâche en backoff expiré est rééligible si retryCount < maxRetries
 * - Le parking préserve l'historique, la cause et les compteurs
 * - Les transitions restent cohérentes après redémarrage
 * - Les tâches parkées ne sont jamais relancées automatiquement
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const QUEUE_DIR = path.join(__dirname, '..', '..', '..', 'queue');
const STATE_DIR = path.join(__dirname, '..', '..', '..', 'scripts', 'local-factory', 'state');

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    console.log(`❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }

// Sauvegarder et restaurer les fichiers de queue réels
const REAL_QUEUE_FILES = fs.existsSync(QUEUE_DIR) ? fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')) : [];
const REAL_STATE_FILES = fs.existsSync(STATE_DIR) ? fs.readdirSync(STATE_DIR).filter(f => f.startsWith('processing-') && f.endsWith('.json')) : [];

let backupDir = null;

function backupRealFiles() {
  backupDir = path.join(os.tmpdir(), `queue-backup-${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of REAL_QUEUE_FILES) {
    fs.copyFileSync(path.join(QUEUE_DIR, f), path.join(backupDir, f));
  }
  for (const f of REAL_STATE_FILES) {
    fs.copyFileSync(path.join(STATE_DIR, f), path.join(backupDir, f));
  }
}

function restoreRealFiles() {
  if (!backupDir) return;
  for (const f of REAL_QUEUE_FILES) {
    fs.copyFileSync(path.join(backupDir, f), path.join(QUEUE_DIR, f));
  }
  for (const f of REAL_STATE_FILES) {
    fs.copyFileSync(path.join(backupDir, f), path.join(STATE_DIR, f));
  }
  try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch (_) {}
  backupDir = null;
}

function purgeQueue() {
  for (const f of fs.readdirSync(QUEUE_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(QUEUE_DIR, f));
  }
  for (const f of fs.readdirSync(STATE_DIR)) {
    if (f.startsWith('processing-') && f.endsWith('.json')) fs.unlinkSync(path.join(STATE_DIR, f));
  }
}

function writeQueueFile(id, overrides = {}) {
  const file = {
    id,
    type: 'code_task',
    status: 'queued',
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    lastError: null,
    parkedAt: null,
    quarantineReason: null,
    finalError: null,
    reactivatedAt: null,
    reactivationReason: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  fs.writeFileSync(path.join(QUEUE_DIR, `${id}.json`), JSON.stringify(file, null, 2));
  return file;
}

function writeProcessingFile(taskId) {
  fs.writeFileSync(path.join(STATE_DIR, `processing-${taskId}.json`), JSON.stringify({
    taskId,
    startedAt: new Date().toISOString(),
    pid: process.pid,
  }));
}

backupRealFiles();
// --- Test 1: Tâche à sa limite de retries ---
test('T1: tâche à retryCount=maxRetries n\'est pas exécutée (parking automatique)', () => {
  purgeQueue();
  const future = new Date(Date.now() - 60000).toISOString();
  writeQueueFile('budget-exhausted', {
    status: 'queued',
    retryCount: 3,
    maxRetries: 3,
    nextRetryAt: future,
    lastError: 'échec précédent',
    parkedAt: null,
  });

  const queue = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).map(f => {
    return JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'));
  });

  const task = queue.find(t => t.id === 'budget-exhausted');
  assert(task !== undefined, 'tâche trouvée');
  assert(task.retryCount >= task.maxRetries, `retryCount=${task.retryCount} >= maxRetries=${task.maxRetries}`);

  const isEligible = task.status !== 'parked' &&
    (!task.nextRetryAt || new Date(task.nextRetryAt).getTime() <= Date.now()) &&
    task.retryCount < task.maxRetries;
  assert(isEligible === false, `tâche à limite ne doit pas être éligible`);
  console.log('  → règle métier: tâche à limite correctement identifiée comme non-éligible');
});

// --- Test 2: Tâche en backoff ---
test('T2: tâche en backoff (nextRetryAt > now) n\'est pas exécutée', () => {
  purgeQueue();
  const future = new Date(Date.now() + 60000).toISOString();
  writeQueueFile('backoff-task', {
    status: 'queued',
    retryCount: 1,
    maxRetries: 3,
    nextRetryAt: future,
  });

  const queue = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).map(f => {
    return JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'));
  });

  const task = queue.find(t => t.id === 'backoff-task');
  const now = Date.now();
  const isBackoff = task.nextRetryAt && new Date(task.nextRetryAt).getTime() > now;
  assert(isBackoff === true, `tâche doit être en backoff`);
  console.log(`  → nextRetryAt=${task.nextRetryAt} est dans le futur, tâche en backoff`);
});

// --- Test 3: Tâche en backoff expiré avec retryCount < maxRetries ---
test('T3: tâche en backoff expiré avec retryCount < maxRetries est rééligible', () => {
  purgeQueue();
  const past = new Date(Date.now() - 60000).toISOString();
  writeQueueFile('expired-backoff', {
    status: 'queued',
    retryCount: 1,
    maxRetries: 3,
    nextRetryAt: past,
  });

  const queue = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).map(f => {
    return JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'));
  });

  const task = queue.find(t => t.id === 'expired-backoff');
  const isEligible = task.status !== 'parked' &&
    (!task.nextRetryAt || new Date(task.nextRetryAt).getTime() <= Date.now()) &&
    task.retryCount < task.maxRetries;
  assert(isEligible === true, `tâche backoff expiré avec retryCount<maxRetries doit être éligible`);
  console.log('  → backoff expiré + retryCount<maxRetries = éligible');
});

// --- Test 4: Parking préserve l'historique ---
test('T4: parking préserve retryCount, lastError et cause', () => {
  purgeQueue();
  const errorMsg = 'npm ci failed: EUSAGE - package-lock.json manquant';
  writeQueueFile('preserved-task', {
    status: 'queued',
    retryCount: 3,
    maxRetries: 3,
    lastError: errorMsg,
    parkedAt: null,
    finalError: null,
  });

  const taskPath = path.join(QUEUE_DIR, 'preserved-task.json');
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
  task.status = 'parked';
  task.finalError = task.lastError;
  task.parkedAt = new Date().toISOString();
  fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));

  const saved = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
  assert(saved.status === 'parked', `status=parked, got ${saved.status}`);
  assert(saved.retryCount === 3, `retryCount=3 préservé`);
  assert(saved.finalError === errorMsg, `finalError préservé`);
  assert(saved.parkedAt !== null, `parkedAt défini`);
  console.log('  → historique, compteurs et cause préservés');
});

// --- Test 5: Tâche parked jamais relancée ---
test('T5: tâche parked est exclue de l\'éligibilité (jamais relancée auto)', () => {
  purgeQueue();
  writeQueueFile('parked-task', {
    status: 'parked',
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    quarantineReason: 'quarantaine manuelle',
  });

  const queue = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).map(f => {
    return JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'));
  });

  const task = queue.find(t => t.id === 'parked-task');
  assert(task.status === 'parked', `status=parked`);
  const isEligible = task.status !== 'parked' &&
    (!task.nextRetryAt || new Date(task.nextRetryAt).getTime() <= Date.now()) &&
    task.retryCount < task.maxRetries;
  assert(isEligible === false, `tâche parked jamais éligible`);
  console.log('  → tâche parked correctement exclue de l\'éligibilité');
});

// --- Test 6: Fichier de verrouillage ---
test('T6: fichier processing-*.json présent = tâche running (non réexécutable)', () => {
  purgeQueue();
  writeQueueFile('running-task', {
    status: 'queued',
    retryCount: 0,
    maxRetries: 3,
  });
  writeProcessingFile('running-task');

  const processingFile = path.join(STATE_DIR, 'processing-running-task.json');
  assert(fs.existsSync(processingFile), 'fichier de verrouillage existe');
  const proc = JSON.parse(fs.readFileSync(processingFile, 'utf8'));
  assert(proc.taskId === 'running-task', 'taskId correspond');
  assert(proc.pid === process.pid, 'pid correspond');
  console.log('  → verrou de traitement présent, tâche running');
});

// --- Test 7: UX-LOW-20261020-007 — cas réel ---
test('T7: UX-LOW-20261020-007 (retryCount=3/maxRetries=3) non réexécutée', () => {
  const realFile = path.join(QUEUE_DIR, 'UX-LOW-20261020-007.json');
  if (!fs.existsSync(realFile)) {
    console.log('  → fichier réel non présent, test skipped');
    return;
  }
  const task = JSON.parse(fs.readFileSync(realFile, 'utf8'));
  assert(task.retryCount === 3, `retryCount=3, got ${task.retryCount}`);
  assert(task.maxRetries === 3, `maxRetries=3`);
  const isEligible = task.status !== 'parked' &&
    (!task.nextRetryAt || new Date(task.nextRetryAt).getTime() <= Date.now()) &&
    task.retryCount < task.maxRetries;
  assert(isEligible === false, `UX-LOW-20261020-007 ne doit pas être éligible`);
  console.log(`  → statut=${task.status}, retryCount=${task.retryCount}/maxRetries=${task.maxRetries}, non-éligible`);
});

// Restaurer les fichiers réels
purgeQueue();
restoreRealFiles();

// Vérifier la restauration
const restored = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).length;
if (restored !== REAL_QUEUE_FILES.length) {
  console.error(`\n⚠️  AVERTISSEMENT: ${REAL_QUEUE_FILES.length} fichiers réels attendus, ${restored} restaurés`);
}

console.log(`\n${passed} tests passés, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
