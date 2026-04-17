#!/usr/bin/env node
/**
 * Daily Stats Check — reads metrics from Apps Script backend
 * and logs them for monitoring. Run after each ERDDAP update.
 *
 * Reads from: Apps Script ?action=stats
 * Writes to:  scripts/automation/data/daily-metrics.json
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const STATS_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=stats'
const METRICS_PATH = path.join(__dirname, 'data', 'daily-metrics.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      // Follow redirects (Apps Script returns 302)
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(10000, () => { req.destroy(); resolve(null) })
  })
}

async function main() {
  console.log('=== Daily Stats Check ===')
  const now = new Date()

  // 1. Fetch stats from Apps Script
  console.log('Fetching stats from Apps Script...')
  const stats = await fetchJSON(STATS_URL)

  if (!stats || stats.error) {
    console.log('Could not fetch stats:', stats?.error || 'no response')
    console.log('(Apps Script may not be deployed yet)')
  } else {
    console.log(`Payments: ${stats.payments} (${stats.revenue} EUR)`)
    console.log(`Emails: ${stats.emails}`)
    console.log(`Feedbacks: ${stats.feedbacks} (avg rating: ${stats.avgRating})`)
    console.log(`Emails sent: ${stats.emailsSent}`)
  }

  // 2. Check pipeline freshness
  let pipelineOk = false
  try {
    const sarg = JSON.parse(fs.readFileSync(SARG_PATH, 'utf-8'))
    const age = (now - new Date(sarg.updatedAt)) / 3600000 // hours
    pipelineOk = age < 12
    console.log(`Pipeline: ${sarg.source} | age: ${age.toFixed(1)}h | ${pipelineOk ? 'OK' : 'STALE'}`)
  } catch { console.log('Pipeline: no sargassum.json found') }

  // 3. Save daily snapshot
  const dataDir = path.join(__dirname, 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  let metrics = []
  try { metrics = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8')) } catch {}

  const today = now.toISOString().slice(0, 10)
  // Upsert by date: drop any prior same-day rows so the last write of the day wins.
  // Without this, 4x/day crons + local runs bloat the file (90-day cap = ~15 real days)
  // and trend detection below would compare same-day dups instead of day-over-day.
  metrics = metrics.filter(r => r.date !== today)
  metrics.push({
    date: today,
    time: now.toISOString(),
    payments: stats?.payments || null,
    revenue: stats?.revenue || null,
    emails: stats?.emails || null,
    feedbacks: stats?.feedbacks || null,
    avgRating: stats?.avgRating || null,
    pipelineOk,
  })

  // Keep last 90 days
  if (metrics.length > 90) metrics = metrics.slice(-90)
  fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2), 'utf-8')
  console.log(`Metrics saved (${metrics.length} days)`)

  // 4. Trend detection — compare today vs last entry from a prior date
  const curr = metrics[metrics.length - 1]
  const prev = [...metrics].reverse().find(r => r.date !== curr.date)
  if (prev) {
    if (prev.payments != null && curr.payments != null && curr.payments > prev.payments) {
      console.log(`NEW PAYMENT DETECTED: ${prev.payments} -> ${curr.payments}`)
    }
    if (prev.emails != null && curr.emails != null && curr.emails > prev.emails) {
      console.log(`NEW EMAIL SIGNUP: ${prev.emails} -> ${curr.emails} (+${curr.emails - prev.emails})`)
    }
    if (prev.feedbacks != null && curr.feedbacks != null && curr.feedbacks > prev.feedbacks) {
      console.log(`NEW FEEDBACK: ${prev.feedbacks} -> ${curr.feedbacks}`)
    }
  }

  console.log('Done.')
}

main().catch(e => console.error(e))
