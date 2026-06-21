#!/usr/bin/env node
/**
 * SEO Core Web Vitals Tracker — Rolling history of CrUX field metrics.
 *
 * Snapshots the CrUX metrics already collected by seo-audit.cjs into a
 * timestamped history so we can detect regressions over weeks/months
 * (CrUX is a 28-day trailing average — by the time it surfaces a problem
 * in Search Console, the cause may already be 2 weeks old).
 *
 * Tracked: LCP, INP, CLS, TTFB. Both p75 (Google's threshold value) and
 * good/needs-improvement/poor distribution.
 *
 * Output: data/cwv-history.json (rolling 90-day store)
 *         data/cwv-changes.json  (significant deltas vs prev snapshot)
 *
 * Usage: node scripts/automation/seo-cwv-tracker.cjs
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const DATA_DIR = resolve(__dirname, 'data')
const AUDIT_PATH = resolve(DATA_DIR, 'audit-full.json')
const HISTORY_PATH = resolve(DATA_DIR, 'cwv-history.json')
const CHANGES_PATH = resolve(DATA_DIR, 'cwv-changes.json')

const HISTORY_DAYS = 90
const REGRESSION_THRESHOLDS = {
  // p75 deltas considered a regression worth alerting on
  LCP: 200,    // ms
  INP: 50,     // ms
  CLS: 0.05,   // unitless
  TTFB: 100,   // ms
}

// Google's "good" thresholds — for surface labeling
const GOOD_THRESHOLDS = {
  LCP: 2500,
  INP: 200,
  CLS: 0.1,
  TTFB: 800,
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return { snapshots: [] }
  try { return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')) }
  catch { return { snapshots: [] } }
}

function extractMetrics(crux) {
  if (!crux || crux.error) return null
  // The seo-audit shape varies — some snapshots are { metrics: { largest_contentful_paint: { ... } } }
  // and some are flat. Normalise both.
  const m = crux.metrics || crux.record?.metrics || crux
  const out = {}
  const map = {
    LCP: ['largest_contentful_paint', 'lcp'],
    INP: ['interaction_to_next_paint', 'inp'],
    CLS: ['cumulative_layout_shift', 'cls'],
    TTFB: ['experimental_time_to_first_byte', 'ttfb'],
  }
  for (const [key, candidates] of Object.entries(map)) {
    for (const c of candidates) {
      const metric = m[c]
      if (metric == null) continue // not `if (metric)` — CLS p75 of 0 is valid, not absent
      // seo-audit.cjs writes a FLAT shape ({lcp:<number>,inp:<number>,cls:<number>});
      // raw CrUX records are nested ({percentiles:{p75},histogram:[...]}). Accept both —
      // a flat number IS the p75. Before this, the flat shape silently yielded p75:null
      // (the tracker read `.percentiles.p75` off a number) → cwv-history all-null = blind.
      if (typeof metric === 'number') {
        out[key] = { p75: metric, good: null }
      } else {
        out[key] = {
          p75: metric.percentiles?.p75 ?? metric.p75 ?? null,
          good: metric.histogram?.[0]?.density ?? metric.histogramGood ?? null,
        }
      }
      break
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function snapshotFromAudit(audit) {
  const today = new Date().toISOString().slice(0, 10)
  const snapshot = { date: today, sites: {} }
  for (const [siteKey, siteData] of Object.entries(audit.sites || {})) {
    const cruxBlock = siteData.crux || {}
    // CrUX may be split by form-factor (PHONE/DESKTOP) or per-URL
    if (cruxBlock.PHONE || cruxBlock.DESKTOP) {
      snapshot.sites[siteKey] = {
        phone: extractMetrics(cruxBlock.PHONE),
        desktop: extractMetrics(cruxBlock.DESKTOP),
      }
    } else {
      snapshot.sites[siteKey] = { combined: extractMetrics(cruxBlock) }
    }
  }
  return snapshot
}

function computeChanges(prev, curr) {
  if (!prev) return { kind: 'first-snapshot' }
  const changes = []
  for (const [siteKey, siteCurr] of Object.entries(curr.sites || {})) {
    const sitePrev = prev.sites?.[siteKey]
    if (!sitePrev) continue
    for (const formFactor of ['phone', 'desktop', 'combined']) {
      const c = siteCurr[formFactor]
      const p = sitePrev[formFactor]
      if (!c || !p) continue
      for (const metric of ['LCP', 'INP', 'CLS', 'TTFB']) {
        const cv = c[metric]?.p75
        const pv = p[metric]?.p75
        if (cv == null || pv == null) continue
        const delta = cv - pv
        const threshold = REGRESSION_THRESHOLDS[metric]
        if (Math.abs(delta) >= threshold) {
          changes.push({
            site: siteKey,
            formFactor,
            metric,
            from: pv,
            to: cv,
            delta,
            kind: delta > 0 ? 'regression' : 'improvement',
            crossesThreshold:
              (cv > GOOD_THRESHOLDS[metric] && pv <= GOOD_THRESHOLDS[metric]) ||
              (cv <= GOOD_THRESHOLDS[metric] && pv > GOOD_THRESHOLDS[metric]),
          })
        }
      }
    }
  }
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return { kind: 'delta', changes }
}

function pruneOldSnapshots(history) {
  const cutoff = Date.now() - HISTORY_DAYS * 86400 * 1000
  history.snapshots = history.snapshots.filter(s => new Date(s.date).getTime() >= cutoff)
}

function main() {
  console.log('=== SEO CWV Tracker ===\n')
  if (!existsSync(AUDIT_PATH)) {
    console.error('audit-full.json missing — run seo-audit.cjs first')
    process.exit(1)
  }
  const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'))
  const history = loadHistory()
  const snapshot = snapshotFromAudit(audit)

  // Drop today's previous snapshot if it exists (this is the same-day rerun case)
  history.snapshots = history.snapshots.filter(s => s.date !== snapshot.date)
  const prev = history.snapshots[history.snapshots.length - 1]
  history.snapshots.push(snapshot)
  pruneOldSnapshots(history)
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))

  const result = computeChanges(prev, snapshot)
  writeFileSync(CHANGES_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2))

  if (result.kind === 'first-snapshot') {
    console.log('First snapshot — no deltas yet. Future runs will compare.')
  } else {
    console.log(`Detected ${result.changes.length} significant CWV deltas:`)
    for (const c of result.changes.slice(0, 10)) {
      const arrow = c.kind === 'regression' ? '↑' : '↓'
      const cross = c.crossesThreshold ? ' [CROSSED THRESHOLD]' : ''
      console.log(`  ${arrow} ${c.site} ${c.formFactor} ${c.metric}: ${c.from} → ${c.to} (Δ${c.delta > 0 ? '+' : ''}${c.delta})${cross}`)
    }
  }

  console.log(`\nHistory: ${history.snapshots.length} snapshots`)
  console.log(`Wrote ${HISTORY_PATH}`)
  console.log(`Wrote ${CHANGES_PATH}`)

  appendLog({
    script: 'seo-cwv-tracker',
    action: 'snapshot',
    historyCount: history.snapshots.length,
    deltaCount: result.changes?.length || 0,
  })
}

main()
