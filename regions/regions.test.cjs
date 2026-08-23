#!/usr/bin/env node
/**
 * regions.test.cjs — auto-découvert par scripts/run-tests.cjs (donc lancé en CI
 * via `npm test`). Deux objectifs :
 *   1. VALIDATION STRICTE de TOUTES les régions réelles (pas seulement mq) — une
 *      région cassée ne doit jamais passer la PR.
 *   2. Vérifier le filet de RÉSILIENCE build : un JSON non-core cassé est isolé
 *      (skip) sans faire tomber MQ/GP ; un core cassé, lui, fail-loud.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const R = require('./index.cjs');

let n = 0;
function test(name, fn) { n++; try { fn(); console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// ── 1. Régions réelles : validation stricte ────────────────────────────────
test('assertAllRegionsValid passe sur les régions réelles', () => {
  const count = R.assertAllRegionsValid();
  assert.ok(count >= 5, `attendu ≥5 régions, eu ${count}`);
});

test('getAllRegions contient les 5 régions attendues, chacune avec id+domain', () => {
  const ids = R.getAllRegions().map(r => r.id);
  for (const id of ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya']) {
    assert.ok(ids.includes(id), `région manquante: ${id}`);
  }
  for (const r of R.getAllRegions()) {
    assert.ok(r.id, 'région sans id');
    assert.ok(r.domain, `région ${r.id} sans domain`);
  }
});

// ── 2. Filet de résilience (sur un dossier temporaire, zéro pollution) ──────
function mkTmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regtest-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}
const validMq = { id: 'mq', domain: 'sargasses-martinique.com' };
const validGp = { id: 'gp', domain: 'sargasses-guadeloupe.com' };
// Non-core cassée : une plage dont island ≠ id (invariant validateRegion).
const brokenUsd = { id: 'florida', domain: 'sargassummiami.com', bbox: [-81, 25, -80, 26], beaches: [{ id: 'fl1', island: 'mq', lat: 25.5, lng: -80.5 }] };

test('une région NON-CORE cassée est isolée — MQ/GP préservées', () => {
  const dir = mkTmp({ 'mq.json': validMq, 'gp.json': validGp, 'florida.json': brokenUsd });
  try {
    const out = R._loadFromDir(dir);
    assert.ok(out.mq && out.gp, 'mq/gp doivent survivre');
    assert.ok(!out.florida, 'florida cassée doit être ignorée');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('une région CORE cassée fait fail-loud (throw)', () => {
  const dir = mkTmp({ 'mq.json': '{ bad json', 'gp.json': validGp });
  try {
    assert.throws(() => R._loadFromDir(dir), /mq/i, 'un mq.json cassé doit throw');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('aucune région core chargée → throw', () => {
  const dir = mkTmp({ 'florida.json': { id: 'florida', domain: 'x.com' } });
  try {
    assert.throws(() => R._loadFromDir(dir), /core/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\nregions.test.cjs : ${n} test(s)`);
