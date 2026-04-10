#!/usr/bin/env node
/**
 * Diagnose GA4 data for both properties (MQ + GP).
 *
 * Fetches activeUsers, eventCount, sessions over the last 2 days for both
 * properties and prints a side-by-side comparison. Useful when one site
 * appears in GA4 but the other does not.
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_JSON, GA4_PROPERTY_ID_MQ, GA4_PROPERTY_ID_GP
 */
const { getAnalyticsData } = require('./lib/google-auth.cjs')

async function diag(label, propertyId) {
  const ad = getAnalyticsData()
  if (!ad) { console.log(`${label}: NO AUTH`); return }
  if (!propertyId) { console.log(`${label}: NO PROPERTY_ID`); return }
  const property = `properties/${propertyId}`
  console.log(`\n=== ${label} (property ${propertyId}) ===`)

  // 1) Totals (last 2 days)
  try {
    const r = await ad.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: '2daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'eventCount' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
      },
    })
    const row = r.data.rows?.[0]?.metricValues || []
    console.log(`  Totals (2daysAgo → today):`)
    console.log(`    activeUsers:    ${row[0]?.value || 0}`)
    console.log(`    eventCount:     ${row[1]?.value || 0}`)
    console.log(`    sessions:       ${row[2]?.value || 0}`)
    console.log(`    screenPageViews:${row[3]?.value || 0}`)
  } catch (e) {
    console.log(`  runReport error: ${e.message}`)
  }

  // 2) Top events (last 2 days)
  try {
    const r = await ad.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: '2daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 15,
      },
    })
    console.log(`  Top events:`)
    for (const row of (r.data.rows || [])) {
      console.log(`    ${row.dimensionValues[0].value.padEnd(30)} ${row.metricValues[0].value}`)
    }
    if (!(r.data.rows || []).length) console.log(`    (none — no events recorded)`)
  } catch (e) {
    console.log(`  events error: ${e.message}`)
  }

  // 3) Realtime (last 30 min)
  try {
    // Active users (no dimensions — realtime constraint)
    const users = await ad.properties.runRealtimeReport({
      property,
      requestBody: { metrics: [{ name: 'activeUsers' }] },
    })
    const u = users.data.rows?.[0]?.metricValues?.[0]?.value || '0'
    console.log(`  Realtime activeUsers (30min): ${u}`)
    // Event counts per name
    const events = await ad.properties.runRealtimeReport({
      property,
      requestBody: {
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'eventName' }],
        limit: 15,
      },
    })
    console.log(`  Realtime events (last 30min):`)
    for (const row of (events.data.rows || [])) {
      console.log(`    ${row.dimensionValues[0].value.padEnd(30)} ${row.metricValues[0].value}`)
    }
    if (!(events.data.rows || []).length) console.log(`    (none active)`)
  } catch (e) {
    console.log(`  realtime error: ${e.message}`)
  }

  // 4) Data stream list (surfaces stream-level config issues)
  try {
    const https = require('https')
    const { GoogleAuth } = require('google-auth-library')
    const auth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    })
    const client = await auth.getClient()
    const token = (await client.getAccessToken()).token
    const data = await new Promise((resolve) => {
      const req = https.request({
        hostname: 'analyticsadmin.googleapis.com',
        path: `/v1beta/properties/${propertyId}/dataStreams`,
        headers: { Authorization: `Bearer ${token}` },
      }, res => {
        let b = ''
        res.on('data', d => b += d)
        res.on('end', () => resolve(b))
      })
      req.on('error', e => resolve(JSON.stringify({ error: e.message })))
      req.end()
    })
    try {
      const parsed = JSON.parse(data)
      const streams = parsed.dataStreams || []
      console.log(`  Data streams: ${streams.length}`)
      for (const s of streams) {
        const mid = s.webStreamData?.measurementId || '—'
        const url = s.webStreamData?.defaultUri || '—'
        console.log(`    ${s.displayName} | ${mid} | ${url} | type=${s.type}`)
      }
    } catch {
      console.log(`  streams raw: ${data.slice(0, 300)}`)
    }
  } catch (e) {
    console.log(`  stream list error: ${e.message}`)
  }
}

async function main() {
  console.log('=== GA4 MQ vs GP diagnostic ===')
  console.log(`date: ${new Date().toISOString()}`)
  await diag('MQ', process.env.GA4_PROPERTY_ID_MQ)
  await diag('GP', process.env.GA4_PROPERTY_ID_GP)
}

main().catch(e => { console.error(e); process.exit(1) })
