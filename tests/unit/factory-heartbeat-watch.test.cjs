/**
 * factory-heartbeat-watch.cjs — tests de la logique pure `evaluate()`.
 *
 * Le fichier d'état `data/factory-heartbeat-watch-seen.json` est un artefact
 * runtime local écrit UNIQUEMENT en mode `--send` : il n'est pas un défaut de
 * code et ne doit jamais être réinitialisé artificiellement. Ce qui est
 * testable (et ce qui manquait) est la fonction pure `evaluate()`, qui est
 * exportée sans effet de bord.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const ROOT = path.resolve(__dirname, '..', '..')
const SCRIPT = path.join(ROOT, 'scripts', 'automation', 'factory-heartbeat-watch.cjs')
const SEEN_FILE = path.join(ROOT, 'scripts', 'automation', 'data', 'factory-heartbeat-watch-seen.json')

let passed = 0
let failed = 0
function test (name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++ }
  catch (e) { console.log('  ✗ ' + name + ' :: ' + (e && e.message ? e.message : e)); failed++ }
}

const { evaluate } = require(SCRIPT)

test('never seen + grâce (< seuil) : pas d\'alerte, sig vide', () => {
  const r = evaluate({ lastIso: null, nowIso: '2026-11-11T10:00:00.000Z', firstCheckIso: '2026-11-11T08:00:00.000Z', threshold: 48 })
  assert.strictEqual(r.triggered, false)
  assert.strictEqual(r.neverSeen, true)
  assert.strictEqual(r.sig, '')
  assert.strictEqual(r.ageH, null)
})

test('never seen + grâce dépassée : alerte « never », sig « never|<jour> »', () => {
  const r = evaluate({ lastIso: null, nowIso: '2026-11-11T10:00:00.000Z', firstCheckIso: '2026-11-08T08:00:00.000Z', threshold: 48 })
  assert.strictEqual(r.triggered, true)
  assert.strictEqual(r.neverSeen, true)
  assert.strictEqual(r.sig, 'never|2026-11-11')
})

test('never seen sans firstCheckIso : grâce = now (pas d\'alerte immédiate)', () => {
  const r = evaluate({ lastIso: null, nowIso: '2026-11-11T10:00:00.000Z', threshold: 48 })
  assert.strictEqual(r.triggered, false)
  assert.strictEqual(r.neverSeen, true)
  assert.strictEqual(r.firstCheckIso, '2026-11-11T10:00:00.000Z')
})

test('heartbeat frais (< seuil) : pas d\'alerte', () => {
  const r = evaluate({ lastIso: '2026-11-11T09:00:00.000Z', nowIso: '2026-11-11T10:00:00.000Z', threshold: 48 })
  assert.strictEqual(r.triggered, false)
  assert.strictEqual(r.neverSeen, false)
  assert.strictEqual(r.sig, '')
  assert.ok(Math.abs(r.ageH - 1) < 1e-9, 'ageH doit être 1h')
})

test('heartbeat stale (>= seuil) : alerte « stale », sig « stale|<jour> »', () => {
  const r = evaluate({ lastIso: '2026-11-08T08:00:00.000Z', nowIso: '2026-11-11T10:00:00.000Z', threshold: 48 })
  assert.strictEqual(r.triggered, true)
  assert.strictEqual(r.neverSeen, false)
  assert.strictEqual(r.sig, 'stale|2026-11-11')
  assert.ok(r.ageH >= 48)
})

test('seuil personnalisé respecté (threshold)', () => {
  const r = evaluate({ lastIso: '2026-11-11T09:30:00.000Z', nowIso: '2026-11-11T10:00:00.000Z', threshold: 0.25 })
  assert.strictEqual(r.triggered, true, '0.5h >= 0.25h doit déclencher')
})

test('evaluate() est pure : ne touche pas au fichier d\'état (artefact runtime)', () => {
  const before = fs.existsSync(SEEN_FILE) ? fs.readFileSync(SEEN_FILE) : null
  const beforeMtime = fs.existsSync(SEEN_FILE) ? fs.statSync(SEEN_FILE).mtimeMs : null
  // Appels répétés (y compris le cas déclenchant) ne doivent rien écrire.
  evaluate({ lastIso: null, nowIso: '2026-11-11T10:00:00.000Z', threshold: 48 })
  evaluate({ lastIso: '2026-11-01T00:00:00.000Z', nowIso: '2026-11-11T10:00:00.000Z', threshold: 48 })
  const after = fs.existsSync(SEEN_FILE) ? fs.readFileSync(SEEN_FILE) : null
  const afterMtime = fs.existsSync(SEEN_FILE) ? fs.statSync(SEEN_FILE).mtimeMs : null
  assert.deepStrictEqual(after, before, 'evaluate() ne doit pas modifier le fichier d\'état')
  assert.strictEqual(afterMtime, beforeMtime, 'evaluate() ne doit pas toucher au mtime')
})

test('evaluate() est déterministe (même entrée -> même sortie)', () => {
  const args = { lastIso: '2026-11-08T08:00:00.000Z', nowIso: '2026-11-11T10:00:00.000Z', threshold: 48 }
  const a = evaluate(args)
  const b = evaluate(args)
  assert.deepStrictEqual(a, b)
})

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
