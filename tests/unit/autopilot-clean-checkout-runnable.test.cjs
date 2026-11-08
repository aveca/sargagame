'use strict'

// tests/unit/autopilot-clean-checkout-runnable.test.cjs
//
// GARDE-FOU : la boucle Factory doit être LANCABLE depuis un checkout propre.
//
// RÉGRESSION RÉELLE (constatée le 2026-11-07 sur le PC du fondateur) :
// `scripts/autopilot/runner.cjs` fait `require('./lib/notify.cjs')` — un module
// qui n'a JAMAIS été commité (le commit `efdcde9da` du 2026-10-22 a ajouté le
// `require` sans ajouter le fichier). Résultat : sur toute copie fraîche du
// dépôt, le runner meurt AVANT son premier cycle avec
// `MODULE_NOT_FOUND: Cannot find module '.../lib/notify.cjs'`.
//
// Ce que la.previous disparition costait : la factory 24/7 ne démarrait plus
// depuis un clone propre (le fichier n'existait que comme fichier NON suivi
// dans un vieux clone local). Le symptôme observable côté opérateur n'était
// qu'un « MAX_RESTARTS atteint — abandon, intervention requise » : impossible
// de distinguer « la tâche a échoué » de « le runner n'a jamais démarré ».
//
// Ce test verrouille trois propriétés :
//   1. tout `require()` relatif des modules du runner résout dans le dépôt ;
//   2. l'API `notify.*` utilisée par runner.cjs est entièrement exportée ;
//   3. le module restauré ne contient AUCUN secret en dur et reste neutre
//      pour la production (exclu du déclencheur de déploiement, appelé par
//      aucun workflow).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const AUTOPILOT = path.join(ROOT, 'scripts', 'autopilot')
const RUNNER = path.join(AUTOPILOT, 'runner.cjs')
const NOTIFY = path.join(AUTOPILOT, 'lib', 'notify.cjs')

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Retire les commentaires de bloc (`/* … *\/`) pour ne pas scanner du texte. */
function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Tous les `require()` relatifs d'un fichier source. */
function relativeRequires(source) {
  const specs = []
  const re = /require\(['"](\.[^'"]+)['"]\)/g
  let m
  while ((m = re.exec(stripBlockComments(source)))) specs.push(m[1])
  return specs
}

/** Un spec relatif résout-il vers un fichier (ou un index) ? */
function resolves(file, spec) {
  const base = path.resolve(path.dirname(file), spec)
  const candidates = [base, `${base}.cjs`, `${base}.js`, path.join(base, 'index.cjs'), path.join(base, 'index.js')]
  return candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile())
}

function listFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(p))
    else if (entry.name.endsWith('.cjs')) out.push(p)
  }
  return out
}

// ── 1. Tous les require() relatifs du runner résolvent ──────────────────────

assert.ok(
  fs.existsSync(RUNNER),
  'scripts/autopilot/runner.cjs must exist (the Factory loop entry point)',
)
assert.ok(
  fs.existsSync(NOTIFY),
  "scripts/autopilot/lib/notify.cjs must exist and be committed: runner.cjs does require('./lib/notify.cjs'), so a clean checkout crashes with MODULE_NOT_FOUND before its first cycle",
)

// On balaie les modules réellement chargés par la boucle (hors `tests/`, dont
// les commentaires citent des chemins d'exemples qui ne sont pas des requires).
const runtimeModules = [
  ...fs.readdirSync(AUTOPILOT).filter((f) => f.endsWith('.cjs')).map((f) => path.join(AUTOPILOT, f)),
  ...fs.readdirSync(path.join(AUTOPILOT, 'lib')).filter((f) => f.endsWith('.cjs')).map((f) => path.join(AUTOPILOT, 'lib', f)),
]

for (const file of runtimeModules) {
  const source = fs.readFileSync(file, 'utf8')
  for (const spec of relativeRequires(source)) {
    assert.ok(
      resolves(file, spec),
      `${path.relative(ROOT, file)} requires '${spec}' which does not exist in the repository — a clean checkout must be able to load the Factory loop`,
    )
  }
}

// ── 2. L'API notify.* utilisée par runner.cjs est complète ──────────────────

const runnerSource = fs.readFileSync(RUNNER, 'utf8')
const usedNotifyFns = new Set()
const notifyRe = /notify\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
let m
while ((m = notifyRe.exec(stripBlockComments(runnerSource)))) usedNotifyFns.add(m[1])

assert.ok(usedNotifyFns.size > 0, 'runner.cjs must actually use the notify module (guard must stay meaningful)')

const notifyModule = require(NOTIFY)
for (const fn of usedNotifyFns) {
  assert.equal(
    typeof notifyModule[fn],
    'function',
    `scripts/autopilot/lib/notify.cjs must export notify.${fn}() — runner.cjs calls it`,
  )
}

// ── 3. Aucun secret en dur dans le module restauré ─────────────────────────

const notifySource = fs.readFileSync(NOTIFY, 'utf8')
assert.ok(
  !/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{10,}/.test(notifySource),
  'scripts/autopilot/lib/notify.cjs must NOT hardcode a Discord webhook URL — it must be read from the DISCORD_WEBHOOK_URL environment variable',
)
assert.ok(
  !/hc-ping\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(notifySource),
  'scripts/autopilot/lib/notify.cjs must NOT hardcode a Healthchecks ping URL — it must be read from the HC_PING_URL environment variable',
)
assert.ok(
  notifySource.includes('process.env.HC_PING_URL') && notifySource.includes('process.env.DISCORD_WEBHOOK_URL'),
  'scripts/autopilot/lib/notify.cjs must read its endpoints from the environment (User scope, never in the repository)',
)

// ── 4. Neutralité production ───────────────────────────────────────────────

const production = fs.readFileSync(
  path.join(ROOT, '.github/workflows/cloudflare-production.yml'),
  'utf8',
)

function pathsIgnore(source) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((l) => /^\s*paths-ignore:\s*$/.test(l))
  if (start < 0) return []
  const keyIndent = lines[start].match(/^\s*/)[0].length
  const itemIndent = keyIndent + 2
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const indent = line.match(/^\s*/)[0].length
    if (indent < itemIndent) break
    const text = line.trim()
    if (text.startsWith('#')) continue
    const match = text.match(/^-\s*(.+)$/)
    if (!match) break
    out.push(match[1].trim().replace(/^['"]|['"]$/g, ''))
  }
  return out
}

const ignored = pathsIgnore(production)
assert.ok(
  ignored.includes('scripts/autopilot/lib/notify.cjs'),
  "cloudflare-production.yml must ignore 'scripts/autopilot/lib/notify.cjs' — restoring a local-only runner module must not redeploy the Worker nor rewrite payment secrets",
)
assert.ok(
  ignored.includes('tests/unit/autopilot-clean-checkout-runnable.test.cjs'),
  'cloudflare-production.yml must ignore this guard (a guard-only change must not redeploy the Worker)',
)
assert.ok(
  !ignored.includes('scripts/autopilot/lib/**'),
  "cloudflare-production.yml must NOT ignore 'scripts/autopilot/lib/**' wholesale — production-critical helpers live in that folder",
)

const workflowDir = path.join(ROOT, '.github/workflows')
const workflowFiles = fs
  .readdirSync(workflowDir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

function stripPathsIgnore(source) {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((l) => /^\s*paths-ignore:\s*$/.test(l))
  if (start < 0) return source
  const keyIndent = lines[start].match(/^\s*/)[0].length
  const itemIndent = keyIndent + 2
  const kept = [lines.slice(0, start).join('\n')]
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      kept.push(line)
      continue
    }
    const indent = line.match(/^\s*/)[0].length
    if (indent < itemIndent) {
      kept.push(line)
      continue
    }
  }
  return kept.join('\n')
}

for (const wf of workflowFiles) {
  const content = fs.readFileSync(path.join(workflowDir, wf), 'utf8')
  assert.ok(
    !stripPathsIgnore(content).includes('lib/notify.cjs'),
    `.github/workflows/${wf} must not execute lib/notify.cjs — the module is excluded from the production trigger, so a workflow dependency on it would never be deployed`,
  )
}

console.log(
  'PASS: the Factory runner is loadable from a clean checkout (every relative require resolves, the notify API is complete, no hardcoded secret, production-neutral)',
)
