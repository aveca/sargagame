'use strict'

const assert = require('node:assert/strict')
const { ALLOWED_PAGES_ONLY_PATHS, validateChangedFiles } = require('../../scripts/automation/verify-pages-code-only-change.cjs')

assert.equal(validateChangedFiles(['.ai/release-pages-code-only.json']).ok, true)
assert.equal(validateChangedFiles([
  'scripts/lib/hotel-landing-fr.cjs',
  'scripts/lib/region-seo-pages.cjs',
  'tests/unit/b2b-hotel-form-contract.test.cjs',
]).ok, true)
assert.equal(validateChangedFiles([]).ok, false)
assert.equal(validateChangedFiles(['workers/sargagame/index.js']).ok, false)
assert.equal(validateChangedFiles(['workers/sg-payments/index.js']).ok, false)
assert.equal(validateChangedFiles(['wrangler.template.jsonc']).ok, false)
assert.equal(validateChangedFiles(['.github/workflows/cloudflare-production.yml']).ok, false)
assert.equal(validateChangedFiles([
  '.ai/release-pages-code-only.json',
  'workers/sg-payments/index.js',
]).ok, false)
assert.ok(ALLOWED_PAGES_ONLY_PATHS.includes('src/ChasseHome.jsx'))

console.log('PASS: Pages-only release refuses mixed, Worker, payment, and Wrangler changes')
