'use strict'

// tests/unit/autopilot-bridge-paths-ignore.test.cjs
//
// Garde-fou de non-regression : le pont autopilot multi-dépôt est de
// l'OUTILLAGE, il ne doit jamais redéployer le Worker ni réécrire les
// secrets de paiement.
//
// CONTEXTE : `cloudflare-production.yml` est le seul workflow qui exécute
// `Deploy Worker` + `Configure Worker secrets` (MOLLIE_API_KEY,
// SUPABASE_SERVICE_KEY, MOLLIE_WEBHOOK_SECRET). `paths-ignore` ne filtre que
// l'événement `push` : sans exclusion, corriger le pont autopilot sur `main`
// déclencherait la chaîne de production complète.
//
// DANGER ÉVITÉ : `scripts/autopilot/**` ne peut PAS être exclu wholesale.
// La production elle-même appelle des scripts de ce dossier :
//   - check-predeploy-satellite-freshness.cjs  (gate de fraîcheur fail-closed)
//   - check-prepared-html.cjs                   (intégrité du HTML préparé)
//   - html-integrity.cjs                        (empreinte HTML)
//   - post-deploy-verify.cjs                    (vérification post-déploiement)
// Une exclusion large ferait qu'un correctif de la gate de fraîcheur NE
// serait plus jamais déployé. L'exclusion doit rester fichier par fichier.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const production = fs.readFileSync(
  path.join(ROOT, '.github/workflows/cloudflare-production.yml'),
  'utf8',
)

/** Extrait la liste `on.push.paths-ignore` du workflow de production. */
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
    const m = text.match(/^-\s*(.+)$/)
    if (!m) break
    out.push(m[1].trim().replace(/^['"]|['"]$/g, ''))
  }
  return out
}

/** Un chemin de dépôt est-il couvert par un motif de `paths-ignore` ? */
function matches(pattern, filePath) {
  if (pattern === filePath) return true
  if (!pattern.includes('*')) return false
  const rx = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*')
  return new RegExp('^' + rx + '$').test(filePath)
}

const ignored = pathsIgnore(production)

/**
 * Retire le bloc `paths-ignore` (clé + liste) du texte du workflow.
 * Indispensable : la liste d'exclusion cite elle-même le nom du pont, et on
 * veut vérifier qu'aucun workflow ne l'EXÉCUTE, pas qu'il ne le nomme.
 */
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
    // On saute les entrées de la liste (et leurs commentaires).
  }
  return kept.join('\n')
}

// ── 1. Le pont multi-dépôt est bien neutralisé pour la production ───────────

assert.ok(
  ignored.includes('scripts/autopilot/multi-repo-bridge.cjs'),
  "cloudflare-production.yml must ignore 'scripts/autopilot/multi-repo-bridge.cjs' (a tooling-only change must not redeploy the Worker or rewrite payment secrets)",
)
assert.ok(
  ignored.includes('scripts/autopilot/multi-repo-bridge.test.cjs'),
  'cloudflare-production.yml must ignore the bridge test file',
)
assert.ok(
  ignored.includes('tests/unit/autopilot-bridge-paths-ignore.test.cjs'),
  'cloudflare-production.yml must ignore this guard (a guard-only change must not redeploy the Worker)',
)

// ── 2. Aucune exclusion large de `scripts/autopilot/**` ──────────────────────
// Régression interdite : elle désactiverait le déploiement des scripts de
// gate utilisés par la production elle-même.

assert.ok(
  !ignored.includes('scripts/autopilot/**'),
  "cloudflare-production.yml must NOT ignore 'scripts/autopilot/**': the production workflow itself calls check-predeploy-satellite-freshness.cjs, check-prepared-html.cjs, html-integrity.cjs and post-deploy-verify.cjs — excluding the whole folder would prevent their fixes from ever being deployed",
)

// ── 3. Les scripts autopilot critiques pour la production restent déclenchables

const PRODUCTION_CRITICAL = [
  'scripts/autopilot/check-predeploy-satellite-freshness.cjs',
  'scripts/autopilot/check-prepared-html.cjs',
  'scripts/autopilot/html-integrity.cjs',
  'scripts/autopilot/post-deploy-verify.cjs',
  'scripts/autopilot/ci-certification-audit.cjs',
  'scripts/autopilot/deploy-audit.cjs',
]
for (const file of PRODUCTION_CRITICAL) {
  assert.ok(
    !ignored.some((p) => matches(p, file)),
    `cloudflare-production.yml must keep '${file}' deployable (it is called by the production workflow itself)`,
  )
}

// ── 4. Le pont multi-dépôt n'est appelé par AUCUN workflow ──────────────────
// Condition de sécurité de l'exclusion : on n'exclut que ce qui n'a aucun
// effet sur le contenu déployé.

const workflowDir = path.join(ROOT, '.github/workflows')
const workflowFiles = fs
  .readdirSync(workflowDir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

for (const wf of workflowFiles) {
  const content = fs.readFileSync(path.join(workflowDir, wf), 'utf8')
  const executable = stripPathsIgnore(content)
  assert.ok(
    !executable.includes('multi-repo-bridge'),
    `.github/workflows/${wf} must not execute multi-repo-bridge: the path is excluded from the production trigger, so a workflow dependency on it would never be deployed`,
  )
}

// ── 5. Le workflow n'a pas été élargi par cette exclusion ───────────────────

assert.match(
  production,
  /push:\s*\n\s*branches:\s*\n\s*- main/,
  'cloudflare-production.yml must keep `on.push.branches` restricted to main',
)
assert.match(
  production,
  /certification-gate:[\s\S]*needs:[\s\S]*scope/,
  'cloudflare-production.yml must keep the certification gate conditioned on the scope job',
)
assert.match(
  production,
  /Deploy Worker/,
  'cloudflare-production.yml must keep its Worker deployment step (this guard only adds exclusions)',
)
assert.match(
  production,
  /Configure Worker secrets/,
  'cloudflare-production.yml must keep its Worker secrets step (this guard only adds exclusions)',
)

// ── 6. Le pont autonome GitHub <-> Factory V3 <-> OpenCode est neutralisé ──
//
// CONTEXTE (2026-11-09) : la mission du pont autonome a ajouté de NOUVEAUX
// modules sous `scripts/autopilot/` (cycle de vie des missions [AUTOPILOT],
// routage d'agent, garde-fou de périmètre, prompt) et un runbook. Aucun
// workflow ne les execute ni ne les importe (vérifié : aucun nom de ces
// modules n'apparait dans `.github/workflows/**` ni dans `scripts/automation/**`).
//
// SANS exclusion fichier par fichier, un push sur `main` de cette mission
// déclencherait `cloudflare-production.yml` (`on.push` -> `production=true`)
// → redéploiement des Workers ET réécriture des secrets de paiement
// (MOLLIE_API_KEY, SUPABASE_SERVICE_KEY, MOLLIE_WEBHOOK_SECRET) pour un
// simple correctif d'outillage local.
//
// L'invariant est donc explicite et fail-closed : chaque fichier de la
// mission DOIT être listé dans `paths-ignore`.

const AUTOPILOT_BRIDGE_FILES = [
  // Cycle de vie des missions [AUTOPILOT].
  'scripts/autopilot/lib/agent-prompt.cjs',
  'scripts/autopilot/lib/agent-prompt.probe.cjs',
  'scripts/autopilot/lib/agent-router.cjs',
  'scripts/autopilot/lib/agent-router.test.cjs',
  'scripts/autopilot/lib/final-scope.cjs',
  'scripts/autopilot/lib/final-scope.test.cjs',
  'scripts/autopilot/lib/mission-lifecycle.cjs',
  'scripts/autopilot/lib/mission-lifecycle.test.cjs',
  'scripts/autopilot/lib/mission-publisher.cjs',
  'scripts/autopilot/lib/mission-watchdog.cjs',
  'scripts/autopilot/lib/orchestrator-scope.test.cjs',
  'scripts/autopilot/lib/restore-scope.test.cjs',
  'scripts/autopilot/lib/safety-guard.cjs',
  'scripts/autopilot/lib/safety-guard.test.cjs',
  'scripts/autopilot/lib/gitops.cjs',
  'scripts/autopilot/status.cjs',
  'scripts/autopilot/multi-repo-bridge-e2e.test.cjs',
  // Persistance et exploitation du service 24/7.
  'scripts/autopilot/autopilot-service.cmd',
  'scripts/autopilot/autopilot-stop.cmd',
  'scripts/autopilot/autopilot-stop.ps1',
  'scripts/autopilot/install-service.ps1',
  // Runbook (documentation pure).
  'docs/AUTOPILOT-RUNBOOK.md',
]

for (const file of AUTOPILOT_BRIDGE_FILES) {
  assert.ok(
    ignored.includes(file),
    `cloudflare-production.yml must ignore '${file}': it is local tooling of the autonomous bridge, and a push touching it must not redeploy the Worker or rewrite the payment secrets`,
  )
}

// Aucun de ces fichiers ne doit masquer un script critique de la production.
for (const file of AUTOPILOT_BRIDGE_FILES) {
  assert.ok(
    !PRODUCTION_CRITICAL.some((p) => matches(p, file)),
    `the paths-ignore entry '${file}' must not shadow a production-critical script`,
  )
}

// ── 7. Aucun module du pont n'est exécuté par un workflow ───────────────────
// Condition de sécurité de l'exclusion : on n'exclut que ce qui n'a aucun
// effet sur le contenu déployé.

const BRIDGE_MODULE_NAMES = [
  'agent-prompt',
  'agent-router',
  'final-scope',
  'mission-lifecycle',
  'mission-publisher',
  'mission-watchdog',
  'safety-guard',
  'multi-repo-bridge-e2e',
  'autopilot-service',
  'autopilot-stop',
  'install-service',
]

for (const wf of workflowFiles) {
  const content = fs.readFileSync(path.join(workflowDir, wf), 'utf8')
  const executable = stripPathsIgnore(content)
  for (const name of BRIDGE_MODULE_NAMES) {
    assert.ok(
      !executable.includes(name),
      `.github/workflows/${wf} must not execute '${name}': the path is excluded from the production trigger, so a workflow dependency on it would never be deployed`,
    )
  }
}

console.log(
  'PASS: the multi-repo autopilot bridge is production-neutral, the production-critical autopilot scripts stay deployable, and the autonomous-bridge modules are excluded file by file',
)


// ── 8. Seuls les artefacts générés des Veilleurs sont ignorés ──────────────
// scripts/veilleurs/orchestrator.cjs, run-veilleur.cjs et synthesize.cjs
// sont exécutés par .github/workflows/veilleurs.yml : ne jamais exclure le
// dossier entier. Les briefs/digests générés ne sont pas des assets Worker.

const VEILLEURS_GENERATED_OUTPUTS = [
  'scripts/veilleurs/DIGEST.md',
  'scripts/veilleurs/latest-digest.json',
  'scripts/veilleurs/out/sable/2026-11-09.md',
  'scripts/veilleurs/out/sable/latest.json',
  'scripts/veilleurs/out/digue/2026-11-09.md',
  'scripts/veilleurs/out/digue/latest.json',
  'scripts/veilleurs/out/prisme/latest.json',
]

for (const file of VEILLEURS_GENERATED_OUTPUTS) {
  assert.ok(
    ignored.some((pattern) => matches(pattern, file)),
    "cloudflare-production.yml must ignore generated Veilleurs output '" + file + "' (it is not a Worker asset)",
  )
}

const VEILLEURS_RUNTIME_FILES = [
  'scripts/veilleurs/lib.cjs',
  'scripts/veilleurs/orchestrator.cjs',
  'scripts/veilleurs/run-veilleur.cjs',
  'scripts/veilleurs/synthesize.cjs',
]

assert.ok(
  !ignored.includes('scripts/veilleurs/**'),
  "cloudflare-production.yml must NOT ignore 'scripts/veilleurs/**': veilleurs.yml executes the runtime scripts",
)

for (const file of VEILLEURS_RUNTIME_FILES) {
  assert.ok(
    !ignored.some((pattern) => matches(pattern, file)),
    "cloudflare-production.yml must keep Veilleurs runtime '" + file + "' deployable",
  )
}
