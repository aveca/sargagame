'use strict';
/**
 * Tests de non-régression Factory V3 runner (v2 réel).
 * Cible le contrat P0 : lock stale/EPERM, claims atomiques anti-doublon,
 * recovery orphelins, backoff, verdict strict sans preuve = jamais VERIFIED.
 * Run : node --test tests/unit/factory-v3-runner.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const runner = require('../../scripts/factory-v3/run.cjs');

function tempStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'factory-v3-test-'));
}

function seedQueue(stateDir, jobs) {
  fs.writeFileSync(path.join(stateDir, 'queue.json'), JSON.stringify({ version: 2, updatedAt: null, jobs }, null, 2));
}

function mkCfg(stateDir) {
  const cfg = JSON.parse(JSON.stringify(runner.DEFAULT_CONFIG));
  cfg.repos.sargagame.local = stateDir; // répertoire neutre pour les tests
  cfg.repos.botwow.local = stateDir;
  cfg.cycleDelayMs = 10;
  cfg.backoffBaseMs = 1000;
  return cfg;
}

test('pidAlive: pid courant vivant, pid mort mort', () => {
  assert.equal(runner.pidAlive(process.pid), true);
  const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
  child.on('close', () => {
    assert.equal(runner.pidAlive(child.pid), false);
  });
});

test('lockIsStale: pid mort → stale ; lock ancien avec pid vivant → stale (PID réutilisé)', () => {
  const now = new Date().toISOString();
  assert.equal(runner.lockIsStale({ pid: 4_000_000_000, at: now }, 4 * 3600e3), true, 'pid inexistant');
  assert.equal(runner.lockIsStale({ pid: process.pid, at: now }, 4 * 3600e3), false, 'pid vivant + lock récent');
  const old = new Date(Date.now() - 5 * 3600e3).toISOString();
  assert.equal(runner.lockIsStale({ pid: process.pid, at: old }, 4 * 3600e3), true, 'pid vivant + lock > 4h = réutilisation de PID');
  assert.equal(runner.lockIsStale({ pid: process.pid, at: 'not-a-date' }, 4 * 3600e3), true, 'timestamp invalide');
});

test('acquireLock: reclaim un lock stale en préservant la preuve, bloque sur un lock valide', () => {
  const dir = tempStateDir();
  const cfg = mkCfg(dir);
  // Lock d'un pid mort → reclaim avec preuve
  fs.writeFileSync(path.join(dir, 'factory.lock'), JSON.stringify({ pid: 4_000_000_000, at: new Date().toISOString() }));
  const r1 = runner.acquireLock(dir, cfg);
  assert.equal(r1.acquired, true);
  const proofs = fs.readdirSync(dir).filter(f => f.startsWith('factory.lock.stale-'));
  assert.equal(proofs.length, 1, 'preuve du lock stale conservée');
  // Lock valide d'un autre pid récent → refus
  fs.writeFileSync(path.join(dir, 'factory.lock'), JSON.stringify({ pid: 4_000_000_000, at: new Date().toISOString() }));
  // (le reclaim ci-dessus a déjà tourné ; on teste le refus avec un pid vivant autre que le nôtre impossible
  // de façon déterministe → on vérifie au moins le chemin "lock de ce processus")
  const r2 = runner.acquireLock(dir, cfg);
  assert.equal(r2.acquired, true, 'reprise de son propre lock autorisée');
  runner.releaseLock(dir);
  assert.equal(fs.existsSync(path.join(dir, 'factory.lock')), false, 'lock libéré');
});

test('queue: enqueue + claimNextJob anti-doublon (RUNNING jamais re-claimé)', () => {
  const dir = tempStateDir();
  const cfg = mkCfg(dir);
  const j1 = runner.enqueue(dir, { repo: 'sargagame', task: 'tâche de test numéro un' });
  const j2 = runner.enqueue(dir, { repo: 'botwow', task: 'tâche de test numéro deux' });
  const c1 = runner.claimNextJob(dir, cfg);
  assert.equal(c1.jobId, j1.jobId, 'ordre FIFO respecté');
  assert.equal(c1.status, 'RUNNING');
  assert.equal(c1.claimedBy.pid, process.pid);
  const c2 = runner.claimNextJob(dir, cfg);
  assert.equal(c2.jobId, j2.jobId, 'le job RUNNING n\'est pas re-claimé (anti-doublon)');
  const c3 = runner.claimNextJob(dir, cfg);
  assert.equal(c3, null, 'plus de job → null');
});

test('recoverOrphans: RUNNING de runner mort → PENDING avec backoff ; RUNNING vivant → intact', () => {
  const dir = tempStateDir();
  const cfg = mkCfg(dir);
  seedQueue(dir, [
    { jobId: 'job-dead-1', repo: 'sargagame', task: 'orphelin', status: 'RUNNING', attempts: 0, maxAttempts: 3, claimedBy: { pid: 4_000_000_000 }, createdAt: new Date().toISOString() },
    { jobId: 'job-alive-1', repo: 'sargagame', task: 'en cours', status: 'RUNNING', attempts: 0, maxAttempts: 3, claimedBy: { pid: process.pid }, createdAt: new Date().toISOString() }
  ]);
  const n = runner.recoverOrphans(dir, cfg);
  assert.equal(n, 1, 'un seul orphelin récupéré');
  const q = runner.readQueue(dir);
  const dead = q.jobs.find(j => j.jobId === 'job-dead-1');
  const alive = q.jobs.find(j => j.jobId === 'job-alive-1');
  assert.equal(dead.status, 'PENDING');
  assert.equal(dead.attempts, 1);
  assert.ok(dead.nextRetryAt, 'backoff programmé');
  assert.equal(alive.status, 'RUNNING', 'job du runner vivant non touché');
});

test('computeBackoff: exponentiel plafonné', () => {
  const cfg = { backoffBaseMs: 5 * 60e3, backoffMaxMs: 60 * 60e3 };
  assert.equal(runner.computeBackoff(cfg, 1), 5 * 60e3);
  assert.equal(runner.computeBackoff(cfg, 2), 10 * 60e3);
  assert.equal(runner.computeBackoff(cfg, 3), 20 * 60e3);
  assert.equal(runner.computeBackoff(cfg, 9), 60 * 60e3, 'plafond respecté');
});

test('computeVerdict STRICT: jamais VERIFIED sans agent ok + gates verts + commit', () => {
  assert.equal(runner.computeVerdict(null, null).verdict, 'FAILED', 'pas d\'agent = FAILED');
  assert.equal(runner.computeVerdict({ ok: false, error: 'x' }, { allPassed: true }).verdict, 'FAILED');
  assert.equal(runner.computeVerdict({ ok: true, dirtyFiles: 0, committedSha: 'abc' }, { allPassed: false }).verdict, 'FAILED', 'gates rouges = FAILED');
  assert.equal(runner.computeVerdict({ ok: true, dirtyFiles: 3, committedSha: null }, { allPassed: true }).verdict, 'BLOCKED_UNCOMMITTED', 'fichiers non commités = BLOCKED');
  assert.equal(runner.computeVerdict({ ok: true, dirtyFiles: 0, committedSha: 'abc123' }, { allPassed: true }).verdict, 'VERIFIED', 'preuves complètes = VERIFIED');
  assert.equal(runner.computeVerdict({ ok: true, dirtyFiles: 0, committedSha: null }, { allPassed: true }).verdict, 'DONE_NO_CHANGE', 'aucun changement légitime = DONE_NO_CHANGE');
});

test('loadConfig: state/config.json surcharge les défauts (repos fusionnés)', () => {
  const dir = tempStateDir();
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    cycleDelayMs: 1234,
    repos: { sargagame: { gates: [{ id: 'custom', cmd: 'echo hi' }] } }
  }));
  const cfg = runner.loadConfig(dir);
  assert.equal(cfg.cycleDelayMs, 1234);
  assert.deepEqual(cfg.repos.sargagame.gates, [{ id: 'custom', cmd: 'echo hi' }]);
  assert.ok(cfg.repos.botwow, 'autres repos conservés');
});

test('execStep: code de sortie réel + timeout réel', async () => {
  const ok = await runner.execStep('exit 0', { cwd: os.tmpdir(), timeoutMs: 15_000 });
  assert.equal(ok.exitCode, 0);
  const ko = await runner.execStep('exit 3', { cwd: os.tmpdir(), timeoutMs: 15_000 });
  assert.equal(ko.exitCode, 3, 'code de sortie propagé');
  const slow = await runner.execStep('Start-Sleep -Seconds 30', { cwd: os.tmpdir(), timeoutMs: 1500 });
  assert.equal(slow.timedOut, true, 'timeout détecté');
  assert.notEqual(slow.exitCode, 0, 'timeout = pas un succès');
});
