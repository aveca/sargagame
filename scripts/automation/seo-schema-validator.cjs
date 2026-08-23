#!/usr/bin/env node
/**
 * SEO Schema Validator — Validate JSON-LD structured data on every page.
 *
 * Walks built HTML, extracts every <script type="application/ld+json">,
 * parses it, and checks:
 *   - Valid JSON syntax (the #1 silent-failure mode)
 *   - Required @context and @type
 *   - Type-specific required fields (Article, FAQPage, BreadcrumbList,
 *     Beach, WebApplication, Organization)
 *   - Recommended-but-missing fields (warnings)
 *
 * This is the SEO equivalent of a linter — Google silently ignores
 * malformed schemas, so a typo can kill rich-result eligibility for an
 * entire content type without leaving a trace in Search Console.
 *
 * Output: data/schema-validation.json
 *
 * Usage: node scripts/automation/seo-schema-validator.cjs
 */
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require('fs')
const { resolve, relative, sep } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const ROOT = resolve(__dirname, '..', '..')
const OUT_PATH = resolve(__dirname, 'data', 'schema-validation.json')

const SITES = [
  { key: 'mq', dir: 'martinique-ftp' },
  { key: 'gp', dir: 'guadeloupe-ftp' },
]

const SKIP_DIRS = new Set(['assets', 'icons', 'images', 'data', 'api'])
const MAX_PARSE_BYTES = 256 * 1024

// Type → { required: [], recommended: [] }
const SCHEMA_RULES = {
  Article: {
    required: ['headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'image', 'description', 'publisher'],
  },
  FAQPage: {
    required: ['mainEntity'],
    recommended: [],
  },
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
  },
  Beach: {
    required: ['name'],
    recommended: ['description', 'address', 'geo'],
  },
  WebApplication: {
    required: ['name', 'url'],
    recommended: ['description', 'applicationCategory'],
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['description'],
  },
  Organization: {
    required: ['name'],
    recommended: ['url', 'logo'],
  },
  SiteNavigationElement: {
    required: ['name'],
    recommended: ['url'],
  },
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

function extractJsonLd(html) {
  const slice = html.length > MAX_PARSE_BYTES ? html.slice(0, MAX_PARSE_BYTES) : html
  const blocks = []
  for (const m of slice.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    blocks.push(m[1].trim())
  }
  return blocks
}

function validateSchema(parsed, errors, warnings, fileLabel) {
  // Some pages embed an array of @graph nodes — recurse into it
  const nodes = Array.isArray(parsed)
    ? parsed
    : (parsed['@graph'] && Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed])
  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      errors.push({ file: fileLabel, message: 'JSON-LD node is not an object' })
      continue
    }
    if (!node['@context']) warnings.push({ file: fileLabel, message: 'missing @context' })
    const type = node['@type']
    if (!type) {
      errors.push({ file: fileLabel, message: 'missing @type' })
      continue
    }
    const types = Array.isArray(type) ? type : [type]
    for (const t of types) {
      const rules = SCHEMA_RULES[t]
      if (!rules) continue // unknown type — skip silently
      for (const field of rules.required) {
        if (node[field] === undefined || node[field] === null || node[field] === '') {
          errors.push({ file: fileLabel, type: t, message: `missing required field "${field}"` })
        }
      }
      for (const field of rules.recommended) {
        if (node[field] === undefined || node[field] === null || node[field] === '') {
          warnings.push({ file: fileLabel, type: t, message: `missing recommended field "${field}"` })
        }
      }
    }
  }
}

function checkSite(site) {
  const ftpRoot = resolve(ROOT, site.dir)
  if (!existsSync(ftpRoot)) return { error: `${site.dir} not found` }
  const files = walkHtml(ftpRoot)
  const errors = []
  const warnings = []
  let totalBlocks = 0
  let parseFailures = 0
  let pagesWithSchema = 0

  for (const file of files) {
    const fileLabel = relative(ROOT, file).split(sep).join('/')
    let html
    try { html = readFileSync(file, 'utf-8') } catch { continue }
    const blocks = extractJsonLd(html)
    if (blocks.length > 0) pagesWithSchema++
    for (const raw of blocks) {
      totalBlocks++
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        parseFailures++
        errors.push({ file: fileLabel, message: `JSON parse error: ${e.message}`, snippet: raw.slice(0, 80) })
        continue
      }
      validateSchema(parsed, errors, warnings, fileLabel)
    }
  }

  return {
    pageCount: files.length,
    pagesWithSchema,
    totalBlocks,
    parseFailures,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors: errors.slice(0, 30),
    warnings: warnings.slice(0, 30),
  }
}

function main() {
  console.log('=== SEO Schema Validator ===\n')
  const report = { generatedAt: new Date().toISOString(), sites: {} }
  let totalErrors = 0

  for (const site of SITES) {
    const result = checkSite(site)
    report.sites[site.key] = result
    if (result.error) {
      console.warn(`[${site.key}] ${result.error}`)
      continue
    }
    totalErrors += result.errorCount
    console.log(`[${site.key}] pages=${result.pageCount}  with-schema=${result.pagesWithSchema}  blocks=${result.totalBlocks}  errors=${result.errorCount}  warnings=${result.warningCount}`)
    if (result.parseFailures > 0) console.log(`        ⚠ ${result.parseFailures} JSON parse failures`)
    if (result.errors.length > 0) {
      const byType = new Map()
      for (const e of result.errors) {
        const k = e.type ? `${e.type}: ${e.message}` : e.message
        byType.set(k, (byType.get(k) || 0) + 1)
      }
      const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      for (const [msg, count] of top) console.log(`        × ${msg}  (${count}x)`)
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${OUT_PATH}`)
  console.log(`Total schema errors: ${totalErrors}`)

  appendLog({
    script: 'seo-schema-validator',
    action: 'validate',
    sites: Object.keys(report.sites).length,
    totalErrors,
  })
}

main()
