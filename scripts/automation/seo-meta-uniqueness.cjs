#!/usr/bin/env node
/**
 * SEO Meta Uniqueness Checker — Find duplicate <title>/<meta description>.
 *
 * Google merges pages with identical titles/descriptions into a single
 * canonical entry, killing rich-result eligibility for every duplicate.
 * This walks built HTML and reports:
 *   - exact duplicate titles (>1 page)
 *   - exact duplicate meta descriptions
 *   - missing or empty title/description
 *   - title length out of range (30-60 chars rec, hard cap 70)
 *   - description length out of range (120-160 chars rec, hard cap 200)
 *
 * Output: data/meta-uniqueness.json
 *
 * Usage: node scripts/automation/seo-meta-uniqueness.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'meta-uniqueness.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp' },
  { key: 'gp', dir: 'guadeloupe-ftp' },
]

const SKIP_DIRS = new Set(['assets', 'icons', 'images', 'data', 'api'])
const MAX_PARSE_BYTES = 64 * 1024

const TITLE_MIN = 30
const TITLE_MAX = 60
const TITLE_HARD_CAP = 70
const DESC_MIN = 120
const DESC_MAX = 160
const DESC_HARD_CAP = 200

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

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim()
}

function extractMeta(html) {
  const slice = html.length > MAX_PARSE_BYTES ? html.slice(0, MAX_PARSE_BYTES) : html
  const titleMatch = slice.match(/<title[^>]*>([^<]*)<\/title>/i)
  const descMatch = slice.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
  return {
    title: titleMatch ? decode(titleMatch[1]) : '',
    description: descMatch ? decode(descMatch[1]) : '',
  }
}

function checkSite(site) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found` }
  const files = walkHtml(ftpRoot)

  const titles = new Map()
  const descs = new Map()
  const issues = []

  for (const file of files) {
    const fileLabel = relative(ftpRoot, file).split(sep).join('/')
    let html
    try { html = readFileSync(file, 'utf-8') } catch { continue }
    const { title, description } = extractMeta(html)

    if (!title) {
      issues.push({ file: fileLabel, kind: 'missing-title' })
    } else {
      if (title.length > TITLE_HARD_CAP) issues.push({ file: fileLabel, kind: 'title-too-long', length: title.length, value: title })
      else if (title.length < TITLE_MIN || title.length > TITLE_MAX) issues.push({ file: fileLabel, kind: 'title-length-warn', length: title.length, value: title })
      if (!titles.has(title)) titles.set(title, [])
      titles.get(title).push(fileLabel)
    }

    if (!description) {
      issues.push({ file: fileLabel, kind: 'missing-desc' })
    } else {
      if (description.length > DESC_HARD_CAP) issues.push({ file: fileLabel, kind: 'desc-too-long', length: description.length })
      else if (description.length < DESC_MIN || description.length > DESC_MAX) issues.push({ file: fileLabel, kind: 'desc-length-warn', length: description.length })
      if (!descs.has(description)) descs.set(description, [])
      descs.get(description).push(fileLabel)
    }
  }

  const dupTitles = [...titles.entries()].filter(([_, files]) => files.length > 1)
  const dupDescs = [...descs.entries()].filter(([_, files]) => files.length > 1)

  return {
    pageCount: files.length,
    uniqueTitles: titles.size,
    uniqueDescs: descs.size,
    duplicateTitleGroups: dupTitles.length,
    duplicateDescGroups: dupDescs.length,
    duplicateTitlePages: dupTitles.reduce((a, [_, f]) => a + f.length, 0),
    duplicateDescPages: dupDescs.reduce((a, [_, f]) => a + f.length, 0),
    duplicateTitles: dupTitles.slice(0, 10).map(([title, files]) => ({ title, count: files.length, sample: files.slice(0, 3) })),
    duplicateDescs: dupDescs.slice(0, 10).map(([desc, files]) => ({ desc: desc.slice(0, 80), count: files.length, sample: files.slice(0, 3) })),
    issueCount: issues.length,
    issues: issues.slice(0, 30),
  }
}

function main() {
  console.log('=== SEO Meta Uniqueness ===\n')
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalDupTitles = 0
  let totalDupDescs = 0

  for (const site of SITES) {
    const r = checkSite(site)
    report.sites[site.key] = r
    if (r.error) { console.warn(`[${site.key}] ${r.error}`); continue }
    totalDupTitles += r.duplicateTitlePages
    totalDupDescs += r.duplicateDescPages
    console.log(`[${site.key}] pages=${r.pageCount}  uniqueTitles=${r.uniqueTitles}  uniqueDescs=${r.uniqueDescs}`)
    console.log(`        dup titles: ${r.duplicateTitleGroups} groups (${r.duplicateTitlePages} pages)`)
    console.log(`        dup descs:  ${r.duplicateDescGroups} groups (${r.duplicateDescPages} pages)`)
    console.log(`        issues:     ${r.issueCount}`)
    if (r.duplicateTitles.length > 0) {
      console.log(`        top dup titles:`)
      for (const d of r.duplicateTitles.slice(0, 3)) {
        console.log(`          (${d.count}x) ${d.title.slice(0, 70)}`)
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)

  appendLog({
    script: 'seo-meta-uniqueness',
    action: 'check',
    sites: Object.keys(report.sites).length,
    totalDupTitles,
    totalDupDescs,
  })
}

main()
