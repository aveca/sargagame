#!/usr/bin/env node
/**
 * A/B Test Evaluator
 *
 * Reads test results (manually entered or from GA4 export),
 * computes statistical significance, and outputs recommendations.
 *
 * Usage:
 *   node scripts/automation/ab-evaluate.cjs
 *
 * Input: scripts/automation/ab-results.json (create/update manually from GA4)
 * Output: console report + optimization-log.json update
 *
 * GA4 → Get numbers from: Explore > Free Form
 *   Dimension: ab_lock1 (or ab_modal1, etc.)
 *   Metric: Event count for the target event
 */
const fs = require('fs')
const path = require('path')

const RESULTS_PATH = path.join(__dirname, 'ab-results.json')
const LOG_PATH = path.join(__dirname, 'optimization-log.json')

// Two-proportion z-test (one-tailed)
function significance(n1, c1, n2, c2) {
  if (n1 === 0 || n2 === 0) return { z: 0, p: 1, significant: false }
  const p1 = c1 / n1, p2 = c2 / n2
  const p = (c1 + c2) / (n1 + n2)
  if (p === 0 || p === 1) return { z: 0, p: 1, significant: false }
  const z = (p1 - p2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  // Approximate p-value from z-score (one-tailed)
  const pVal = 1 - 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI)))
  return { z: Math.round(z * 100) / 100, p: Math.round(pVal * 1000) / 1000, significant: pVal < 0.05 }
}

function main() {
  console.log('=== A/B Test Evaluator ===')
  console.log(`Date: ${new Date().toISOString()}\n`)

  let results
  try {
    results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'))
  } catch (e) {
    // Create template file
    const template = {
      _comment: "Fill in from GA4 Explorations. sessions = total sessions per variant, conversions = target event count.",
      tests: [
        { id: "lock1", variants: ["control", "loss"], sessions: [0, 0], conversions: [0, 0], metric: "sg_forecast_lock_click" },
        { id: "modal1", variants: ["control", "family"], sessions: [0, 0], conversions: [0, 0], metric: "sg_premium_modal_cta" },
        { id: "onb1", variants: ["control", "skip"], sessions: [0, 0], conversions: [0, 0], metric: "sg_conversion" },
        { id: "free1", variants: ["control", "two_free"], sessions: [0, 0], conversions: [0, 0], metric: "sg_forecast_lock_click" },
        { id: "vp1", variants: ["feature", "outcome"], sessions: [0, 0], conversions: [0, 0], metric: "sg_weekend_banner_click" },
      ]
    }
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(template, null, 2), 'utf-8')
    console.log(`Created template: ${RESULTS_PATH}`)
    console.log('Fill in the sessions/conversions from GA4, then re-run.\n')
    console.log('How to get numbers from GA4:')
    console.log('  1. GA4 > Explore > Free Form')
    console.log('  2. Dimension: ab_lock1 (custom dimension, register first)')
    console.log('  3. Metric: Event count')
    console.log('  4. Filter: Event name = sg_forecast_lock_click (or target metric)')
    console.log('  5. Read the count per variant (0 = control, 1 = variant B)')
    return
  }

  const report = []
  for (const test of results.tests) {
    const [n1, n2] = test.sessions
    const [c1, c2] = test.conversions
    if (n1 === 0 && n2 === 0) {
      report.push({ id: test.id, status: 'no-data', message: 'No data yet' })
      continue
    }

    const r1 = n1 > 0 ? (c1 / n1 * 100).toFixed(2) : '0'
    const r2 = n2 > 0 ? (c2 / n2 * 100).toFixed(2) : '0'
    const { z, p, significant } = significance(n1, c1, n2, c2)

    const winner = significant ? (parseFloat(r1) > parseFloat(r2) ? test.variants[0] : test.variants[1]) : null
    const lift = n1 > 0 && n2 > 0 ? ((c2 / n2 - c1 / n1) / (c1 / n1) * 100).toFixed(1) : '0'

    const entry = {
      id: test.id,
      metric: test.metric,
      variants: test.variants,
      rates: [`${r1}%`, `${r2}%`],
      lift: `${lift}%`,
      z, p,
      significant,
      winner,
      status: significant ? 'winner' : (n1 + n2 < 400 ? 'too-early' : 'not-significant'),
      recommendation: significant
        ? `Apply "${winner}" as default for test "${test.id}". Remove abVariant() call and hardcode the winner.`
        : `Keep running. Need more data (${n1 + n2} sessions, need ~1500+).`
    }

    report.push(entry)

    console.log(`\n── ${test.id} (${test.metric}) ──`)
    console.log(`  ${test.variants[0]}: ${r1}% (${c1}/${n1})`)
    console.log(`  ${test.variants[1]}: ${r2}% (${c2}/${n2})`)
    console.log(`  Lift: ${lift}% | z=${z} | p=${p} | ${significant ? '✅ SIGNIFICANT' : '⏳ not yet'}`)
    if (winner) console.log(`  🏆 Winner: ${winner}`)
    console.log(`  → ${entry.recommendation}`)
  }

  // Update optimization log
  let optLog = {}
  try { optLog = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8')) } catch {}
  optLog.abTests = optLog.abTests || {}
  optLog.abTests.lastEvaluated = new Date().toISOString()
  optLog.abTests.results = report
  fs.writeFileSync(LOG_PATH, JSON.stringify(optLog, null, 2), 'utf-8')

  console.log(`\nReport saved to ${LOG_PATH}`)
  console.log('Done.')
}

main()
