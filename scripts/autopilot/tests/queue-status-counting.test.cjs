#!/usr/bin/env node
/**
 * Tests de comptage des tâches de queue par statut (P0.12 Phase 2).
 *
 * Vérifie que countQueueByStatus() et countQueueActive() comptent correctement
 * les états : parked, queued, backoff, running, total.
 *
 * Les fichiers de queue réels sont temporairement déplacés pendant le test
 * pour éviter toute interférence, puis restaurés.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { countQueueByStatus, countQueueActive, loadQueue } = require('../../local-factory/factory-runner.cjs');

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

// Sauvegarder les fichiers de queue réels avant le test
let REAL_QUEUE_FILES = [];
let REAL_STATE_FILES = [];

function captureRealFiles() {
  REAL_QUEUE_FILES = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json'));
  REAL_STATE_FILES = fs.existsSync(STATE_DIR) ? fs.readdirSync(STATE_DIR).filter(f => f.startsWith('processing-') && f.endsWith('.json')) : [];
}

function backupRealFiles() {
  const backupDir = path.join(os.tmpdir(), `queue-backup-${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of REAL_QUEUE_FILES) {
    const src = path.join(QUEUE_DIR, f);
    if (!fs.existsSync(src)) continue; // Le runner a pu le supprimer entre-temps
    try {
      fs.copyFileSync(src, path.join(backupDir, f));
    } catch (_) {
      // Fichier supprimé par le runner entre-temps
    }
  }
  for (const f of REAL_STATE_FILES) {
    const src = path.join(STATE_DIR, f);
    if (!fs.existsSync(src)) continue;
    try {
      fs.copyFileSync(src, path.join(backupDir, f));
    } catch (_) {
      // Fichier supprimé par le runner entre-temps
    }
  }
  return backupDir;
}

function restoreRealFiles(backupDir) {
  for (const f of REAL_QUEUE_FILES) {
    const src = path.join(backupDir, f);
    if (!fs.existsSync(src)) continue; // N'a pas pu être sauvegardé
    fs.copyFileSync(src, path.join(QUEUE_DIR, f));
  }
  for (const f of REAL_STATE_FILES) {
    const src = path.join(backupDir, f);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(STATE_DIR, f));
  }
  // Supprimer le backup
  try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch (_) {}
}

function purgeQueue() {
  for (const f of fs.readdirSync(QUEUE_DIR)) {
    if (!f.endsWith('.json')) continue;
    try { fs.unlinkSync(path.join(QUEUE_DIR, f)); } catch (_) {}
  }
  for (const f of fs.readdirSync(STATE_DIR)) {
    if (!f.startsWith('processing-') || !f.endsWith('.json')) continue;
    try { fs.unlinkSync(path.join(STATE_DIR, f)); } catch (_) {}
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

let backupDir;
try {
  captureRealFiles();
  console.log(`\nSauvegarde de ${REAL_QUEUE_FILES.length} fichier(s) de queue réel(s)...`);
  backupDir = backupRealFiles();
  test('T1: queue vide → tous les compteurs à zéro', () => {
    purgeQueue();
    const stats = countQueueByStatus();
    assert(stats.total === 0, `expected total=0, got ${stats.total}`);
    assert(stats.parked === 0, `expected parked=0`);
    assert(stats.queued === 0, `expected queued=0`);
    assert(stats.backoff === 0, `expected backoff=0`);
    assert(stats.running === 0, `expected running=0`);
    assert(countQueueActive() === 0, `expected active=0`);
  });

  // --- Test 2: Tâches queued (éligibles immédiatement) ---
  test('T2: tâches queued (pas de statut, pas de nextRetryAt, pas de verrou)', () => {
    purgeQueue();
    writeQueueFile('test-queued-1');
    writeQueueFile('test-queued-2');
    const stats = countQueueByStatus();
    assert(stats.total === 2, `expected total=2, got ${stats.total}`);
    assert(stats.queued === 2, `expected queued=2, got ${stats.queued}`);
    assert(stats.parked === 0, `expected parked=0`);
    assert(countQueueActive() === 2, `expected active=2`);
  });

  // --- Test 3: Tâches en backoff (nextRetryAt dans le futur) ---
  test('T3: tâches en backoff (nextRetryAt > now)', () => {
    purgeQueue();
    const future = new Date(Date.now() + 60000).toISOString();
    writeQueueFile('test-backoff-1', { nextRetryAt: future });
    const stats = countQueueByStatus();
    assert(stats.total === 1, `expected total=1, got ${stats.total}`);
    assert(stats.backoff === 1, `expected backoff=1, got ${stats.backoff}`);
    assert(stats.queued === 0, `expected queued=0`);
    assert(countQueueActive() === 1, `expected active=1 (backoff counts as active)`);
  });

  // --- Test 4: Tâches parked ---
  test('T4: tâches parked (status=parked)', () => {
    purgeQueue();
    const now = new Date().toISOString();
    writeQueueFile('test-parked-1', { status: 'parked', parkedAt: now });
    writeQueueFile('test-parked-2', { status: 'parked', parkedAt: now });
    const stats = countQueueByStatus();
    assert(stats.total === 2, `expected total=2, got ${stats.total}`);
    assert(stats.parked === 2, `expected parked=2, got ${stats.parked}`);
    assert(stats.queued === 0, `expected queued=0`);
    assert(countQueueActive() === 0, `expected active=0 (parked not active)`);
  });

  // --- Test 5: Tâche en cours (running) via fichier de verrouillage ---
  test('T5: tâche running (fichier processing-*.json présent)', () => {
    purgeQueue();
    writeQueueFile('test-running-1');
    writeProcessingFile('test-running-1');
    const stats = countQueueByStatus();
    assert(stats.total === 1, `expected total=1, got ${stats.total}`);
    assert(stats.running === 1, `expected running=1, got ${stats.running}`);
    assert(stats.queued === 0, `expected queued=0 (running takes precedence)`);
    assert(countQueueActive() === 1, `expected active=1`);
  });

  // --- Test 6: Mixte de tous les états ---
  test('T6: mélange de parked, queued, backoff, running', () => {
    purgeQueue();
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 60000).toISOString();
    writeQueueFile('mix-parked', { status: 'parked', parkedAt: now });
    writeQueueFile('mix-queued-1');
    writeQueueFile('mix-queued-2');
    writeQueueFile('mix-backoff', { nextRetryAt: future });
    writeQueueFile('mix-running');
    writeProcessingFile('mix-running');

    const stats = countQueueByStatus();
    assert(stats.total === 5, `expected total=5, got ${stats.total}`);
    assert(stats.parked === 1, `expected parked=1, got ${stats.parked}`);
    assert(stats.queued === 2, `expected queued=2, got ${stats.queued}`);
    assert(stats.backoff === 1, `expected backoff=1, got ${stats.backoff}`);
    assert(stats.running === 1, `expected running=1, got ${stats.running}`);
    assert(countQueueActive() === 4, `expected active=4 (queued+backoff+running)`);
  });

  // --- Test 7: nextRetryAt dans le passé n'est PAS du backoff ---
  test('T7: nextRetryAt expiré (dans le passé) = queued, pas backoff', () => {
    purgeQueue();
    const past = new Date(Date.now() - 60000).toISOString();
    writeQueueFile('expired-backoff', { nextRetryAt: past });
    const stats = countQueueByStatus();
    assert(stats.backoff === 0, `expected backoff=0 for expired retry, got ${stats.backoff}`);
    assert(stats.queued === 1, `expected queued=1 for expired retry, got ${stats.queued}`);
  });

} finally {
  // Restaurer les fichiers réels
  purgeQueue();
  restoreRealFiles(backupDir);
  // Vérifier la restauration
  const restored = loadQueue();
  if (restored.length !== REAL_QUEUE_FILES.length) {
    console.error(`\n⚠️  AVERTISSEMENT: ${REAL_QUEUE_FILES.length} fichiers réels attendus, ${restored.length} restaurés`);
  }
}

console.log(`\n${passed} tests passés, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
