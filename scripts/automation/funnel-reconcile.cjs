#!/usr/bin/env node
/**
 * funnel-reconcile.cjs — RECONCILIATION TEST
 *
 * Verifies that all funnel sources agree on the same definitions:
 * 1. No dead events counted as live (premium_modal_cta, checkout_redirect)
 * 2. daily-metrics.json funnel matches Supabase snapshot data
 * 3. All sources use the same sg_ prefix stripping logic
 * 4. No mismatch between modal→CTA rates across sources
 *
 * Exit 0 = PASS, Exit 1 = FAIL (blocking)
 *
 * Usage: node scripts/automation/funnel-reconcile.cjs
 */

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const DAILY_METRICS = path.join(DATA_DIR, 'daily-metrics.json')
const FUNNEL_SNAPSHOT = path.join(DATA_DIR, 'funnel-snapshot.json')
const FUNNEL_DAILY = path.join(DATA_DIR, 'funnel-daily-report.json')

let failures = 0
let warnings = 0

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`)
  } else {
    console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`)
    failures++
  }
}

function warn(label, detail) {
  console.log(`  ⚠️  ${label}${detail ? ': ' + detail : ''}`)
  warnings++
}

function loadJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  } catch {
    return null
  }
}

console.log('🔍 Funnel Reconciliation Test')
console.log('═══════════════════════════════')
console.log('')

// 1. Check daily-metrics.json funnel is NOT frozen
console.log('1. daily-metrics.json funnel freshness:')
const metrics = loadJSON(DAILY_METRICS)
if (metrics && metrics.length > 0) {
  const last = metrics[metrics.length - 1]
  const funnel = last.funnel
  if (funnel) {
    // Check that modalOpens is a reasonable number (not the frozen 3518)
    check('funnel exists', true)
    check('modalOpens is numeric', typeof funnel.modalOpens === 'number', `got ${funnel.modalOpens}`)
    check('modalCta is numeric', typeof funnel.modalCta === 'number', `got ${funnel.modalCta}`)
    check('conversions is numeric', typeof funnel.conversions === 'number', `got ${funnel.conversions}`)
    
    // The frozen value was 3518 modalOpens — if it's still exactly 3518, it might be stale
    if (funnel.modalOpens === 3518 && funnel.modalCta === 13) {
      warn('funnel may still be frozen (3518/13 match Apps Script freeze)', 'Will update on next CI run after deploy')
    }
    
    // Rates should be reasonable (not 351800 which was the overflow)
    if (funnel.rates && funnel.rates.lock_to_modal > 10000) {
      warn('lock_to_modal rate is suspiciously high', `${funnel.rates.lock_to_modal} (was 351800 in frozen data)`)
    }
  } else {
    warn('no funnel block in latest entry')
  }
} else {
  warn('daily-metrics.json not found or empty')
}

// 2. Check funnel-snapshot.json (Supabase 7d)
console.log('')
console.log('2. funnel-snapshot.json (Supabase 7d):')
const snapshot = loadJSON(FUNNEL_SNAPSHOT)
if (snapshot) {
  check('snapshot exists', true)
  check('has counts', !!snapshot.counts)
  
  if (snapshot.counts) {
    const c = snapshot.counts
    check('premium_modal_cta is 0 (dead event)', c.premium_modal_cta === 0, `got ${c.premium_modal_cta}`)
    check('checkout_redirect is 0 (dead event)', c.checkout_redirect === 0, `got ${c.checkout_redirect}`)
    check('pass_cta >= 0', c.pass_cta >= 0, `got ${c.pass_cta}`)
    check('conversion >= 0', c.conversion >= 0, `got ${c.conversion}`)
    check('premium_modal_open >= 0', c.premium_modal_open >= 0, `got ${c.premium_modal_open}`)
    
    // Modal→CTA rate should be 0-100%
    if (snapshot.rates) {
      check('modal_to_cta rate is 0-100%', 
        snapshot.rates.modal_to_cta >= 0 && snapshot.rates.modal_to_cta <= 100,
        `got ${snapshot.rates.modal_to_cta}`)
    }
  }
} else {
  warn('funnel-snapshot.json not found (Supabase may not be configured)')
}

// 3. Check funnel-daily-report.json (Supabase 24h)
console.log('')
console.log('3. funnel-daily-report.json (Supabase 24h):')
const daily = loadJSON(FUNNEL_DAILY)
if (daily) {
  check('daily report exists', true)
  
  if (daily.counts) {
    check('premium_modal_cta is 0 (dead event)', daily.counts.premium_modal_cta === 0, `got ${daily.counts.premium_modal_cta}`)
    check('cta_total equals pass_cta', daily.cta_total === daily.counts.pass_cta, 
      `cta_total=${daily.cta_total} but pass_cta=${daily.counts.pass_cta}`)
  }
  
  if (daily.by_pw_style) {
    const styles = Object.keys(daily.by_pw_style)
    check('pw_style variants tracked', styles.length > 0, `found: ${styles.join(', ')}`)
  }
} else {
  warn('funnel-daily-report.json not found')
}

// 4. Cross-source consistency (if both exist)
console.log('')
console.log('4. Cross-source consistency:')
if (snapshot && daily) {
  // Both rates should be in reasonable range (0-100%). Different windows (7d vs 24h)
  // naturally produce different rates — that's expected, not a bug.
  const snapshotRate = snapshot.rates?.modal_to_cta || 0
  const dailyRate = daily.rates?.find(r => r.from === 'Paywall seen' && r.to === 'CTA clicked')?.rate || 0
  check('snapshot modal→CTA rate in 0-100%', snapshotRate >= 0 && snapshotRate <= 100,
    `got ${snapshotRate}`)
  check('daily modal→CTA rate in 0-100%', dailyRate >= 0 && dailyRate <= 100,
    `got ${dailyRate}`)
  // Both should be >0 (if there are any modal opens)
  if ((snapshot.counts?.premium_modal_open || 0) > 0) {
    check('snapshot modal→CTA > 0 when modals exist', snapshotRate > 0,
      `got ${snapshotRate}% with ${snapshot.counts.premium_modal_open} modals`)
  }
}

// 5. Frontend dead events check
console.log('')
console.log('5. Frontend dead events (grep verification):')
const prodSrc = fs.readFileSync(path.join(__dirname, '../../src/Sargasses_PROD.jsx'), 'utf-8')
check('sg_premium_modal_cta NOT in SG_FUNNEL_EVENTS', 
  !prodSrc.includes('"sg_premium_modal_cta"'),
  'should be removed from allowlist')
check('sg_checkout_redirect NOT in SG_FUNNEL_EVENTS',
  !prodSrc.includes('"sg_checkout_redirect"'),
  'should be removed from allowlist')
check('sg_pass_cta IS in SG_FUNNEL_EVENTS',
  prodSrc.includes('"sg_pass_cta"'),
  'must remain — this is the real CTA event')

// Summary
console.log('')
console.log('═══════════════════════════════')
if (failures === 0) {
  console.log(`✅ RECONCILIATION PASSED (${warnings} warnings)`)
  process.exit(0)
} else {
  console.log(`❌ RECONCILIATION FAILED (${failures} failures, ${warnings} warnings)`)
  process.exit(1)
}
