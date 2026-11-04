#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const gitignore = read('.gitignore')
const diagnosticWorkflow = read('.github/workflows/diagnose-fulfillment.yml')
const diagnosticScript = read('scripts/automation/diagnose-fulfillment.cjs')
const salesScript = read('scripts/automation/reconcile-mollie-sales.cjs')

for (const file of [
  'scripts/automation/data/reconcile-sales.json',
  'scripts/automation/data/b2c-segmentation.json',
  'scripts/automation/data/fulfillment-diagnosis.json',
]) {
  assert.ok(gitignore.includes(file), `${file} must be ignored`)
  assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must not be tracked in the public tree`)
}

assert.equal(fs.existsSync(path.join(root, '.github/workflows/reconcile-sales.yml')), false,
  'financial reconciliation must not run in public GitHub Actions or push a private report')

assert.match(diagnosticWorkflow, /authorize_readonly_diagnostic:[\s\S]*default: false/)
assert.match(diagnosticWorkflow, /if: inputs\.authorize_readonly_diagnostic == true/)
assert.match(diagnosticWorkflow, /permissions:\s*\n\s+contents: read/)
assert.doesNotMatch(diagnosticWorkflow, /contents: write/)
assert.match(diagnosticWorkflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
assert.match(diagnosticWorkflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/)

assert.doesNotMatch(diagnosticScript, /method:\s*['"]POST['"]/i,
  'diagnostic must never execute a write-capable Supabase RPC')
assert.doesNotMatch(diagnosticScript, /\/rpc\/sg_upsert_payment_grant/,
  'diagnostic must not probe entitlement creation by calling the grant RPC')
assert.match(diagnosticScript, /not_probed_read_only/)
assert.doesNotMatch(diagnosticScript, /sample_links/)
assert.match(diagnosticScript, /os\.tmpdir\(\)/)
assert.match(diagnosticScript, /SUPABASE_URL and SUPABASE_SERVICE_KEY are all required/)

assert.match(salesScript, /\/v2\/payments\/\$\{encodeURIComponent\(payment\.id\)\}\/refunds/,
  'refunds must be listed through each payment resource')
assert.doesNotMatch(salesScript, /listAll\(['"]\/v2\/refunds/,
  'do not use an unscoped global refunds collection')
assert.match(salesScript, /else if \(!entry\.grantMatch\)/,
  'grant mismatch must use the computed entry.grantMatch value')
assert.doesNotMatch(salesScript, /!grant\.grantMatch/)
assert.match(salesScript, /SUPABASE_URL and SUPABASE_SERVICE_KEY are all required/)
assert.match(salesScript, /GITHUB_ACTIONS/)
assert.match(salesScript, /os\.tmpdir\(\)/)
assert.match(salesScript, /assertPrivateOutput\(PRIVATE_OUTPUT\)/)
assert.doesNotMatch(salesScript, /paymentId=\$\{/,
  'stdout must not print transaction identifiers')
assert.doesNotMatch(salesScript, /emailHash=\$\{/,
  'stdout must not print pseudonymous contact identifiers')

console.log('OK: private financial/contact artifacts excluded from public tree')
console.log('OK: financial reconciliation removed from public GitHub Actions')
console.log('OK: fulfillment diagnostic is explicitly authorized and GET-only')
console.log('OK: refunds and grant matching use correct reconciliation contracts')
