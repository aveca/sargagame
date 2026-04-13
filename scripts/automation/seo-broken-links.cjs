#!/usr/bin/env node
/**
 * SEO Broken Link Checker — Verify every internal href resolves to a real file.
 *
 * Walks martinique-ftp/ and guadeloupe-ftp/, parses every HTML file for
 * <a href> internal links, and resolves each one against the disk. A link
 * is BROKEN when:
 *   - it points at /foo/ but neither foo/index.html nor foo.html exists
 *   - it points at /foo.html but the file doesn't exist
 *   - it points at an asset (/assets/foo.js) that doesn't exist
 *
 * Cross-domain links to the partner site (sargasses-{martinique,guadeloupe})
 * are checked against the partner FTP folder so they validate too.
 *
 * Output: data/broken-links.json
 * Exit code: non-zero if any broken link is found (fails CI).
 *
 * Usage: node scripts/automation/seo-broken-links.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep, posix, join } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'broken-links.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp', domain: 'sargasses-martinique.com' },
  { key: 'gp', dir: 'guadeloupe-ftp', domain: 'sargasses-guadeloupe.com' },
]

const SITE_BY_DOMAIN = Object.fromEntries(SITES.map(s => [s.domain, s]))
const SKIP_DIRS = new Set(['node_modules', '.git'])
const MAX_PARSE_BYTES = 256 * 1024

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

function extractHrefs(html) {
  const slice = html.length > MAX_PARSE_BYTES ? html.slice(0, MAX_PARSE_BYTES) : html
  const hrefs = []
  for (const m of slice.matchAll(/href\s*=\s*["']([^"'#]+)/gi)) {
    let href = m[1].trim()
    if (!href) continue
    if (/^(mailto|tel|javascript|data):/i.test(href)) continue
    href = href.split('#')[0].split('?')[0]
    if (!href) continue
    hrefs.push(href)
  }
  return hrefs
}

// Resolve a relative href against the source page URL path.
function resolveHref(href, fromUrlPath) {
  if (/^https?:\/\//i.test(href)) return { type: 'absolute', value: href }
  if (href.startsWith('/')) return { type: 'site', path: href }
  if (href.startsWith('//')) return { type: 'protocol-relative', value: href }
  // relative href — anchor against fromUrlPath's directory
  const fromDir = fromUrlPath.endsWith('/') ? fromUrlPath : fromUrlPath.replace(/[^/]*$/, '')
  const joined = posix.normalize(fromDir + href)
  return { type: 'site', path: joined.startsWith('/') ? joined : '/' + joined }
}

// Map a site path (e.g. /plages/foo/) to a disk path. Tries:
//   /foo/         → ftpRoot/foo/index.html
//   /foo.html     → ftpRoot/foo.html
//   /foo          → ftpRoot/foo/index.html OR ftpRoot/foo.html OR ftpRoot/foo (asset)
function pathToDisk(sitePath, ftpRoot) {
  const clean = sitePath.replace(/^\/+/, '').replace(/\/+$/, '')
  if (clean === '') return join(ftpRoot, 'index.html')
  // Trailing slash on original = directory
  if (sitePath.endsWith('/')) return join(ftpRoot, clean, 'index.html')
  // Has a recognized extension = literal file
  if (/\.[a-z0-9]{1,5}$/i.test(clean)) return join(ftpRoot, clean)
  // No extension, no trailing slash — try directory first then bare file
  const asDir = join(ftpRoot, clean, 'index.html')
  if (existsSync(asDir)) return asDir
  const asHtml = join(ftpRoot, clean + '.html')
  if (existsSync(asHtml)) return asHtml
  return join(ftpRoot, clean)
}

function fileToUrlPath(file, ftpRoot) {
  let rel = relative(ftpRoot, file).split(sep).join('/')
  if (rel === 'index.html') return '/'
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length)
  return '/' + rel
}

function checkSite(site, allFtpRoots) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found`, broken: [] }

  const files = walkHtml(ftpRoot)
  const broken = []
  let totalLinks = 0
  let checkedLinks = 0

  for (const file of files) {
    const fromUrl = fileToUrlPath(file, ftpRoot)
    let html
    try { html = readFileSync(file, 'utf-8') } catch { continue }
    for (const href of extractHrefs(html)) {
      totalLinks++
      const r = resolveHref(href, fromUrl)
      if (r.type === 'protocol-relative') continue // skip — usually CDNs
      if (r.type === 'absolute') {
        // Only check internal-network partner links
        try {
          const u = new URL(r.value)
          const partner = SITE_BY_DOMAIN[u.hostname]
          if (!partner) continue // external — not our problem
          const partnerRoot = allFtpRoots[partner.key]
          if (!partnerRoot || !existsSync(partnerRoot)) continue
          const target = pathToDisk(u.pathname || '/', partnerRoot)
          checkedLinks++
          if (!existsSync(target)) {
            broken.push({ from: fromUrl, href, target: relative(ROOT, target).split(sep).join('/'), kind: 'cross-domain' })
          }
        } catch {
          continue
        }
        continue
      }
      // site-relative
      const target = pathToDisk(r.path, ftpRoot)
      checkedLinks++
      if (!existsSync(target)) {
        broken.push({ from: fromUrl, href, target: relative(ROOT, target).split(sep).join('/'), kind: 'internal' })
      }
    }
  }

  return {
    pageCount: files.length,
    totalLinks,
    checkedLinks,
    brokenCount: broken.length,
    broken,
  }
}

function main() {
  console.log('=== SEO Broken Link Checker ===\n')
  const allFtpRoots = Object.fromEntries(
    SITES.map(s => [s.key, resolve(ROOT, s.dir)])
  )
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalBroken = 0

  for (const site of SITES) {
    const result = checkSite(site, allFtpRoots)
    if (result.error) {
      console.warn(`[${site.key}] ${result.error}`)
      report.sites[site.key] = { error: result.error }
      continue
    }
    report.sites[site.key] = result
    totalBroken += result.brokenCount

    console.log(`[${site.key}] ${result.pageCount} pages  ${result.totalLinks} hrefs  ${result.checkedLinks} checked  ${result.brokenCount} BROKEN`)
    if (result.broken.length > 0) {
      // Group by href so the same broken target listed across many pages
      // doesn't drown the log.
      const byHref = new Map()
      for (const b of result.broken) {
        if (!byHref.has(b.href)) byHref.set(b.href, [])
        byHref.get(b.href).push(b.from)
      }
      const top = [...byHref.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)
      for (const [href, sources] of top) {
        console.log(`        ${href}  (${sources.length}x — e.g. ${sources[0]})`)
      }
      if (byHref.size > 10) console.log(`        ... +${byHref.size - 10} more unique broken hrefs`)
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total broken internal links: ${totalBroken}`)

  appendLog({
    script: 'seo-broken-links',
    action: 'check',
    sites: Object.keys(report.sites).length,
    totalBroken,
  })

  // Fail CI if anything is broken — broken internal links are a hard
  // SEO bug (orphan crawl, 404s, score loss).
  if (totalBroken > 0 && process.env.CI) process.exit(1)
}

main()
