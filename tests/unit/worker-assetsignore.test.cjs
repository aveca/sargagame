const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')
const { REQUIRED_ASSET_IGNORE_RULES, assertWorkerAssetIgnore } = require('../../scripts/lib/worker-assetsignore.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
let passed = 0
function check(name, condition) {
  assert.ok(condition, name)
  passed++
  console.log('  ✓ ' + name)
}

console.log('WORKER-ASSETIGNORE — fail-closed packaging guard\n')

// Source configuration must contain the exact exclusion rules, not merely the word "_private".
assertWorkerAssetIgnore(path.join(ROOT, 'public'), 'public/.assetsignore')
check('source .assetsignore has all required exclusion rules', true)

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-assetsignore-'))
try {
  const ignorePath = path.join(temp, '.assetsignore')
  const incomplete = REQUIRED_ASSET_IGNORE_RULES.filter(rule => rule !== '**/.htpasswd')
  fs.writeFileSync(ignorePath, incomplete.join('\n') + '\n')
  assert.throws(
    () => assertWorkerAssetIgnore(temp, 'incomplete fixture'),
    /\.assetsignore missing required rules:.*\*\*\/\.htpasswd/
  )
  check('missing .htpasswd exclusion fails closed', true)

  fs.writeFileSync(ignorePath, REQUIRED_ASSET_IGNORE_RULES.join('\n') + '\n')
  assert.doesNotThrow(() => assertWorkerAssetIgnore(temp, 'complete fixture'))
  check('complete fixture passes', true)

  fs.unlinkSync(ignorePath)
  assert.throws(() => assertWorkerAssetIgnore(temp, 'missing fixture'), /\.assetsignore missing at Worker assets root/)
  check('missing .assetsignore fails closed', true)
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

console.log(`\n${passed}/4 assertions passed — missing exclusions block packaging.\n`)
