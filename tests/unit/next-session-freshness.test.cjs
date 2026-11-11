/**
 * check-next-session-freshness.cjs — tests du détecteur de staleness.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const SCRIPT = path.join(ROOT, 'scripts', 'automation', 'check-next-session-freshness.cjs')
const { makeTempDir } = require('./helpers/agent-task-state.cjs')

let passed = 0
let failed = 0
function test (name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++ }
  catch (e) { console.log('  ✗ ' + name + ' :: ' + (e && e.message ? e.message : e)); failed++ }
}

function run (args) {
  try {
    const out = execFileSync('node', [SCRIPT].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, stdout: out, stderr: '' }
  } catch (e) {
    return { code: e.status, stdout: e.stdout ? e.stdout.toString() : '', stderr: e.stderr ? e.stderr.toString() : '' }
  }
}

test('doc à jour (NEXT_SESSION >= current_state) : exit 0', () => {
  const dir = makeTempDir()
  const ns = path.join(dir, 'NEXT_SESSION.md')
  const cs = path.join(dir, 'current_state.md')
  fs.writeFileSync(ns, '# NEXT\n> 2026-11-10 — à jour\n', 'utf8')
  fs.writeFileSync(cs, '# state\n2026-11-05 entrée\n', 'utf8')
  const r = run(['--next-session', ns, '--current-state', cs])
  assertEq(r.code, 0, 'exit 0 attendu, got ' + r.code + ' :: ' + r.stderr)
})

test('doc obsolète (NEXT_SESSION < current_state) : exit 1 + message', () => {
  const dir = makeTempDir()
  const ns = path.join(dir, 'NEXT_SESSION.md')
  const cs = path.join(dir, 'current_state.md')
  fs.writeFileSync(ns, '# NEXT\n> 2026-07-30 — payment flow\n', 'utf8')
  fs.writeFileSync(cs, '# state\n2026-11-10 entrée\n', 'utf8')
  const r = run(['--next-session', ns, '--current-state', cs])
  assertEq(r.code, 1, 'exit 1 attendu, got ' + r.code)
  assert(r.stderr.includes('OBSOLÈTE'), 'message OBSOLÈTE attendu')
})

test('--json renvoie un objet structuré et stale=true', () => {
  const dir = makeTempDir()
  const ns = path.join(dir, 'NEXT_SESSION.md')
  const cs = path.join(dir, 'current_state.md')
  fs.writeFileSync(ns, '2026-07-30\n', 'utf8')
  fs.writeFileSync(cs, '2026-11-10\n', 'utf8')
  const r = run(['--next-session', ns, '--current-state', cs, '--json'])
  const obj = JSON.parse(r.stdout)
  assertEq(obj.stale, true)
  assertEq(obj.nextSessionMaxDate, '2026-07-30')
  assertEq(obj.currentStateMaxDate, '2026-11-10')
  assertEq(obj.lagDays, 103)
})

test('fichier manquant : exit 2', () => {
  const dir = makeTempDir()
  const r = run(['--next-session', path.join(dir, 'nope.md'), '--current-state', path.join(dir, 'nope2.md')])
  assertEq(r.code, 2, 'exit 2 attendu pour fichier manquant')
})

test('aucune date ISO : exit 2', () => {
  const dir = makeTempDir()
  const ns = path.join(dir, 'NEXT_SESSION.md')
  const cs = path.join(dir, 'current_state.md')
  fs.writeFileSync(ns, 'pas de date ici\n', 'utf8')
  fs.writeFileSync(cs, '2026-11-10\n', 'utf8')
  const r = run(['--next-session', ns, '--current-state', cs])
  assertEq(r.code, 2)
})

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)

function assertEq (a, b, msg) {
  if (a !== b) throw new Error((msg || 'assertion failed') + ` (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`)
}
function assert (cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}
