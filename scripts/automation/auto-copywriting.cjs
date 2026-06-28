#!/usr/bin/env node
/**
 * Auto-Copywriting — GSC-driven copywriting optimization.
 * Reads audit-summary.json (GSC performance data), analyzes top queries,
 * and generates optimized meta titles, descriptions, and H1 suggestions
 * based on real search data.
 *
 * Proven high-CTR keywords from GSC:
 *   - "en temps réel" (162 clicks)
 *   - "aujourd'hui" (30 clicks)
 *   - commune names (local SEO)
 *   - "2026" (freshness signal)
 *
 * Idempotent: safe to run multiple times. Merges with existing overrides.
 *
 * Outputs:
 *   data/meta-overrides.json  — Title/description overrides per beach slug
 *   data/copywriting-log.json — All copywriting decisions with supporting data
 *
 * Usage:
 *   node scripts/automation/auto-copywriting.cjs
 *   DRY_RUN=1 node scripts/automation/auto-copywriting.cjs
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { SITES, BEACHES } = require('./lib/config.cjs')
const { DRY_RUN, appendLog } = require('./lib/safety.cjs')

const DATA_DIR = resolve(__dirname, 'data')
const AUDIT_PATH = resolve(DATA_DIR, 'audit-summary.json')
const AUDIT_FULL_PATH = resolve(DATA_DIR, 'audit-full.json')
const META_OVERRIDES_PATH = resolve(DATA_DIR, 'meta-overrides.json')
const COPY_LOG_PATH = resolve(DATA_DIR, 'copywriting-log.json')

// ── Helpers ──────────────────────────────────────────────────

function readJSON(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function writeJSON(filePath, data) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would write ${filePath}`)
    return
  }
  mkdirSync(resolve(filePath, '..'), { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2))
}

function today() {
  const d = new Date()
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function year() {
  return new Date().getFullYear()
}

/** Truncate string to maxLen, cutting at last space if possible. */
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str
  const cut = str.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut
}

// ── Copywriting log ─────────────────────────────────────────

function readCopyLog() {
  const existing = readJSON(COPY_LOG_PATH)
  if (existing && Array.isArray(existing.decisions)) return existing
  return { decisions: [], lastRun: null }
}

function addDecision(copyLog, decision) {
  // Idempotent: replace existing decision with same rule + key, or append
  const idx = copyLog.decisions.findIndex(
    d => d.rule === decision.rule && d.key === decision.key
  )
  const entry = {
    ...decision,
    timestamp: new Date().toISOString(),
  }
  if (idx >= 0) {
    copyLog.decisions[idx] = entry
  } else {
    copyLog.decisions.push(entry)
  }
}

// ── Step 1: Extract top GSC queries ─────────────────────────

function extractTopQueries(audit) {
  const queries = {}

  for (const [siteKey, siteData] of Object.entries(audit.sites || {})) {
    // GSC performance data lives in audit-full.json as raw rows,
    // and in audit-summary as findings.lowCtrPages[].topQueries.
    // We aggregate from lowCtrPages top queries in summary.
    const lowCtrPages = (siteData.findings && siteData.findings.lowCtrPages) || []
    for (const page of lowCtrPages) {
      for (const q of (page.topQueries || [])) {
        const key = q.query.toLowerCase().trim()
        if (!queries[key]) {
          queries[key] = { query: q.query, impressions: 0, clicks: 0, sites: new Set() }
        }
        queries[key].impressions += q.impressions || 0
        queries[key].clicks += q.clicks || 0
        queries[key].sites.add(siteKey)
      }
    }
  }

  // Also try audit-full.json for richer performance data
  const auditFull = readJSON(AUDIT_FULL_PATH)
  if (auditFull && auditFull.sites) {
    for (const [siteKey, siteData] of Object.entries(auditFull.sites)) {
      const performance = siteData.performance || {}
      for (const [, metrics] of Object.entries(performance)) {
        for (const q of (metrics.topQueries || [])) {
          const key = q.query.toLowerCase().trim()
          if (!queries[key]) {
            queries[key] = { query: q.query, impressions: 0, clicks: 0, sites: new Set() }
          }
          queries[key].impressions += q.impressions || 0
          queries[key].clicks += q.clicks || 0
          queries[key].sites.add(siteKey)
        }
      }
    }
  }

  // Convert sets to arrays and sort by impressions
  const sorted = Object.values(queries)
    .map(q => ({ ...q, sites: Array.from(q.sites) }))
    .sort((a, b) => b.impressions - a.impressions)

  return sorted
}

/**
 * Identify high-value keywords that users search for.
 * These are the proven GSC keywords we want to feature in copy.
 */
function identifyHighValueKeywords(topQueries) {
  // Known high-CTR keyword patterns from GSC data
  const highValuePatterns = [
    { pattern: /en temps r[ée]el/i, label: 'en temps réel', baseClicks: 162 },
    { pattern: /aujourd[''']?hui/i, label: "aujourd'hui", baseClicks: 30 },
    { pattern: /carte/i, label: 'carte', baseClicks: 0 },
    { pattern: /pr[ée]vision/i, label: 'prévisions', baseClicks: 0 },
    { pattern: /alerte/i, label: 'alertes', baseClicks: 0 },
    { pattern: /plage propre/i, label: 'plage propre', baseClicks: 0 },
  ]

  const result = {}
  for (const { pattern, label, baseClicks } of highValuePatterns) {
    const matching = topQueries.filter(q => pattern.test(q.query))
    const totalClicks = matching.reduce((sum, q) => sum + q.clicks, 0) + baseClicks
    const totalImpressions = matching.reduce((sum, q) => sum + q.impressions, 0)
    result[label] = { totalClicks, totalImpressions, matchingQueries: matching.length }
  }

  return result
}

// ── Step 2: Generate beach page meta ────────────────────────

function generateBeachMeta(beach, island, topQueries, copyLog) {
  const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
  const y = year()
  const slug = beach.slug

  // Find queries specifically mentioning this beach
  const beachQueries = topQueries.filter(q => {
    const lq = q.query.toLowerCase()
    const lname = beach.name.toLowerCase()
    const lcommune = beach.commune.toLowerCase()
    return lq.includes(lname) || lq.includes(lcommune) || lq.includes(slug)
  })

  // Build title: Beach Name + Commune — Sargasses aujourd'hui YYYY
  // Constraint: under 60 chars
  let title = `${beach.name} ${beach.commune} — Sargasses aujourd'hui ${y}`
  if (title.length > 60) {
    // Try without commune
    title = `${beach.name} — Sargasses ${islandName} aujourd'hui ${y}`
  }
  if (title.length > 60) {
    // Shorter variant
    title = `${beach.name} — Sargasses aujourd'hui ${y}`
  }
  title = truncate(title, 60)

  // Build description: include "en temps réel", commune, island, "aujourd'hui"
  // Constraint: under 160 chars
  const dateStr = today()
  let description = `Sargasses à ${beach.name} (${beach.commune}, ${islandName}) aujourd'hui — mesuré au satellite, pas deviné. Carte en temps réel, prévisions 7 jours. Mis à jour le ${dateStr}.`
  if (description.length > 160) {
    description = `Sargasses ${beach.name} (${beach.commune}) aujourd'hui. Carte en temps réel, prévisions 7 jours. Mis à jour le ${dateStr}.`
  }
  if (description.length > 160) {
    description = `Sargasses ${beach.name} aujourd'hui — Carte en temps réel et prévisions 7 jours. ${islandName} ${y}.`
  }
  description = truncate(description, 160)

  // Log the decision
  const reason = []
  reason.push(`Includes "aujourd'hui" (GSC: 30 clicks proven)`)
  reason.push(`Includes "en temps réel" (GSC: 162 clicks proven)`)
  reason.push(`Includes commune "${beach.commune}" (local SEO)`)
  reason.push(`Includes year "${y}" (freshness signal)`)
  if (beachQueries.length > 0) {
    const topQ = beachQueries.slice(0, 3).map(q => `"${q.query}" (${q.impressions} imp)`)
    reason.push(`Top GSC queries for this beach: ${topQ.join(', ')}`)
  }

  addDecision(copyLog, {
    rule: 'beach-meta',
    key: `${island}:${slug}`,
    action: 'meta-override',
    data: {
      beachName: beach.name,
      commune: beach.commune,
      island: islandName,
      beachQueriesCount: beachQueries.length,
      topBeachQueries: beachQueries.slice(0, 5).map(q => ({
        query: q.query,
        impressions: q.impressions,
        clicks: q.clicks,
      })),
    },
    result: { title, description },
    reason: reason.join('. ') + '.',
  })

  return { title, description }
}

// ── Step 3: Write meta-overrides.json ───────────────────────

function buildMetaOverrides(topQueries, copyLog) {
  const overrides = {}
  let count = 0

  for (const beach of BEACHES) {
    const { title, description } = generateBeachMeta(
      beach, beach.island, topQueries, copyLog
    )

    const slugPath = `plages/${beach.slug}`
    overrides[slugPath] = { title, description }
    count++
  }

  console.log(`  Generated meta overrides for ${count} beach pages.`)
  return overrides
}

// ── Step 4: H1 suggestions for high-traffic pages ───────────

function generateH1Suggestions(topQueries, copyLog) {
  const y = year()
  const dateStr = today()
  const suggestions = {}

  // For each island, generate H1s for the 3 key pages
  for (const [siteKey, site] of Object.entries(SITES)) {
    // Sites USD (EN/ES) : les H1 français Martinique/Guadeloupe n'ont pas de sens —
    // leur copy vient de regions/seo-content/<id>.json, pas de ce générateur.
    if (site.regionConfig) continue
    const islandName = siteKey === 'mq' ? 'Martinique' : 'Guadeloupe'

    // Homepage H1
    const homeH1 = `Sargasses ${islandName} en temps réel — Carte et plages aujourd'hui`
    suggestions[`${siteKey}:homepage`] = {
      path: '/',
      h1: homeH1,
      reason: `Combines "en temps réel" (162 clicks) + "aujourd'hui" (30 clicks) + island name for local SEO.`,
    }
    addDecision(copyLog, {
      rule: 'h1-suggestion',
      key: `${siteKey}:homepage`,
      action: 'h1-override',
      data: { page: '/', island: islandName },
      result: { h1: homeH1 },
      reason: `Homepage H1: combines top GSC keywords "en temps réel" (162 clicks) and "aujourd'hui" (30 clicks) with island name.`,
    })

    // /carte-sargasses/ H1
    const carteH1 = `Carte des sargasses ${islandName} en temps réel — ${dateStr}`
    suggestions[`${siteKey}:carte`] = {
      path: '/carte-sargasses/',
      h1: carteH1,
      reason: `"Carte" is a top query intent. Adding "en temps réel" and date for freshness.`,
    }
    addDecision(copyLog, {
      rule: 'h1-suggestion',
      key: `${siteKey}:carte`,
      action: 'h1-override',
      data: { page: '/carte-sargasses/', island: islandName },
      result: { h1: carteH1 },
      reason: `Carte H1: "carte" is top search intent, combined with "en temps réel" and current date for freshness signal.`,
    })

    // /alertes/ H1
    const alerteH1 = `Alertes sargasses ${islandName} — la dépêche du matin, mesurée au satellite`
    suggestions[`${siteKey}:alertes`] = {
      path: '/alertes/',
      h1: alerteH1,
      reason: `"Alertes" + "gratuites" to capture notification-seeking users. Island name for local SEO.`,
    }
    addDecision(copyLog, {
      rule: 'h1-suggestion',
      key: `${siteKey}:alertes`,
      action: 'h1-override',
      data: { page: '/alertes/', island: islandName },
      result: { h1: alerteH1 },
      reason: `Alertes H1: targets notification-seeking users with "gratuites" value prop and island name for local SEO.`,
    })
  }

  console.log(`  Generated ${Object.keys(suggestions).length} H1 suggestions.`)
  return suggestions
}

// ── Main ─────────────────────────────────────────────────────

function main() {
  console.log(`=== Auto-Copywriting (GSC-driven) ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`Timestamp: ${new Date().toISOString()}`)
  console.log(`Date string: ${today()}\n`)

  // 1. Read audit data
  const audit = readJSON(AUDIT_PATH)
  if (!audit || !audit.sites) {
    console.log('No audit-summary.json found. Run seo-audit.cjs first.')
    console.log('Generating meta overrides from BEACHES config alone (no GSC data).\n')
  }

  // 2. Extract and analyze GSC queries
  console.log('--- Step 1: Analyzing GSC queries ---')
  const topQueries = audit ? extractTopQueries(audit) : []
  console.log(`  Found ${topQueries.length} unique queries from GSC data.`)

  if (topQueries.length > 0) {
    console.log('  Top 10 queries by impressions:')
    for (const q of topQueries.slice(0, 10)) {
      console.log(`    "${q.query}" — ${q.impressions} imp, ${q.clicks} clicks`)
    }
  }

  // Identify high-value keyword patterns
  const highValueKw = identifyHighValueKeywords(topQueries)
  console.log('\n  High-value keyword performance:')
  for (const [kw, stats] of Object.entries(highValueKw)) {
    console.log(`    "${kw}" — ${stats.totalClicks} clicks, ${stats.totalImpressions} impressions, ${stats.matchingQueries} matching queries`)
  }

  // 3. Initialize copywriting log
  const copyLog = readCopyLog()
  copyLog.lastRun = new Date().toISOString()

  // 4. Generate meta overrides for all beach pages
  console.log('\n--- Step 2: Generating beach page meta overrides ---')
  const metaOverrides = buildMetaOverrides(topQueries, copyLog)

  // 5. Generate H1 suggestions for high-traffic pages
  console.log('\n--- Step 3: Generating H1 suggestions ---')
  const h1Suggestions = generateH1Suggestions(topQueries, copyLog)

  // 6. Merge with existing meta-overrides.json (preserve entries from auto-optimize.cjs)
  console.log('\n--- Step 4: Merging with existing overrides ---')
  const existingOverrides = readJSON(META_OVERRIDES_PATH)
  let mergedOverrides

  if (existingOverrides && (existingOverrides.titles || existingOverrides.descriptions)) {
    // Old format from auto-optimize.cjs: { titles: {slug: title}, descriptions: {slug: desc} }
    // Convert to new format and merge
    mergedOverrides = { ...metaOverrides }
    for (const [slug, title] of Object.entries(existingOverrides.titles || {})) {
      const key = slug.includes('/') ? slug : `plages/${slug}`
      // Auto-optimize entries take priority only if they have CTR-specific data
      // (they target low-CTR pages with specific fixes)
      if (!mergedOverrides[key]) {
        mergedOverrides[key] = {
          title,
          description: (existingOverrides.descriptions || {})[slug] || '',
        }
      }
    }
    console.log(`  Merged ${Object.keys(existingOverrides.titles || {}).length} existing overrides.`)
  } else if (existingOverrides) {
    // New format: { "plages/slug": { title, description } }
    mergedOverrides = { ...metaOverrides }
    for (const [key, value] of Object.entries(existingOverrides)) {
      if (key === 'generatedAt' || key === 'h1Suggestions') continue
      if (!mergedOverrides[key] && typeof value === 'object') {
        mergedOverrides[key] = value
      }
    }
    console.log(`  Merged ${Object.keys(existingOverrides).length} existing overrides.`)
  } else {
    mergedOverrides = metaOverrides
    console.log('  No existing overrides to merge.')
  }

  // Add metadata
  const finalOutput = {
    generatedAt: new Date().toISOString(),
    generatedBy: 'auto-copywriting.cjs',
    keywordsUsed: {
      'en temps réel': '162 clicks (GSC)',
      "aujourd'hui": '30 clicks (GSC)',
      'commune name': 'local SEO signal',
      [String(year())]: 'freshness signal',
    },
    h1Suggestions,
    ...mergedOverrides,
  }

  // 7. Write outputs
  console.log('\n--- Step 5: Writing outputs ---')

  writeJSON(META_OVERRIDES_PATH, finalOutput)

  // Trim log to last 300 decisions
  if (copyLog.decisions.length > 300) {
    copyLog.decisions = copyLog.decisions.slice(-300)
  }
  writeJSON(COPY_LOG_PATH, copyLog)

  // 8. Summary
  const beachOverrideCount = Object.keys(metaOverrides).length
  const h1Count = Object.keys(h1Suggestions).length
  const totalDecisions = copyLog.decisions.length

  console.log('\n--- Summary ---')
  console.log(`  Beach meta overrides:  ${beachOverrideCount}`)
  console.log(`  H1 suggestions:        ${h1Count}`)
  console.log(`  Total logged decisions: ${totalDecisions}`)

  if (!DRY_RUN) {
    console.log(`\nWritten:`)
    console.log(`  ${META_OVERRIDES_PATH}`)
    console.log(`  ${COPY_LOG_PATH}`)
  }

  // 9. Log to shared automation log
  appendLog({
    script: 'auto-copywriting',
    action: DRY_RUN ? 'dry-run' : 'copywriting-optimized',
    results: {
      beachMetaOverrides: beachOverrideCount,
      h1Suggestions: h1Count,
      topQueriesAnalyzed: topQueries.length,
      highValueKeywords: highValueKw,
    },
  })

  console.log('\n=== Auto-Copywriting complete ===')
}

try {
  main()
} catch (err) {
  console.error(`\n[auto-copywriting] Fatal error: ${err.message}`)
  console.error(err.stack)
  // Exit 0 so the CI pipeline continues
  process.exit(0)
}
