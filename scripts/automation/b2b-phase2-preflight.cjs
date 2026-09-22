#!/usr/bin/env node
'use strict'
/**
 * B2B Phase 2 — PREFLIGHT (read-only, jamais de secret affiché).
 *
 * Répond à une seule question : "peut-on démarrer la séquence Phase 2 ?"
 *   node scripts/automation/b2b-phase2-preflight.cjs
 *
 * - présence des credentials : OUI/NON (jamais de valeur)
 * - dernier run apply-supabase-schema.yml : via `gh` CLI si disponible (READ-ONLY)
 * - suites Phase 2 : rejouées en local (hermétiques, zéro réseau)
 * - PR #710 : DRAFT/OPEN (via `gh`, READ-ONLY, best-effort)
 *
 * N'écrit RIEN (ni fichier, ni réseau en écriture) et n'appelle JAMAIS
 * Supabase ni SIRENE. Exit 0 si prêt, 1 sinon — sans quitter en cas
 * d'outil externe indisponible (UNKNOWN ≠ échec).
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const results = []
function check(label, value, ready) {
  const mark = value === true ? 'OUI' : value === false ? 'NON' : String(value)
  results.push({ label, mark, ready })
  console.log(`  ${ready === true ? '✓' : ready === false ? '✗' : '·'} ${label} : ${mark}`)
}

function envPresent(name) {
  const fromProc = typeof process.env[name] === 'string' && process.env[name].length > 0
  if (fromProc) return true
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return false
  const raw = fs.readFileSync(envPath, 'utf8')
  const m = raw.match(new RegExp('^' + name + '=(.*)$', 'm'))
  return !!m && m[1].trim().length > 0 && !m[1].includes('YOUR_')
}

console.log('B2B PHASE 2 — PREFLIGHT (read-only)')
console.log('— credentials (présence uniquement) —')
check('SIRENE_CONSUMER_KEY', envPresent('SIRENE_CONSUMER_KEY'), envPresent('SIRENE_CONSUMER_KEY'))
check('SIRENE_CONSUMER_SECRET', envPresent('SIRENE_CONSUMER_SECRET'), envPresent('SIRENE_CONSUMER_SECRET'))
check('SUPABASE_URL (execute seul)', envPresent('SUPABASE_URL'), envPresent('SUPABASE_URL'))
check('SUPABASE_SERVICE_KEY (execute seul)', envPresent('SUPABASE_SERVICE_KEY'), envPresent('SUPABASE_SERVICE_KEY'))

console.log('— apply-supabase-schema.yml (via gh, read-only) —')
let schemaReady = null
try {
  const out = execFileSync('gh', [
    'run', 'list', '--workflow=apply-supabase-schema.yml', '--limit', '1',
    '--json', 'conclusion,createdAt,databaseId',
  ], { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] })
  const runs = JSON.parse(out)
  const last = runs[0]
  if (!last) {
    check('dernier run', 'AUCUN', false)
  } else {
    check('dernier run ' + last.databaseId, last.conclusion === 'success' ? 'GREEN' : 'RED', last.conclusion === 'success')
    schemaReady = last.conclusion === 'success'
  }
} catch (e) {
  check('dernier run', 'UNKNOWN (gh indisponible)', null)
}

console.log('— suites Phase 2 (hermétiques, offline) —')
const suites = [
  'scripts/tests/b2b-scoring.test.cjs',
  'scripts/tests/sirene-import.test.cjs',
  'scripts/tests/b2b-phase2-guards.test.cjs',
  'scripts/tests/b2b-sales-engine-schema.test.cjs',
]
let allPass = true
for (const s of suites) {
  let code = 0
  try { execFileSync(process.execPath, [s], { cwd: ROOT, stdio: 'pipe' }) } catch (e) { code = e.status || 1 }
  check(path.basename(s), code === 0 ? 'PASS' : 'FAIL (exit ' + code + ')', code === 0)
  if (code !== 0) allPass = false
}

console.log('— PR #710 (via gh, read-only) —')
try {
  const pr = JSON.parse(execFileSync('gh', [
    'pr', 'view', '710', '--json', 'state,isDraft,headRefName',
  ], { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }))
  check('#710 état', `${pr.state}/${pr.isDraft ? 'DRAFT' : 'READY'}/${pr.headRefName}`,
    pr.state === 'OPEN' && pr.isDraft === true)
} catch (e) {
  check('#710 état', 'UNKNOWN (gh indisponible)', null)
}

const ready = schemaReady === true && allPass === true &&
  envPresent('SIRENE_CONSUMER_KEY') && envPresent('SIRENE_CONSUMER_SECRET')
console.log('')
console.log('VERDICT : ' + (ready
  ? 'READY — séquence Phase 2 autorisée (dry-run réel ensuite)'
  : 'NOT READY — prérequis manquants (voir ✗ ci-dessus)'))
process.exit(ready ? 0 : 1)
