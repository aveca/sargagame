#!/usr/bin/env node
/**
 * factory-p0.test.cjs — Suite de tests P0 (Phase 4) : « success » seulement si
 * l'exécution est réelle et son résultat vérifiable.
 *
 * 9 tests obligatoires, tous exécutés sur des PROCESSUS ENFANTS RÉELS et dans
 * un ÉTAT ISOLÉ (FACTORY_*_DIR surchargeables) : rien n'est écrit dans l'état
 * de production, aucune tâche historique n'est réexécutée.
 *
 *   1. runner actif + heartbeat récent (timestamp/PID/état/cycle)
 *   2. runner bloqué / mort sans heartbeat valide
 *   3. heartbeat absent au démarrage
 *   4. verrou détenu par un processus ACTIF -> non libérable sans preuve
 *   5. verrou abandonné (PID mort / TTL) -> balayé + libération idempotente
 *   6. attente sémaphore -> requeue, JAMAIS task.success
 *   7. échec réel (exitCode != 0) -> task.error, pas de succès
 *   8. succès réel avec preuve (exitCode 0 + artefact vérifiable)
 *   9. redémarrage runner + récupération d'état observable
 *
 * Aucun test ne s'appuie sur un « faux succès » : les assertions portent sur
 * des preuves (fichiers, codes de sortie, journaux), pas sur des déclarations.
 *
 * Usage : node --test scripts/local-factory/tests/factory-p0.test.cjs
 *         node scripts/local-factory/tests/factory-p0.test.cjs   (exécution simple)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const RUNNER_SCRIPT = path.join(REPO, 'scripts', 'local-factory', 'factory-runner.cjs');
const SUPERVISOR_SCRIPT = path.join(REPO, 'scripts', 'local-factory', 'supervisor.cjs');
const SEMAPHORE_SCRIPT = path.join(REPO, 'scripts', 'local-factory', 'semaphore.cjs');

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

let seq = 0;
function tmpDir(prefix = 'p0') {
  const dir = path.join(os.tmpdir(), `factory-${prefix}-${process.pid}-${Date.now()}-${seq++}`);
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'queue'), { recursive: true });
  // tasks.md doit EXISTER : le runner le lit à chaque cycle (bug réel corrigé
  // côté runner, mais le harnais reproduit ici l'état d'un dépôt sain).
  fs.writeFileSync(path.join(dir, 'tasks.md'), '# Tâches isolées (tests P0)\n');
  return dir;
}

/** Environnement isolé : les modules factory lisent ces variables au require(). */
function isoEnv(dir, extra = {}) {
  return {
    ...process.env,
    FACTORY_STATE_DIR: path.join(dir, 'state'),
    FACTORY_LOGS_DIR: path.join(dir, 'logs'),
    FACTORY_QUEUE_DIR: path.join(dir, 'queue'),
    FACTORY_TASKS_FILE: path.join(dir, 'tasks.md'),
    FACTORY_ROOT_DIR: REPO,
    // Cycles rapides pour rendre les tests courts (jamais en production)
    FACTORY_HEARTBEAT_MS: '1500',
    FACTORY_HEARTBEAT_MAX_AGE_MS: '8000',
    ...extra,
  };
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function factoryLog(dir) {
  const logsDir = path.join(dir, 'logs');
  if (!fs.existsSync(logsDir)) return [];
  const out = [];
  for (const f of fs.readdirSync(logsDir).filter(f => /\.jsonl$/.test(f)).sort()) {
    for (const line of fs.readFileSync(path.join(logsDir, f), 'utf8').split('\n').filter(Boolean)) {
      try { out.push({ file: f, ...JSON.parse(line) }); } catch (_) {}
    }
  }
  return out.sort((a, b) => new Date(a.t) - new Date(b.t));
}

function waitFor(cond, { timeout = 30000, step = 250 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let ok = false;
      try { ok = Boolean(cond()); } catch (_) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() - started > timeout) return reject(new Error(`waitFor timeout (${timeout}ms)`));
      setTimeout(tick, step);
    };
    tick();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Processus enfant vivant et CONSERVÉ jusqu'à kill() — nécessaire pour les preuves PID. */
function liveMarker(ms = 60000) {
  const child = spawn(process.execPath, ['-e', `setInterval(() => {}, 1000)`], {
    windowsHide: true, stdio: 'ignore',
  });
  child.longLived = true;
  const t = setTimeout(() => { try { child.kill(); } catch (_) {} }, ms);
  if (t.unref) t.unref();
  return child;
}

/** PID d'un processus qui EXISTE puis MEURT (preuve d'abandon par PID mort). */
async function deadPid() {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true, stdio: 'ignore' });
  await new Promise(res => child.on('close', res));
  return child.pid;
}

function killTree(child) {
  if (!child || child.pid === undefined) return;
  try { process.kill(child.pid, 'SIGKILL'); } catch (_) {}
}

/**
 * Tue le runner que le superviseur a DÉTACHÉ sur un état isolé (il survit à la
 * mort du superviseur : sans ce nettoyage, les tests laissent des processus).
 * Le verrou d'usine porte le PID du runner courant.
 */
function stopIsolatedRunner(dir) {
  const lock = readJSON(path.join(dir, 'state', 'factory.lock'));
  if (!lock || !lock.pid) return;
  try { process.kill(Number(lock.pid), 'SIGKILL'); } catch (_) {}
}

/** Applique réellement un environnement au processus courant, puis restaure. */
function withEnv(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = k in process.env ? process.env[k] : undefined;
    process.env[k] = v;
  }
  try { return fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Charge un module factory dans CE processus avec l'état isolé. */
function loadModule(env, mod) {
  const file = path.join(REPO, 'scripts', 'local-factory', mod.endsWith('.cjs') ? mod : `${mod}.cjs`);
  const resolved = require.resolve(file);
  // Les constantes (STATE_DIR…) sont lues au require : l'env DOIT être posé avant.
  return withEnv(env, () => {
    delete require.cache[resolved];
    return require(resolved);
  });
}

/** Lance un cycle unique du runner et rend la sortie exploitable en cas d'échec. */
function runOnce(env, timeout = 180000) {
  const res = spawnSync(process.execPath, [RUNNER_SCRIPT, '--once'], {
    env, encoding: 'utf8', timeout, windowsHide: true,
  });
  if (res.error) throw new Error(`runner non lancé : ${res.error.message}`);
  return res;
}

function childDiag(res) {
  return `exit=${res.status} signal=${res.signal}\n--STDOUT (fin)--\n${(res.stdout || '').slice(-2500)}\n--STDERR (fin)--\n${(res.stderr || '').slice(-1500)}`;
}

function queueTask(dir, task) {
  fs.writeFileSync(path.join(dir, 'queue', `${task.id}.json`), JSON.stringify(task, null, 2));
}

/**
 * Compte les événements d'UNE tâche (id ou taskId selon l'événement).
 *
 * Pourquoi par tâche et pas global : dans un même cycle, les tâches de
 * découverte (api_discovery, gh-discovery) réussissent LÉGITIMEMENT avec une
 * preuve réelle. Une assertion globale (« task_success == 0 ») mesurerait leur
 * succès, pas celui de la tâche testée. La télémétrie n'ayant que des
 * compteurs agrégés, la preuve exacte est le journal par tâche.
 */
function taskEventCount(events, taskId, event) {
  return events.filter(e => (e.id === taskId || e.taskId === taskId) && e.event === event).length;
}

/** Lecture exploitable du journal du sémaphore d'un état isolé. */
function semaphoreJournal(dir) {
  const file = path.join(dir, 'state', 'semaphore-journal.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (_) { return null; }
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// TEST 1 — runner actif : heartbeat réel (timestamp UTC, PID, état, cycle)
// ---------------------------------------------------------------------------

test('1. runner actif : heartbeat écrit avec timestamp/PID/état/cycle', async () => {
  const dir = tmpDir('t1');
  const env = isoEnv(dir);
  const child = spawn(process.execPath, [RUNNER_SCRIPT, '--supervisor'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const hbFile = path.join(dir, 'state', 'heartbeat.json');
    // Le heartbeat doit exister AVANT la fin du premier cycle (démarrage sain).
    await waitFor(() => fs.existsSync(hbFile), { timeout: 40000 });

    const hb = readJSON(hbFile);
    assert.ok(hb, 'heartbeat lisible');
    assert.equal(hb.version, 2, 'contrat heartbeat v2');
    assert.ok(hb.timestamp && !Number.isNaN(Date.parse(hb.timestamp)), 'timestamp UTC présent');
    assert.equal(typeof hb.timestamp, 'string');
    assert.equal(hb.pid, child.pid, 'PID du runner réel (pas celui du test)');
    assert.ok(['starting', 'busy', 'running', 'idle'].includes(hb.state), `état cohérent (${hb.state})`);
    assert.ok(typeof hb.cycle === 'number', 'identifiant de cycle présent');
    assert.ok(typeof hb.queueDepth === 'number', 'profondeur de file présente');
    assert.ok(hb.startedAtMs > 0, 'horodatage de démarrage');

    // Rafraîchissement : le timestamp avance réellement (pas figé au boot).
    const first = Date.parse(hb.timestamp);
    await waitFor(() => Date.parse(readJSON(hbFile).timestamp) > first, { timeout: 15000 });
    assert.ok(Date.parse(readJSON(hbFile).timestamp) > first, 'heartbeat rafraîchi périodiquement');

    // Le superviseur juge ce runner VIVANT (contrat partagé).
    const hbLib = loadModule(env, 'heartbeat');
    const evalLive = hbLib.evaluateHeartbeat(readJSON(hbFile));
    assert.equal(evalLive.alive, true, `runner jugé vivant : ${evalLive.reason}`);

    // Verrou d'usine détenu par CE pid vivant (garde anti-doublon)
    const lock = readJSON(path.join(dir, 'state', 'factory.lock'));
    assert.ok(lock && lock.pid === child.pid, 'factory.lock détenu par le runner vivant');
  } finally {
    killTree(child);
  }
});

// ---------------------------------------------------------------------------
// TEST 2 — runner bloqué / mort : heartbeat non valide => pas de faux « vivant »
// ---------------------------------------------------------------------------

test('2. runner bloqué ou mort : heartbeat invalide jamais déclaré vivant', async () => {
  const dir = tmpDir('t2');
  const env = isoEnv(dir);
  const hbLib = loadModule(env, 'heartbeat');

  // (a) heartbeat frais mais PID MORT (runner tué) -> non vivant
  const dead = await deadPid();
  const ghost = { state: 'busy', cycle: 42, pid: dead, timestamp: new Date().toISOString() };
  const rA = hbLib.evaluateHeartbeat(ghost);
  assert.equal(rA.alive, false, 'PID mort => non vivant');
  assert.match(rA.reason, /not running/);

  // (b) heartbeat vieux et état idle (runner figé) -> non vivant
  const stale = { state: 'idle', cycle: 42, pid: process.pid, timestamp: new Date(Date.now() - 30 * 60000).toISOString() };
  const rB = hbLib.evaluateHeartbeat(stale);
  assert.equal(rB.alive, false, 'idle + 30 min => non vivant');
  assert.match(rB.reason, /stale/);

  // (c) heartbeat vieux MAIS tâche longue en cours et PID vivant -> toléré
  //     (sinon une tâche longue déclencherait un redémarrage = double exécution)
  const busyAlive = { state: 'busy', cycle: 42, pid: process.pid, timestamp: new Date(Date.now() - 30 * 60000).toISOString() };
  const rC = hbLib.evaluateHeartbeat(busyAlive);
  assert.equal(rC.alive, true, `busy + PID vivant toléré : ${rC.reason}`);

  // (d) au-delà de la borne busy -> non vivant
  const tooOld = { state: 'busy', cycle: 42, pid: process.pid, timestamp: new Date(Date.now() - 90 * 60000).toISOString() };
  assert.equal(hbLib.evaluateHeartbeat(tooOld).alive, false);

  // (e) progression figée : cycle identique depuis longtemps + file non vide
  const frozen = hbLib.evaluateProgress(
    { cycle: 7, state: 'idle', queueDepth: 3 },
    { lastSeenCycle: 7, lastSeenCycleTime: Date.now() - 90 * 60000 }
  );
  assert.equal(frozen.stuck, true, `runner bloqué détecté : ${frozen.reason}`);
});

// ---------------------------------------------------------------------------
// TEST 3 — heartbeat absent au démarrage : un run neuf n'est pas « vivant »
// ---------------------------------------------------------------------------

test('3. heartbeat absent au démarrage : jamais déclaré vivant', async () => {
  const dir = tmpDir('t3');
  const env = isoEnv(dir);
  const hbLib = loadModule(env, 'heartbeat');

  assert.equal(fs.existsSync(hbLib.HEARTBEAT_FILE), false, 'aucun fichier heartbeat au départ');
  const r = hbLib.evaluateHeartbeat();
  assert.equal(r.alive, false);
  assert.equal(r.reason, 'no heartbeat file');

  // Le superviseur, confronté à cette absence, RELANCE (ne prétend pas que tout va bien)
  const res = spawnSync(process.execPath, [SUPERVISOR_SCRIPT, '--check'], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  assert.match(out, /runner NOT alive - no heartbeat file/, 'absence détectée');
  assert.match(out, /recovery=restarted/, 'relance effective en mode continu');

  const persist = readJSON(path.join(dir, 'state', 'supervisor-persist.json'));
  assert.ok(persist && persist.recovery && persist.recovery.childPid, 'récupération tracée (childPid)');
  assert.ok(Array.isArray(persist.restarts) && persist.restarts.length >= 1, 'fenêtre de redémarrages enregistrée');

  // Nettoyage : le superviseur lance le runner DÉTACHÉ (il survit au superviseur).
  stopIsolatedRunner(dir);
});

// ---------------------------------------------------------------------------
// TEST 4 — verrou détenu par un processus ACTIF : non libérable sans preuve
// ---------------------------------------------------------------------------

test('4. verrou détenu par un processus actif : pas de libération sans preuve', async () => {
  const dir = tmpDir('t4');
  const env = isoEnv(dir);
  const sem = loadModule(env, 'semaphore.cjs');

  // Deux processus RÉELLEMENT vivants : les verrous sont légitimes.
  const p1 = liveMarker();
  const p2 = liveMarker();
  try {
    assert.equal(sem.acquire('T4-actif-1', { pid: p1.pid }).acquired, true, '1er jeton pris');
    assert.equal(sem.acquire('T4-actif-2', { pid: p2.pid }).acquired, true, '2e jeton pris');

    // Sémaphore saturé : aucun 3e jeton (max 2 concurrences)
    const third = sem.acquire('T4-sature', { pid: p1.pid });
    assert.equal(third.acquired, false, '3e jeton refusé (saturation)');
    assert.match(third.reason, /max concurrent/);
    assert.equal(third.holders.length, 2, 'les 2 détenteurs actifs sont identifiés');

    // (a) Libération ADMIN refusée : le détenteur est vivant, aucune preuve d'abandon
    const refused = sem.reclaim('T4-actif-1', { reason: 'test refus' });
    assert.equal(refused.released, false, 'verrou vivant non cassé');
    assert.equal(refused.reason, 'refused_no_proof');

    // (b) Balayage automatique : conserve les détenteurs vivants
    const sweep = sem.sweepOrphans({ reason: 'test balayage' });
    assert.equal(sweep.released.length, 0, 'aucun verrou légitime balayé');
    assert.equal(sweep.kept.length, 2);

    // (c) Anti-doublon : même tâche + même processus = pas de second jeton
    const dup = sem.acquire('T4-actif-1', { pid: p1.pid });
    assert.equal(dup.acquired, false, 'double acquisition refusée');
    assert.equal(dup.duplicate, true);

    // (d) Audit : count recalculé depuis les preuves de vie
    const audit = sem.audit();
    assert.equal(audit.count, 2);
    assert.equal(audit.saturated, true);
    assert.equal(audit.orphans.length, 0);

    // (e) Libération par le propriétaire : autorisée, ciblée, idempotente
    const rel = sem.release('T4-actif-1', { pid: p1.pid });
    assert.equal(rel.released, true, 'le propriétaire libère son jeton');
    assert.equal(sem.audit().count, 1, 'un seul jeton retiré');

    // (f) Un autre processus ne peut PAS voler le jeton restant
    const steal = sem.release('T4-actif-2', { pid: p1.pid /* p1 vit, mais ne détient pas ce jeton */ });
    assert.equal(steal.released, false, 'non-propriétaire refusé');
    assert.equal(steal.reason, 'refused_not_owner');
    assert.equal(sem.audit().count, 1, 'le jeton volé est resté en place');
  } finally {
    killTree(p1); killTree(p2);
  }
});

// ---------------------------------------------------------------------------
// TEST 5 — verrou abandonné : PID mort / TTL dépassé -> balayage idempotent
// ---------------------------------------------------------------------------

test('5. verrou abandonné : balayé et libéré de façon idempotente', async () => {
  const dir = tmpDir('t5');
  const env = isoEnv(dir);
  const sem = loadModule(env, 'semaphore.cjs');

  // (a) PID d'un processus réellement mort
  const dead = await deadPid();
  // (b) Détenteur vivant mais verrou plus vieux que le TTL (2 h)
  const TTL = sem.SEMAPHORE_TTL_MS;
  // HOLDER_MIN_AGE_MS empêche le sweep d'un verrou pris il y a < 1 s : les
  // holders abandonnés sont donc vieillis pour être OPPOSABLES (sinon le sweep
  // les conserve et le test ne prouverait rien).
  const holderDead = { taskId: 'T5-pid-mort', pid: dead, host: os.hostname(), acquiredAt: new Date(Date.now() - 60000).toISOString(), acquiredAtMs: Date.now() - 60000 };
  const holderExpired = { taskId: 'T5-ttl-depasse', pid: process.pid, host: os.hostname(), acquiredAt: new Date(Date.now() - TTL - 60000).toISOString(), acquiredAtMs: Date.now() - TTL - 60000 };
  const holderActive = { taskId: 'T5-actif', pid: process.pid, host: os.hostname(), acquiredAt: new Date().toISOString(), acquiredAtMs: Date.now() };
  sem.writeSemaphore({ count: 3, holders: [holderDead, holderExpired, holderActive] });

  // Classification préalable = la PREUVE d'abandon
  const pre = sem.audit();
  const verdict = Object.fromEntries(pre.holders.map(h => [h.taskId, h.verdict]));
  assert.equal(verdict['T5-pid-mort'], 'orphan_dead_pid');
  assert.equal(verdict['T5-ttl-depasse'], 'orphan_expired');
  assert.equal(verdict['T5-actif'], 'active', 'le verrou légitime reste classé actif');

  // Balayage : libère exactement les abandonnés
  const sweep = sem.sweepOrphans({ reason: 'test abandon' });
  assert.deepEqual(sweep.released.map(r => r.taskId).sort(), ['T5-pid-mort', 'T5-ttl-depasse']);
  assert.equal(sweep.kept.length, 1, 'le verrou actif est conservé');

  const post = sem.audit();
  assert.equal(post.count, 1);
  assert.equal(post.saturated, false, 'un verrou abandonné ne bloque plus la file');

  // Désynchronisation détectée puis résorbée. `writeSemaphore` dérive `count`
  // des holders, donc le fichier déclarait 3 verroux là où les preuves de vie
  // n'en donnent qu' : `count` (recalculé) vaut 1 alors que `rawDeclaredCount`
  // (le déclaré) vaut encore 3. Après sweep, les deux s'alignent enfin sur la
  // réalité : c'est exactement le défaut d'origine (count désynchronisable).
  assert.equal(pre.rawDeclaredCount, 3, "le fichier déclarait 3 verroux");
  assert.equal(pre.count, 1, 'les preuves de vie ne donnent que 1 verrou actif');
  assert.notEqual(pre.rawDeclaredCount, pre.count, 'la désynchronisation est détectable');
  assert.equal(post.rawDeclaredCount, post.count, 'plus de désynchronisation après sweep');
  assert.deepEqual(post.holders.map(h => h.taskId), ['T5-actif'], 'seul le verrou actif subsiste');

  // Idempotence : rebalayer ne casse rien et ne duplique rien
  const again = sem.sweepOrphans({ reason: 'test abandon (2e appel)' });
  assert.equal(again.released.length, 0, 'idempotent : plus rien à libérer');
  assert.equal(sem.audit().count, 1);

  // Libération admin d'un verrou DÉJÀ libéré = noop (pas d'erreur)
  const rel = sem.reclaim('T5-pid-mort', { reason: 'déjà balayé' });
  assert.equal(rel.released, false);
  assert.equal(rel.reason, 'noop');

  // Journal des libérations (traçabilité)
  const journal = fs.readFileSync(sem.JOURNAL_FILE, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const events = journal.filter(l => l.taskId === 'T5-pid-mort' || l.taskId === 'T5-ttl-depasse');
  assert.ok(events.some(l => l.event === 'release.orphan'), 'libération journalisée');
});

// ---------------------------------------------------------------------------
// TEST 6 — attente sémaphore : requeue, JAMAIS un succès
// ---------------------------------------------------------------------------

test('6. attente sémaphore : remise en file et aucun task.success', async () => {
  const dir = tmpDir('t6');
  const env = isoEnv(dir, { FACTORY_HEARTBEAT_MS: '1500' });

  // Saturation par deux processus RÉELLEMENT vivants (jetons OpenCode épuisés)
  const p1 = liveMarker(); const p2 = liveMarker();
  const sem = loadModule(env, 'semaphore.cjs');
  sem.acquire('T6-bloc-1', { pid: p1.pid });
  sem.acquire('T6-bloc-2', { pid: p2.pid });
  try {
    // `code_task` est le SEUL type qui acquiert le sémaphore OpenCode
    // (executeCodeTask, ligne ~555). Une `script_task` ne l'acquiert pas :
    // elle ne consomme pas de jeton OpenCode. Pour éprouver l'attente, la
    // tâche doit donc emprunter ce chemin réel — et le payload est vide, donc
    // même si un jeton était libre, aucune exécution OpenCode n'aurait lieu.
    queueTask(dir, {
      id: 'T6-attente',
      type: 'code_task',
      payload: {},
      agent: 'coding', priority: 1, createdAt: new Date().toISOString(), retryCount: 0, maxRetries: 3,
    });

    const res = runOnce(env);
    assert.ok(res.status !== null, `runner terminé sans crash\n${childDiag(res)}`);

    const events = factoryLog(dir);
    const mine = events.filter(e => e.id === 'T6-attente' || e.taskId === 'T6-attente');
    assert.ok(mine.some(e => e.event === 'code_task.semaphore_wait'), 'attente sémaphore journalisée');
    assert.ok(mine.some(e => e.event === 'task.semaphore_wait_requeue'), 'requeue journalisée');
    assert.ok(!mine.some(e => e.event === 'task.success' || e.event === 'task_success'), 'AUCUN succès déclaré');
    assert.ok(!mine.some(e => e.event === 'task.error'), "pas d'auto-guérison en erreur");

    // La tâche reste en file, non consommée, non marquée terminée
    const after = readJSON(path.join(dir, 'queue', 'T6-attente.json'));
    assert.ok(after, 'la tâche reste dans la file');
    assert.equal(after.retryCount, 0, 'aucun retry consommé par une simple attente');
    assert.ok(after.nextRetryAt, 'backoff appliqué pour plus tard');
    assert.ok(after.status === undefined || after.status !== 'done');

    // Télémétrie PAR TÂCHE : la tâche en attente n'a produit AUCUN succès ni
    // erreur. (Les tâches de découverte du même cycle réussissent, elles, avec
    // preuve réelle — cf. journal factory task_success des ids api/gh-discovery.)
    assert.equal(taskEventCount(events, 'T6-attente', 'task_success'), 0, 'aucun task_success pour la tâche en attente');
    assert.equal(taskEventCount(events, 'T6-attente', 'task_error'), 0, "aucun task_error : l'attente n'est pas un échec");

    // Et le sémaphore a bien journalisé l'attente (refus d'admission, pas un succès)
    const semJournal = semaphoreJournal(dir);
    assert.ok(semJournal.some(l => l.event === 'acquire.refused' || l.event === 'acquire.wait'),
      `sémaphore : attente journalisée (${semJournal.map(l => l.event).join(', ') || 'aucun événement'})`);
    assert.ok(!semJournal.some(l => l.event === 'acquire' && l.taskId === 'T6-attente'),
      "la tâche en attente n'a jamais obtenu de jeton");
  } finally {
    killTree(p1); killTree(p2);
    sem.release('T6-bloc-1', { pid: p1.pid });
    sem.release('T6-bloc-2', { pid: p2.pid });
  }
});

// ---------------------------------------------------------------------------
// TEST 7 — échec réel : exitCode != 0 => erreur honnête, jamais un succès
// ---------------------------------------------------------------------------

test('7. échec réel : exitCode non nul jamais transformé en succès', async () => {
  const dir = tmpDir('t7');
  const env = isoEnv(dir);
  queueTask(dir, {
    id: 'T7-echec', type: 'script_task',
    payload: { command: 'node', args: ['-e', 'console.error("echec volontaire"); process.exit(3)'] },
    agent: 'coding', priority: 1, createdAt: new Date().toISOString(), retryCount: 0, maxRetries: 3,
  });

  const res = runOnce(env);
  const events = factoryLog(dir);
  const mine = events.filter(e => e.id === 'T7-echec' || e.taskId === 'T7-echec');

  assert.ok(mine.some(e => e.event === 'task.error'), `échec réel journalisé\n${childDiag(res)}`);
  const err = mine.find(e => e.event === 'task.error');
  assert.match(err.error, /3/, `le code de sortie 3 remonte (${err.error.slice(0, 80)}…)`);
  assert.ok(!mine.some(e => e.event === 'task.success' || e.event === 'task_success'), 'AUCUN succès');

  // Télémétrie PAR TÂCHE : un et un seul task_error pour CETTE tâche, jamais de
  // task_success. (Compteurs globes non assertés : les découvertes du même
  // cycle réussissent légitimement avec preuve réelle.)
  assert.equal(taskEventCount(events, 'T7-echec', 'task_error'), 1, 'task_error compté une fois pour cette tâche');
  assert.equal(taskEventCount(events, 'T7-echec', 'task_success'), 0, 'aucun task_success pour cette tâche');

  // Commande hors allowlist : refusée AVANT exécution (pas d'exécution réelle)
  queueTask(dir, { id: 'T7-interdit', type: 'script_task', payload: { command: 'powershell', args: ['-c', 'exit'] }, retryCount: 0, maxRetries: 3 });
  runOnce(env);
  const interd = factoryLog(dir).find(e => (e.id === 'T7-interdit') && e.event === 'task.error');
  assert.ok(interd, 'commande interdite rejetée');
  assert.match(interd.error, /non autorisee/);
});

// ---------------------------------------------------------------------------
// TEST 8 — succès réel : exécution prouvée (exitCode 0 + artefact vérifiable)
// ---------------------------------------------------------------------------

test('8. succès réel : preuve vérifiable (exitCode 0 + artefact produit)', async () => {
  const dir = tmpDir('t8');
  const env = isoEnv(dir);
  const artifact = path.join(dir, 'preuve-artefact.txt');
  env.P8_ARTIFACT = artifact;

  queueTask(dir, {
    id: 'T8-preuve', type: 'script_task',
    payload: { command: 'node', args: ['-e', `require('fs').writeFileSync(process.env.P8_ARTIFACT, 'ok')`] },
    agent: 'coding', priority: 1, createdAt: new Date().toISOString(), retryCount: 0, maxRetries: 3,
  });

  const res = runOnce(env);
  assert.equal(res.status, 0, `runner terminé proprement\n${childDiag(res)}`);

  // PREUVE INDÉPENDANTE : l'exécution a réellement produit un effet sur disque
  assert.equal(fs.existsSync(artifact), true, 'artefact produit par la vraie exécution');
  assert.equal(fs.readFileSync(artifact, 'utf8'), 'ok');

  const events = factoryLog(dir);
  const ok = events.find(e => e.id === 'T8-preuve' && e.event === 'task.success');
  assert.ok(ok, 'succès déclaré');
  assert.ok(Array.isArray(ok.proof) && ok.proof.includes('exitCode'), `preuve attachée : ${JSON.stringify(ok.proof)}`);

  // Télémétrie PAR TÂCHE : exactement un task_success pour CETTE tâche, et sa
  // preuve est enregistrée. Les autres succès du cycle (découvertes) ont leurs
  // propres preuves réelles — on ne les compte pas comme ceux de T8-preuve.
  assert.equal(taskEventCount(events, 'T8-preuve', 'task_success'), 1, 'un seul succès compté pour cette tâche');
  assert.equal(taskEventCount(events, 'T8-preuve', 'task_error'), 0, 'aucune erreur pour cette tâche');

  // La tâche exécutée quitte la file
  assert.equal(fs.existsSync(path.join(dir, 'queue', 'T8-preuve.json')), false, 'tâche terminée retirée');

  // Contre-épreuve : la porte de preuve REJETTE les résultats sans exécution
  const runner = loadModule(env, 'factory-runner.cjs');
  assert.equal(runner.verifyExecutionProof({ id: 'x' }, 'script_task', null).ok, false);
  assert.equal(runner.verifyExecutionProof({ id: 'x' }, 'script_task', {}).ok, false);
  assert.equal(runner.verifyExecutionProof({ id: 'x' }, 'code_task', { requeued: true }).ok, false);
  assert.equal(runner.verifyExecutionProof({ id: 'x' }, 'script_task', { exitCode: 2 }).ok, false);
  assert.equal(runner.verifyExecutionProof({ id: 'x' }, 'script_task', { exitCode: 0 }).ok, true);
  assert.equal(runner.verifyExecutionProof({ id: 'x' }, 'api_candidate', { candidates: 3 }).ok, true);
  assert.equal(runner.verifyExecutionProof({ id: 'x' }, 'code_task', { noChanges: true }).ok, true);
});

// ---------------------------------------------------------------------------
// TEST 9 — redémarrage runner + récupération d'état observable
// ---------------------------------------------------------------------------

test('9. redémarrage runner : reprise, traçabilité, pas de double lancement', async () => {
  const dir = tmpDir('t9');
  const env = isoEnv(dir);
  const lockFile = path.join(dir, 'state', 'factory.lock');

  try {
    // (a) Un runner tourne puis meurt brutalement (SIGKILL = pas de heartbeat final)
    const spin = spawn(process.execPath, [RUNNER_SCRIPT, '--supervisor'], { env, windowsHide: true, stdio: 'ignore' });
    const hbFile = path.join(dir, 'state', 'heartbeat.json');
    await waitFor(() => fs.existsSync(hbFile), { timeout: 40000 });
    const hbBefore = readJSON(hbFile);
    const cycleBefore = hbBefore.cycle;
    const telemetryBefore = readJSON(path.join(dir, 'state', 'telemetry.json')).cycles || 0;
    killTree(spin);
    await sleep(1500);

    // (b) Le superviseur constate la mort et relance
    const res = spawnSync(process.execPath, [SUPERVISOR_SCRIPT, '--check'], {
      env, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    const out = `${res.stdout || ''}`;
    assert.match(out, /runner NOT alive/, `mort détectée (${out.slice(0, 200)}…)`);
    assert.match(out, /recovery=restarted/, 'relance tracée');

    // (c) Le nouveau runner écrit un heartbeat AVEC l'état récupéré (cycle persistant)
    await waitFor(() => fs.existsSync(hbFile) && Date.parse(readJSON(hbFile).timestamp) > Date.parse(hbBefore.timestamp), { timeout: 40000 });
    const hbAfter = readJSON(hbFile);
    assert.notEqual(hbAfter.pid, spin.pid, 'nouveau processus runner');
    assert.ok(hbAfter.cycle >= cycleBefore, `cycle repris/continuité (avant ${cycleBefore}, apres ${hbAfter.cycle})`);
    const telemetryAfter = readJSON(path.join(dir, 'state', 'telemetry.json')).cycles || 0;
    assert.ok(telemetryAfter >= telemetryBefore, `télémétrie conservée (${telemetryBefore} -> ${telemetryAfter})`);

    // (d) Second passage : runner vivant => AUCUNE nouvelle relance (pas de boucle)
    const res2 = spawnSync(process.execPath, [SUPERVISOR_SCRIPT, '--check'], {
      env, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    const out2 = `${res2.stdout || ''}`;
    assert.match(out2, /runner alive/, 'runner reconnu vivant');
    assert.match(out2, /recovery=nominal/, 'récupération nominale');
    assert.ok(!/recovery=restarted/.test(out2), 'aucun redémarrage supplémentaire');

    const persist = readJSON(path.join(dir, 'state', 'supervisor-persist.json'));
    assert.ok(persist.restarts.length >= 1, 'au moins un redémarrage enregistré');
    assert.ok(persist.restarts.every(t => Number.isFinite(t)), 'horodatages de redémarrage valides');
    const restartsApresReprise = persist.restarts.length;

    // (e) Preuve anti-doublon par le VERROU d'usine isolé : un seul détenteur,
    //     PID vivant, et le compteur de redémarrages NE BOUGE PAS.
    const lock = readJSON(lockFile);
    assert.ok(lock && lock.pid, 'factory.lock présent et renseigné');
    assert.equal(lock.pid, hbAfter.pid, 'le verrou est détenu par le runner courant');
    let lockAlive = true;
    try { process.kill(Number(lock.pid), 0); } catch (e) { if (e.code === 'ESRCH') lockAlive = false; }
    assert.equal(lockAlive, true, 'le PID du verrou est bien un processus vivant');

    const res3 = spawnSync(process.execPath, [SUPERVISOR_SCRIPT, '--check'], {
      env, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    const out3 = `${res3.stdout || ''}`;
    assert.match(out3, /runner alive/, `runner toujours reconnu vivant : ${out3.slice(0, 300)}`);
    assert.ok(!/recovery=restarted/.test(out3), 'aucune relance supplémentaire au 3e passage');

    const persist3 = readJSON(path.join(dir, 'state', 'supervisor-persist.json'));
    assert.equal(persist3.restarts.length, restartsApresReprise,
      `pas de boucle de relance (${restartsApresReprise} -> ${persist3.restarts.length} redémarrages)`);

    // (f) Un run supplémentaire n'est PAS lancé : un seul fichier de heartbeat
    //     et un seul verrou pour ce même état isolé.
    await sleep(2000);
    const hbFinal = readJSON(hbFile);
    assert.equal(hbFinal.pid, hbAfter.pid, 'le runner est resté le MÊME processus (pas de doublon)');
    assert.equal(readJSON(lockFile).pid, hbAfter.pid, 'un seul détenteur de verrou');
  } finally {
    // Le runner détaché par le superviseur doit être arrêté : il survit au
    // superviseur et occuperait sinon un verrou/jeton sur cet état isolé.
    stopIsolatedRunner(dir);
    await sleep(300);
    stopIsolatedRunner(dir);
  }
});
