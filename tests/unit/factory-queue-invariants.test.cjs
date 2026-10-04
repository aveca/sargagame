// tests/unit/factory-queue-invariants.test.cjs — PROOF-001
// Garde-fou non-régression : les artefacts runtime de la factory (queue,
// lock, télémétrie, circuit breakers, logs) ne doivent jamais être suivis
// par git. Testé via `git check-ignore` (état réel de l'index), pas via
// lecture du .gitignore (qui pourrait mentir).
// Lancement : node tests/unit/factory-queue-invariants.test.cjs

const { execFileSync } = require('child_process');
const assert = require('assert');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('PROOF-001 — factory runtime artifacts stay untracked\n');

function isIgnored(p) {
  try {
    execFileSync('git', ['check-ignore', '-q', p]);
    return true;
  } catch (_) {
    return false;
  }
}

// 1. Fichiers runtime représentatifs ignorés
check('queue/task-TEST-001.json ignoré', isIgnored('queue/task-TEST-001.json'));
check('scripts/local-factory/state/factory.lock ignoré', isIgnored('scripts/local-factory/state/factory.lock'));
check('scripts/local-factory/state/telemetry.json ignoré', isIgnored('scripts/local-factory/state/telemetry.json'));
check('scripts/local-factory/state/circuit-breakers.json ignoré', isIgnored('scripts/local-factory/state/circuit-breakers.json'));
check('scripts/local-factory/logs/factory-2026-10-04.jsonl ignoré', isIgnored('scripts/local-factory/logs/factory-2026-10-04.jsonl'));

// 2. Aucun artefact runtime actuellement suivi
let tracked = '';
try {
  tracked = execFileSync('git', ['ls-files', 'queue/', 'scripts/local-factory/state/', 'scripts/local-factory/logs/'], { encoding: 'utf8' }).trim();
} catch (_) {}
const trackedRuntime = tracked.split('\n').map((l) => l.trim()).filter((l) => l && !l.endsWith('.gitignore') && !l.endsWith('README.md'));
check('aucun artefact runtime suivi en git', trackedRuntime.length === 0, JSON.stringify(trackedRuntime).slice(0, 200));

console.log(`\n${passed} checks passed — factory runtime stays out of git.`);
