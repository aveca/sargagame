'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/pages-code-only-release.yml'), 'utf8')
const production = fs.readFileSync(path.join(ROOT, '.github/workflows/cloudflare-production.yml'), 'utf8')
const payloadScript = fs.readFileSync(path.join(ROOT, 'scripts/automation/prepare-pages-code-only-payload.cjs'), 'utf8')
const rollbackScript = fs.readFileSync(path.join(ROOT, 'scripts/automation/pages-code-only-rollback.cjs'), 'utf8')

assert.match(workflow, /workflow_dispatch:[\s\S]*confirm_production/)
assert.match(workflow, /push:\s*\n\s*branches:\s*\n\s*- main[\s\S]*?paths:/)
assert.match(workflow, /github\.event_name == 'push'/)
assert.match(workflow, /verify-pages-code-only-change\.cjs/)
for (const p of [".ai/release-pages-code-only.json","scripts/lib/hotel-landing-fr.cjs","scripts/lib/region-seo-pages.cjs","scripts/automation/prepare-pages-code-only-payload.cjs","src/ChasseHome.jsx","src/lib/format-freshness.mjs"]) {
  assert.ok(workflow.includes("- '" + p + "'"), "Pages-only push trigger must include " + p)
}
// Non-regression (2026-11-27) : les surfaces de conversion servies sur les six
// domaines doivent declencher la release Pages. Sans ces paths, un correctif
// funnel merge sur main ne sort jamais : le 24/11/2026 le verify live a refuse
// le bundle http (36 bloquants, wm-stale-offer absent), le correctif d0af3953c a
// ete merge le 27/11 mais le bundle servi ne l'a toujours pas (verrou trigger).
const conversionSurfaces = [
  "src/WorldMapView.jsx",
  "src/PremiumModal.jsx",
  "src/Sargasses_PROD.jsx",
  "src/BeachSheet.jsx",
  "src/WeekHub.jsx",
]
for (const p of conversionSurfaces) {
  assert.ok(workflow.includes("- '" + p + "'"), "Pages-only push trigger must include conversion surface " + p)
}
// La meme surface doit etre dans l'allowlist du verificateur de perimetre,
// sinon une release declenchee par ces fichiers serait refusee par
// verify-pages-code-only-change.cjs (refus de release, pas un bug silencieux).
const {
  ALLOWED_PAGES_ONLY_PATHS,
} = require('../../scripts/automation/verify-pages-code-only-change.cjs')
for (const p of conversionSurfaces) {
  assert.ok(ALLOWED_PAGES_ONLY_PATHS.includes(p), "Pages-only verify allowlist must include " + p)
}
assert.match(workflow, /CLOUDFLARE_DEPLOY_ENABLED == 'true'/)
assert.match(workflow, /prepare-pages-code-only-payload\.cjs/)
assert.match(workflow, /pages deploy/)
assert.match(workflow, /check-bundle-budget\.cjs/)
assert.match(workflow, /include-hidden-files: true/)
assert.match(workflow, /needs: \[prepare, capture-rollback\]/)
assert.doesNotMatch(workflow, /wrangler(?:@latest)? deploy|secret put|MOLLIE_API_KEY|SUPABASE_SERVICE_KEY|MOLLIE_WEBHOOK_SECRET/,
  'Pages-only workflow must never deploy a Worker or configure payment secrets')
assert.match(workflow, /user-journey-audit\.cjs/)
assert.match(workflow, /summary\.blocking>0/)
assert.match(workflow, /pages-code-only-rollback\.cjs capture/)
assert.match(workflow, /pages-code-only-rollback\.cjs rollback/)

// ── Non-regression : le gate doit BUILDER avant de tester ───────────────────
// `tests/sitemap-guard-beach-pages.test.cjs` lit l'artefact `dist/` produit par
// Vite. Sans `npm run build` avant `npm test`, le gate echoue et la release
// code-only des six domaines ne peut pas partir (run 42215481383, job `gate`,
// step "Unit and contract tests" -> exit 1).
const gateJob = (() => {
  const lines = workflow.split(/\r?\n/)
  const start = lines.findIndex((l) => /^ {2}gate:\s*$/.test(l))
  assert.ok(start >= 0, 'pages-code-only-release.yml must declare a `gate` job')
  const rest = lines.slice(start + 1)
  const endRel = rest.findIndex((l) => /^ {2}\S/.test(l))
  return (endRel === -1 ? rest : rest.slice(0, endRel)).join('\n')
})()
const gateLines = gateJob.split(/\r?\n/)
const buildStep = gateLines.findIndex((l) => /run:\s*npm run build\b/.test(l))
const testStep = gateLines.findIndex((l) => /run:\s*npm test\b/.test(l))
assert.ok(testStep >= 0, 'gate job must run `npm test`')
assert.ok(buildStep >= 0,
  'gate job must run `npm run build` before the test suite (the sitemap guard reads the Vite artifact `dist/`)')
assert.ok(buildStep < testStep, 'gate job must run `npm run build` BEFORE `npm test`')

// ── Non-regression : la release Pages ne doit pas redeployer le Worker ──────
// Un push sur `main` qui touche l'outillage de release Pages ne doit pas
// declencher cloudflare-production.yml : sa certification-gate finit par
// executer "Deploy Worker" + "Configure Worker secrets", hors perimetre d'une
// release code-only Pages (aucun Worker, aucun secret, aucun paiement).
const productionPathsIgnore = (() => {
  const lines = production.split(/\r?\n/)
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
})()
assert.ok(
  productionPathsIgnore.includes('.github/workflows/pages-code-only-release.yml'),
  'cloudflare-production.yml must ignore pushes touching the Pages release workflow (a release-tooling change must not redeploy the Worker)'
)
assert.ok(
  productionPathsIgnore.includes('tests/unit/pages-code-only-workflow.test.cjs'),
  'cloudflare-production.yml must ignore pushes touching this guard (a guard-only change must not redeploy the Worker)'
)

assert.ok(production.includes('TRIGGER_EVENT: ${{ github.event.workflow_run.event }}'),
  'workflow_run must inspect the originating Daily Copernicus event')
assert.ok(production.includes('if [ "$TRIGGER_EVENT" = "schedule" ] || [ "$TRIGGER_EVENT" = "workflow_dispatch" ]; then'),
  'only scheduled or manually dispatched Daily Copernicus runs may unlock production')

for (const p of ["scripts/lib/hotel-landing-fr.cjs","scripts/lib/region-seo-pages.cjs","scripts/automation/prepare-pages-code-only-payload.cjs","src/ChasseHome.jsx","src/lib/format-freshness.mjs","tests/unit/b2b-hotel-form-contract.test.cjs","tests/unit/bug-2026-015-offer-decoupling.test.cjs"]) {
  assert.ok(productionPathsIgnore.includes(p), "full Worker production workflow must ignore Pages-only path " + p)
}
assert.match(payloadScript, /refreshSatellitePayload/)
assert.match(payloadScript, /METADATA_FIELDS = new Set\(\['dataAgeMinutes', 'stale'\]\)/)
assert.match(payloadScript, /nonMetadataFieldsPreserved: true/)
assert.doesNotMatch(payloadScript, /payload\.updatedAt\s*=/,
  'publication timestamp must not be rewritten as observation time')

assert.match(rollbackScript, /environment === 'production'/)
assert.match(rollbackScript, /metadata\?\.branch === 'main'/)
assert.match(rollbackScript, /deployments\/.*\/rollback/)
assert.equal((rollbackScript.match(/'sargagame(?:-[a-z]+)?'/g) || []).length >= 6, true,
  'rollback snapshot must cover all six production Pages projects')

// The existing full-data/Worker production path remains strict and unchanged.
assert.match(production, /Pre-deploy satellite freshness gate \(all six regions\)/)
assert.match(production, /Recheck satellite freshness immediately before Worker deploy/)
assert.match(production, /Recheck satellite freshness immediately before Pages deploy/)
assert.match(production, /mollie-live-gate:/)

console.log('PASS: Pages-only release is isolated, metadata-only, gated, and rollback-capable')
