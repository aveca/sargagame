#!/usr/bin/env node
/**
 * SEO Content Depth Scorer — Find pages too thin to rank.
 *
 * Google's thin-content classifier de-prioritizes pages with <300 words
 * of substantive text. Walks built HTML, strips scripts/styles/nav/header
 * /footer noise, counts words from <main>/<article>/<noscript> blocks,
 * and reports the bottom-N pages.
 *
 * Output: data/content-depth.json
 *
 * Usage: node scripts/automation/seo-content-depth.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'content-depth.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp' },
  { key: 'gp', dir: 'guadeloupe-ftp' },
]

const SKIP_DIRS = new Set(['assets', 'icons', 'images', 'data', 'api'])
const THIN_THRESHOLD = 300
const RICH_THRESHOLD = 800

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

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function countContentWords(html) {
  // Prefer <main>/<article>/<noscript> if present (the SEO content lives there)
  let body = ''
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i)
  if (mainMatch) body += ' ' + mainMatch[0]
  for (const m of html.matchAll(/<article[\s\S]*?<\/article>/gi)) body += ' ' + m[0]
  for (const m of html.matchAll(/<noscript[\s\S]*?<\/noscript>/gi)) body += ' ' + m[0]
  if (!body.trim()) {
    // Fallback to <body>
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)
    body = bodyMatch ? bodyMatch[0] : html
  }
  const text = stripTags(body)
  if (!text) return 0
  return text.split(/\s+/).filter(w => w.length >= 2).length
}

function checkSite(site) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found` }
  const files = walkHtml(ftpRoot)
  const pages = []

  for (const file of files) {
    let html
    try { html = readFileSync(file, 'utf-8') } catch { continue }
    const wc = countContentWords(html)
    pages.push({ url: fileToUrlPath(file, ftpRoot), words: wc })
  }

  pages.sort((a, b) => a.words - b.words)
  const thin = pages.filter(p => p.words < THIN_THRESHOLD)
  const rich = pages.filter(p => p.words >= RICH_THRESHOLD)
  const median = pages.length > 0 ? pages[Math.floor(pages.length / 2)].words : 0

  return {
    pageCount: pages.length,
    medianWords: median,
    thinCount: thin.length,
    richCount: rich.length,
    thinPages: thin.slice(0, 30),
    topPages: pages.slice(-10).reverse(),
  }
}

function main() {
  console.log('=== SEO Content Depth ===\n')
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalThin = 0

  for (const site of SITES) {
    const r = checkSite(site)
    report.sites[site.key] = r
    if (r.error) { console.warn(`[${site.key}] ${r.error}`); continue }
    totalThin += r.thinCount
    console.log(`[${site.key}] pages=${r.pageCount}  median=${r.medianWords}w  thin(<${THIN_THRESHOLD}w)=${r.thinCount}  rich(>=${RICH_THRESHOLD}w)=${r.richCount}`)
    if (r.thinPages.length > 0) {
      console.log(`        thinnest:`)
      for (const p of r.thinPages.slice(0, 5)) {
        console.log(`          ${p.url.padEnd(45)} ${p.words}w`)
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total thin pages: ${totalThin}`)

  appendLog({
    script: 'seo-content-depth',
    action: 'score',
    sites: Object.keys(report.sites).length,
    totalThin,
  })
}

main()
