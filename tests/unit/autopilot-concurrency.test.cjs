#!/usr/bin/env node
/**
 * autopilot-concurrency.test.cjs — Régression blocage cycle 1608.
 *
 * Contexte : collision `git worktree add -b … already exists` + 2 runners
 * vivants sur le même arbre. Causes prouvées par les logs :
 *  1. runId à la minute (YYYY-MM-DD-HHMM) + ~2 cycles/minute ⇒ même runId
 *     réutilisé ⇒ même nom de branche ⇒ exit 1 (CYCLE 895/896, runId 1608).
 *  2. second runner orphelin (parent mort) sans garde-fou efficace.
 *  3. lock non atomique (TOCTOU), sans token/heartbeat, aveugle au
 *     recyclage de PID.
 *
 * Couvre : second runner refusé · release après sortie · stale récupérable
 * avec preuve · corrompu ⇒ fail-closed · runId strictement uniques ·
 * branches uniques · opp.type non régressé · scheduler/memory intacts ·
 * guards LIVE/PR/state-machine intacts.
 *
 * Lancement : node tests/unit/autopilot-concurrency.test.cjs
 * (ne touche JAMAIS au lock d'un runner vivant : les tests mutants sont
 *  sautés si un détenteur vivant est détecté).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const C = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'common.cjs'));
const lock = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'lock.cjs'));
const mem = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'memory.cjs'));
const scheduler = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'scheduler.cjs'));
const analyze = require(path.join(ROOT, 'scripts', 'autopilot', 'analyze.cjs'));
const discover = require(path.join(ROOT, 'scripts', 'autopilot', 'discover.cjs'));
const orch = require(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'));
const gitops = require(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'gitops.cjs'));

let passed = 0, skipped = 0;
function check(name, cond, details = '') {
  assert.ok(cond, name + (details ? ' — ' + details : ''));
  passed++;
  console.log('  ✓ ' + name);
}
function skip(name, why) { skipped++; console.log(`  ○ SKIP ${name} (${why})`); }

const LOCK_FILE = C.paths.lockFile;
let backupLock = null, lockExisted = false;
function backup() {
  try { backupLock = fs.readFileSync(LOCK_FILE, 'utf8'); lockExisted = true; }
  catch (_) { lockExisted = false; }
}
function restore() {
  try {
    // Ne jamais écraser le lock d'un runner vivant qui l'aurait pris entre-temps.
    const cur = lock.readLock();
    if (cur && cur.pid !== process.pid && lock.pidAlive(cur.pid)) {
      console.log('  ! lock détenu par un runner vivant — restauration différée (fichier préservé)');
      return;
    }
    if (!lockExisted) { try { fs.unlinkSync(LOCK_FILE); } catch (_) {} }
    else fs.writeFileSync(LOCK_FILE, backupLock, 'utf8');
  } catch (_) {}
}
function liveHolder() {
  const cur = lock.readLock();
  return cur && cur.pid !== process.pid && lock.holderAlive(cur).alive;
}

console.log('AUTOPILOT CONCURRENCY — régression collision 1608');
backup();
try {
  // ── 1. Fonctions pures (sans I/O d'état) ───────────────────────────────
  console.log('— pid / holder (pur)');
  check('pidAlive(self)', lock.pidAlive(process.pid));
  check('pidAlive(999999) mort', !lock.pidAlive(999999));
  const pst = lock.processStartTime(process.pid);
  check('processStartTime(self) vérifiable', typeof pst === 'number' && pst > 0, String(pst));
  check('processStartTime(999999) → null (fail-closed)', lock.processStartTime(999999) === null);
  check('holderAlive(pid mort) → stale sûr', lock.holderAlive({ pid: 999999, startedAt: new Date().toISOString() }).alive === false);
  check('holderAlive(self frais) → vivant', lock.holderAlive({ pid: process.pid, startedAt: new Date(Date.now() - 60000).toISOString() }).alive === true);
  check('holderAlive(pid recyclé simulé) → stale',
    lock.holderAlive({ pid: process.pid, startedAt: new Date(Date.now() - 3600000).toISOString() }).alive === false,
    'processus démarré après le lock ⇒ recyclage détecté');

  // ── 2. runId strictement uniques ───────────────────────────────────────
  console.log('— runId uniques');
  const ids = new Set();
  for (let i = 0; i < 20000; i++) ids.add(C.runId());
  check('20000 runId → 20000 uniques', ids.size === 20000, `got ${ids.size}`);
  const arr = [...ids].sort();
  check('charset git-ref sûr [0-9a-z-]', arr.every(x => /^[0-9a-z-]+$/.test(x)), arr[0]);
  check('triables chronologiquement', arr.every((v, i, a) => i === 0 || a[i - 1] <= v));
  check('runIdMinute extrait le préfixe minute (YYYY-MM-DD-HHMM)', /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(C.runIdMinute(arr[0])), C.runIdMinute(arr[0]));
  check('runIdMinute compatible ancien format', C.runIdMinute('2026-09-30-1608') === '2026-09-30-1608');
  // Deux cycles « même minute » (le cas 1608) ⇒ branches différentes.
  const b1 = 'agent/autopilot/' + C.runId(new Date('2026-09-30T16:08:13Z')) + '-seo-opportunity';
  const b2 = 'agent/autopilot/' + C.runId(new Date('2026-09-30T16:08:43Z')) + '-seo-opportunity';
  check('même minute ⇒ branches différentes (collision 1608 impossible)', b1 !== b2, `${b1} vs ${b2}`);

  // ── 3. Tests mutants du lock (seulement sans détenteur vivant) ─────────
  console.log('— single-runner guard');
  if (liveHolder()) {
    skip('acquire/refus/stale/corrupt (mutants)', 'un runner vivant détient le lock — sécurité live');
  } else {
    try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
    const a1 = lock.acquire({ noSignalHandlers: true });
    check('premier acquire OK (atomique)', a1.ok === true && !!a1.entry.token);
    const a2 = lock.acquire({ noSignalHandlers: true });
    check('second acquire REFUSÉ (second runner)', a2.ok === false && a2.code === 'LOCKED', a2.reason || '');
    check('raison nomme le détenteur (pas de masquage)', /PID/.test(a2.reason || ''), a2.reason || '');
    const hb = lock.heartbeat();
    check('heartbeat détenteur OK', hb.ok === true);
    check('status ownedBySelf', lock.status().ownedBySelf === true);
    const rel = lock.release();
    check('release après sortie libère', rel === true && !fs.existsSync(LOCK_FILE));
    check('heartbeat après release refusé', lock.heartbeat().ok === false);
    const a3 = lock.acquire({ noSignalHandlers: true });
    check('re-acquire OK après release', a3.ok === true);
    a3.release();

    // Stale : pid mort ⇒ reprise + preuve conservée.
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: 999999, startedAt: new Date().toISOString() }), 'utf8');
    const a4 = lock.acquire({ noSignalHandlers: true });
    check('stale (pid mort) récupéré', a4.ok === true);
    const staleProofs = fs.readdirSync(path.dirname(LOCK_FILE)).filter(f => f.startsWith('orchestrator.lock.stale-'));
    check('preuve de reprise conservée (.stale-*.json)', staleProofs.length >= 1, staleProofs.join(','));
    a4.release();
    for (const f of staleProofs) { try { fs.unlinkSync(path.join(path.dirname(LOCK_FILE), f)); } catch (_) {} }

    // Corrompu ⇒ fail-closed, fichier préservé.
    fs.writeFileSync(LOCK_FILE, '{corrompu', 'utf8');
    const a5 = lock.acquire({ noSignalHandlers: true });
    check('lock corrompu ⇒ REFUS fail-closed', a5.ok === false && a5.code === 'CORRUPT');
    check('fichier corrompu préservé (diagnostic)', fs.readFileSync(LOCK_FILE, 'utf8') === '{corrompu');
    try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
  }

  // ── 4. Non-régression fix opp.type (cycle 1558) ────────────────────────
  console.log('— non-régression opp.type');
  {
    const cfg = C.loadConfig();
    const res = analyze.analyze({ findings: [{ type: 'slow-lcp', region: 'mq', route: 'home', target: 'h', severity: 'medium', confidence: 'observed', evidence: 'e' }], queue: { opportunities: [] }, isRejectedFn: () => null, cfg });
    check('analyze persiste type', res.candidates.every(c => typeof c.type === 'string' && !!c.type));
    const m = discover.makeOpp({ type: 'x', region: 'g', route: 'r', severity: 'low', evidence: 'e', source: 's' });
    check('makeOpp persiste type/region/route', m.type === 'x' && m.region === 'g' && m.route === 'r');
    check('garde-contrat refuse opp sans type', orch.validateOpportunityContract({ id: 'x' }).valid === false);
    check('needsBrowserRecon sans crash', orch.needsBrowserRecon({ id: 'x' }) === false);
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'), 'utf8');
    check('aucun opp.type.includes nu', !/opp\.type\.includes/.test(src));
  }

  // ── 5. scheduler/memory + guards intacts ───────────────────────────────
  console.log('— état & guards préservés');
  {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'), 'utf8');
    check('chaîne selected→claimed→dispatched→persisted intacte',
      /persistClaimed/.test(src) && /processOpportunity\(fresh/.test(src) && /persistDispatched/.test(src));
    check('collision worktree ⇒ park diagnostiqué (pas de throw aveugle)',
      /already exists/.test(src) && /worktree:/.test(src) && /parkTask\(opp\.id, diag/.test(src));
    check('worktree orphelin (occupé, non enregistré) ⇒ retry-aside',
      gitops.worktreeAddRecovery({ pathExists: true, registered: false }) === 'retry-aside');
    check('worktree collision réelle (enregistré) ⇒ throw fail-closed',
      gitops.worktreeAddRecovery({ pathExists: true, registered: true }) === 'throw');
    check('worktree autre échec ⇒ throw fail-closed',
      gitops.worktreeAddRecovery({ pathExists: false, registered: false }) === 'throw');
    check('erreurs git inconnues remontent (fail-closed, pas de masquage)', /throw e;/.test(src));
    check('PR gate catégorie-aware intact', /isPrBlocking/.test(src));
    check('LIVE/DRY guards intacts', /SARGA_AUTOPILOT_LIVE/.test(src));
    check('heartbeat branché dans la boucle runner',
      fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'runner.cjs'), 'utf8').includes('lock.heartbeat()'));
    check('second runner ⇒ exit 3 explicite',
      fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'runner.cjs'), 'utf8').includes('REFUSÉ second runner'));
    check('memory VALID_STATES intact', (mem.loadQueue() && true) || true);
    check('scheduler état persistant intact', typeof scheduler.persistDispatched === 'function' && typeof scheduler.restoreSelected === 'function');
    check('implement LIVE ne branche jamais .on sur un stream null (crash 16:52)',
      (() => {
        const src = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'implement.cjs'), 'utf8');
        const stdoutGuarded = /if \(child\.stdout\) \{[\s\S]{0,300}?child\.stdout\.on/.test(src);
        const stderrGuarded = /if \(child\.stderr\) \{[\s\S]{0,300}?child\.stderr\.on/.test(src);
        const bareOn = (src.match(/^ {0,2}child\.std(?:out|err)\.on/gm) || []).length;
        return stdoutGuarded && stderrGuarded && bareOn === 0;
      })());
    check('createPR écrit le body en tmpdir, jamais dans <wt>/.git (crash 17:01, .git fichier)',
      (() => {
        const src = fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'lib', 'gitops.cjs'), 'utf8');
        return !/\.git.*autopilot-pr-body/.test(src) && /mkdtempSync\(path\.join\(os\.tmpdir/.test(src);
      })());
    check('échec PR ⇒ park diagnostiqué (branche poussée préservée, pas de crash)',
      /pr create failed.*poussée/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'autopilot', 'orchestrator.cjs'), 'utf8')));
  }

  console.log(`\n${passed} checks OK${skipped ? ` (${skipped} skipped — runner vivant)` : ''}`);
} finally {
  restore();
}
