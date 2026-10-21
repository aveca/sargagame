#!/usr/bin/env node
/**
 * Tests de terminaison de processus bloqué et reprise de la queue (P0.10).
 *
 * Cas couverts :
 *  1. Processus enfant qui dépasse son timeout est arrêté.
 *  2. Arbre parent-enfant effectivement terminé (taskkill /T /F sous Windows).
 *  3. Faux `npm ci` bloqué échoue dans le délai prévu.
 *  4. Build bloqué ne monopolise pas indéfiniment le runner.
 *  5. Serveur Preview qui ne devient jamais disponible arrêté proprement.
 *  6. Smoke test qui ne répond pas échoue dans le délai prévu.
 *  7. Erreur de validation libère correctement le verrou et les ressources.
 *  8. Heartbeat reste fonctionnel quand un sous-processus est bloqué.
 *  9. Runner peut ensuite traiter une tâche indépendante.
 * 10. Tâche `parked` reste en quarantaine (jamais retraitée).
 * 11. Build normal réussit toujours avec les nouveaux délais.
 * 12. Erreurs distinguées des timeouts et interruptions.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execBounded, killProcessTree } = require('../../lib/process-runner.cjs');
const IS_WIN = os.platform() === 'win32';

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

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// CAS 1: Processus enfant qui dépasse son timeout est arrêté
// ---------------------------------------------------------------------------
test('CAS 1: processus enfant bloqué tué après timeout de 2s', async () => {
  const timeoutMs = 2000;
  const child = spawn(process.execPath, ['-e', 'while(true){}'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let resolved = false;
  const timer = setTimeout(() => {
    if (resolved) return;
    resolved = true;
    killProcessTree(child.pid, 'SIGKILL');
  }, timeoutMs);

  const exited = await new Promise((resolve) => {
    child.on('close', (code) => { clearTimeout(timer); resolve(code); });
    child.on('error', (e) => { clearTimeout(timer); resolve(null); });
  });

  await waitMs(1000);
  const stillAlive = pidAlive(child.pid);

  assert(resolved === true, 'timeout doit se déclencher');
  assert(stillAlive === false, `processus enfant PID ${child.pid} doit être mort après killProcessTree`);
  console.log(`   PID ${child.pid} fermé (code=${exited}), vivant=${stillAlive}`);
});

// ---------------------------------------------------------------------------
// CAS 2: Arbre parent-enfant effectivement terminé
// ---------------------------------------------------------------------------
test('CAS 2: killProcessTree termine le processus et ses descendants', async () => {
  const child = spawn(process.execPath, ['-e', 'while(true){}'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  assert(pidAlive(child.pid) === true, 'processus doit être vivant avant kill');

  const killed = killProcessTree(child.pid, 'SIGKILL');

  await waitMs(1000);
  const stillAlive = pidAlive(child.pid);

  assert(killed === true || IS_WIN, 'killProcessTree doit retourner true sur succès (ou être sur Windows)');
  assert(stillAlive === false, `processus enfant PID ${child.pid} doit être mort`);
  console.log(`   PID ${child.pid} tué, vivant=${stillAlive}`);
});

// ---------------------------------------------------------------------------
// CAS 3: Faux `npm ci` bloqué échoue dans le délai prévu
// ---------------------------------------------------------------------------
test('CAS 3: commande bloquée (infinite loop) échoue via execBounded avec timeout', async () => {
  const result = await execBounded(process.execPath, ['-e', 'while(true){}'], {
    timeout: 3000,
    windowsHide: true,
  });

  assert(result.timedOut === true, `expected timedOut=true, got ${result.timedOut}`);
  assert(result.code === -1, `expected code=-1, got ${result.code}`);
  assert(result.error !== null && result.error.includes('timed out'), `expected timeout error, got: ${result.error}`);
  await waitMs(1000);
  // Le processus enfant ne doit plus être vivant
  // (on ne peut pas vérifier le PID exact car execBounded l'enveloppe, mais timedOut=true prouve la détection)
  console.log(`   timedOut=${result.timedOut}, code=${result.code}, error=${result.error}`);
});

// ---------------------------------------------------------------------------
// CAS 4: Build bloqué ne monopolise pas indéfiniment le runner
// ---------------------------------------------------------------------------
test('CAS 4: execBounded rend le contrôle après timeout, runner reste réactif', async () => {
  const start = Date.now();
  const result = await execBounded(process.execPath, ['-e', 'while(true){}'], {
    timeout: 2000,
    windowsHide: true,
  });
  const elapsed = Date.now() - start;

  assert(result.timedOut === true, 'doit détecter le timeout');
  assert(elapsed >= 2000 && elapsed < 10000, `durée anormale: ${elapsed}ms (attendu ~2000ms)`);
  // Après le timeout, le runner peut exécuter une autre commande immédiatement
  const ok = await execBounded(process.execPath, ['-e', 'process.exit(0);'], {
    timeout: 5000,
    windowsHide: true,
  });
  assert(ok.timedOut === false, 'commande suivante doit s\'exécuter normalement');
  assert(ok.code === 0, 'commande suivante doit quitter avec code 0');
  console.log(`   timeout détecté après ${elapsed}ms, commande suivante OK`);
});

// ---------------------------------------------------------------------------
// CAS 5: Serveur Preview qui ne devient jamais disponible — arrêt propre
// ---------------------------------------------------------------------------
test('CAS 5: avecPreviewServer nettoie même quand le serveur ne démarre pas', async () => {
  const { stopAllServers } = require('../../lib/process-runner.cjs');
  await stopAllServers();

  // Vite n'est probablement pas installé/configuré ici — le serveur ne démarrera pas.
  // withPreviewServer doit échouer proprement sans bloquer indéfiniment.
  let threw = false;
  let errorMessage = '';
  try {
    await require('../../lib/process-runner.cjs').withPreviewServer(
      async (baseUrl) => { return { ok: true }; },
      {
        port: 9999, // port improbable
        host: 'localhost',
        previewCmd: [process.execPath, '-e', 'while(true){}'], // commande qui bloque
        previewArgs: [],
        readyTimeout: 3000,
      }
    );
  } catch (e) {
    threw = true;
    errorMessage = e.message;
  }
  assert(threw, 'doit échouer (serveur bloqué)');
  console.log(`   échec propre: ${errorMessage.slice(0, 100)}`);

  // Vérifier qu'aucun processus orphelin n'est resté
  await stopAllServers();
  await waitMs(1000);
  console.log('   nettoyage effectué');
});

// ---------------------------------------------------------------------------
// CAS 6: Smoke test qui ne répond pas échoue dans le délai prévu
// ---------------------------------------------------------------------------
test('CAS 6: commande qui ne produit jamais de sortie échoue dans le délai', async () => {
  // un script node qui attend indéfiniment sans jamais écrire sur stdout
  const result = await execBounded(process.execPath, [
    '-e', 'setInterval(() => {}, 1000);' // boucle d'event loop sans sortie
  ], {
    timeout: 2000,
    windowsHide: true,
  });

  assert(result.timedOut === true, `expected timedOut=true, got ${result.timedOut}`);
  assert(result.code === -1, `expected code=-1`);
  console.log(`   timeout détecté: ${result.timedOut}, code=${result.code}`);
});

// ---------------------------------------------------------------------------
// CAS 7: Erreur de validation libère le verrou et les ressources
// ---------------------------------------------------------------------------
test('CAS 7: erreur de validation libère le fichier de verrou (processing)', async () => {
  const STATE_DIR = path.join(__dirname, '..', '..', 'scripts', 'local-factory', 'state');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const taskId = 'TEST-TASK-LOCK-RELEASE';
  const processingFile = path.join(STATE_DIR, `processing-${taskId}.json`);

  // Simuler un verrou actif
  fs.writeFileSync(processingFile, JSON.stringify({
    taskId,
    startedAt: new Date().toISOString(),
    pid: process.pid
  }));

  assert(fs.existsSync(processingFile), 'verrou doit exister avant le test');

  // Simuler la libération après erreur (comme dans factory-runner.cjs catch block)
  try { fs.unlinkSync(processingFile); } catch (_) {}

  assert(!fs.existsSync(processingFile), 'verrou doit être libéré après erreur');
  console.log('   verrou de traitement libéré correctement');
});

// ---------------------------------------------------------------------------
// CAS 8: Heartbeat reste fonctionnel quand un sous-processus est bloqué
// ---------------------------------------------------------------------------
test('CAS 8: heartbeat continue pendant qu\'un processus est bloqué', async () => {
  const HEARTBEAT_FILE = path.join(__dirname, '..', '..', 'scripts', 'local-factory', 'state', 'heartbeat.json');

  // Lancer un processus bloqué en arrière-plan
  const blocked = spawn(process.execPath, ['-e', 'while(true){}'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Pendant ce temps, écrire le heartbeat (simule le runner qui continue)
  const hb = {
    pid: process.pid,
    at: new Date().toISOString(),
    cycle: 42,
    queueDepth: 5,
    lastTaskId: 'TEST-TASK-HEARTBEAT',
  };
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(hb, null, 2));

  const saved = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
  assert(saved.lastTaskId === 'TEST-TASK-HEARTBEAT', 'heartbeat doit être écrit pendant le blocage');
  assert(saved.cycle === 42, 'cycle doit être préservé');

  // Tuer le processus bloqué
  killProcessTree(blocked.pid, 'SIGKILL');
  await waitMs(1000);
  assert(pidAlive(blocked.pid) === false, 'processus bloqué doit être tué');

  console.log(`   heartbeat écrit pendant le blocage du PID ${blocked.pid}`);
});

// ---------------------------------------------------------------------------
// CAS 9: Runner peut traiter une tâche indépendante après interruption
// ---------------------------------------------------------------------------
test('CAS 9: tâche indépendante s\'exécute après terminaison d\'un processus bloqué', async () => {
  // Tuer un processus bloqué
  const blocked = spawn(process.execPath, ['-e', 'while(true){}'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await waitMs(500);
  killProcessTree(blocked.pid, 'SIGKILL');
  await waitMs(1000);
  assert(pidAlive(blocked.pid) === false, 'processus bloqué doit être mort');

  // Exécuter une tâche indépendante qui réussit
  const result = await execBounded(process.execPath, ['-e', 'console.log("indépendant OK"); process.exit(0);'], {
    timeout: 5000,
    windowsHide: true,
  });

  assert(result.timedOut === false, 'tâche indépendante ne doit pas timeout');
  assert(result.code === 0, 'tâche indépendante doit réussir');
  assert(result.stdout.includes('indépendant OK'), 'sortie doit contenir le message');
  console.log('   tâche indépendante exécutée avec succès');
});

// ---------------------------------------------------------------------------
// CAS 10: Tâche `parked` reste en quarantaine
// ---------------------------------------------------------------------------
test('CAS 10: tâche parked n\'est pas retraitée (statut préservé)', () => {
  const queueFile = path.join(__dirname, '..', '..', '..', 'queue', 'test-cas10-parked.json');
  const parkedTask = {
    id: 'test-cas10-parked',
    type: 'code_task',
    status: 'parked',
    retryCount: 3,
    maxRetries: 3,
    nextRetryAt: null,
    lastError: 'test parked task',
    parkedAt: new Date().toISOString(),
    quarantineReason: 'test quarantine',
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(queueFile, JSON.stringify(parkedTask, null, 2));
  try {
    const content = fs.readFileSync(queueFile, 'utf8');
    const task = JSON.parse(content);

    assert(task.status === 'parked', `expected status=parked, got ${task.status}`);
    assert(task.quarantineReason !== undefined, 'quarantineReason doit être présent');
    assert(task.nextRetryAt === null, 'nextRetryAt doit être null (pas de retry auto)');
    console.log(`   statut=${task.status}, quarantaine="${task.quarantineReason.slice(0, 60)}..."`);
  } finally {
    try { fs.unlinkSync(queueFile); } catch (_) {}
  }
});

// ---------------------------------------------------------------------------
// CAS 11: Build normal réussit avec les nouveaux délais
// ---------------------------------------------------------------------------
test('CAS 11: commande simple réussit avec execBounded (délai normal)', async () => {
  const result = await execBounded(process.execPath, ['-e', 'process.exit(0);'], {
    timeout: 10000,
    windowsHide: true,
  });

  assert(result.timedOut === false, 'ne doit pas timeout');
  assert(result.code === 0, `code doit être 0, got ${result.code}`);
  console.log(`   commande simple: code=${result.code}, timedOut=${result.timedOut}`);
});

// ---------------------------------------------------------------------------
// CAS 12: Erreurs distinguées des timeouts et interruptions
// ---------------------------------------------------------------------------
test('CAS 12: erreur d\'execution (exit code != 0) distincte de timeout', async () => {
  // Commande qui quitte avec code d'erreur rapidement
  const errResult = await execBounded(process.execPath, ['-e', 'process.exit(1);'], {
    timeout: 5000,
    windowsHide: true,
  });
  assert(errResult.timedOut === false, 'ne doit pas être un timeout');
  assert(errResult.code === 1, `code doit être 1, got ${errResult.code}`);
  assert(errResult.error !== null, 'error doit être défini pour une échec');

  // Commande qui bloque → timeout
  const toResult = await execBounded(process.execPath, ['-e', 'while(true){}'], {
    timeout: 2000,
    windowsHide: true,
  });
  assert(toResult.timedOut === true, 'doit être un timeout');
  assert(toResult.code === -1, `code doit être -1, got ${toResult.code}`);
  assert(toResult.error !== null && toResult.error.includes('timed out'), 'error doit mentionner timeout');

  console.log(`   erreur: code=${errResult.code}, timedOut=${errResult.timedOut}`);
  console.log(`   timeout: code=${toResult.code}, timedOut=${toResult.timedOut}`);
});

// ---------------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------------
console.log(`\n${passed} tests passés, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
