const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/diagnose-fulfillment.yml'), 'utf8')
const script = fs.readFileSync(path.join(ROOT, 'scripts/automation/diagnose-fulfillment.cjs'), 'utf8')

assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/)
assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/)
assert.doesNotMatch(workflow, /contents:\s*write|GITHUB_TOKEN/i)

assert.doesNotMatch(script, /supabaseRpc\s*\(/)
assert.doesNotMatch(script, /\/rest\/v1\/rpc\/sg_upsert_payment_grant/)
assert.doesNotMatch(script, /method:\s*['"]POST['"]/i)
assert.doesNotMatch(script, /p_payment_id:\s*['"]diag_check_only['"]/)
assert.match(script, /NON TESTÉ : aucun appel RPC mutatif/)
assert.match(script, /rest\/v1\/payment_grants\?select=/)

console.log('fulfillment-diagnostic-readonly: OK')
