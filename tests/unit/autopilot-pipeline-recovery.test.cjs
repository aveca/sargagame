#!/usr/bin/env node
/**
 * autopilot-pipeline-recovery.test.cjs — ÉTAPE 7 : chaque tâche progresse
 * sans intervention. Échec → classifier → retry si récupérable (borne) →
 * parker si non → scheduler continue. Une tâche ne stoppe JAMAIS la factory.
 */
'use strict';
const assert = require('assert');
const orch = require('../../scripts/autopilot/orchestrator.cjs');

let passed = 0;
function check(name, cond, details = '') {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else { console.log('  ✗ ' + name + (details ? ' — ' + details : '')); throw new Error('FAIL: ' + name); }
}

console.log('AUTOPILOT PIPELINE-RECOVERY TESTS\n');

// ── 1. classifyError = le vrai (exporté), pas une copie ──
{
  check('exporté', typeof orch.classifyError === 'function' && typeof orch.decideRecovery === 'function');
  const cases = [
    ['CI failed on tests', 'ci-failure'],
    ['CI red', 'ci-failure'],
    ['build failed: syntax', 'build-failure'],
    ['test failure assert', 'test-failure'],
    ['preview deploy failed', 'preview-deploy-failed'],
    ['online QA regression detected', 'online-qa-regression'],
    ['playwright pageerror', 'browser-error'],
    ['connection timeout', 'timeout'],
    ['something weird', 'unknown'],
    ['', 'unknown'],
    [null, 'unknown'],
  ];
  for (const [msg, expected] of cases) {
    check(`classify "${String(msg).slice(0, 28)}" → ${expected}`, orch.classifyError(msg) === expected);
  }
}

// ── 2. decideRecovery : retry borné ──
{
  let d = orch.decideRecovery({ classification: 'test-failure', attempt: 0, maxAttempts: 3, reason: 'gate rouge' });
  check('essai 0/3 → retry', d.action === 'retry');
  d = orch.decideRecovery({ classification: 'test-failure', attempt: 2, maxAttempts: 3, reason: 'gate rouge' });
  check('essai 2/3 → retry (dernier)', d.action === 'retry');
  d = orch.decideRecovery({ classification: 'test-failure', attempt: 3, maxAttempts: 3, reason: 'gate rouge' });
  check('essai 3/3 → park', d.action === 'park');
  d = orch.decideRecovery({ classification: 'ci-failure', attempt: 99, maxAttempts: 3, reason: 'CI rouge' });
  check('au-delà du max → park (pas de boucle)', d.action === 'park');
}

// ── 3. decideRecovery : non récupérable → park immédiat (zéro acharnement) ──
{
  for (const reason of ['denylist: public/api/mollie.php', 'secrets détectés: sk_live',
    'contrat opportunité invalide: id manquant', 'branch protection bloque le push']) {
    const d = orch.decideRecovery({ classification: 'test-failure', attempt: 0, maxAttempts: 3, reason });
    check(`park immédiat: "${reason.slice(0, 34)}"`, d.action === 'park');
  }
}

// ── 4. decideRecovery : jamais de stop-factory pour une tâche ──
{
  const actions = new Set();
  for (let a = 0; a <= 5; a++) {
    for (const c of ['ci-failure', 'build-failure', 'test-failure', 'unknown', null]) {
      actions.add(orch.decideRecovery({ classification: c, attempt: a, maxAttempts: 3, reason: 'x' }).action);
    }
  }
  check('actions ∈ {retry, park} uniquement', [...actions].every(x => x === 'retry' || x === 'park'));
  check('jamais abort-factory/stop/human', ![...actions].some(x => /stop|abort|human/i.test(x)));
}

// ── 5. backoff croissant (pas de busy-loop) ──
{
  const b0 = orch.decideRecovery({ classification: 'timeout', attempt: 0, maxAttempts: 3, reason: 't' });
  const b1 = orch.decideRecovery({ classification: 'timeout', attempt: 1, maxAttempts: 3, reason: 't' });
  check('backoff croissant', (b1.backoffMs || 0) >= (b0.backoffMs || 0));
}

// ── 6. défauts sûrs : max invalide → 3, attempt invalide → 0 ──
{
  const d = orch.decideRecovery({ classification: 'unknown', attempt: -5, maxAttempts: 0, reason: 'x' });
  check('défauts sûrs → retry', d.action === 'retry');
}

console.log(`\nRESULTS: ${passed} passed, 0 failed`);
