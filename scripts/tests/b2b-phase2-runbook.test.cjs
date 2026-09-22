#!/usr/bin/env node
'use strict'
/**
 * B2B Phase 2 — runbook coherence contract (100 % offline, zero network).
 *
 * Locks docs/B2B_PHASE2_RUNBOOK.md against the real code:
 *   - CLI flags/default dept/DRY default
 *   - documented commands match the actual CLI surface
 *   - documented exit codes match the actual process.exit codes
 *   - documented assertion counts match ACTUAL suite outputs (suites are
 *     hermetic: fixtures + in-memory mocks only — safe to run offline)
 *
 * Any drift between docs and code fails this file. No secrets, no network.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const runbook = read('docs/B2B_PHASE2_RUNBOOK.md')
const cli = read('scripts/automation/sirene-mq-import.cjs')
const client = read('scripts/lib/sirene-client.cjs')
const store = read('scripts/lib/b2b-store.cjs')

let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

// ---------------------------------------------------------------------------
// A) CLI surface documented = CLI surface real
// ---------------------------------------------------------------------------
console.log('— surface CLI —')
const dryLine = runbook.split(/\r?\n/).find((l) => l.trim() === 'node scripts/automation/sirene-mq-import.cjs')
ok(!!dryLine, 'runbook : commande dry-run = CLI nue (ligne exacte)')
ok(runbook.includes('--execute --max-pages 1'), 'runbook : execute contrôlé = --execute --max-pages 1')
ok(cli.includes("'--execute'") && cli.includes("'--from-file'") && cli.includes("'--max-pages'") && cli.includes("'--dept'"),
  'CLI : 4 options parsées (--execute/--from-file/--max-pages/--dept)')
ok(/execute:\s*false/.test(cli), 'CLI : DRY_RUN est le défaut (execute=false)')
ok(client.includes("MQ_DEPARTEMENT = '972'"), 'client : département par défaut = 972')
ok(/maxPages[^;]*500/.test(cli.replace(/\s+/g, ' ')), 'CLI : max-pages défaut 500 documenté')

// ---------------------------------------------------------------------------
// B) Codes de sortie documentés = codes réels
// ---------------------------------------------------------------------------
console.log('— codes de sortie —')
const exits = [...cli.matchAll(/process\.exit\((\d)\)/g)].map((m) => m[1])
for (const code of ['1', '2', '3']) {
  ok(exits.includes(code), `CLI : exit ${code} existe`)
  ok(new RegExp(`exit ${code}\\b|\\| ${code} \\|`).test(runbook), `runbook : exit ${code} documenté`)
}

// ---------------------------------------------------------------------------
// C) Comportement DRY/execute documenté = comportement réel
// ---------------------------------------------------------------------------
console.log('— DRY/execute —')
ok(runbook.includes('zéro HTTP') || runbook.includes('DRY-RUN'), 'runbook : DRY_RUN décrit')
ok(/if \(dryRun\) \{\n\s+stats\.wouldInsert/.test(store.replace(/\r\n/g, '\n')), 'store : dry-run court-circuite avant HTTP')
ok(store.includes('probeSchema'), 'store : probeSchema (fail-closed schéma absent)')
ok(runbook.includes('probeSchema()') && runbook.includes('fail-closed'), 'runbook : fail-closed documenté')
ok(/outreach|campagne|cron/.test(runbook) === false || !/workflow.*importeur/.test(runbook), 'runbook : aucune promesse de cron/import auto')

// ---------------------------------------------------------------------------
// D) Compteurs d'assertions documentés = sorties réelles (suites hermétiques)
// ---------------------------------------------------------------------------
console.log('— compteurs assertions (run réel, offline) —')
const suites = [
  ['scripts/tests/b2b-scoring.test.cjs', 'b2b-scoring'],
  ['scripts/tests/sirene-import.test.cjs', 'sirene-import'],
  ['scripts/tests/b2b-phase2-guards.test.cjs', 'b2b-phase2-guards'],
  ['scripts/tests/b2b-sales-engine-schema.test.cjs', 'b2b-sales-engine-schema'],
]
let total = 0
for (const [file, name] of suites) {
  let out = ''
  let code = 0
  try {
    out = execFileSync(process.execPath, [file], { encoding: 'utf8', cwd: ROOT })
  } catch (e) {
    code = e.status || 1
    out = String(e.stdout || '')
  }
  const count = (out.match(/✓/g) || []).length
  ok(code === 0, `${name} : exit 0`)
  const docM = runbook.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\D{0,40}?(\\d+)'))
  ok(!!docM, `runbook : ${name} a un compteur documenté`)
  if (docM) {
    const documented = parseInt(docM[1], 10)
    ok(documented === count, `runbook : ${name} documenté ${documented} == réel ${count}`)
  }
  total += count
}
ok(runbook.includes('251/251'), `runbook : total 251 documenté (réel ${total})`)
ok(total === 251, `total réel = 251 (mesuré ${total})`)

console.log(failures === 0
  ? '\nB2B-PHASE2-RUNBOOK TESTS: ALL PASS'
  : `\nB2B-PHASE2-RUNBOOK TESTS: ${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
