#!/usr/bin/env node
/**
 * SEO Sitemap Completeness Checker — Cross-reference sitemap vs disk.
 *
 * Walks built FTP folders and compares the set of generated HTML pages
 * against the sitemap-{martinique,guadeloupe}.xml URLs:
 *   - Pages on disk MISSING from sitemap (Google can't crawl them efficiently)
 *   - Sitemap URLs MISSING from disk (Google fetches → 404 → trust loss)
 *   - Sitemap URLs with wrong domain (cross-domain sitemap pollution)
 *
 * Output: data/sitemap-check.json
 *
 * Usage: node scripts/automation/seo-sitemap-check.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep, join } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'sitemap-check.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp', domain: 'sargasses-martinique.com', sitemap: 'sitemap-martinique.xml' },
  { key: 'gp', dir: 'guadeloupe-ftp', domain: 'sargasses-guadeloupe.com', sitemap: 'sitemap-guadeloupe.xml' },
]
const KNOWN_DOMAINS = new Set(SITES.map(s => s.domain))

const SKIP_DIRS = new Set(['assets', 'icons', 'images', 'data', 'api'])

// Pages we don't want in the sitemap even if present on disk.
const SITEMAP_EXCLUDE = new Set([
  '/404.html',
  '/LISEZMOI-FTP.txt',
])

const NOINDEX_RE = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i
const CANONICAL_RE = /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i
const HEAD_BYTES = 8 * 1024

function readHead(file) {
  try { return readFileSync(file, 'utf-8').slice(0, HEAD_BYTES) }
  catch { return '' }
}

function isNoindex(file) {
  return NOINDEX_RE.test(readHead(file))
}

// Pages whose canonical points to a different domain are intentionally
// off-sitemap here (they belong on the partner island's sitemap).
function canonicalHostOf(file) {
  const m = readHead(file).match(CANONICAL_RE)
  if (!m) return null
  try { return new URL(m[1]).hostname }
  catch { return null }
}

function walkHtml(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = resolve(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walkHtml(full))
    else if (entry.endsWith('.html')) out.push(full)
  }
  return out
}

function fileToUrlPath(file, ftpRoot) {
  let rel = relative(ftpRoot, file).split(sep).join('/')
  if (rel === 'index.html') return '/'
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length)
  return '/' + rel
}

function parseSitemapUrls(xml) {
  const urls = []
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1].trim())
  return urls
}

function pathToFile(sitePath, ftpRoot) {
  const clean = sitePath.replace(/^\/+/, '').replace(/\/+$/, '')
  if (clean === '') return join(ftpRoot, 'index.html')
  if (/\.html$/i.test(clean)) return join(ftpRoot, clean)
  return join(ftpRoot, clean, 'index.html')
}

function checkSite(site) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found` }

  const sitemapPath = resolve(ftpRoot, site.sitemap)
  if (!existsSync(sitemapPath)) return { error: `${site.sitemap} not found in ${site.dir}` }

  const sitemapUrls = parseSitemapUrls(readFileSync(sitemapPath, 'utf-8'))
  const onDiskFiles = walkHtml(ftpRoot)
  // Filter out pages that don't belong in this site's sitemap:
  //   - noindex pages (Google is told to skip them)
  //   - pages whose canonical points to a known partner domain (cross-island
  //     mirrors kept on disk as redirect fallbacks)
  const indexableFiles = onDiskFiles.filter(f => {
    if (isNoindex(f)) return false
    const ch = canonicalHostOf(f)
    if (ch && KNOWN_DOMAINS.has(ch) && ch !== site.domain) return false
    return true
  })
  const onDiskPaths = new Set(
    indexableFiles
      .map(f => fileToUrlPath(f, ftpRoot))
      .filter(p => !SITEMAP_EXCLUDE.has(p))
  )

  // Sitemap URLs split into own-domain and cross-domain
  const ownPaths = new Set()
  const crossDomain = []
  for (const url of sitemapUrls) {
    try {
      const u = new URL(url)
      if (u.hostname === site.domain) {
        ownPaths.add(u.pathname)
      } else {
        crossDomain.push(url)
      }
    } catch {
      crossDomain.push(url)
    }
  }

  // 1) Sitemap → disk (URLs that 404)
  const sitemapUrls404 = []
  for (const path of ownPaths) {
    const target = pathToFile(path, ftpRoot)
    if (!existsSync(target)) sitemapUrls404.push(path)
  }

  // 2) Disk → sitemap (pages not advertised)
  const diskMissing = []
  for (const path of onDiskPaths) {
    // Be tolerant of trailing slash variation
    if (!ownPaths.has(path) && !ownPaths.has(path.replace(/\/$/, '')) && !ownPaths.has(path + '/')) {
      diskMissing.push(path)
    }
  }

  return {
    sitemapSize: sitemapUrls.length,
    ownDomainCount: ownPaths.size,
    crossDomainCount: crossDomain.length,
    diskCount: onDiskPaths.size,
    sitemapUrls404Count: sitemapUrls404.length,
    diskMissingCount: diskMissing.length,
    sitemapUrls404: sitemapUrls404.slice(0, 30),
    diskMissing: diskMissing.slice(0, 30),
    crossDomainSample: crossDomain.slice(0, 10),
  }
}

function main() {
  console.log('=== SEO Sitemap Check ===\n')
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let total404 = 0
  let totalMissing = 0

  for (const site of SITES) {
    const r = checkSite(site)
    report.sites[site.key] = r
    if (r.error) { console.warn(`[${site.key}] ${r.error}`); continue }
    total404 += r.sitemapUrls404Count
    totalMissing += r.diskMissingCount
    console.log(`[${site.key}] sitemap=${r.sitemapSize}  ownDomain=${r.ownDomainCount}  disk=${r.diskCount}  404=${r.sitemapUrls404Count}  missing=${r.diskMissingCount}`)
    if (r.crossDomainCount > 0) console.log(`        ⚠ ${r.crossDomainCount} cross-domain URLs in sitemap`)
    if (r.sitemapUrls404.length > 0) {
      console.log(`        sitemap → 404 (top 5):`)
      for (const u of r.sitemapUrls404.slice(0, 5)) console.log(`          ${u}`)
    }
    if (r.diskMissing.length > 0) {
      console.log(`        disk pages not in sitemap (top 5):`)
      for (const u of r.diskMissing.slice(0, 5)) console.log(`          ${u}`)
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total 404s in sitemap: ${total404}  Total disk pages missing from sitemap: ${totalMissing}`)

  appendLog({
    script: 'seo-sitemap-check',
    action: 'check',
    sites: Object.keys(report.sites).length,
    total404,
    totalMissing,
  })
}

main()
