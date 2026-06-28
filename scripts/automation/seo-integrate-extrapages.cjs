#!/usr/bin/env node
/**
 * seo-integrate-extrapages.cjs — Splice generated programmatic-SEO page specs
 * into regions/seo-content/<site>.json as `extraPages[]`, rendered by
 * region-seo-pages.cjs (FAQPage JSON-LD + hub↔spoke mesh + sister network).
 *
 * Idempotent: re-running replaces the extraPages set for the site (merge by
 * slug). Curation guards against cannibalization — a page is DROPPED if its
 * slug collides with an existing hub/route/press slug or is in the per-site
 * SKIP set (near-duplicates of an existing page).
 *
 * Usage:
 *   node scripts/automation/seo-integrate-extrapages.cjs <site> <pages.json> [--dry]
 *   site ∈ florida|puntacana|rivieramaya
 */
'use strict'
const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '..', '..')
const [, , SITE, PAGES_PATH, ...rest] = process.argv
const DRY = rest.includes('--dry')
if (!SITE || !PAGES_PATH) { console.error('usage: <site> <pages.json> [--dry]'); process.exit(1) }

const REGION_PATH = resolve(ROOT, 'regions', `${SITE}.json`)
const cpath = f => resolve(ROOT, 'regions', 'seo-content', f)

// Secondary langs load a SEPARATE content file (<id>.<lang>.json). Each page
// must be written to the content file matching ITS language, else the per-lang
// renderer never sees it. Map: site → { lang → content file }.
const LANG_FILES = {
  florida: { en: `${SITE}.json`, es: `${SITE}.es.json` },
  puntacana: { en: `${SITE}.json`, es: `${SITE}.es.json` },
  rivieramaya: { es: `${SITE}.json`, en: `${SITE}.en.json` },
}[SITE]
if (!LANG_FILES) { console.error(`unknown site ${SITE}`); process.exit(1) }

// Near-duplicate slugs to skip per site (cannibalize an existing hub/route).
const SKIP = {
  florida: new Set(['florida-beaches-without-sargassum', 'florida-sargassum-map-today']),
  puntacana: new Set(),
  // Riviera Maya already has rich ES hubs (pronostico/mapa/playas-sin-sargazo) +
  // best/weekly routes — drop generated pages that duplicate those intents.
  rivieramaya: new Set(['pronostico-sargazo-cancun-semana', 'playas-sin-sargazo-riviera-maya']),
}

const region = JSON.parse(readFileSync(REGION_PATH, 'utf8'))
const specs = JSON.parse(readFileSync(resolve(PAGES_PATH), 'utf8')).filter(p => p.site === SITE)

// Reserved slugs across ALL the site's content files + region routes.
const reserved = new Set()
for (const r of Object.values(region.routes || {})) if (typeof r === 'string') reserved.add(r)
;['methodology', 'metodologia', 'semaforo-del-sargazo'].forEach(s => reserved.add(s))
for (const f of Object.values(LANG_FILES)) {
  try {
    const c = JSON.parse(readFileSync(cpath(f), 'utf8'))
    for (const v of Object.values(c.pages || {})) if (v && v.slug) reserved.add(v.slug)
    if (c.press && c.press.slug) reserved.add(c.press.slug)
  } catch { /* file may not exist */ }
}

const isDaily = p => /today|right[- ]?now|live|en direct|en-direct|hoy|aujourd|ahora|en vivo/i.test(`${p.slug} ${p.title} ${p.h1}`)

// Some agents return a full path ("/es/rivieramaya/mapa-sargazo-hoy/") instead of
// a bare slug. Strip leading/trailing slashes and any lang/site path segments —
// the renderer prepends the language prefix itself.
const cleanSlug = (s) => String(s || '').trim().replace(/^\/+|\/+$/g, '')
  .replace(new RegExp(`^(en|es|fr|${SITE})/`), '').replace(new RegExp(`^(en|es|fr|${SITE})/`), '')
  .replace(/\/+$/g, '')

const curated = []
const seen = new Set()
const skipSet = SKIP[SITE] || new Set()
for (const p of specs) {
  const slug = cleanSlug(p.slug)
  if (!slug || !p.title || !p.intro) continue
  if (!LANG_FILES[p.lang]) { console.log(`  drop ${slug} — lang ${p.lang} not emitted by ${SITE}`); continue }
  if (reserved.has(slug)) { console.log(`  drop ${slug} — collides with reserved hub/route slug`); continue }
  if (skipSet.has(slug)) { console.log(`  drop ${slug} — curated SKIP (cannibalizes existing page)`); continue }
  if (seen.has(slug)) { console.log(`  drop ${slug} — duplicate`); continue }
  seen.add(slug)
  curated.push({
    lang: p.lang, slug, title: p.title, desc: p.desc, h1: p.h1, intro: p.intro,
    sections: (p.sections || []).filter(s => s && s.h2 && s.text),
    faq: (p.faq || []).filter(f => f && f.q && f.a),
    priority: '0.7', daily: isDaily(p),
  })
}

// Write each lang's pages into the content file that the renderer loads for it.
console.log(`${SITE}: ${curated.length} curated extraPages (from ${specs.length} specs)`)
for (const [lang, file] of Object.entries(LANG_FILES)) {
  const langPages = curated.filter(p => p.lang === lang)
  if (!langPages.length) continue
  const fp = cpath(file)
  let c
  try { c = JSON.parse(readFileSync(fp, 'utf8')) } catch { console.log(`  skip ${file} — not found`); continue }
  c.extraPages = langPages
  console.log(`  ${file} (${lang}): ${langPages.length} pages — ${langPages.map(p => p.slug).join(', ')}`)
  if (!DRY) { writeFileSync(fp, JSON.stringify(c, null, 2) + '\n'); console.log(`    → wrote ${file}`) }
}
if (DRY) console.log('  (dry-run, not written)')
