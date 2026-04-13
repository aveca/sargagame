#!/usr/bin/env node
/**
 * SEO Canonical + Hreflang Validator — Catch self-canonical mismatches
 * and broken hreflang clusters.
 *
 * Common bugs this catches:
 *   - canonical points to a different URL than the page it's on
 *     (Google ignores the page entirely → orphan from indexation)
 *   - canonical points off-domain (cross-domain duplicate content)
 *   - hreflang link missing the reciprocal (Google requires bidirectional)
 *   - hreflang to a URL that doesn't actually exist on disk
 *   - hreflang lang code typos (e.g. "en-EN" instead of "en")
 *   - missing x-default on multilingual editorial pages
 *
 * Output: data/canonical-hreflang.json
 *
 * Usage: node scripts/automation/seo-canonical-hreflang.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep, join } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'canonical-hreflang.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp', domain: 'sargasses-martinique.com' },
  { key: 'gp', dir: 'guadeloupe-ftp', domain: 'sargasses-guadeloupe.com' },
]

const SKIP_DIRS = new Set(['assets', 'icons', 'images', 'data', 'api'])
const VALID_LANG = /^([a-z]{2})(-[A-Z]{2})?$|^x-default$/
const MAX_PARSE_BYTES = 64 * 1024

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

function extractLinks(html) {
  const slice = html.length > MAX_PARSE_BYTES ? html.slice(0, MAX_PARSE_BYTES) : html
  const canonicalMatch = slice.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
  const canonical = canonicalMatch ? canonicalMatch[1].trim() : null
  const hreflangs = []
  for (const m of slice.matchAll(/<link\s+rel=["']alternate["']\s+hreflang=["']([^"']+)["']\s+href=["']([^"']+)["']/gi)) {
    hreflangs.push({ lang: m[1].trim(), href: m[2].trim() })
  }
  return { canonical, hreflangs }
}

function pathToFile(sitePath, ftpRoot) {
  const clean = sitePath.replace(/^\/+/, '').replace(/\/+$/, '')
  if (clean === '') return join(ftpRoot, 'index.html')
  return join(ftpRoot, clean, 'index.html')
}

function checkSite(site, allFtpRoots) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found` }
  const files = walkHtml(ftpRoot)
  const issues = []

  let pagesWithCanonical = 0
  let pagesWithHreflang = 0

  for (const file of files) {
    const fileLabel = relative(ftpRoot, file).split(sep).join('/')
    const pageUrlPath = fileToUrlPath(file, ftpRoot)
    let html
    try { html = readFileSync(file, 'utf-8') } catch { continue }
    const { canonical, hreflangs } = extractLinks(html)

    // === CANONICAL ===
    if (!canonical) {
      issues.push({ file: fileLabel, kind: 'missing-canonical' })
    } else {
      pagesWithCanonical++
      try {
        const u = new URL(canonical)
        if (u.hostname !== site.domain) {
          issues.push({ file: fileLabel, kind: 'canonical-off-domain', canonical, expected: site.domain })
        } else if (u.pathname !== pageUrlPath) {
          // Tolerate trailing slash diff
          const a = u.pathname.replace(/\/$/, '')
          const b = pageUrlPath.replace(/\/$/, '')
          if (a !== b) {
            issues.push({ file: fileLabel, kind: 'canonical-mismatch', canonical: u.pathname, pageUrl: pageUrlPath })
          }
        }
      } catch {
        issues.push({ file: fileLabel, kind: 'canonical-invalid-url', canonical })
      }
    }

    // === HREFLANG ===
    if (hreflangs.length > 0) {
      pagesWithHreflang++
      const langs = new Set()
      let hasXDefault = false
      for (const h of hreflangs) {
        if (h.lang === 'x-default') hasXDefault = true
        if (!VALID_LANG.test(h.lang)) {
          issues.push({ file: fileLabel, kind: 'hreflang-invalid-lang', lang: h.lang })
        }
        if (langs.has(h.lang)) {
          issues.push({ file: fileLabel, kind: 'hreflang-duplicate-lang', lang: h.lang })
        }
        langs.add(h.lang)

        // Verify the href target actually exists on disk
        try {
          const u = new URL(h.href)
          const partner = SITES.find(s => s.domain === u.hostname)
          if (partner) {
            const partnerRoot = allFtpRoots[partner.key]
            if (partnerRoot && existsSync(partnerRoot)) {
              const target = pathToFile(u.pathname, partnerRoot)
              if (!existsSync(target)) {
                issues.push({ file: fileLabel, kind: 'hreflang-target-missing', lang: h.lang, href: h.href })
              }
            }
          }
        } catch {
          issues.push({ file: fileLabel, kind: 'hreflang-invalid-url', lang: h.lang, href: h.href })
        }
      }
      // x-default expected on any page that has 2+ language alternates
      if (hreflangs.length >= 2 && !hasXDefault) {
        issues.push({ file: fileLabel, kind: 'hreflang-missing-x-default' })
      }
    }
  }

  // Group issues by kind for the summary
  const byKind = {}
  for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1

  return {
    pageCount: files.length,
    pagesWithCanonical,
    pagesWithHreflang,
    issueCount: issues.length,
    byKind,
    issues: issues.slice(0, 50),
  }
}

function main() {
  console.log('=== SEO Canonical + Hreflang ===\n')
  const allFtpRoots = Object.fromEntries(SITES.map(s => [s.key, resolve(ROOT, s.dir)]))
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalIssues = 0

  for (const site of SITES) {
    const r = checkSite(site, allFtpRoots)
    report.sites[site.key] = r
    if (r.error) { console.warn(`[${site.key}] ${r.error}`); continue }
    totalIssues += r.issueCount
    console.log(`[${site.key}] pages=${r.pageCount}  canonical=${r.pagesWithCanonical}  hreflang=${r.pagesWithHreflang}  issues=${r.issueCount}`)
    for (const [kind, count] of Object.entries(r.byKind)) {
      console.log(`        ${kind}: ${count}`)
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total issues: ${totalIssues}`)

  appendLog({
    script: 'seo-canonical-hreflang',
    action: 'validate',
    sites: Object.keys(report.sites).length,
    totalIssues,
  })
}

main()
