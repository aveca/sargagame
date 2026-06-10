#!/usr/bin/env node
/**
 * submit-indexnow.cjs — Submit URLs to IndexNow (Bing + Yandex + Seznam)
 *
 * IndexNow is an open protocol accepted by Bing, Yandex, Seznam, and
 * Naver. Hosting /$KEY.txt at domain root proves ownership; then we
 * POST the URL list to the endpoint. Free, no quota documented.
 *
 * Usage:
 *   node scripts/automation/submit-indexnow.cjs            # submits all sitemap URLs
 *   INDEXNOW_URLS_MQ=/plages/x/,/plages/y/ node …         # submits specific relative paths
 *   DRY_RUN=1 node …
 */
'use strict'

const { readFileSync } = require('fs')
const { resolve } = require('path')

const KEY = '57a712687b6d02295a77188ff76da846'
const DRY_RUN = process.env.DRY_RUN === '1'
const ENDPOINT = 'https://api.indexnow.org/indexnow'

// MQ/GP + toutes les nouvelles régions (regions/*.json — la clé est dans public/
// donc servie par chaque build région).
const { getAllRegions } = require('../../regions/index.cjs')
const SITES = [
  { host: 'sargasses-martinique.com', ftp: 'martinique-ftp' },
  { host: 'sargasses-guadeloupe.com', ftp: 'guadeloupe-ftp' },
  ...getAllRegions().filter(r => r.id !== 'mq' && r.id !== 'gp')
    .map(r => ({ host: r.domain, ftp: r.ftpDir })),
]

function extractSitemapUrls(ftpDir) {
  const root = resolve(__dirname, '..', '..', ftpDir)
  const sitemapPath = resolve(root, 'sitemap.xml')
  try {
    const xml = readFileSync(sitemapPath, 'utf-8')
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
    return locs
  } catch (e) {
    console.warn(`  Cannot read ${sitemapPath}: ${e.message}`)
    return []
  }
}

async function submit(site, urls) {
  if (!urls.length) {
    console.log(`  [${site.host}] no URLs to submit`)
    return
  }

  // IndexNow caps payload; chunk at 10_000 per their docs, but 500 is safer.
  const CHUNK = 500
  for (let i = 0; i < urls.length; i += CHUNK) {
    const batch = urls.slice(i, i + CHUNK)
    const body = {
      host: site.host,
      key: KEY,
      keyLocation: `https://${site.host}/${KEY}.txt`,
      urlList: batch,
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN][${site.host}] would POST ${batch.length} URLs (chunk ${i}-${i+batch.length})`)
      console.log(`    e.g. ${batch[0]}`)
      continue
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      })
      // 200 = submitted, 202 = accepted (pending validation), 422 = invalid URL,
      // 429 = rate limited, 403 = key file missing/wrong.
      console.log(`  [${site.host}] POST chunk ${i}-${i+batch.length}: ${res.status} ${res.statusText}`)
      if (res.status >= 400) {
        const text = await res.text().catch(() => '')
        if (text) console.log(`    body: ${text.slice(0, 200)}`)
      }
    } catch (e) {
      console.error(`  [${site.host}] error: ${e.message}`)
    }
  }
}

async function main() {
  console.log(`=== IndexNow submission ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`Key: ${KEY}\n`)

  for (const site of SITES) {
    const urls = extractSitemapUrls(site.ftp)
    console.log(`[${site.host}] ${urls.length} URLs from ${site.ftp}/sitemap.xml`)
    await submit(site, urls)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
