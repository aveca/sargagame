#!/usr/bin/env node
/**
 * SEO Position Tracker — Time-series tracking of GSC page positions.
 *
 * Reads the latest audit-full.json snapshot, computes per-page average
 * position + clicks + impressions, appends to a rolling 90-day history,
 * and outputs significant movements to position-changes.json.
 *
 * Without this, every audit is a snapshot in isolation and there is no
 * way to know whether a fix moved the needle (or whether a competitor
 * just dropped us 6 positions overnight). The history file is the
 * substrate downstream scripts can react to.
 *
 * Usage: node scripts/automation/seo-position-tracker.cjs
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const DATA_DIR = resolve(__dirname, 'data')
const AUDIT_PATH = resolve(DATA_DIR, 'audit-full.json')
const HISTORY_PATH = resolve(DATA_DIR, 'position-history.json')
const CHANGES_PATH = resolve(DATA_DIR, 'position-changes.json')

const HISTORY_DAYS = 90
const MIN_IMPRESSIONS = 20 // ignore noise from low-impression pages
const SIGNIFICANT_DROP = 3 // positions worse → alert
const SIGNIFICANT_GAIN = 5 // positions better → log win
// Per-query tracking is finer-grained: a high-volume query (100+ impr) that
// slips half a position matters more than a page-level average drop of 3.
const QUERY_MIN_IMPRESSIONS = 50
const QUERY_SIGNIFICANT_DROP = 1.5
const QUERY_SIGNIFICANT_GAIN = 2

function loadAudit() {
  if (!existsSync(AUDIT_PATH)) {
    console.error(`audit-full.json not found at ${AUDIT_PATH}`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'))
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return { snapshots: [] }
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'))
  } catch {
    return { snapshots: [] }
  }
}

function snapshotFromAudit(audit) {
  const date = (audit.generatedAt || new Date().toISOString()).slice(0, 10)
  const sites = {}
  for (const [siteKey, siteData] of Object.entries(audit.sites || {})) {
    const pages = {}
    for (const [page, m] of Object.entries(siteData.performance || {})) {
      if (!m.count || m.impressions < MIN_IMPRESSIONS) continue
      // Snapshot the top queries attached to this page so downstream diffing
      // can detect per-query drops. GSC returns one row per (query, page,
      // device, country), so merge rows for the same query and impression-
      // weight the position average before filtering by min impressions.
      const merged = {}
      for (const q of m.topQueries || []) {
        if (typeof q.position !== 'number') continue
        if (!merged[q.query]) merged[q.query] = { impressions: 0, clicks: 0, posSum: 0 }
        merged[q.query].impressions += q.impressions
        merged[q.query].clicks += q.clicks
        merged[q.query].posSum += q.position * q.impressions
      }
      const queries = {}
      for (const [query, agg] of Object.entries(merged)) {
        if (agg.impressions < QUERY_MIN_IMPRESSIONS) continue
        queries[query] = {
          pos: Math.round((agg.posSum / agg.impressions) * 10) / 10,
          impressions: agg.impressions,
          clicks: agg.clicks,
        }
      }
      pages[page] = {
        avgPos: Math.round((m.position / m.count) * 10) / 10,
        clicks: m.clicks,
        impressions: m.impressions,
        queries,
      }
    }
    sites[siteKey] = pages
  }
  return { date, sites }
}

function trimHistory(history) {
  const cutoff = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10)
  history.snapshots = history.snapshots.filter(s => s.date >= cutoff)
  return history
}

function findPrevious(history, currentDate) {
  // Use the most recent snapshot strictly before today (so a same-day re-run
  // doesn't compare against itself and report zero movement).
  for (let i = history.snapshots.length - 1; i >= 0; i--) {
    if (history.snapshots[i].date < currentDate) return history.snapshots[i]
  }
  return null
}

function diffSnapshots(prev, curr) {
  const alerts = { drops: [], gains: [], appeared: [], vanished: [], queryDrops: [], queryGains: [] }
  for (const [siteKey, currPages] of Object.entries(curr.sites)) {
    const prevPages = prev.sites[siteKey] || {}
    for (const [page, currMetrics] of Object.entries(currPages)) {
      const prevMetrics = prevPages[page]
      if (!prevMetrics) {
        if (currMetrics.impressions >= MIN_IMPRESSIONS * 2) {
          alerts.appeared.push({ site: siteKey, page, avgPos: currMetrics.avgPos, clicks: currMetrics.clicks, impressions: currMetrics.impressions })
        }
        continue
      }
      const delta = currMetrics.avgPos - prevMetrics.avgPos
      if (delta >= SIGNIFICANT_DROP) {
        alerts.drops.push({
          site: siteKey, page,
          prevPos: prevMetrics.avgPos, currPos: currMetrics.avgPos, delta: Math.round(delta * 10) / 10,
          impressions: currMetrics.impressions,
        })
      } else if (delta <= -SIGNIFICANT_GAIN) {
        alerts.gains.push({
          site: siteKey, page,
          prevPos: prevMetrics.avgPos, currPos: currMetrics.avgPos, delta: Math.round(delta * 10) / 10,
          impressions: currMetrics.impressions,
        })
      }
      // Per-query diff within this page
      const prevQ = prevMetrics.queries || {}
      const currQ = currMetrics.queries || {}
      for (const [query, c] of Object.entries(currQ)) {
        const p = prevQ[query]
        if (!p) continue
        const qDelta = c.pos - p.pos
        if (qDelta >= QUERY_SIGNIFICANT_DROP) {
          alerts.queryDrops.push({
            site: siteKey, page, query,
            prevPos: p.pos, currPos: c.pos, delta: Math.round(qDelta * 10) / 10,
            prevImpressions: p.impressions, impressions: c.impressions,
            clicks: c.clicks, prevClicks: p.clicks,
          })
        } else if (qDelta <= -QUERY_SIGNIFICANT_GAIN) {
          alerts.queryGains.push({
            site: siteKey, page, query,
            prevPos: p.pos, currPos: c.pos, delta: Math.round(qDelta * 10) / 10,
            impressions: c.impressions, clicks: c.clicks,
          })
        }
      }
    }
    // Pages that vanished from this snapshot (lost all impressions)
    for (const [page, prevMetrics] of Object.entries(prevPages)) {
      if (!currPages[page] && prevMetrics.impressions >= MIN_IMPRESSIONS * 2) {
        alerts.vanished.push({ site: siteKey, page, prevImpressions: prevMetrics.impressions })
      }
    }
  }
  // Sort drops by severity (impressions × delta) so the workflow can prioritise
  alerts.drops.sort((a, b) => (b.impressions * b.delta) - (a.impressions * a.delta))
  alerts.gains.sort((a, b) => (a.delta - b.delta)) // most negative delta first
  alerts.queryDrops.sort((a, b) => (b.impressions * b.delta) - (a.impressions * a.delta))
  alerts.queryGains.sort((a, b) => a.delta - b.delta)
  return alerts
}

function main() {
  console.log('=== SEO Position Tracker ===\n')

  const audit = loadAudit()
  const history = trimHistory(loadHistory())
  const snapshot = snapshotFromAudit(audit)

  const prev = findPrevious(history, snapshot.date)
  const prevDate = prev ? prev.date : 'none'
  console.log(`Snapshot date: ${snapshot.date}`)
  console.log(`Previous snapshot: ${prevDate}`)

  let pageCount = 0
  for (const pages of Object.values(snapshot.sites)) pageCount += Object.keys(pages).length
  console.log(`Tracking ${pageCount} pages across ${Object.keys(snapshot.sites).length} sites\n`)

  // Replace any same-day snapshot (idempotent re-runs) and append current
  history.snapshots = history.snapshots.filter(s => s.date !== snapshot.date)
  history.snapshots.push(snapshot)
  history.snapshots.sort((a, b) => a.date.localeCompare(b.date))
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))
  console.log(`History updated: ${history.snapshots.length} snapshots over ${HISTORY_DAYS}d window`)

  let changes = { generatedAt: new Date().toISOString(), comparedTo: prevDate, alerts: { drops: [], gains: [], appeared: [], vanished: [], queryDrops: [], queryGains: [] } }
  if (prev) {
    changes.alerts = diffSnapshots(prev, snapshot)
    console.log(`\nPage drops    (>= ${SIGNIFICANT_DROP} pos worse):    ${changes.alerts.drops.length}`)
    console.log(`Page gains    (>= ${SIGNIFICANT_GAIN} pos better):   ${changes.alerts.gains.length}`)
    console.log(`Query drops   (>= ${QUERY_SIGNIFICANT_DROP} pos, ${QUERY_MIN_IMPRESSIONS}+ impr): ${changes.alerts.queryDrops.length}`)
    console.log(`Query gains   (>= ${QUERY_SIGNIFICANT_GAIN} pos better):   ${changes.alerts.queryGains.length}`)
    console.log(`Appeared      (new in audit):                 ${changes.alerts.appeared.length}`)
    console.log(`Vanished      (gone from audit):              ${changes.alerts.vanished.length}`)

    if (changes.alerts.drops.length > 0) {
      console.log('\n--- Top 5 page drops ---')
      for (const d of changes.alerts.drops.slice(0, 5)) {
        const short = d.page.replace(/^https?:\/\/[^/]+/, '')
        console.log(`  [${d.site}] ${short.padEnd(40)} ${d.prevPos} → ${d.currPos} (Δ +${d.delta}, impr=${d.impressions})`)
      }
    }
    if (changes.alerts.queryDrops.length > 0) {
      console.log('\n--- Top 5 query drops ---')
      for (const d of changes.alerts.queryDrops.slice(0, 5)) {
        console.log(`  [${d.site}] "${d.query}" ${d.prevPos} → ${d.currPos} (Δ +${d.delta}, impr=${d.impressions})`)
      }
    }
    if (changes.alerts.gains.length > 0) {
      console.log('\n--- Top 5 page gains ---')
      for (const g of changes.alerts.gains.slice(0, 5)) {
        const short = g.page.replace(/^https?:\/\/[^/]+/, '')
        console.log(`  [${g.site}] ${short.padEnd(40)} ${g.prevPos} → ${g.currPos} (Δ ${g.delta}, impr=${g.impressions})`)
      }
    }
  } else {
    console.log('\nNo previous snapshot — first run, history seeded.')
  }

  writeFileSync(CHANGES_PATH, JSON.stringify(changes, null, 2))
  console.log(`\nWrote ${CHANGES_PATH}`)

  appendLog({
    script: 'seo-position-tracker',
    action: 'snapshot',
    snapshots: history.snapshots.length,
    drops: changes.alerts.drops.length,
    gains: changes.alerts.gains.length,
    queryDrops: changes.alerts.queryDrops.length,
    queryGains: changes.alerts.queryGains.length,
    appeared: changes.alerts.appeared.length,
    vanished: changes.alerts.vanished.length,
  })
}

main()
