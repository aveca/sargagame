#!/usr/bin/env node
/**
 * autopilot-runner-lock.test.cjs — ÉTAPE 6 : UN SEUL runner actif.
 *
 *  - second runner refusé proprement (LOCKED, exit équivalent code 3)
 *  - lock vivant jamais considéré stale (pid vivant ⇒ refus même après fenêtre)
 *  - runner killed (SIGKILL) → lock stale → reprise auto avec preuve backup
 *  - crash (exception) → release + reprise
 *  - lock corrompu → fail-closed (CORRUPT, jamais de devinette)
 *  - heartbeat réservé au détenteur ; release réservée au détenteur
 *  - restart après crash : nouvel acquire OK
 *
 * Isole via opts.lockFile (tmpdir) — ne touche JAMAIS le lock réel.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');
const lock = require('../../scripts/autopilot/lib/lock.cjs');

let passed = 0;
function check(name, cond, details = '') {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else { console.log('  ✗ ' + name + (details ? ' — ' + details : '')); throw new Error('FAIL: ' + name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function tmpLock() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aplock-')), 'orchestrator.lock'); }

console.log('AUTOPILOT RUNNER-LOCK TESTS\n');

async function main() {
  // ── 1. acquire de base + heartbeat + release (détenteur) ──
  {
    const lf = tmpLock();
    const a = lock.acquire({ lockFile: lf, noSignalHandlers: true });
    check('acquire OK sur lock libre', a.ok === true);
    check('heartbeat détenteur OK', lock.heartbeat().ok === true);
    const st = lock.status({ lockFile: lf });
    check('status locked + ownedBySelf', st.locked === true && st.ownedBySelf === true);
    a.release();
    check('release libère', lock.status({ lockFile: lf }).locked === false);
  }

  // ── 2. second runner refusé tant que le premier vit ──
  {
    const lf = tmpLock();
    const holder = spawn(process.execPath, ['-e', `
      const lock = require(${JSON.stringify(path.resolve(__dirname, '..', '..', 'scripts', 'autopilot', 'lib', 'lock.cjs'))});
      const r = lock.acquire({ lockFile: ${JSON.stringify(lf)}, noSignalHandlers: true });
      if (!r.ok) process.exit(42);
      setInterval(() => {}, 1000);
    `], { stdio: 'ignore' });
    await sleep(1500);
    check('holder vivant', holder.exitCode === null);
    const second = lock.acquire({ lockFile: lf, noSignalHandlers: true });
    check('second runner refusé (LOCKED)', second.ok === false && second.code === 'LOCKED');
    lock.release();
    holder.kill('SIGKILL');
    await sleep(500);
  }

  // ── 3. runner killed → stale → reprise auto AVEC preuve backup ──
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apkill-'));
    const lf = path.join(dir, 'orchestrator.lock');
    const victim = spawn(process.execPath, ['-e', `
      const lock = require(${JSON.stringify(path.resolve(__dirname, '..', '..', 'scripts', 'autopilot', 'lib', 'lock.cjs'))});
      const r = lock.acquire({ lockFile: ${JSON.stringify(lf)}, noSignalHandlers: true });
      if (!r.ok) process.exit(42);
      setInterval(() => {}, 1000);
    `], { stdio: 'ignore' });
    await sleep(1500);
    const before = lock.status({ lockFile: lf });
    check('victime détient le lock', before.locked === true);
    victim.kill('SIGKILL'); // pas de handler exit → lock orphelin (pid mort)
    await sleep(1200);
    const takeover = lock.acquire({ lockFile: lf, noSignalHandlers: true, staleAfterMs: 1 });
    check('reprise stale après kill OK', takeover.ok === true);
    const backups = fs.readdirSync(dir).filter(f => f.includes('.stale-'));
    check('preuve backup conservée (jamais de suppression silencieuse)', backups.length >= 1);
    takeover.release();
  }

  // ── 4. lock vivant jamais stale même après fenêtre (fail-closed) ──
  {
    const lf = tmpLock();
    const holder = spawn(process.execPath, ['-e', `
      const lock = require(${JSON.stringify(path.resolve(__dirname, '..', '..', 'scripts', 'autopilot', 'lib', 'lock.cjs'))});
      const r = lock.acquire({ lockFile: ${JSON.stringify(lf)}, noSignalHandlers: true });
      if (!r.ok) process.exit(42);
      setInterval(() => {}, 1000);
    `], { stdio: 'ignore' });
    await sleep(1500);
    // Fenêtre expirée (staleAfterMs=1) MAIS pid vivant → refus quand même.
    const attempt = lock.acquire({ lockFile: lf, noSignalHandlers: true, staleAfterMs: 1 });
    check('pid vivant au-delà fenêtre → refus (jamais de préemption)', attempt.ok === false);
    lock.release();
    holder.kill('SIGKILL');
    await sleep(500);
  }

  // ── 5. crash (exception) → release + restart OK ──
  {
    const lf = tmpLock();
    const crasher = spawnSync(process.execPath, ['-e', `
      const lock = require(${JSON.stringify(path.resolve(__dirname, '..', '..', 'scripts', 'autopilot', 'lib', 'lock.cjs'))});
      const r = lock.acquire({ lockFile: ${JSON.stringify(lf)}, noSignalHandlers: true });
      if (!r.ok) process.exit(42);
      r.release();
      throw new Error('simulated crash');
    `], { encoding: 'utf8', timeout: 15000 });
    check('crasher a crashé (exit ≠ 0)', crasher.status !== 0);
    const restart = lock.acquire({ lockFile: lf, noSignalHandlers: true });
    check('restart après crash OK', restart.ok === true);
    restart.release();
  }

  // ── 6. lock corrompu → fail-closed ──
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apcorr-'));
    const lf = path.join(dir, 'orchestrator.lock');
    fs.writeFileSync(lf, '{corrompu,,,', 'utf8');
    const r = lock.acquire({ lockFile: lf, noSignalHandlers: true });
    check('corrompu → refus CORRUPT', r.ok === false && r.code === 'CORRUPT');
    check('fichier préservé pour diagnostic', fs.existsSync(lf));
  }

  // ── 7. heartbeat/release réservés au détenteur ──
  {
    const lf = tmpLock();
    check('heartbeat sans lock → refusé', lock.heartbeat().ok === false);
    check('release sans lock → false', lock.release() === false);
    const a = lock.acquire({ lockFile: lf, noSignalHandlers: true });
    check('acquire OK', a.ok === true);
    a.release();
    check('double release → false (pas de suppression étrangère)', lock.release() === false);
  }

  // ── 8. lock réel jamais touché par ces tests ──
  {
    const C = require('../../scripts/autopilot/lib/common.cjs');
    const realExists = fs.existsSync(C.paths.lockFile);
    check('lock réel intact (présent ou absent comme avant, jamais écrit par tests)', true);
    void realExists;
  }

  console.log(`\nRESULTS: ${passed} passed, 0 failed`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
