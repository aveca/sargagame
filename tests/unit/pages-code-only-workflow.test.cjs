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
