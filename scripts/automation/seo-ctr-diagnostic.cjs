#!/usr/bin/env node
/**
 * SEO CTR Diagnostic — Find pages whose CTR underperforms their position.
 *
 * Industry-standard CTR curve (Advanced Web Ranking, 2024 desktop avg):
 *   pos 1 → 27%, pos 2 → 15%, pos 3 → 11%, pos 4 → 8%, pos 5 → 6%
 *   pos 6 → 4%, pos 7 → 3%, pos 8 → 2.5%, pos 9 → 2%, pos 10 → 1.5%
 *
 * A page that ranks #2 with 4% CTR is leaking ~11pts vs expected — usually
 * a meta description that doesn't match search intent. This script flags
 * those pages so seo-optimize-meta.cjs can rewrite their descriptions.
 *
 * Output: data/ctr-diagnostic.json
 *
 * Usage: node scripts/automation/seo-ctr-diagnostic.cjs
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const AUDIT_PATH = resolve(__dirname, 'data', 'audit-full.json')
const OUT_PATH = resolve(__dirname, 'data', 'ctr-diagnostic.json')

// Expected CTR by integer position. Linear interpolation between integers.
const EXPECTED_CTR = {
  1: 0.27, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015,
}
const MIN_IMPRESSIONS = 50
const UNDER_CTR_GAP = 0.03 // 3pt CTR gap = significant under-performance

function expectedCtr(position) {
  if (position <= 1) return EXPECTED_CTR[1]
  if (position >= 10) return 0.005
  const lo = Math.floor(position)
  const hi = Math.ceil(position)
  if (lo === hi) return EXPECTED_CTR[lo]
  const t = position - lo
  return EXPECTED_CTR[lo] * (1 - t) + EXPECTED_CTR[hi] * t
}

function diagnoseSite(siteData) {
  const perf = siteData.performance || {}
  const opportunities = []
  const wins = []

  for (const [url, m] of Object.entries(perf)) {
    if (!m || m.impressions < MIN_IMPRESSIONS) continue
    // GSC sometimes returns absurd position aggregates (sum across queries
    // instead of avg). Ignore positions > 100 — they're junk.
    let position = m.position
    if (m.count && m.count > 0 && position > 100) position = position / m.count
    if (position > 100 || position < 1) continue

    const actualCtr = m.clicks / m.impressions
    const expected = expectedCtr(position)
    const gap = expected - actualCtr

    if (gap >= UNDER_CTR_GAP) {
      opportunities.push({
        url,
        impressions: m.impressions,
        clicks: m.clicks,
        position: Number(position.toFixed(1)),
        actualCtr: Number((actualCtr * 100).toFixed(2)),
        expectedCtr: Number((expected * 100).toFixed(2)),
        ctrGap: Number((gap * 100).toFixed(2)),
        // Lost-clicks estimate: how many clicks we're leaving on the table
        // if we got expected CTR.
        lostClicks: Math.round(gap * m.impressions),
      })
    } else if (gap <= -UNDER_CTR_GAP) {
      wins.push({
        url,
        impressions: m.impressions,
        clicks: m.clicks,
        position: Number(position.toFixed(1)),
        actualCtr: Number((actualCtr * 100).toFixed(2)),
        expectedCtr: Number((expected * 100).toFixed(2)),
        ctrLift: Number((-gap * 100).toFixed(2)),
      })
    }
  }

  // Sort opportunities by lost-clicks desc → fix biggest leaks first
  opportunities.sort((a, b) => b.lostClicks - a.lostClicks)
  wins.sort((a, b) => b.ctrLift - a.ctrLift)

  const totalLostClicks = opportunities.reduce((a, o) => a + o.lostClicks, 0)
  return {
    opportunityCount: opportunities.length,
    winCount: wins.length,
    totalLostClicks,
    opportunities: opportunities.slice(0, 30),
    wins: wins.slice(0, 10),
  }
}

function main() {
  console.log('=== SEO CTR Diagnostic ===\n')
  if (!existsSync(AUDIT_PATH)) {
    console.error('audit-full.json missing — run seo-audit.cjs first')
    process.exit(1)
  }
  const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'))
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalLost = 0

  for (const [siteKey, siteData] of Object.entries(audit.sites || {})) {
    const r = diagnoseSite(siteData)
    report.sites[siteKey] = r
    totalLost += r.totalLostClicks
    console.log(`[${siteKey}] underperformers=${r.opportunityCount}  winners=${r.winCount}  potential clicks left on table=${r.totalLostClicks}`)
    if (r.opportunities.length > 0) {
      console.log(`        biggest CTR leaks:`)
      for (const o of r.opportunities.slice(0, 5)) {
        const short = o.url.replace(/^https?:\/\/[^/]+/, '')
        console.log(`          ${short.padEnd(40)} pos=${o.position}  actual=${o.actualCtr}%  expected=${o.expectedCtr}%  lost=${o.lostClicks}`)
      }
    }
    if (r.wins.length > 0) {
      console.log(`        top CTR winners (snippet patterns to reuse):`)
      for (const w of r.wins.slice(0, 3)) {
        const short = w.url.replace(/^https?:\/\/[^/]+/, '')
        console.log(`          ${short.padEnd(40)} pos=${w.position}  actual=${w.actualCtr}%  +${w.ctrLift}pt`)
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total potential clicks recoverable: ${totalLost}`)

  appendLog({
    script: 'seo-ctr-diagnostic',
    action: 'diagnose',
    sites: Object.keys(report.sites).length,
    totalLost,
  })
}

main()
