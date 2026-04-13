#!/usr/bin/env node
/**
 * SEO Image Alt Audit — Find images with missing/empty/lazy alt text.
 *
 * Alt text matters for: accessibility (screen readers), Google Image
 * Search ranking, and as fallback when the image fails to load. Lazy
 * defaults like alt="image" or alt="DSC_0123.jpg" are worse than nothing
 * because they pollute screen reader output without helping SEO.
 *
 * Walks built HTML, extracts every <img> tag, and flags:
 *   - missing alt attribute entirely
 *   - empty alt="" that isn't on a decorative aria-hidden image
 *   - alt = filename (e.g. alt="hero.jpg")
 *   - alt = generic placeholder ("image", "photo", "picture")
 *   - alt unusually short (< 5 chars) or long (> 125 chars per a11y guidance)
 *
 * Output: data/image-audit.json
 *
 * Usage: node scripts/automation/seo-image-audit.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'image-audit.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp' },
  { key: 'gp', dir: 'guadeloupe-ftp' },
]

const SKIP_DIRS = new Set(['assets', 'icons', 'images', 'data', 'api'])
const MAX_PARSE_BYTES = 256 * 1024
const LAZY_PLACEHOLDERS = new Set(['image', 'photo', 'picture', 'img', 'imagen', 'foto'])
const ALT_MIN = 5
const ALT_MAX = 125

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

function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')
  const m = tag.match(re)
  return m ? m[1] : null
}

function classifyImg(tag) {
  const src = getAttr(tag, 'src') || getAttr(tag, 'data-src') || ''
  const ariaHidden = /aria-hidden\s*=\s*["']true["']/i.test(tag)
  const role = getAttr(tag, 'role')
  const altMatch = /\salt\s*=/.test(tag)
  const alt = getAttr(tag, 'alt')

  const issues = []
  if (!altMatch) {
    issues.push('missing-alt')
  } else if (alt === '' || alt === null) {
    if (!ariaHidden && role !== 'presentation') {
      issues.push('empty-alt')
    }
  } else {
    const trimmed = alt.trim()
    const lower = trimmed.toLowerCase()
    if (LAZY_PLACEHOLDERS.has(lower)) {
      issues.push('placeholder-alt')
    } else if (src) {
      const filename = src.split('/').pop()?.split('?')[0] || ''
      const filenameNoExt = filename.replace(/\.[a-z0-9]+$/i, '').toLowerCase()
      if (lower === filename.toLowerCase() || lower === filenameNoExt) {
        issues.push('alt-is-filename')
      }
    }
    if (trimmed.length < ALT_MIN) issues.push('alt-too-short')
    if (trimmed.length > ALT_MAX) issues.push('alt-too-long')
  }
  return { src, alt, issues }
}

function checkSite(site) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found` }
  const files = walkHtml(ftpRoot)

  let totalImages = 0
  const issues = []
  const byKind = {}

  for (const file of files) {
    const url = fileToUrlPath(file, ftpRoot)
    let html
    try { html = readFileSync(file, 'utf-8') } catch { continue }
    const slice = html.length > MAX_PARSE_BYTES ? html.slice(0, MAX_PARSE_BYTES) : html
    for (const m of slice.matchAll(/<img\b[^>]*>/gi)) {
      totalImages++
      const { src, alt, issues: imgIssues } = classifyImg(m[0])
      for (const kind of imgIssues) {
        byKind[kind] = (byKind[kind] || 0) + 1
        issues.push({ url, kind, src, alt })
      }
    }
  }

  return {
    pageCount: files.length,
    totalImages,
    issueCount: issues.length,
    byKind,
    issues: issues.slice(0, 30),
  }
}

function main() {
  console.log('=== SEO Image Audit ===\n')
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalIssues = 0

  for (const site of SITES) {
    const r = checkSite(site)
    report.sites[site.key] = r
    if (r.error) { console.warn(`[${site.key}] ${r.error}`); continue }
    totalIssues += r.issueCount
    console.log(`[${site.key}] pages=${r.pageCount}  images=${r.totalImages}  issues=${r.issueCount}`)
    for (const [kind, count] of Object.entries(r.byKind)) {
      console.log(`        ${kind}: ${count}`)
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total image issues: ${totalIssues}`)

  appendLog({
    script: 'seo-image-audit',
    action: 'audit',
    sites: Object.keys(report.sites).length,
    totalIssues,
  })
}

main()
