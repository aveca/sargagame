#!/usr/bin/env node
/**
 * SEO Link Graph Analyzer — Build internal-link graph from built HTML.
 *
 * Walks martinique-ftp/ and guadeloupe-ftp/, parses every index.html for
 * <a href> internal links, builds an adjacency map, then computes:
 *   - pagesWithNoIncoming: structural orphans (no internal link points at them)
 *   - pagesWithFewIncoming: weak pages (1-2 incoming links)
 *   - topLinkDonors: pages with the most outgoing internal links
 *   - topLinkTargets: pages with the most incoming internal links
 *
 * The orphan detector tells you which pages have no GSC traffic. This
 * tells you which pages have no internal-link substrate at all — usually
 * the *cause* of the GSC problem. Together they triangulate the gap.
 *
 * Output: data/link-graph.json
 *
 * Usage: node scripts/automation/seo-link-graph.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep, posix } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'link-graph.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp', domain: 'sargasses-martinique.com' },
  { key: 'gp', dir: 'guadeloupe-ftp', domain: 'sargasses-guadeloupe.com' },
]

const SKIP_DIRS = new Set(['assets', 'icons', 'images', 'data', 'api'])
const MAX_PARSE_BYTES = 256 * 1024

function walkHtml(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = resolve(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walkHtml(full))
    } else if (entry.endsWith('.html')) {
      out.push(full)
    }
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
  const links = new Set()
  for (const m of slice.matchAll(/href\s*=\s*["']([^"'#]+)/gi)) {
    let href = m[1].trim()
    if (!href) continue
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue
    href = href.split('?')[0]
    links.add(href)
  }
  return links
}

function resolveInternal(href, fromUrl, domain) {
  if (/^https?:\/\//i.test(href)) {
    try {
      const u = new URL(href)
      if (u.hostname !== domain) return null
      return u.pathname || '/'
    } catch {
      return null
    }
  }
  if (href.startsWith('#')) return null
  if (href.startsWith('/')) return href
  const fromDir = fromUrl.endsWith('/') ? fromUrl : fromUrl.replace(/[^/]*$/, '')
  return posix.normalize(fromDir + href)
}

function normalizePath(p) {
  if (!p) return '/'
  let n = p.replace(/\/+/g, '/')
  if (!n.startsWith('/')) n = '/' + n
  return n
}

function analyzeSite(site) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) {
    return { error: `${site.dir} not found` }
  }
  const files = walkHtml(ftpRoot)
  const incoming = new Map()
  const outgoing = new Map()
  const allPages = new Set()

  for (const file of files) {
    const fromUrl = normalizePath(fileToUrlPath(file, ftpRoot))
    allPages.add(fromUrl)
    if (!outgoing.has(fromUrl)) outgoing.set(fromUrl, new Set())
    let html
    try {
      html = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    for (const href of extractLinks(html)) {
      const target = resolveInternal(href, fromUrl, site.domain)
      if (!target) continue
      const norm = normalizePath(target)
      if (norm === fromUrl) continue
      outgoing.get(fromUrl).add(norm)
      if (!incoming.has(norm)) incoming.set(norm, new Set())
      incoming.get(norm).add(fromUrl)
    }
  }

  const pages = []
  for (const url of allPages) {
    const inLinks = incoming.get(url)?.size || 0
    const outLinks = outgoing.get(url)?.size || 0
    pages.push({ url, in: inLinks, out: outLinks })
  }
  pages.sort((a, b) => a.in - b.in || a.url.localeCompare(b.url))

  const noIncoming = pages.filter(p => p.in === 0 && p.url !== '/')
  const fewIncoming = pages.filter(p => p.in >= 1 && p.in <= 2 && p.url !== '/')
  const topTargets = [...pages].sort((a, b) => b.in - a.in).slice(0, 10)
  const topDonors = [...pages].sort((a, b) => b.out - a.out).slice(0, 10)

  const phantom = []
  for (const target of incoming.keys()) {
    if (!allPages.has(target)) {
      phantom.push({ url: target, incomingFrom: [...incoming.get(target)].slice(0, 3) })
    }
  }

  return {
    pageCount: allPages.size,
    noIncomingCount: noIncoming.length,
    fewIncomingCount: fewIncoming.length,
    phantomCount: phantom.length,
    noIncoming: noIncoming.slice(0, 50),
    fewIncoming: fewIncoming.slice(0, 30),
    topTargets,
    topDonors,
    phantom: phantom.slice(0, 20),
  }
}

function main() {
  console.log('=== SEO Link Graph Analyzer ===\n')
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalNoIncoming = 0

  for (const site of SITES) {
    const result = analyzeSite(site)
    if (result.error) {
      console.warn(`[${site.key}] ${result.error}`)
      continue
    }
    report.sites[site.key] = result
    totalNoIncoming += result.noIncomingCount

    console.log(`[${site.key}] ${result.pageCount} pages`)
    console.log(`        no-incoming: ${result.noIncomingCount}  few-incoming(1-2): ${result.fewIncomingCount}  phantom: ${result.phantomCount}`)
    if (result.noIncoming.length > 0) {
      console.log(`        top structural orphans:`)
      for (const p of result.noIncoming.slice(0, 5)) {
        console.log(`          ${p.url.padEnd(45)} in=${p.in} out=${p.out}`)
      }
    }
    if (result.topTargets.length > 0) {
      console.log(`        top link targets (most authority):`)
      for (const p of result.topTargets.slice(0, 3)) {
        console.log(`          ${p.url.padEnd(45)} in=${p.in}`)
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total structural orphans (no internal links pointing at them): ${totalNoIncoming}`)

  appendLog({
    script: 'seo-link-graph',
    action: 'analyze',
    sites: Object.keys(report.sites).length,
    structuralOrphans: totalNoIncoming,
  })
}

main()
