#!/usr/bin/env node
/**
 * SEO Audit — Data collection from GSC, GA4, and CrUX.
 * No site modifications. Produces data/audit-summary.json for downstream scripts.
 *
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_JSON='...' GA4_PROPERTY_ID_MQ=123 GA4_PROPERTY_ID_GP=456 node seo-audit.cjs
 *
 * Sites USD (florida/puntacana/rivieramaya) : pas de GA4_PROPERTY_ID_* — le
 * property id est résolu au runtime via la GA4 Admin API (measurementId match).
 */
const { writeFileSync } = require('fs')
const { resolve } = require('path')
const { getSearchConsole, getAnalyticsData, getAnalyticsAdmin } = require('./lib/google-auth.cjs')
const { SITES, getKnownUrls } = require('./lib/config.cjs')
const { appendLog } = require('./lib/safety.cjs')

const DATA_DIR = resolve(__dirname, 'data')

async function fetchGSCPerformance(searchconsole, siteUrl) {
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)
  try {
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query', 'page', 'device', 'country'],
        rowLimit: 1000,
        dataState: 'all',
      },
    })
    return res.data.rows || []
  } catch (e) {
    console.error(`[GSC perf] ${siteUrl}:`, e.message)
    return []
  }
}

async function fetchGSCIndexStatus(searchconsole, siteUrl, urls) {
  // GSC URL Inspection quota = 200/day/site. 100 leaves margin for retries.
  const MAX_INSPECT = parseInt(process.env.URL_INSPECT_LIMIT || '100', 10)
  const limited = urls.slice(0, MAX_INSPECT)
  if (urls.length > MAX_INSPECT) console.log(`  (limited to ${MAX_INSPECT}/${urls.length} URLs)`)
  const results = []
  for (const url of limited) {
    try {
      const res = await searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: url,
          siteUrl,
        },
      })
      const result = res.data.inspectionResult || {}
      results.push({
        url,
        verdict: result.indexStatusResult?.verdict || 'UNKNOWN',
        pageFetchState: result.indexStatusResult?.pageFetchState || 'UNKNOWN',
        robotsTxtState: result.indexStatusResult?.robotsTxtState || 'UNKNOWN',
        lastCrawlTime: result.indexStatusResult?.lastCrawlTime || null,
        coverageState: result.indexStatusResult?.coverageState || 'UNKNOWN',
      })
    } catch (e) {
      results.push({ url, verdict: 'ERROR', error: e.message })
    }
    // Rate limit: max 600 req/min for URL Inspection
    await new Promise(r => setTimeout(r, 150))
  }
  return results
}

async function fetchGSCSitemaps(searchconsole, siteUrl) {
  try {
    const res = await searchconsole.sitemaps.list({ siteUrl })
    return (res.data.sitemap || []).map(s => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted,
      lastDownloaded: s.lastDownloaded,
      isPending: s.isPending,
      warnings: s.warnings,
      errors: s.errors,
    }))
  } catch (e) {
    console.error(`[GSC sitemaps] ${siteUrl}:`, e.message)
    return []
  }
}

// ── GA4 property id — résolution runtime (sites USD) ─────────
// MQ/GP : property id via env (GA4_PROPERTY_ID_MQ/GP) — chemin historique inchangé.
// Sites USD : le property id numérique n'est stocké nulle part. On le résout via
// la GA4 Admin API : accounts.list → properties.list (filter parent:accounts/N)
// → dataStreams.list, match webStreamData.measurementId === ga4MeasurementId.
// La map measurementId→propertyId est construite UNE fois par run (cache mémoire).
// Échec de résolution = warning + GA4 skippé pour ce site (le GSC tourne quand même).
let _measurementIdMap = null // Map<measurementId, propertyId> | null = pas encore construit

async function buildMeasurementIdMap(admin) {
  const map = new Map()
  let accountsPageToken
  do {
    const accRes = await admin.accounts.list({ pageToken: accountsPageToken })
    for (const account of accRes.data.accounts || []) {
      let propsPageToken
      do {
        const propRes = await admin.properties.list({ filter: `parent:${account.name}`, pageToken: propsPageToken })
        for (const prop of propRes.data.properties || []) {
          let streamsPageToken
          do {
            const streamRes = await admin.properties.dataStreams.list({ parent: prop.name, pageToken: streamsPageToken })
            for (const stream of streamRes.data.dataStreams || []) {
              const mid = stream.webStreamData && stream.webStreamData.measurementId
              if (mid) map.set(mid, prop.name.replace('properties/', ''))
            }
            streamsPageToken = streamRes.data.nextPageToken
          } while (streamsPageToken)
        }
        propsPageToken = propRes.data.nextPageToken
      } while (propsPageToken)
    }
    accountsPageToken = accRes.data.nextPageToken
  } while (accountsPageToken)
  return map
}

async function resolveGa4PropertyId(site) {
  if (site.ga4PropertyId) return site.ga4PropertyId // env (MQ/GP) — pas d'appel Admin API
  if (!site.ga4MeasurementId) return ''
  if (_measurementIdMap === null) {
    try {
      const admin = getAnalyticsAdmin()
      _measurementIdMap = admin ? await buildMeasurementIdMap(admin) : new Map()
    } catch (e) {
      console.warn(`  [GA4 admin] property id resolution failed: ${e.message}`)
      _measurementIdMap = new Map()
    }
  }
  const propertyId = _measurementIdMap.get(site.ga4MeasurementId) || ''
  if (!propertyId) {
    console.warn(`  [GA4] no property matches ${site.ga4MeasurementId} (${site.domain}) — skipping GA4, GSC still runs`)
  }
  return propertyId
}

async function fetchGA4Report(analyticsdata, propertyId) {
  if (!propertyId) return []
  try {
    const res = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        dimensions: [
          { name: 'pagePath' },
          { name: 'deviceCategory' },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'screenPageViews' },
          { name: 'engagedSessions' },
        ],
        limit: 500,
      },
    })
    return (res.data.rows || []).map(row => ({
      pagePath: row.dimensionValues[0].value,
      device: row.dimensionValues[1].value,
      sessions: parseInt(row.metricValues[0].value) || 0,
      bounceRate: parseFloat(row.metricValues[1].value) || 0,
      avgDuration: parseFloat(row.metricValues[2].value) || 0,
      pageViews: parseInt(row.metricValues[3].value) || 0,
      engagedSessions: parseInt(row.metricValues[4].value) || 0,
    }))
  } catch (e) {
    console.error(`[GA4] Property ${propertyId}:`, e.message)
    return []
  }
}

async function fetchClarityEvents(analyticsdata, propertyId) {
  if (!propertyId) return []
  try {
    const res = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        dimensions: [
          { name: 'eventName' },
          { name: 'pagePath' },
        ],
        metrics: [
          { name: 'eventCount' },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { matchType: 'BEGINS_WITH', value: 'clarity_' },
          },
        },
        limit: 200,
      },
    })
    return (res.data.rows || []).map(row => ({
      event: row.dimensionValues[0].value,
      page: row.dimensionValues[1]?.value || '',
      target: '',
      count: parseInt(row.metricValues[0].value) || 0,
    }))
  } catch (e) {
    console.warn(`[GA4 Clarity events] Property ${propertyId}:`, e.message)
    return []
  }
}

async function fetchCrUX(domain) {
  const CRUX_API_KEY = process.env.CRUX_API_KEY || ''
  // The CrUX API 403s without a key for normal usage → without it we're blind on CWV.
  // Free key (4 clicks): https://developer.chrome.com/docs/crux/api#crux-api-key
  if (!CRUX_API_KEY) {
    console.warn(`[CrUX] ${domain}: CRUX_API_KEY missing → skipping (set it as a repo secret).`)
    return null
  }
  const url = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_API_KEY}`
  async function query(body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, status: res.status, text: await res.text() }
    return { ok: true, data: await res.json() }
  }
  // Objectif = CWV MOBILE → on demande PHONE en priorité, fallback toutes-plateformes
  // si l'origine n'a pas assez de trafic mobile (CrUX renvoie 404 pour ce form-factor).
  const num = v => (v == null ? null : Number(v)) // CrUX renvoie CLS en STRING ("0.08")
  try {
    let r = await query({ origin: `https://${domain}`, formFactor: 'PHONE' })
    let formFactor = 'PHONE'
    if (!r.ok && r.status === 404) {
      r = await query({ origin: `https://${domain}` })
      formFactor = 'ALL'
    }
    if (!r.ok) {
      console.warn(`[CrUX] ${domain}: ${r.status} — ${String(r.text).slice(0, 200)}`)
      return null
    }
    const metrics = r.data.record?.metrics || {}
    const p75 = m => num(m?.percentiles?.p75) // ?? not || : a real 0 (perfect CLS) is valid
    return {
      formFactor,
      lcp: p75(metrics.largest_contentful_paint),
      inp: p75(metrics.interaction_to_next_paint),
      cls: p75(metrics.cumulative_layout_shift),
      ttfb: p75(metrics.experimental_time_to_first_byte),
    }
  } catch (e) {
    console.warn(`[CrUX] ${domain}:`, e.message)
    return null
  }
}

async function main() {
  console.log('=== SEO Audit — Data Collection ===\n')

  const searchconsole = getSearchConsole()
  const analyticsdata = getAnalyticsData()

  if (!searchconsole) {
    console.error('No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON env var.')
    process.exit(1)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    sites: {},
  }

  for (const [key, site] of Object.entries(SITES)) {
    console.log(`\n--- ${site.domain} ---`)

    // GSC Performance
    console.log('  Fetching GSC performance data...')
    const performance = await fetchGSCPerformance(searchconsole, site.siteUrl)
    console.log(`  → ${performance.length} rows`)

    // GSC Index Status
    const knownUrls = getKnownUrls(key)
    console.log(`  Inspecting ${knownUrls.length} URLs for indexation...`)
    const indexStatus = await fetchGSCIndexStatus(searchconsole, site.siteUrl, knownUrls)
    const indexed = indexStatus.filter(u => u.verdict === 'PASS').length
    const notIndexed = indexStatus.filter(u => u.verdict !== 'PASS' && u.verdict !== 'ERROR')
    console.log(`  → ${indexed}/${knownUrls.length} indexed`)

    // GSC Sitemaps
    console.log('  Checking sitemaps...')
    const sitemaps = await fetchGSCSitemaps(searchconsole, site.siteUrl)
    console.log(`  → ${sitemaps.length} sitemaps found`)

    // GA4 — property id depuis l'env (MQ/GP) ou résolu via l'Admin API (sites USD)
    const ga4PropertyId = await resolveGa4PropertyId(site)
    console.log('  Fetching GA4 report...')
    const ga4 = await fetchGA4Report(analyticsdata, ga4PropertyId)
    console.log(`  → ${ga4.length} rows`)

    // Clarity events (rage clicks, dead clicks, quick bounces)
    console.log('  Fetching Clarity events from GA4...')
    const clarityEvents = await fetchClarityEvents(analyticsdata, ga4PropertyId)
    console.log(`  → ${clarityEvents.length} Clarity events`)

    // CrUX
    console.log('  Fetching CrUX data...')
    const crux = await fetchCrUX(site.domain)
    if (crux) console.log(`  → LCP: ${crux.lcp}ms, INP: ${crux.inp}ms, CLS: ${crux.cls}`)
    else console.log('  → No CrUX data available yet')

    // Analyze findings
    const findings = {
      notIndexed: indexStatus.filter(u => u.verdict === 'FAIL' || u.verdict === 'PARTIAL'),
      softErrors: indexStatus.filter(u => ['SOFT_404', 'NOT_FOUND'].includes(u.pageFetchState)),
      lowCtrPages: [],
      highBouncePages: [],
      cwvIssues: [],
      rageClicks: clarityEvents.filter(e => e.event === 'clarity_rage_click'),
      deadClicks: clarityEvents.filter(e => e.event === 'clarity_dead_click'),
      quickBounces: clarityEvents.filter(e => e.event === 'clarity_quick_bounce'),
    }

    // Identify low CTR pages (position < 10 but CTR below expected)
    const expectedCtr = { 1: 0.28, 2: 0.17, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.05, 7: 0.04, 8: 0.03, 9: 0.025, 10: 0.02 }
    const pageMetrics = {}
    for (const row of performance) {
      const page = row.keys[1]
      if (!pageMetrics[page]) pageMetrics[page] = { clicks: 0, impressions: 0, position: 0, count: 0, topQueries: [] }
      pageMetrics[page].clicks += row.clicks
      pageMetrics[page].impressions += row.impressions
      pageMetrics[page].position += row.position
      pageMetrics[page].count++
      pageMetrics[page].topQueries.push({ query: row.keys[0], impressions: row.impressions, clicks: row.clicks, position: row.position })
    }
    for (const [page, m] of Object.entries(pageMetrics)) {
      const avgPos = Math.round(m.position / m.count)
      const actualCtr = m.impressions > 0 ? m.clicks / m.impressions : 0
      const expected = expectedCtr[Math.min(avgPos, 10)] || 0.02
      if (avgPos <= 10 && actualCtr < expected * 0.7 && m.impressions > 20) {
        m.topQueries.sort((a, b) => b.impressions - a.impressions)
        findings.lowCtrPages.push({
          page,
          avgPosition: avgPos,
          actualCtr: Math.round(actualCtr * 10000) / 100,
          expectedCtr: Math.round(expected * 100),
          impressions: m.impressions,
          clicks: m.clicks,
          topQueries: m.topQueries.slice(0, 5),
        })
      }
    }

    // Identify high bounce rate pages from GA4
    for (const row of ga4) {
      if (row.sessions >= 10 && row.bounceRate > 0.7) {
        findings.highBouncePages.push({
          pagePath: row.pagePath,
          device: row.device,
          sessions: row.sessions,
          bounceRate: Math.round(row.bounceRate * 100),
          avgDuration: Math.round(row.avgDuration),
        })
      }
    }

    // CWV issues
    if (crux) {
      if (crux.lcp && crux.lcp > 2500) findings.cwvIssues.push({ metric: 'LCP', value: crux.lcp, threshold: 2500 })
      if (crux.inp && crux.inp > 200) findings.cwvIssues.push({ metric: 'INP', value: crux.inp, threshold: 200 })
      if (crux.cls && crux.cls > 0.1) findings.cwvIssues.push({ metric: 'CLS', value: crux.cls, threshold: 0.1 })
    }

    summary.sites[key] = {
      domain: site.domain,
      performance: pageMetrics,
      indexStatus,
      sitemaps,
      ga4,
      crux,
      findings,
    }
  }

  // Write full audit data
  const auditPath = resolve(DATA_DIR, 'audit-full.json')
  writeFileSync(auditPath, JSON.stringify(summary, null, 2))
  console.log(`\n→ Full audit saved to ${auditPath}`)

  // Write summary for downstream scripts
  const summaryPath = resolve(DATA_DIR, 'audit-summary.json')
  const condensed = {
    generatedAt: summary.generatedAt,
    sites: {},
  }
  for (const [key, data] of Object.entries(summary.sites)) {
    condensed.sites[key] = {
      domain: data.domain,
      indexedCount: data.indexStatus.filter(u => u.verdict === 'PASS').length,
      totalUrls: data.indexStatus.length,
      findings: data.findings,
      crux: data.crux,
      sitemapStatus: data.sitemaps,
    }
  }
  writeFileSync(summaryPath, JSON.stringify(condensed, null, 2))
  console.log(`→ Summary saved to ${summaryPath}`)

  // Log
  appendLog({
    script: 'seo-audit',
    action: 'data-collection',
    results: Object.fromEntries(
      Object.entries(condensed.sites).map(([k, v]) => [k, {
        indexed: v.indexedCount,
        total: v.totalUrls,
        notIndexed: v.findings.notIndexed.length,
        lowCtr: v.findings.lowCtrPages.length,
        highBounce: v.findings.highBouncePages.length,
        cwvIssues: v.findings.cwvIssues.length,
      }])
    ),
  })

  console.log('\n=== Audit complete ===')
}

main().catch(e => { console.error(e); process.exit(1) })
