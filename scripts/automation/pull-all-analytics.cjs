#!/usr/bin/env node
/**
 * pull-all-analytics.cjs — Unified analytics-ingestion pipeline.
 *
 * Pulls EVERY data plane for which credentials exist and GRACEFULLY SKIPS the
 * rest with a clear console message. Never throws on a missing cred — a missing
 * plane only nulls its own section. Writes the merged snapshot to
 *   scripts/automation/data/analytics-snapshot.json   (gitignored)
 * which the autonomous design loop reads as its ONLY analytics input.
 *
 * Planes:
 *   • GSC   + GA4 → only if GOOGLE_SERVICE_ACCOUNT_JSON present (googleapis JWT).
 *   • Clarity     → only if CLARITY_API_TOKEN present.
 *   • firstParty  → only if scripts/automation/data/stats-keys.json (mq key) present
 *                   → GET the live stats.php (mirrors fetch-stats.cjs).
 *   • funnel      → ALWAYS (public Apps Script ?action=funnel, no auth).
 *
 * DETERMINISM: this script calls NO wall-clock / current-time API. The `generated`
 * field is read from process.env.SNAP_TS, or the literal string 'unset' if absent.
 * The CALLER stamps the time. This keeps the output deterministic given the same
 * upstream data.
 *
 * Env: parsed manually from .env (no dotenv dependency).
 * Deps: googleapis (already in package.json). No @google-analytics/data needed.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ── .env manual parse (copied from scripts/tmp-wf-results/fetch-stats.cjs) ──────
// Does NOT clobber real process.env (CI injects secrets there); .env only fills gaps.
const env = {}
try {
  for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
} catch (e) {}
// Merge: process.env wins (CI secrets), .env fills the rest.
function envGet(name) {
  return (process.env[name] !== undefined && process.env[name] !== '') ? process.env[name] : env[name]
}

const ROOT = path.resolve(__dirname, '..', '..')
const SNAPSHOT_PATH = path.join(ROOT, 'scripts', 'automation', 'data', 'analytics-snapshot.json')
const STATS_KEYS_PATH = path.join(ROOT, 'scripts', 'automation', 'data', 'stats-keys.json')

const FUNNEL_URL =
  'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel'

const GSC_PROPERTIES = [
  'sc-domain:sargasses-martinique.com',
  'sc-domain:sargasses-guadeloupe.com',
]

// ── tiny GET helper (https, follows one redirect; Apps Script 302s to script.googleusercontent.com)
function httpGetJSON(url, { headers = {}, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume()
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString()
        return resolve(httpGetJSON(next, { headers, redirects: redirects - 1 }))
      }
      let b = ''
      res.on('data', (d) => (b += d))
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${b.slice(0, 160)}`))
        try { resolve(JSON.parse(b)) }
        catch (e) { reject(new Error(`bad JSON (HTTP ${res.statusCode}): ${b.slice(0, 160)}`)) }
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('timeout (30s)')))
  })
}

// ── date window (28d) computed WITHOUT a wall-clock call. We derive the window
//    from SNAP_TS if it parses, else leave the GSC/GA4 relative ranges to the API
//    ('28daysAgo'/'today' for GA4; for GSC we must pass explicit dates, so we fall
//    back to a fixed deterministic placeholder window when SNAP_TS is unset).
//    GA4 uses relative tokens so it never needs a clock here.
function gscWindow() {
  const ts = envGet('SNAP_TS')
  const base = ts && !Number.isNaN(Date.parse(ts)) ? Date.parse(ts) : null
  if (base === null) {
    // Deterministic placeholder: GSC requires explicit dates. Without SNAP_TS we
    // cannot know "today" without a clock, so use a fixed 28d window ending at the
    // SNAP_TS date. If SNAP_TS is unset, GSC is still queried with this placeholder
    // window — the caller is expected to pass SNAP_TS in production.
    return { startDate: '2020-01-01', endDate: '2020-01-29', note: 'SNAP_TS unset — placeholder GSC window' }
  }
  const end = new Date(base).toISOString().slice(0, 10)
  const start = new Date(base - 28 * 86400000).toISOString().slice(0, 10)
  return { startDate: start, endDate: end, note: null }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANE: GSC  (top 25 pages + top 25 queries by clicks, both properties)
// ═══════════════════════════════════════════════════════════════════════════════
async function pullGSC(sc, win) {
  async function queryDim(siteUrl, dimension) {
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: win.startDate,
        endDate: win.endDate,
        dimensions: [dimension],
        rowLimit: 25,
        dataState: 'all',
      },
    })
    return (res.data.rows || []).map((r) => ({
      key: r.keys[0],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0,
    }))
  }
  const out = {}
  for (const siteUrl of GSC_PROPERTIES) {
    try {
      const [pages, queries] = await Promise.all([
        queryDim(siteUrl, 'page'),
        queryDim(siteUrl, 'query'),
      ])
      out[siteUrl] = { pages, queries }
    } catch (e) {
      console.error(`  [gsc] ${siteUrl}: ${e.message}`)
      out[siteUrl] = { pages: [], queries: [], error: e.message }
    }
  }
  return { window: win, perProperty: out }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANE: GA4  (traffic/pages/sources only — NO conversions/revenue; those are untrusted)
// ═══════════════════════════════════════════════════════════════════════════════
async function pullGA4(analyticsdata) {
  const propertyIds = [
    { key: 'MQ', id: envGet('GA4_PROPERTY_ID_MQ') },
    { key: 'GP', id: envGet('GA4_PROPERTY_ID_GP') },
  ].filter((p) => p.id)

  if (!propertyIds.length) {
    return { skipped: true, note: 'no GA4 property ids (GA4_PROPERTY_ID_MQ / GA4_PROPERTY_ID_GP unset)', perProperty: {} }
  }

  const dateRanges = [{ startDate: '28daysAgo', endDate: 'today' }]
  const num = (v) => parseInt(v, 10) || 0
  const perProperty = {}

  for (const prop of propertyIds) {
    const property = `properties/${prop.id}`
    const rec = { propertyId: property, totals: { totalUsers: 0, sessions: 0 }, topPages: [], channels: [] }
    try {
      const r = await analyticsdata.properties.runReport({
        property,
        requestBody: { dateRanges, metrics: [{ name: 'totalUsers' }, { name: 'sessions' }] },
      })
      const m = (r.data.rows && r.data.rows[0] && r.data.rows[0].metricValues) || []
      rec.totals.totalUsers = num(m[0] && m[0].value)
      rec.totals.sessions = num(m[1] && m[1].value)
    } catch (e) { console.error(`  [ga4 ${prop.key}] totals: ${e.message}`) }

    try {
      const r = await analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges,
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 25,
        },
      })
      rec.topPages = (r.data.rows || []).map((row) => ({
        pagePath: row.dimensionValues[0].value,
        screenPageViews: num(row.metricValues[0].value),
      }))
    } catch (e) { console.error(`  [ga4 ${prop.key}] topPages: ${e.message}`) }

    try {
      const r = await analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges,
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        },
      })
      rec.channels = (r.data.rows || []).map((row) => ({
        channel: row.dimensionValues[0].value || '(unknown)',
        sessions: num(row.metricValues[0].value),
        totalUsers: num(row.metricValues[1] && row.metricValues[1].value),
      }))
    } catch (e) { console.error(`  [ga4 ${prop.key}] channels: ${e.message}`) }

    perProperty[prop.key.toLowerCase()] = rec
  }
  return { range: { startDate: '28daysAgo', endDate: 'today' }, perProperty }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANE: Clarity  (corroborating only — last 3 days aggregate)
// ═══════════════════════════════════════════════════════════════════════════════
async function pullClarity(token) {
  const url =
    'https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3'
  const data = await httpGetJSON(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  return { projectId: 'w4o6w9aenv', numOfDays: 3, metrics: data }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANE: first-party  (mirror fetch-stats.cjs — GET live stats.php with mq key)
// ═══════════════════════════════════════════════════════════════════════════════
async function pullFirstParty(key) {
  const url = `https://sargasses-martinique.com/stats.php?key=${encodeURIComponent(key)}&days=14`
  const j = await httpGetJSON(url)
  if (!j || j.error) throw new Error('stats.php: ' + ((j && j.error) || 'empty'))
  return j // mirror verbatim: { sessions, screens, clicks, byRegion, ... }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLANE: funnel  (ALWAYS — public Apps Script)
// ═══════════════════════════════════════════════════════════════════════════════
async function pullFunnel() {
  return await httpGetJSON(FUNNEL_URL)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  const pulled = []
  const skipped = []

  const snapshot = {
    schemaVersion: 1,
    generated: envGet('SNAP_TS') || 'unset', // deterministic: caller stamps time
    windowDays: 14,
    freshness: {
      gsc: { ok: false, note: null },
      ga4: { ok: false, note: null },
      clarity: { ok: false, note: null },
      firstParty: { ok: false, note: null },
      funnel: { ok: false, note: null },
    },
    gsc: null,
    ga4: null,
    clarity: null,
    firstParty: null,
    funnel: null,
  }

  // ── GSC + GA4 (gated on GOOGLE_SERVICE_ACCOUNT_JSON) ──────────────────────────
  // Creds Google : variable d'env OU simple fichier google-sa.json déposé à la racine
  // (gitignored). Le chemin le + simple pour le fondateur : déposer le JSON, rien d'autre.
  let saJson = envGet('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!saJson) { try { if (fs.existsSync('google-sa.json')) saJson = fs.readFileSync('google-sa.json', 'utf8') } catch (e) {} }
  if (saJson) {
    let auth = null
    try {
      const { google } = require('googleapis')
      const credentials = JSON.parse(saJson)
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/webmasters.readonly',
          'https://www.googleapis.com/auth/analytics.readonly',
        ],
      })

      // GSC
      try {
        const { google: g } = require('googleapis')
        const sc = g.searchconsole({ version: 'v1', auth })
        snapshot.gsc = await pullGSC(sc, gscWindow())
        snapshot.freshness.gsc.ok = true
        pulled.push('gsc')
      } catch (e) {
        snapshot.freshness.gsc.note = e.message
        skipped.push(`gsc (error: ${e.message})`)
      }

      // GA4
      try {
        const { google: g } = require('googleapis')
        const analyticsdata = g.analyticsdata({ version: 'v1beta', auth })
        const ga4 = await pullGA4(analyticsdata)
        if (ga4.skipped) {
          snapshot.freshness.ga4.note = ga4.note
          skipped.push(`ga4 (${ga4.note})`)
        } else {
          snapshot.ga4 = ga4
          snapshot.freshness.ga4.ok = true
          pulled.push('ga4')
        }
      } catch (e) {
        snapshot.freshness.ga4.note = e.message
        skipped.push(`ga4 (error: ${e.message})`)
      }
    } catch (e) {
      const msg = `GOOGLE_SERVICE_ACCOUNT_JSON failed to parse: ${e.message}`
      snapshot.freshness.gsc.note = msg
      snapshot.freshness.ga4.note = msg
      skipped.push(`gsc (${msg})`)
      skipped.push(`ga4 (${msg})`)
    }
  } else {
    const msg = 'missing GOOGLE_SERVICE_ACCOUNT_JSON'
    snapshot.freshness.gsc.note = msg
    snapshot.freshness.ga4.note = msg
    skipped.push(`gsc (${msg})`)
    skipped.push(`ga4 (${msg})`)
  }

  // ── Clarity (gated on CLARITY_API_TOKEN) ─────────────────────────────────────
  const clarityToken = envGet('CLARITY_API_TOKEN')
  if (clarityToken) {
    try {
      snapshot.clarity = await pullClarity(clarityToken)
      snapshot.freshness.clarity.ok = true
      pulled.push('clarity')
    } catch (e) {
      snapshot.freshness.clarity.note = e.message
      skipped.push(`clarity (error: ${e.message})`)
    }
  } else {
    const msg = 'missing CLARITY_API_TOKEN'
    snapshot.freshness.clarity.note = msg
    skipped.push(`clarity (${msg})`)
  }

  // ── first-party (gated on stats-keys.json mq key) ────────────────────────────
  let statsKey = null
  try {
    const sk = JSON.parse(fs.readFileSync(STATS_KEYS_PATH, 'utf8'))
    statsKey = sk && sk.mq
  } catch (e) {}
  if (statsKey) {
    try {
      snapshot.firstParty = await pullFirstParty(statsKey)
      snapshot.freshness.firstParty.ok = true
      pulled.push('firstParty')
    } catch (e) {
      snapshot.freshness.firstParty.note = e.message
      skipped.push(`firstParty (error: ${e.message})`)
    }
  } else {
    const msg = 'missing stats-keys.json (mq key) — run scripts/tmp-wf-results/fetch-stats.cjs'
    snapshot.freshness.firstParty.note = msg
    skipped.push(`firstParty (${msg})`)
  }

  // ── funnel (ALWAYS) ──────────────────────────────────────────────────────────
  try {
    snapshot.funnel = await pullFunnel()
    snapshot.freshness.funnel.ok = true
    pulled.push('funnel')
  } catch (e) {
    snapshot.freshness.funnel.note = e.message
    skipped.push(`funnel (error: ${e.message})`)
  }

  // ── write merged snapshot ────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true })
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))

  // ── human summary ────────────────────────────────────────────────────────────
  console.log('')
  console.log('═══ pull-all-analytics ═══')
  console.log('PULLED :', pulled.length ? pulled.join(', ') : '(none)')
  console.log('SKIPPED:', skipped.length ? '' : '(none)')
  for (const s of skipped) console.log('   - ' + s)
  console.log('generated:', snapshot.generated)
  console.log('snapshot →', path.relative(ROOT, SNAPSHOT_PATH).replace(/\\/g, '/'))
  if (snapshot.funnel && typeof snapshot.funnel.revenue_real !== 'undefined') {
    console.log('note: funnel.payments_real/revenue_real are KNOWN-MISLEADING — Stripe is revenue truth.')
  }
  console.log('═════════════════════════')
}

main().catch((e) => {
  // Last-resort guard: still should not happen (each plane is try/caught), but
  // never crash the loop. Print and exit 0 so a missing cred is never fatal.
  console.error('pull-all-analytics: unexpected error (non-fatal):', e && e.message)
  process.exit(0)
})
