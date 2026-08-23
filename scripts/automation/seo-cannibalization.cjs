#!/usr/bin/env node
/**
 * SEO Keyword Cannibalization Detector — Find queries where multiple
 * pages compete and split the traffic.
 *
 * Cannibalization = Google can't decide which of YOUR pages best matches
 * a query, so it splits impressions across them and ranks every variant
 * weakly. The fix: pick a winner, redirect or noindex the others, and
 * focus all internal links on the winner.
 *
 * This script reads audit-full.json's per-page topQueries and inverts
 * the mapping: for each query, list the pages that received impressions.
 * Reports queries with 2+ competing pages.
 *
 * Output: data/cannibalization.json
 *
 * Usage: node scripts/automation/seo-cannibalization.cjs
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const AUDIT_PATH = resolve(__dirname, 'data', 'audit-full.json')
const OUT_PATH = resolve(__dirname, 'data', 'cannibalization.json')

const MIN_QUERY_IMPRESSIONS = 50  // ignore long-tail noise
const MIN_PAGE_SHARE = 0.1         // a page only counts as a competitor if it owns >=10% of query impressions

function detectSite(siteData) {
  const perf = siteData.performance || {}
  // queryMap: { query: [{ url, impressions, clicks }] }
  const queryMap = new Map()
  for (const [url, m] of Object.entries(perf)) {
    if (!m?.topQueries) continue
    for (const q of m.topQueries) {
      const key = q.query.toLowerCase().trim()
      if (!queryMap.has(key)) queryMap.set(key, [])
      queryMap.get(key).push({ url, impressions: q.impressions, clicks: q.clicks })
    }
  }

  // Aggregate same-page entries (GSC sometimes splits a query into multiple
  // rows — country/device facets), then compute per-page share.
  const cannibalized = []
  for (const [query, pages] of queryMap.entries()) {
    const byUrl = new Map()
    for (const p of pages) {
      const cur = byUrl.get(p.url) || { impressions: 0, clicks: 0 }
      cur.impressions += p.impressions
      cur.clicks += p.clicks
      byUrl.set(p.url, cur)
    }
    const totalImpressions = [...byUrl.values()].reduce((a, p) => a + p.impressions, 0)
    if (totalImpressions < MIN_QUERY_IMPRESSIONS) continue
    const competitors = [...byUrl.entries()]
      .map(([url, p]) => ({ url, ...p, share: p.impressions / totalImpressions }))
      .filter(p => p.share >= MIN_PAGE_SHARE)
      .sort((a, b) => b.impressions - a.impressions)
    if (competitors.length >= 2) {
      cannibalized.push({
        query,
        totalImpressions,
        totalClicks: [...byUrl.values()].reduce((a, p) => a + p.clicks, 0),
        competitorCount: competitors.length,
        competitors,
      })
    }
  }

  cannibalized.sort((a, b) => b.totalImpressions - a.totalImpressions)
  return {
    queryCount: queryMap.size,
    cannibalizedCount: cannibalized.length,
    cannibalized: cannibalized.slice(0, 30),
  }
}

function main() {
  console.log('=== SEO Cannibalization ===\n')
  if (!existsSync(AUDIT_PATH)) {
    console.error('audit-full.json missing — run seo-audit.cjs first')
    process.exit(1)
  }
  const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'))
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalCanni = 0

  for (const [siteKey, siteData] of Object.entries(audit.sites || {})) {
    const r = detectSite(siteData)
    report.sites[siteKey] = r
    totalCanni += r.cannibalizedCount
    console.log(`[${siteKey}] queries=${r.queryCount}  cannibalized=${r.cannibalizedCount}`)
    if (r.cannibalized.length > 0) {
      console.log(`        top conflicts:`)
      for (const c of r.cannibalized.slice(0, 5)) {
        console.log(`          "${c.query}" (${c.totalImpressions} impr, ${c.competitorCount} competitors)`)
        for (const cmp of c.competitors.slice(0, 3)) {
          const short = cmp.url.replace(/^https?:\/\/[^/]+/, '')
          console.log(`            ${short.padEnd(40)} ${cmp.impressions} impr (${(cmp.share * 100).toFixed(0)}%)`)
        }
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total cannibalized queries: ${totalCanni}`)

  appendLog({
    script: 'seo-cannibalization',
    action: 'detect',
    sites: Object.keys(report.sites).length,
    totalCanni,
  })
}

main()
