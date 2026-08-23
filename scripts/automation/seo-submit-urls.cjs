#!/usr/bin/env node
/**
 * SEO Submit URLs — Submit new/updated URLs to Google Indexing API.
 * Reads sitemaps from dist/, compares with last submission log,
 * submits changed URLs. Respects 200 URLs/day quota.
 *
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_JSON='...' node seo-submit-urls.cjs
 */
const { readFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { getIndexing, getSearchConsole } = require('./lib/google-auth.cjs')
const { SITES } = require('./lib/config.cjs')
const { DRY_RUN, LIMITS, readLog, appendLog } = require('./lib/safety.cjs')

const DIST_DIR = resolve(__dirname, '..', '..', 'dist')
const AUDIT_PATH = resolve(__dirname, 'data', 'audit-full.json')

// Build a Set of URLs the most recent audit reported as not-indexed.
// These are the ones that actually need a nudge — submitting URLs that are
// already PASS just wastes the daily quota.
function loadNotIndexedFromAudit() {
  if (!existsSync(AUDIT_PATH)) return new Set()
  try {
    const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'))
    const NOT_INDEXED_STATES = new Set([
      'Discovered - currently not indexed',
      'Crawled - currently not indexed',
      'URL is unknown to Google',
    ])
    const set = new Set()
    for (const site of Object.values(audit.sites || {})) {
      for (const r of site.indexStatus || []) {
        if (NOT_INDEXED_STATES.has(r.coverageState)) set.add(r.url)
      }
    }
    return set
  } catch (e) {
    console.warn(`audit-full.json read failed: ${e.message}`)
    return new Set()
  }
}

function parseSitemap(xmlContent) {
  const urls = []
  const regex = /<loc>([^<]+)<\/loc>/g
  let match
  while ((match = regex.exec(xmlContent)) !== null) {
    urls.push(match[1])
  }
  return urls
}

function getRecentSubmissions() {
  const log = readLog()
  const oneDayAgo = Date.now() - 86400000
  let count = 0
  const submitted = new Set()
  for (const run of log.runs) {
    if (run.script === 'seo-submit-urls' && new Date(run.timestamp).getTime() > oneDayAgo) {
      count += run.urlsSubmitted || 0
      for (const url of (run.urls || [])) {
        submitted.add(url)
      }
    }
  }
  return { dailyCount: count, recentlySubmitted: submitted }
}

async function main() {
  console.log(`=== SEO Submit URLs ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  const indexing = getIndexing()
  if (!indexing) {
    console.error('No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON env var.')
    process.exit(1)
  }

  // Submit sitemaps to GSC (idempotent — Google ignores if already submitted)
  const sc = getSearchConsole()
  if (sc) {
    for (const [key, site] of Object.entries(SITES)) {
      // Sites USD : sitemap déjà soumis par provision-gsc.cjs sur la propriété
      // URL-prefix (`https://<domain>/`) — le format siteUrl ci-dessous ne matche pas.
      if (site.regionConfig) continue
      try {
        await sc.sitemaps.submit({
          siteUrl: `https://${site.domain}`,
          feedpath: `https://${site.domain}/sitemap.xml`,
        })
        console.log(`GSC sitemap submitted: ${site.domain}/sitemap.xml`)
      } catch (e) {
        console.log(`GSC sitemap submit ${site.domain}: ${e.message}`)
      }
    }
    console.log()
  }

  const { dailyCount, recentlySubmitted } = getRecentSubmissions()
  const remaining = LIMITS.MAX_URL_SUBMISSIONS_PER_DAY - dailyCount
  console.log(`Daily quota: ${dailyCount}/${LIMITS.MAX_URL_SUBMISSIONS_PER_DAY} used, ${remaining} remaining\n`)

  if (remaining <= 0) {
    console.log('Daily quota exhausted. Skipping.')
    return
  }

  // Tier 1: URLs the audit just reported as not-indexed (highest signal — Google
  // already knows about them but isn't indexing → a publish nudge is exactly the
  // intended use case)
  // Tier 2: editorial/strategic pages by slug (priority before they're audited)
  // Tier 3: everything else from the sitemap
  const auditNotIndexed = loadNotIndexedFromAudit()
  console.log(`Audit reports ${auditNotIndexed.size} URLs not indexed (tier 1)\n`)

  const auditUrls = []
  const priorityUrls = []
  const normalUrls = []

  // Editorial/strategic pages to submit FIRST (before beach pages eat the quota)
  const PRIORITY_SLUGS = [
    'comprendre-sargasses', 'bilan-sargasses-2025', 'detection-satellite-sargasses',
    'previsions-methode', 'nettoyer-sargasses', 'sargasses-record-2026',
    'understanding-sargassum', 'satellite-sargassum-detection',
    'carte-sargasses', 'previsions', 'alertes', 'saison-sargasses',
    'plages-sans-sargasses', 'danger-sargasses-h2s',
  ]

  for (const [key, site] of Object.entries(SITES)) {
    // Sites USD : pas de sitemap-<region>.xml dans ce dist/ (builds séparés par
    // région) — sans ce skip, le mapping mq/gp ci-dessous relirait le sitemap GP
    // et resoumettrait ses URLs en double (gaspillage du quota Indexing API).
    if (site.regionConfig) continue
    const sitemapPath = resolve(DIST_DIR, `sitemap-${key === 'mq' ? 'martinique' : 'guadeloupe'}.xml`)
    if (!existsSync(sitemapPath)) {
      console.warn(`  Sitemap not found: ${sitemapPath}`)
      continue
    }
    const xml = readFileSync(sitemapPath, 'utf-8')
    const urls = parseSitemap(xml)
    console.log(`${site.domain}: ${urls.length} URLs in sitemap`)
    for (const url of urls) {
      if (auditNotIndexed.has(url)) {
        auditUrls.push(url)
      } else if (PRIORITY_SLUGS.some(s => url.includes(`/${s}`))) {
        priorityUrls.push(url)
      } else {
        normalUrls.push(url)
      }
    }
  }

  // Audit-driven first (proven gap), then editorial slug priority, then rest
  const allUrls = [...auditUrls, ...priorityUrls, ...normalUrls]
  console.log(`Audit-not-indexed: ${auditUrls.length}, Priority slugs: ${priorityUrls.length}, Normal: ${normalUrls.length}`)

  // Filter out recently submitted URLs
  const toSubmit = allUrls.filter(u => !recentlySubmitted.has(u)).slice(0, remaining)
  console.log(`\n${toSubmit.length} URLs to submit (${allUrls.length - toSubmit.length} already submitted recently)\n`)

  if (toSubmit.length === 0) {
    console.log('Nothing to submit.')
    appendLog({ script: 'seo-submit-urls', action: 'no-changes', urlsSubmitted: 0 })
    return
  }

  let submitted = 0
  let errors = 0

  for (const url of toSubmit) {
    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would submit: ${url}`)
      submitted++
      continue
    }

    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url,
          type: 'URL_UPDATED',
        },
      })
      console.log(`  ✓ ${url}`)
      submitted++
    } catch (e) {
      console.error(`  ✗ ${url}: ${e.message}`)
      errors++
    }

    // Rate limit: be gentle
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\n✓ Submitted: ${submitted}, Errors: ${errors}`)

  appendLog({
    script: 'seo-submit-urls',
    action: DRY_RUN ? 'dry-run' : 'urls-submitted',
    urlsSubmitted: submitted,
    errors,
    urls: toSubmit.slice(0, 50), // Log up to 50 URLs to keep log manageable
  })
}

main().catch(e => { console.error(e); process.exit(1) })
