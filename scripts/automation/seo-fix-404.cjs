#!/usr/bin/env node
/**
 * SEO Fix 404 — Auto-add .htaccess redirects for new 404 URLs detected by GSC.
 * Reads audit-summary.json, matches 404 URLs to known beach slugs,
 * and inserts RewriteRule entries in public/.htaccess.
 *
 * Safety: max 10 new redirects per run. Dry-run support.
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { BEACHES } = require('./lib/config.cjs')
const { DRY_RUN, LIMITS, appendLog, isPathRedirected, validateHtaccess, similarity } = require('./lib/safety.cjs')

const HTACCESS_PATH = resolve(__dirname, '..', '..', 'public', '.htaccess')
const AUDIT_PATH = resolve(__dirname, 'data', 'audit-summary.json')

// Section markers in .htaccess where we insert new rules
const GP_SECTION_MARKER = '# GUADELOUPE — Smart redirects'
const MQ_SECTION_MARKER = '# MARTINIQUE — Smart redirects'
const CATCHALL_MARKER = '# CATCH-ALL'

function findBestMatch(urlPath) {
  // Extract the slug part from the URL path
  // e.g., /plages/some-unknown-beach/ → "some-unknown-beach"
  // e.g., /plage/diamant-plage/ → "diamant-plage"
  const segments = urlPath.replace(/^\/|\/$/g, '').split('/')
  const slug = segments[segments.length - 1] || ''

  if (!slug) return null

  let bestMatch = null
  let bestScore = 0

  for (const beach of BEACHES) {
    // Try exact match on slug
    if (beach.slug === slug || beach.id === slug) {
      return { beach, score: 1.0, method: 'exact' }
    }

    // Try similarity on slug
    const score = similarity(slug, beach.slug)
    if (score > bestScore) {
      bestScore = score
      bestMatch = beach
    }

    // Also try against beach name (slugified)
    const nameSlug = beach.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const nameScore = similarity(slug, nameSlug)
    if (nameScore > bestScore) {
      bestScore = nameScore
      bestMatch = beach
    }

    // Try against commune (for commune-based URLs)
    const communeSlug = beach.commune.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const communeScore = similarity(slug, communeSlug)
    if (communeScore > bestScore) {
      bestScore = communeScore
      bestMatch = beach
    }
  }

  if (bestScore >= 0.6 && bestMatch) {
    return { beach: bestMatch, score: bestScore, method: 'fuzzy' }
  }

  return null
}

function main() {
  console.log(`=== SEO Fix 404 ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  if (!existsSync(AUDIT_PATH)) {
    console.log('No audit-summary.json found. Run seo-audit.cjs first.')
    process.exit(0)
  }

  const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8'))
  let htaccess = readFileSync(HTACCESS_PATH, 'utf-8')

  const newRules = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [siteKey, siteData] of Object.entries(audit.sites)) {
    const soft404s = siteData.findings.softErrors || []
    const notIndexed = siteData.findings.notIndexed || []

    // Merge: URLs that are 404 or soft 404
    const problemUrls = [...soft404s, ...notIndexed].filter(u =>
      ['NOT_FOUND', 'SOFT_404'].includes(u.pageFetchState)
    )

    console.log(`${siteData.domain}: ${problemUrls.length} 404/soft-404 URLs found`)

    for (const entry of problemUrls) {
      if (newRules.length >= LIMITS.MAX_REDIRECTS_PER_RUN) {
        console.log(`  ⚠ Limit reached (${LIMITS.MAX_REDIRECTS_PER_RUN} redirects per run)`)
        break
      }

      const urlObj = new URL(entry.url)
      const path = urlObj.pathname

      // Skip if already redirected
      if (isPathRedirected(htaccess, path)) {
        console.log(`  ✓ Already redirected: ${path}`)
        continue
      }

      // Skip if it's a known valid page path
      if (['/mentions-legales.html', '/confidentialite.html', '/en/', '/carte-sargasses/', '/previsions/'].includes(path)) {
        continue
      }

      // Find best matching beach
      const match = findBestMatch(path)
      const target = match ? `/plages/${match.beach.slug}/` : '/'
      const cleanPath = path.replace(/^\//, '').replace(/\/$/, '')

      // Build RewriteRule
      const rule = `RewriteRule ^${cleanPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$ ${target} [R=301,L]`

      newRules.push({
        siteKey,
        path,
        target,
        rule,
        matchMethod: match ? match.method : 'fallback-homepage',
        matchScore: match ? match.score : 0,
        matchedBeach: match ? match.beach.name : null,
      })

      console.log(`  + ${path} → ${target} (${match ? `${match.method}: ${match.beach.name}, score=${match.score.toFixed(2)}` : 'fallback → homepage'})`)
    }
  }

  if (newRules.length === 0) {
    console.log('\nNo new redirects needed.')
    appendLog({ script: 'seo-fix-404', action: 'no-changes', redirectsAdded: 0 })
    return
  }

  // Insert rules into .htaccess BEFORE the catch-all section
  const catchAllIndex = htaccess.indexOf(CATCHALL_MARKER)
  if (catchAllIndex === -1) {
    console.error('Cannot find CATCH-ALL marker in .htaccess. Aborting.')
    process.exit(1)
  }

  const newBlock = [
    '',
    `# Auto-added ${today} by seo-fix-404`,
    ...newRules.map(r => r.rule),
    '',
  ].join('\n')

  htaccess = htaccess.slice(0, catchAllIndex) + newBlock + htaccess.slice(catchAllIndex)

  // Validate
  const errors = validateHtaccess(htaccess)
  if (errors.length > 0) {
    console.error('\n.htaccess validation errors:')
    errors.forEach(e => console.error(`  ${e}`))
    console.error('Aborting — no changes written.')
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would add ${newRules.length} redirects to .htaccess`)
    console.log('New block:\n' + newBlock)
  } else {
    writeFileSync(HTACCESS_PATH, htaccess)
    console.log(`\n✓ Added ${newRules.length} redirects to public/.htaccess`)
  }

  appendLog({
    script: 'seo-fix-404',
    action: DRY_RUN ? 'dry-run' : 'redirects-added',
    redirectsAdded: newRules.length,
    rules: newRules.map(r => ({ path: r.path, target: r.target, method: r.matchMethod, score: r.matchScore })),
  })
}

main()
