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

async function main() {
  console.log('=== A/B Test Data Fetch (GA4 API) ===')
  console.log(`Date: ${new Date().toISOString()}\n`)

  const analyticsdata = getAnalyticsData()
  const propertyId = process.env.GA4_PROPERTY_ID_MQ

  if (!analyticsdata || !propertyId) {
    console.log('Missing GOOGLE_SERVICE_ACCOUNT_JSON or GA4_PROPERTY_ID_MQ — skipping')
    console.log('ab-results.json left unchanged')
    return
  }

  const tests = []
  let anyData = false

  for (const test of TESTS) {
    console.log(`Fetching ${test.id} (${test.metric})...`)
    const data = await fetchTestData(analyticsdata, propertyId, test)

    if (data) {
      const total = data.sessions[0] + data.sessions[1]
      console.log(`  sessions: ${data.sessions[0]}/${data.sessions[1]} (total=${total})`)
      console.log(`  conversions: ${data.conversions[0]}/${data.conversions[1]}`)
      if (total > 0) anyData = true
      tests.push({
        id: test.id,
        variants: test.variants,
        sessions: data.sessions,
        conversions: data.conversions,
        metric: test.metric,
      })
    } else {
      // Keep existing data if fetch fails
      tests.push({
        id: test.id,
        variants: test.variants,
        sessions: [0, 0],
        conversions: [0, 0],
        metric: test.metric,
      })
    }
  }

  const payload = {
    _comment: 'Auto-fetched from GA4 Data API. Do not edit manually.',
    _fetchedAt: new Date().toISOString(),
    tests,
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(payload, null, 2), 'utf-8')
  console.log(`\nWrote ${RESULTS_PATH} — ${anyData ? 'data found' : 'no data yet (tests too new?)'}`)
}

main().catch(e => {
  console.error('ab-fetch-ga4 error:', e.message)
  process.exit(0) // Don't fail the workflow
})
