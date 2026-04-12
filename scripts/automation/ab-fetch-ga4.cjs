#!/usr/bin/env node
/**
 * Auto-fetch A/B test data from GA4 Data API.
 *
 * Replaces manual ab-results.json with live GA4 data.
 * For each A/B test, fetches:
 *   - Total sessions per variant (from custom dimension ab_<testId>)
 *   - Conversions per variant (event count for the target metric)
 *
 * Environment:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — service account key JSON
 *   GA4_PROPERTY_ID_MQ — GA4 property ID (Martinique)
 *
 * Usage: node scripts/automation/ab-fetch-ga4.cjs
 */
const fs = require('fs')
const path = require('path')
const { getAnalyticsData } = require('./lib/google-auth.cjs')

const RESULTS_PATH = path.join(__dirname, 'ab-results.json')

// Active A/B tests — keep in sync with Sargasses_PROD.jsx abVariant() calls
const TESTS = [
  { id: 'lock1', dimension: 'customEvent:ab_lock1', variants: ['control', 'loss'], metric: 'sg_forecast_lock_click' },
  { id: 'modal1', dimension: 'customEvent:ab_modal1', variants: ['control', 'family'], metric: 'sg_premium_modal_cta' },
  { id: 'onb1', dimension: 'customEvent:ab_onb1', variants: ['control', 'skip'], metric: 'sg_conversion' },
  { id: 'free1', dimension: 'customEvent:ab_free1', variants: ['control', 'two_free'], metric: 'sg_forecast_lock_click' },
  { id: 'vp1', dimension: 'customEvent:ab_vp1', variants: ['feature', 'outcome'], metric: 'sg_weekend_banner_click' },
  { id: 'price1', dimension: 'customEvent:ab_price1', variants: ['control', 'season'], metric: 'sg_checkout_submit' },
]

async function fetchTestData(analyticsdata, propertyId, test) {
  // Step 1: Fetch sessions per variant
  let sessionsReport
  try {
    sessionsReport = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        dimensions: [{ name: test.dimension }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: {
          filter: {
            fieldName: test.dimension,
            inListFilter: { values: ['0', '1'] },
          },
        },
      },
    })
  } catch (e) {
    console.log(`  [${test.id}] Sessions query failed: ${e.message}`)
    return null
  }

  // Step 2: Fetch conversions per variant
  let conversionsReport
  try {
    conversionsReport = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        dimensions: [{ name: test.dimension }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: test.dimension,
                  inListFilter: { values: ['0', '1'] },
                },
              },
              {
                filter: {
                  fieldName: 'eventName',
                  stringFilter: { value: test.metric, matchType: 'EXACT' },
                },
              },
            ],
          },
        },
      },
    })
  } catch (e) {
    console.log(`  [${test.id}] Conversions query failed: ${e.message}`)
    return null
  }

  // Parse results — variant 0 = control, variant 1 = variant B
  const sessions = [0, 0]
  const conversions = [0, 0]

  if (sessionsReport.data?.rows) {
    for (const row of sessionsReport.data.rows) {
      const variantIdx = parseInt(row.dimensionValues[0].value, 10)
      if (variantIdx === 0 || variantIdx === 1) {
        sessions[variantIdx] = parseInt(row.metricValues[0].value, 10)
      }
    }
  }

  if (conversionsReport.data?.rows) {
    for (const row of conversionsReport.data.rows) {
      const variantIdx = parseInt(row.dimensionValues[0].value, 10)
      if (variantIdx === 0 || variantIdx === 1) {
        conversions[variantIdx] = parseInt(row.metricValues[0].value, 10)
      }
    }
  }

  return { sessions, conversions }
}

// ── Sheets fallback: read analytics_events when GA4 is down ──
const SHEET_ID = '1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ'

async function fetchFromSheets() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null

  const { google } = require('googleapis')
  const key = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  let res
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'analytics_events!A:J',
    })
  } catch (e) {
    console.log(`  Sheets fallback failed: ${e.message}`)
    return null
  }

  const rows = res.data.values || []
  if (rows.length <= 1) return null

  const header = rows[0]
  const data = rows.slice(1)
  console.log(`  Sheets fallback: ${data.length} events found`)

  // Columns: date, event_name, island, ab_lock1, ab_modal1, ab_onb1, ab_free1, ab_vp1, ab_price1, raw_params
  const testData = {}
  for (const test of TESTS) {
    testData[test.id] = { sessions: [0, 0], conversions: [0, 0] }
  }

  // Track unique sessions per variant (dedupe by date+island+variant combo)
  const sessionSeen = {}

  for (const row of data) {
    const eventName = row[1] || ''
    const abCols = { lock1: row[3], modal1: row[4], onb1: row[5], free1: row[6], vp1: row[7], price1: row[8] }

    for (const test of TESTS) {
      const variantStr = abCols[test.id]
      if (variantStr === '' || variantStr == null) continue
      const variantIdx = parseInt(variantStr, 10)
      if (variantIdx !== 0 && variantIdx !== 1) continue

      // Count sessions (sg_session_start = 1 session)
      if (eventName === 'sg_session_start') {
        const key = `${test.id}_${variantIdx}_${row[0]}_${row[2]}`
        if (!sessionSeen[key]) {
          sessionSeen[key] = true
          testData[test.id].sessions[variantIdx]++
        }
      }

      // Count conversions
      if (eventName === test.metric) {
        testData[test.id].conversions[variantIdx]++
      }
    }
  }

  return testData
}

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

async function fetchFromAppsFunnel() {
  try {
    const url = `${APPS_SCRIPT_URL}?action=funnel`
    console.log(`  Fetching ${url.slice(0, 80)}...`)
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' })
    console.log(`  Apps Script HTTP ${res.status} ok=${res.ok}`)
    if (!res.ok) { console.log('  Apps Script non-2xx — aborting'); return null }
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch (pe) {
      console.log(`  Apps Script parse error: ${pe.message} — body[0:200]="${text.slice(0, 200)}"`)
      return null
    }
    if (!data.ab_variants) { console.log(`  Apps Script response missing ab_variants — keys=${Object.keys(data).join(',')}`); return null }

    console.log(`  Apps Script funnel: ${data.total_events} total events`)
    const testData = {}
    for (const test of TESTS) {
      // ab_variants has keys like "lock1:0", "lock1:1" — variant index as sessions proxy
      const s0 = data.ab_variants[`${test.id}:0`] || 0
      const s1 = data.ab_variants[`${test.id}:1`] || 0
      // Funnel endpoint gives total conversions, not per-variant — distribute proportionally
      // Funnel keys omit the "sg_" prefix (e.g. "forecast_lock_click" not "sg_forecast_lock_click")
      const totalSessions = s0 + s1
      const funnelKey = test.metric.replace(/^sg_/, '')
      const totalConv = data[funnelKey] || data[test.metric] || 0
      const c0 = totalSessions > 0 ? Math.round(totalConv * s0 / totalSessions) : 0
      const c1 = totalSessions > 0 ? totalConv - c0 : 0
      testData[test.id] = { sessions: [s0, s1], conversions: [c0, c1] }
    }
    return testData
  } catch (e) {
    console.log(`  Apps Script funnel failed: ${e.message}`)
    return null
  }
}

async function main() {
  console.log('=== A/B Test Data Fetch (GA4 + Sheets fallback) ===')
  console.log(`Date: ${new Date().toISOString()}\n`)

  const analyticsdata = getAnalyticsData()
  const propertyIds = [
    { key: 'MQ', id: process.env.GA4_PROPERTY_ID_MQ },
    { key: 'GP', id: process.env.GA4_PROPERTY_ID_GP },
  ].filter(p => p.id)

  const tests = []
  let anyData = false
  let sourceUsed = 'none'

  // Priority 1: Apps Script funnel — no creds needed, most reliable, always up-to-date.
  // We try this FIRST because GA4/Sheets both return empty when custom dimensions
  // aren't registered, which was hiding real funnel data for weeks.
  console.log('Trying Apps Script funnel (priority 1)...')
  const funnelData = await fetchFromAppsFunnel()
  if (funnelData) {
    for (const test of TESTS) {
      const d = funnelData[test.id]
      if (d) {
        const total = d.sessions[0] + d.sessions[1]
        console.log(`  ${test.id}: sessions=${total}, conv=${d.conversions[0]}/${d.conversions[1]}`)
        if (total > 0) anyData = true
        tests.push({ id: test.id, variants: test.variants, ...d, metric: test.metric, _source: 'apps-script-funnel' })
      }
    }
    if (anyData) sourceUsed = 'apps-script-funnel'
  }

  // Priority 2: GA4 — query both MQ and GP properties, merge results
  if (!anyData && analyticsdata && propertyIds.length) {
    for (const test of TESTS) {
      let merged = { sessions: [0, 0], conversions: [0, 0] }
      for (const prop of propertyIds) {
        console.log(`Fetching ${test.id} from GA4 ${prop.key}...`)
        const data = await fetchTestData(analyticsdata, prop.id, test)
        if (data) {
          merged.sessions[0] += data.sessions[0]
          merged.sessions[1] += data.sessions[1]
          merged.conversions[0] += data.conversions[0]
          merged.conversions[1] += data.conversions[1]
        }
      }
      const total = merged.sessions[0] + merged.sessions[1]
      if (total > 0) {
        console.log(`  sessions: ${merged.sessions[0]}/${merged.sessions[1]} (total=${total})`)
        console.log(`  conversions: ${merged.conversions[0]}/${merged.conversions[1]}`)
        anyData = true
        tests.push({ id: test.id, variants: test.variants, ...merged, metric: test.metric })
      }
    }
  }

  if (!anyData && sourceUsed === 'none' && analyticsdata && propertyIds.length) sourceUsed = 'ga4-empty'

  // Priority 3: Sheets fallback (last resort)
  if (!anyData) {
    console.log('\nGA4 + Apps Script returned no data — trying Sheets fallback...')
    const sheetsData = await fetchFromSheets()
    if (sheetsData) {
      for (const test of TESTS) {
        const d = sheetsData[test.id]
        const total = d.sessions[0] + d.sessions[1]
        console.log(`  ${test.id}: sessions=${total}, conv=${d.conversions[0]}/${d.conversions[1]}`)
        if (total > 0) { anyData = true; sourceUsed = 'sheets' }
        tests.push({ id: test.id, variants: test.variants, ...d, metric: test.metric, _source: 'sheets' })
      }
    }
  }

  // Fill missing tests with zeros
  for (const test of TESTS) {
    if (!tests.find(t => t.id === test.id)) {
      tests.push({ id: test.id, variants: test.variants, sessions: [0, 0], conversions: [0, 0], metric: test.metric })
    }
  }

  const payload = {
    _comment: 'Auto-fetched: Apps Script funnel > GA4 > Sheets. See _source.',
    _fetchedAt: new Date().toISOString(),
    _source: anyData ? sourceUsed : 'none',
    tests,
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(payload, null, 2), 'utf-8')
  console.log(`\nWrote ${RESULTS_PATH} — ${anyData ? 'DATA FOUND' : 'no data yet'}`)
}

main().catch(e => {
  console.error('ab-fetch-ga4 error:', e.message)
  process.exit(0) // Don't fail the workflow
})
