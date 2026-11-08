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
  assert.ok(
    !stripPathsIgnore(content).includes('lib/common.cjs'),
    `.github/workflows/${wf} must not import scripts/autopilot/lib/common.cjs — that file is excluded from the production trigger, so a workflow dependency on it would never be deployed`,
  )
}

// ── 5. Le runner est OBSERVABLE : aucune trace ne peut disparaitre ──────────
//
// Régression constatée le 2026-11-08 sur le PC du fondateur : le wrapper
// `autopilot-live.cmd` redirigeait stdout vers runner.log. Sous Windows,
// cmd.exe ouvre la cible de son `>>` en mode EXCLUSIF : les appends
// concurrents de la trace du runner (runner.cjs) échouaient en EBUSY et le
// `catch` silencieux de rlog() les faisait disparaître. Résultat : la factory
// tournait, le lock était détenu, les statuts GitHub étaient publiés… mais le
// journal du runner restait vide. Un opérateur ne pouvait donc ni voir ni
// diagnostiquer ce que la factory faisait.
//
// Invariant : le wrapper écrit dans runner-console.log, le runner écrit dans
// runner.log, et les deux fichiers existent dans le dépôt des chemins.

const common = require(path.join(ROOT, 'scripts/autopilot/lib/common.cjs'))

assert.ok(
  typeof common.paths.statusFile === 'string' && common.paths.statusFile.length > 0,
  'scripts/autopilot/lib/common.cjs must define paths.statusFile — runner.cjs writes its state snapshot there (an undefined path made every write fail silently)',
)
assert.ok(
  typeof common.paths.runnerConsoleLog === 'string' && common.paths.runnerConsoleLog.length > 0,
  'scripts/autopilot/lib/common.cjs must define paths.runnerConsoleLog — the wrapper console output must not share the runner trace file',
)
assert.notEqual(
  common.paths.runnerConsoleLog,
  common.paths.runnerLog,
  'the console log and the runner trace must be two different files (a single shared file is locked exclusively by the Windows wrapper and silently loses the runner trace)',
)

const liveWrapper = fs.readFileSync(path.join(AUTOPILOT, 'autopilot-live.cmd'), 'utf8')
assert.ok(
  /runner-console\.log/.test(liveWrapper),
  'scripts/autopilot/autopilot-live.cmd must redirect its console output to runner-console.log',
)
assert.ok(
  !/runner-console\.log[^\n]*runner\.log/.test(liveWrapper),
  'scripts/autopilot/autopilot-live.cmd must not redirect the console output to runner.log (Windows locks that file exclusively and the runner trace is silently lost)',
)

const tickWrapper = fs.readFileSync(path.join(AUTOPILOT, 'autopilot.cmd'), 'utf8')
assert.ok(
  /runner-console\.log/.test(tickWrapper),
  'scripts/autopilot/autopilot.cmd must redirect its console output to runner-console.log',
)
assert.ok(
  !/>>\s*"\.ai\\autopilot\\runs\\runner\.log"/.test(tickWrapper),
  'scripts/autopilot/autopilot.cmd must not redirect to runner.log (same exclusive-lock defect)',
)

const runnerLogLines = (fs.readFileSync(RUNNER, 'utf8').match(/rlog\(/g) || []).length
assert.ok(runnerLogLines > 0, 'runner.cjs must still use rlog() for its trace')

// Le fallback de rlog() doit exister : un log qui peut devenir muet est un
// garde-fou de surveillance qui ne surveille plus rien.
const runnerSourceAll = fs.readFileSync(RUNNER, 'utf8')
assert.ok(
  /runnerConsoleLog/.test(runnerSourceAll),
  'runner.cjs must fall back to the console log when runner.log cannot be written (a swallowed EBUSY must not erase the factory trace)',
)

// ── 6. Le runner n'appelle que des fonctions EXPORTÉES ─────────────────────
// Régression constatée le 2026-11-08 : le runner appelle
// `require('./local-model-router.cjs').manualOpencodeSessionActive()`,
// fonction ABSENTE du module -> TypeError a chaque cycle, et l'instantané
// d'état n'était jamais écrit (l'erreur disparaissait dans un catch vide).

const router = require(path.join(AUTOPILOT, 'local-model-router.cjs'))
assert.equal(
  typeof router.manualOpencodeSessionActive,
  'function',
  'scripts/autopilot/local-model-router.cjs must export manualOpencodeSessionActive() — runner.cjs calls it on every cycle',
)
assert.equal(
  typeof router.manualOpencodeSessionActive(),
  'boolean',
  'manualOpencodeSessionActive() must return a boolean and must never throw',
)

// ── 7. Le snapshot d'état est HONNÊTE ──────────────────────────────────────
// Régression constatée le 2026-11-08 sur le PC du fondateur : status.json
// annonçait `autoMergeEnabled: true` (valeur codée en dur) alors que
// `.ai/autopilot/config.json` porte `autoMergeEnabled: false`, et
// `cycleSuccess: false` en permanence — la variable étant réinitialisée à
// chaque tour de boucle alors que l'instantané est écrit au DÉBUT du cycle.
// Un opérateur ne pouvait donc pas savoir, depuis l'instantané, si la factory
// avançait ni si elle auto-mergeait. Deux autres champs structurent la
// supervision : `consecutiveErrors` (déclenche l'alerte Discord et la pause
// de sécurité) et le code de sortie de l'orchestrateur.

const runnerSourceFull = fs.readFileSync(RUNNER, 'utf8')

assert.ok(
  !/autoMergeEnabled:\s*true/.test(runnerSourceFull),
  'runner.cjs must NOT hardcode autoMergeEnabled:true in the state snapshot — it must report the effective policy from config.json (which is false), otherwise the operator reads a lie about auto-merge',
)
assert.ok(
  /autoMergeEnabled:\s*Boolean\(cfg\.policy/.test(runnerSourceFull),
  "runner.cjs must report the effective auto-merge policy (cfg.policy.autoMergeEnabled) in the state snapshot",
)
assert.ok(
  /cycleSuccess:\s*lastCycleSuccess/.test(runnerSourceFull),
  'runner.cjs must report the outcome of the LAST COMPLETED cycle (lastCycleSuccess) — the in-loop variable is reset on every iteration and was therefore always false',
)
assert.ok(
  /let\s+lastCycleSuccess\s*=\s*false/.test(runnerSourceFull),
  'runner.cjs must keep a lastCycleSuccess variable across iterations to report a truthful cycle outcome',
)

// La branche `else` qui traite le code de sortie non nul de l'orchestrateur
// est extraite PRECISEMENT (pas par fenetre de caracteres) : une fenetre
// large pourrait attraper le `consecutiveErrors++` du `catch` voisin et
// laisser passer une regression.
const exitIdx = runnerSourceFull.indexOf('orchestrator exited with code')
assert.ok(exitIdx > 0, 'runner.cjs must handle a non-zero orchestrator exit code explicitly')
const branchStart = runnerSourceFull.lastIndexOf('} else {', exitIdx)
const branchEnd = runnerSourceFull.indexOf('\n      }', exitIdx)
assert.ok(
  branchStart > 0 && branchEnd > branchStart,
  'runner.cjs must have an explicit `else` branch for a non-zero orchestrator exit code',
)
const orchestratorExit = runnerSourceFull.slice(branchStart, branchEnd)
assert.ok(
  /consecutiveErrors\s*\+\+/.test(orchestratorExit),
  'a non-zero orchestrator exit must increment consecutiveErrors — otherwise the Discord failure alert (threshold 2) and the safety pause (threshold 5) can never fire and the factory loops forever in silence',
)

console.log(
  'PASS: the Factory runner is loadable from a clean checkout (every relative require resolves, the notify API is complete, no hardcoded secret, production-neutral) and its trace cannot be silently lost',
)
