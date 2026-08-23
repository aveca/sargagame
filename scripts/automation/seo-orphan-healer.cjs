#!/usr/bin/env node
/**
 * SEO Orphan Healer — Inject internal links into donor pages to fix orphans.
 *
 * Reads orphan-pages.json + link-graph.json and picks:
 *   - DONORS: top high-authority pages (homepage, carte, previsions, plages)
 *   - TARGETS: structural orphans + editorial/beach pages with no GSC traffic
 *
 * Then appends a hidden-but-crawlable <nav class="related-links"> block
 * before </body> in each donor's HTML in *-ftp/. The block is wrapped in
 * a <!-- SEO-ORPHAN-HEAL --> ... <!-- /SEO-ORPHAN-HEAL --> marker so
 * subsequent runs replace cleanly instead of stacking duplicate blocks.
 *
 * Why post-build instead of editorial source: the source content is
 * editorialized prose that should not be auto-mutated. Donor pages get
 * a clearly-labeled "Pages associées" footer that crawlers see but users
 * mostly skim past — same trick newspapers use for related-articles rails.
 *
 * Output: data/orphan-healer.json (audit trail of injections)
 *
 * Usage: node scripts/automation/seo-orphan-healer.cjs
 */
const { readFileSync, writeFileSync, existsSync, statSync } = require('fs')
const { resolve, join } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const DATA_DIR = resolve(__dirname, 'data')
const ORPHAN_PATH = resolve(DATA_DIR, 'orphan-pages.json')
const LINK_GRAPH_PATH = resolve(DATA_DIR, 'link-graph.json')
const OUT_PATH = resolve(DATA_DIR, 'orphan-healer.json')

const MARKER_OPEN = '<!-- SEO-ORPHAN-HEAL -->'
const MARKER_CLOSE = '<!-- /SEO-ORPHAN-HEAL -->'
const MAX_LINKS_PER_BLOCK = 8
const MAX_DONORS_PER_SITE = 5

const SITES = [
  { key: 'mq', dir: 'martinique-ftp', domain: 'sargasses-martinique.com' },
  { key: 'gp', dir: 'guadeloupe-ftp', domain: 'sargasses-guadeloupe.com' },
]

// Donor candidates ordered by intent — homepage first, then deep-funnel
// pages. We pick the first MAX_DONORS_PER_SITE that exist on disk.
const DONOR_CANDIDATES = [
  '/',
  '/plages/',
  '/carte-sargasses/',
  '/previsions/',
  '/conditions/',
  '/alertes/',
  '/comprendre-sargasses/',
]

function loadJson(path) {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf-8')) }
  catch { return null }
}

function pathToFile(sitePath, ftpRoot) {
  const clean = sitePath.replace(/^\/+/, '').replace(/\/+$/, '')
  if (clean === '') return join(ftpRoot, 'index.html')
  return join(ftpRoot, clean, 'index.html')
}

// Pretty anchor text from a URL path. /comprendre-sargasses/ → "Comprendre sargasses"
function anchorText(urlPath) {
  const last = urlPath.replace(/^\/+/, '').replace(/\/+$/, '').split('/').pop() || ''
  if (!last) return urlPath
  return last
    .split('-')
    .filter(s => s && !/^\d+$/.test(s))
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

function buildHealBlock(targets, siteLabel) {
  const items = targets.slice(0, MAX_LINKS_PER_BLOCK).map(t => {
    const txt = anchorText(t.url)
    return `<li><a href="${t.url}">${txt}</a></li>`
  }).join('')
  // The block is plain HTML (not noscript) so the SPA shell doesn't hide
  // it — but it's positioned inside a <nav> with aria-label that screen
  // readers + crawlers parse and average users ignore.
  return `${MARKER_OPEN}\n<nav class="related-links" aria-label="Pages associées ${siteLabel}" style="margin:2rem 1rem;font-size:0.85rem;color:#94a3b8;"><h2 style="font-size:0.9rem;margin:0 0 0.5rem;">Pages associées</h2><ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:0.75rem 1.25rem;">${items}</ul></nav>\n${MARKER_CLOSE}`
}

function injectInto(filePath, block) {
  if (!existsSync(filePath)) return false
  let html = readFileSync(filePath, 'utf-8')
  // Replace existing marker block if present, otherwise insert before </body>
  const re = new RegExp(`${MARKER_OPEN}[\\s\\S]*?${MARKER_CLOSE}`)
  if (re.test(html)) {
    html = html.replace(re, block)
  } else if (html.includes('</body>')) {
    html = html.replace('</body>', `${block}\n</body>`)
  } else {
    return false
  }
  writeFileSync(filePath, html)
  return true
}

function pickTargetsForSite(siteKey, orphanReport, linkGraph) {
  const orphanData = orphanReport?.sites?.[siteKey]
  const graphData = linkGraph?.sites?.[siteKey]
  const targets = []
  const seen = new Set()
  // 1) Editorials with no GSC impressions (orphan detector)
  if (orphanData?.orphans) {
    for (const o of orphanData.orphans) {
      if (o.kind !== 'editorial') continue
      const path = o.url.replace(/^https?:\/\/[^/]+/, '')
      if (seen.has(path)) continue
      seen.add(path)
      targets.push({ url: path, source: 'orphan-editorial' })
    }
  }
  // 2) Structural orphans from link graph (no incoming internal links)
  if (graphData?.noIncoming) {
    for (const p of graphData.noIncoming) {
      // Skip 404 page, archived dated articles, and any path we already have
      if (p.url === '/404.html') continue
      if (p.url.startsWith('/articles/')) continue
      if (seen.has(p.url)) continue
      seen.add(p.url)
      targets.push({ url: p.url, source: 'structural-orphan' })
    }
  }
  return targets
}

function processSite(site, orphanReport, linkGraph) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found` }

  const targets = pickTargetsForSite(site.key, orphanReport, linkGraph)
  if (targets.length === 0) {
    return { donorCount: 0, targetCount: 0, injections: [] }
  }

  const donors = []
  for (const candidate of DONOR_CANDIDATES) {
    if (donors.length >= MAX_DONORS_PER_SITE) break
    const file = pathToFile(candidate, ftpRoot)
    if (existsSync(file)) donors.push({ urlPath: candidate, file })
  }

  const block = buildHealBlock(targets, site.key.toUpperCase())
  const injections = []
  for (const donor of donors) {
    const ok = injectInto(donor.file, block)
    if (ok) injections.push({ donor: donor.urlPath, targetCount: targets.slice(0, MAX_LINKS_PER_BLOCK).length })
  }

  return {
    donorCount: donors.length,
    targetCount: targets.length,
    injections,
    targets: targets.slice(0, MAX_LINKS_PER_BLOCK).map(t => t.url),
  }
}

function main() {
  console.log('=== SEO Orphan Healer ===\n')
  const orphanReport = loadJson(ORPHAN_PATH)
  const linkGraph = loadJson(LINK_GRAPH_PATH)
  if (!orphanReport && !linkGraph) {
    console.error('Need orphan-pages.json and/or link-graph.json — run those first.')
    process.exit(1)
  }

  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalInjections = 0

  for (const site of SITES) {
    const result = processSite(site, orphanReport, linkGraph)
    report.sites[site.key] = result
    if (result.error) {
      console.warn(`[${site.key}] ${result.error}`)
      continue
    }
    totalInjections += result.injections.length
    console.log(`[${site.key}] donors=${result.donorCount}  targets=${result.targetCount}  injected=${result.injections.length}`)
    for (const inj of result.injections) {
      console.log(`        → ${inj.donor}  (+${inj.targetCount} links)`)
    }
    if (result.targets && result.targets.length > 0) {
      console.log(`        targeted orphans:`)
      for (const t of result.targets.slice(0, 5)) console.log(`          ${t}`)
      if (result.targets.length > 5) console.log(`          ... +${result.targets.length - 5} more`)
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total donor pages updated: ${totalInjections}`)

  appendLog({
    script: 'seo-orphan-healer',
    action: 'inject',
    sites: Object.keys(report.sites).length,
    totalInjections,
  })
}

main()
