#!/usr/bin/env node
/**
 * gate.cjs — ONE COMMAND GATE DE SHIP
 *
 * Encapsulates the full ship gate: build → budget → smoke → tests → regions.
 * Run before every push: npm run gate
 *
 * Exit 0 = all green. Exit 1 = something failed.
 */

const { execSync } = require('child_process')

const STEPS = [
  { name: 'Build', cmd: 'npm run build', timeout: 120000 },
  { name: 'Bundle budget (≤210 Ko)', cmd: 'node scripts/check-bundle-budget.cjs', timeout: 30000 },
  { name: 'PHP syntax', cmd: 'php -l public/api/mollie.php', timeout: 15000 },
  { name: 'Region validation', cmd: 'node -e "require(\'./regions/index.cjs\').assertAllRegionsValid()"', timeout: 15000 },
  { name: 'Playwright E2E', cmd: 'npx playwright test tests/e2e/bottomnav-redesign.spec.ts tests/e2e/funnel-payment.spec.ts tests/e2e/contract-pass-one-time.spec.ts tests/e2e/responsive.spec.ts --reporter=line', timeout: 300000 },
]

function run(label, cmd, timeout) {
  const start = Date.now()
  try {
    execSync(cmd, { stdio: 'inherit', timeout, cwd: process.cwd() })
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`\n  ✅ ${label} (${elapsed}s)`)
    return true
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.error(`\n  ❌ ${label} FAILED (${elapsed}s)`)
    if (e.status) console.error(`     exit code: ${e.status}`)
    return false
  }
}

console.log('═'.repeat(50))
console.log('  GATE DE SHIP — sargagame')
console.log('═'.repeat(50))

const results = []
for (const step of STEPS) {
  console.log(`\n▶ ${step.name}`)
  const ok = run(step.name, step.cmd, step.timeout)
  results.push({ name: step.name, ok })
  if (!ok) break // stop on first failure
}

console.log('\n' + '═'.repeat(50))
console.log('  RESULTS:')
for (const r of results) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}`)
}
const allGreen = results.every(r => r.ok)
console.log(allGreen ? '\n  🟢 ALL GREEN — safe to push' : '\n  🔴 BLOCKED — fix before push')
console.log('═'.repeat(50))

process.exit(allGreen ? 0 : 1)
