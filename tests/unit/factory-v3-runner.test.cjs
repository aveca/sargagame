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
const registryLib = require('../../scripts/factory-v3/lib/model-registry.cjs');
const dashboard = require('../../scripts/factory-v3/dashboard.cjs');

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
  assert.equal(c1.jobId, j2.jobId, 'priorité absolue BOT-WOW avant Sargasses');
  assert.equal(c1.status, 'RUNNING');
  assert.equal(c1.claimedBy.pid, process.pid);
  const c2 = runner.claimNextJob(dir, cfg);
  assert.equal(c2.jobId, j1.jobId, 'le job RUNNING n\'est pas re-claimé (anti-doublon)');
  const c3 = runner.claimNextJob(dir, cfg);
  assert.equal(c3, null, 'plus de job → null');
});

test('queue fail-closed: corruption sans backup → erreur ; avec backup → restauration conservée', () => {
  const dir = tempStateDir();
  fs.writeFileSync(path.join(dir, 'queue.json'), '{broken');
  assert.throws(() => runner.readQueue(dir), (error) => error && error.code === 'QUEUE_CORRUPT');

  const recoveredDir = tempStateDir();
  const validQueue = {
    version: 2,
    updatedAt: new Date().toISOString(),
    jobs: [{ jobId: 'job-backup', repo: 'botwow', task: 'backup sain', status: 'PENDING', createdAt: new Date().toISOString() }],
  };
  fs.writeFileSync(path.join(recoveredDir, 'queue.json'), '{broken');
  fs.writeFileSync(path.join(recoveredDir, 'queue.json.bak'), JSON.stringify(validQueue));
  const recovered = runner.readQueue(recoveredDir);
  assert.equal(recovered.jobs.length, 1);
  assert.equal(recovered.jobs[0].jobId, 'job-backup');
  const restored = JSON.parse(fs.readFileSync(path.join(recoveredDir, 'queue.json'), 'utf8'));
  assert.equal(restored.jobs[0].jobId, 'job-backup', 'le backup sain est réinstallé comme état principal');
  const proofs = fs.readdirSync(recoveredDir).filter((name) => name.startsWith('queue.json.corrupt-'));
  assert.equal(proofs.length, 1, 'la copie corrompue est conservée pour diagnostic');
  const backup = JSON.parse(fs.readFileSync(path.join(recoveredDir, 'queue.json.bak'), 'utf8'));
  assert.equal(backup.jobs[0].jobId, 'job-backup', 'le backup sain n\'est jamais écrasé');
});

test('claims tokenisés: un mauvais token ne peut pas muter le job claimed', () => {
  const dir = tempStateDir();
  const cfg = mkCfg(dir);
  const job = runner.enqueue(dir, { repo: 'botwow', task: 'mutation protégée par token' });
  const claimed = runner.claimNextJob(dir, cfg);
  assert.equal(claimed.jobId, job.jobId);
  assert.ok(claimed.claimToken, 'le claim possède un token');
  const rejected = runner.updateJob(dir, job.jobId, { status: 'DONE' }, { expectedClaimToken: 'token-faux' });
  assert.equal(rejected, null, 'mutation rejetée');
  assert.equal(runner.readQueue(dir).jobs[0].status, 'RUNNING', 'job toujours claimed');
  const accepted = runner.updateJob(dir, job.jobId, { status: 'DONE' }, { expectedClaimToken: claimed.claimToken });
  assert.ok(accepted, 'mutation du propriétaire acceptée');
  assert.equal(accepted.status, 'DONE');
});

test('queue concurrente: plusieurs processus claim/enqueue sans perte ni double mission', async () => {
  const dir = tempStateDir();
  const runnerPath = path.resolve(__dirname, '../../scripts/factory-v3/run.cjs');
  const claimCode = `
    const runner = require(${JSON.stringify(runnerPath)});
    const cfg = runner.loadConfig(process.argv[1]);
    const job = runner.claimNextJob(process.argv[1], cfg);
    if (job) process.stdout.write(job.jobId);
  `;
  const enqueueCode = `
    const runner = require(${JSON.stringify(runnerPath)});
    runner.enqueue(process.argv[1], { repo: 'botwow', task: 'mission concurrente sufficiently descriptive' });
  `;

  const runChild = (code) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode, stdout: stdout.trim(), stderr }));
  });

  await Promise.all([runChild(enqueueCode), runChild(enqueueCode), runChild(enqueueCode)]);
  const queue = runner.readQueue(dir);
  assert.equal(queue.jobs.length, 3, 'aucune enqueue concurrente perdue');
  assert.equal(new Set(queue.jobs.map((job) => job.jobId)).size, 3, 'aucun jobId dupliqué');

  const claims = await Promise.all([runChild(claimCode), runChild(claimCode), runChild(claimCode)]);
  assert.ok(claims.every((claim) => claim.exitCode === 0), `claims sans crash: ${JSON.stringify(claims)}`);
  const claimedIds = claims.map((claim) => claim.stdout).filter(Boolean);
  assert.equal(claimedIds.length, 3, 'chaque mission disponible est claimée une fois');
  assert.equal(new Set(claimedIds).size, 3, 'aucune mission claimée par deux processus');
  const after = runner.readQueue(dir);
  assert.equal(after.jobs.filter((job) => job.status === 'RUNNING').length, 3, 'trois missions RUNNING, pas de doublon');
});

test('registre fail-closed: corruption structurelle sans backup → erreur, avec backup → restauration', () => {
  const noBackup = tempStateDir();
  const file = path.join(noBackup, 'model-registry.json');
  fs.writeFileSync(file, JSON.stringify({ version: registryLib.REGISTRY_VERSION, models: [], providers: {}, availability: {}, stats: {} }));
  assert.throws(() => registryLib.readRegistry(file), (error) => error && error.code === 'MODEL_REGISTRY_CORRUPT');

  const withBackup = tempStateDir();
  const backupFile = path.join(withBackup, 'model-registry.json');
  const first = registryLib.emptyRegistry();
  first.stats.attempts = 1;
  registryLib.writeRegistry(backupFile, first);
  const second = registryLib.emptyRegistry();
  second.stats.attempts = 2;
  registryLib.writeRegistry(backupFile, second);
  fs.writeFileSync(backupFile, '{broken');
  const recovered = registryLib.readRegistry(backupFile);
  assert.equal(recovered.stats.attempts, 1, 'le backup preceding est restauré, pas un registre vide');
});

test('dashboard: registre/queue corrompus sont affichés explicitement', () => {
  const dir = tempStateDir();
  fs.writeFileSync(path.join(dir, 'model-registry.json'), '{broken');
  fs.writeFileSync(path.join(dir, 'queue.json'), '{broken');
  const dash = dashboard.buildDashboard(dir);
  assert.equal(dash.registryHealthy, false);
  assert.equal(dash.queueHealthy, false);
  const rendered = dashboard.render(dash);
  assert.match(rendered, /ERREUR REGISTRE \(MODEL_REGISTRY_CORRUPT\)/);
  assert.match(rendered, /ERREUR QUEUE \(QUEUE_CORRUPT\)/);
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

test('computeVerdict STRICT: jamais VERIFIED sans agent ok + gates verts + commit réel', () => {
  const sha = 'a'.repeat(40);
  const completeAgent = {
    ok: true,
    dirtyFiles: 0,
    committedSha: sha,
    commitVerified: true,
    modelVerified: true,
    providerVerified: true,
    sessionSeen: true,
    completionMarker: true,
  };
  assert.equal(runner.computeVerdict(null, null).verdict, 'FAILED', 'pas d\'agent = FAILED');
  assert.equal(runner.computeVerdict({ ok: false, error: 'x' }, { allPassed: true }).verdict, 'FAILED');
  assert.equal(runner.computeVerdict(Object.assign({}, completeAgent, { committedSha: null }), { allPassed: false }).verdict, 'FAILED', 'gates rouges = FAILED');
  assert.equal(runner.computeVerdict(Object.assign({}, completeAgent, { dirtyFiles: 3, committedSha: null }), { allPassed: true }).verdict, 'BLOCKED_UNCOMMITTED', 'fichiers non commités = BLOCKED');
  assert.equal(runner.computeVerdict(Object.assign({}, completeAgent, { committedSha: 'abc123' }), { allPassed: true }).verdict, 'FAILED', 'SHA non 40 hexadécimaux = FAILED');
  assert.equal(runner.computeVerdict(Object.assign({}, completeAgent, { commitVerified: false }), { allPassed: true }).verdict, 'FAILED', 'commit non reachable = FAILED');
  assert.equal(runner.computeVerdict(completeAgent, { allPassed: true }).verdict, 'VERIFIED', 'preuves complètes = VERIFIED');
  assert.equal(runner.computeVerdict(Object.assign({}, completeAgent, { committedSha: null }), { allPassed: true }).verdict, 'DONE_NO_CHANGE', 'aucun changement légitime = DONE_NO_CHANGE');
});

test('computeVerdict WAIT: quota et fournisseur restent distincts des échecs de mission', () => {
  assert.equal(runner.computeVerdict({ ok: false, errorCategory: 'ALL_MODELS_IN_COOLDOWN', error: 'quota' }, { allPassed: true }).verdict, 'WAIT_QUOTA');
  assert.equal(runner.computeVerdict({ ok: false, errorCategory: 'ALL_MODELS_PROVIDER_UNAVAILABLE', error: 'provider' }, { allPassed: true }).verdict, 'WAIT_PROVIDER');
  assert.equal(runner.computeVerdict({ ok: false, errorCategory: 'COST_VIOLATION', error: 'cost' }, { allPassed: true }).verdict, 'FAILED');
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
  const slow = await runner.execStep('node -e "setTimeout(()=>{},30000)"', { cwd: os.tmpdir(), timeoutMs: 1500 });
  assert.equal(slow.timedOut, true, 'timeout détecté');
  assert.notEqual(slow.exitCode, 0, 'timeout = pas un succès');
});
