const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const scriptPath = path.join(ROOT, 'scripts/automation/reconcile-mollie-sales.cjs')
const workflowPath = path.join(ROOT, '.github/workflows/reconcile-sales.yml')
const reportPath = path.join(ROOT, 'scripts/automation/data/reconcile-sales.json')

const script = fs.readFileSync(scriptPath, 'utf8')
const workflow = fs.readFileSync(workflowPath, 'utf8')
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/)
assert.match(workflow, /confirm_live_read_only/)
assert.match(workflow, /node scripts\/automation\/reconcile-mollie-sales\.cjs\s*$/m)
assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/)
assert.doesNotMatch(workflow, /contents:\s*write|GITHUB_TOKEN|--send|git\s+(add|commit|push)/i)

assert.match(script, /RECONCILE_PRIVATE_OUTPUT_PATH/)
assert.match(script, /process\.argv\.includes\('--write-private'\)/)
assert.doesNotMatch(script, /process\.argv\.includes\('--send'\)/)
assert.doesNotMatch(script, /OUT_PATH\s*=\s*path\.join\(__dirname/)
assert.match(script, /Détails transactionnels masqués des logs publics/)
assert.doesNotMatch(script, /paymentId=\$\{iss\.paymentId\}/)
assert.doesNotMatch(script, /brut €\$\{t\.gross\.toFixed/)
assert.doesNotMatch(script, /net €\$\{t\.net\.toFixed/)

const { resolvePrivateOutputPath } = require(scriptPath)
assert.throws(() => resolvePrivateOutputPath('relative-report.json'), /chemin absolu/)
assert.throws(
  () => resolvePrivateOutputPath(path.join(ROOT, 'scripts/automation/data/private-report.json')),
  /hors du dépôt public/
)
const privatePath = path.resolve(ROOT, '..', 'sargagame-private-report.json')
assert.equal(resolvePrivateOutputPath(privatePath), privatePath)

assert.equal(report.redacted, true)
for (const key of ['reconciled', 'issues', 'paymentId', 'emailHash', 'gross', 'net', 'mollieProfile']) {
  assert.equal(Object.hasOwn(report, key), false, `public report must not expose ${key}`)
}

console.log('reconcile-sales-publication-safety: OK')
