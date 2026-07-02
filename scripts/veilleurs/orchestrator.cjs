#!/usr/bin/env node
/**
 * orchestrator.cjs — LE CHEF DE QUART (job série).
 * Décide quels Veilleurs sont « dûs » aujourd'hui (par cadence) et émet la matrix
 * GitHub Actions qui les lance EN PARALLÈLE. Aucun effet de bord, aucun secret.
 *
 * Env  : SCOPE=due|all  (all = les 10, pour un dispatch manuel)
 * Local: node scripts/veilleurs/orchestrator.cjs --dry [--all]
 */
const { registry, dow, today, fs } = require('./lib.cjs')

const SCOPE = (process.env.SCOPE || (process.argv.includes('--all') ? 'all' : 'due')).toLowerCase()
const DRY = process.argv.includes('--dry')
const d = dow()

function isDue(v) {
  if (v.enabled === false) return false
  if (SCOPE === 'all') return true
  const c = (v.cadence || 'weekly').toLowerCase()
  if (c === 'daily') return true
  const days = Array.isArray(v.dow) ? v.dow : (typeof v.dow === 'number' ? [v.dow] : [])
  return days.includes(d)
}

const due = registry().filter(isDue)
const include = due.map(v => ({ id: v.id, name: v.name, depth: v.depth ?? 0 }))
const matrix = JSON.stringify({ include })

console.log(`[orchestrateur] ${today()} dow=${d} scope=${SCOPE} → ${include.length} veilleur(s): ${include.map(x => x.id).join(', ') || '(aucun)'}`)

if (DRY) { console.log(matrix); process.exit(0) }

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\ncount=${include.length}\n`)
} else {
  console.log(matrix)
}
