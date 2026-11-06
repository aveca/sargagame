'use strict'

// tests/unit/ai-docs-paths-ignore.test.cjs
//
// Garde-fou de non-regression : la memoire des agents (`.ai/`) ne doit JAMAIS
// redeployer le Worker ni reecrire les secrets de paiement.
//
// Pourquoi : `cloudflare-production.yml` est le seul workflow qui execute
// "Deploy Worker" + "Configure Worker secrets" (MOLLIE_API_KEY,
// SUPABASE_SERVICE_KEY, MOLLIE_WEBHOOK_SECRET). Or `paths-ignore` ne filtre
// que l'evenement `push` : un PR qui ne modifie que `.ai/**` (handoff,
// backlog, changelog) produirait sinon un push sur `main` et declencherait
// la chaine de production complete. Ce chemin de documentation est frequent
// (un agent qui rend compte = un handoff) et il doit etre neutre.
//
// Le garde-fou lui-meme est declare dans `paths-ignore` : le supprimer ne doit
// pas non plus pouvoir redeployer la production.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
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
    const m = text.match(/^-\s*(.+)$/)
    if (!m) break
    out.push(m[1].trim().replace(/^['"]|['"]$/g, ''))
  }
  return out
}

const ignored = pathsIgnore(production)

assert.ok(
  ignored.includes('.ai/**'),
  "cloudflare-production.yml must ignore pushes touching '.ai/**' (an agent handoff must not redeploy the Worker or rewrite payment secrets)",
)
assert.ok(
  ignored.includes('tests/unit/ai-docs-paths-ignore.test.cjs'),
  'cloudflare-production.yml must ignore pushes touching this guard (a guard-only change must not redeploy the Worker)',
)

// L'exclusion ne doit pas elargir le perimetre du workflow : le push reste
// limite a `main`, et la porte de certification reste conditionnee par le
// job `scope` (parcours de production).
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

console.log('PASS: agent memory (.ai/) updates never trigger the production deployment')
