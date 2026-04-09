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

  const allUrls = []

  for (const [key, site] of Object.entries(SITES)) {
    const sitemapPath = resolve(DIST_DIR, `sitemap-${key === 'mq' ? 'martinique' : 'guadeloupe'}.xml`)
    if (!existsSync(sitemapPath)) {
      console.warn(`  Sitemap not found: ${sitemapPath}`)
      continue
    }
    const xml = readFileSync(sitemapPath, 'utf-8')
    const urls = parseSitemap(xml)
    console.log(`${site.domain}: ${urls.length} URLs in sitemap`)
    allUrls.push(...urls)
  }

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
