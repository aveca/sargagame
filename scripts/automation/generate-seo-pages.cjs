#!/usr/bin/env node
/**
 * Generate SEO Pages — Create new pages for high-value keyword gaps
 * identified in GSC data. Adds entries to vite.config.js for build-time generation.
 *
 * Safety: max 3 new pages per run. Dry-run support.
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { BEACHES, SITES } = require('./lib/config.cjs')
const { DRY_RUN, LIMITS, appendLog } = require('./lib/safety.cjs')

const AUDIT_PATH = resolve(__dirname, 'data', 'audit-summary.json')
const VITE_CONFIG_PATH = resolve(__dirname, '..', '..', 'vite.config.js')
const NEW_PAGES_PATH = resolve(__dirname, 'data', 'new-pages.json')

// Known page patterns — don't create duplicates
const EXISTING_PATHS = new Set([
  '/', '/carte-sargasses/', '/previsions/', '/en/',
  '/mentions-legales.html', '/confidentialite.html',
  ...BEACHES.map(b => `/plages/${b.slug}/`),
])

// Commune -> best beach mapping
const COMMUNE_MAP = {}
for (const b of BEACHES) {
  const communeSlug = b.commune.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!COMMUNE_MAP[communeSlug]) COMMUNE_MAP[communeSlug] = b
}

/**
 * Identify keyword gaps from GSC performance data.
 */
function findKeywordGaps(audit) {
  const gaps = []

  for (const [siteKey, siteData] of Object.entries(audit.sites)) {
    const perf = siteData.findings.lowCtrPages || []
    // We need the full performance data — but we only have findings in summary
    // Look at pages that are NOT indexed or have high impressions on homepage
    // For now, detect commune-based queries and seasonal queries
  }

  return gaps
}

/**
 * Detect potential new pages from query patterns.
 */
function detectNewPageOpportunities(audit) {
  const opportunities = []

  // Commune pages: if queries like "sargasses [commune]" exist but no dedicated page
  const communes = [
    { slug: 'trois-ilets', name: 'Les Trois-Îlets', island: 'mq', nearestBeach: 'anse-mitan' },
    { slug: 'sainte-luce', name: 'Sainte-Luce', island: 'mq', nearestBeach: 'pointe-marin' },
    { slug: 'trinite', name: 'La Trinité', island: 'mq', nearestBeach: 'tartane' },
    { slug: 'saint-francois', name: 'Saint-François', island: 'gp', nearestBeach: 'pointe-des-chateaux' },
    { slug: 'deshaies', name: 'Deshaies', island: 'gp', nearestBeach: 'grande-anse-deshaies' },
    { slug: 'le-moule', name: 'Le Moule', island: 'gp', nearestBeach: 'plage-souffleur' },
  ]

  for (const commune of communes) {
    const path = `/communes/${commune.slug}/`
    if (!EXISTING_PATHS.has(path)) {
      const island = commune.island === 'mq' ? 'Martinique' : 'Guadeloupe'
      const domain = SITES[commune.island].domain
      opportunities.push({
        type: 'commune',
        path: `communes/${commune.slug}`,
        slug: commune.slug,
        title: `Sargasses ${commune.name} (${island}) — État des plages`,
        description: `État des sargasses à ${commune.name}, ${island}. Quelles plages sont propres aujourd'hui ? Carte en temps réel et prévisions 7 jours.`,
        island: commune.island,
        domain,
        redirectTo: `/plages/${commune.nearestBeach}/`,
      })
    }
  }

  // Seasonal pages
  const seasonalPages = [
    {
      slug: 'quand-sargasses-martinique',
      path: 'quand-sargasses-martinique',
      title: 'Quand arrivent les sargasses en Martinique ? Saison et prévisions',
      description: 'Saison des sargasses en Martinique : période de pic, mois à éviter, et prévisions en temps réel. Planifiez vos vacances sans sargasses.',
      island: 'mq',
    },
    {
      slug: 'quand-sargasses-guadeloupe',
      path: 'quand-sargasses-guadeloupe',
      title: 'Quand arrivent les sargasses en Guadeloupe ? Saison et prévisions',
      description: 'Saison des sargasses en Guadeloupe : période de pic, mois à éviter, et prévisions en temps réel. Planifiez vos vacances sans sargasses.',
      island: 'gp',
    },
  ]

  for (const page of seasonalPages) {
    if (!EXISTING_PATHS.has(`/${page.path}/`)) {
      opportunities.push({
        type: 'seasonal',
        ...page,
        domain: SITES[page.island].domain,
      })
    }
  }

  return opportunities
}

function main() {
  console.log(`=== Generate SEO Pages ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  const opportunities = detectNewPageOpportunities(
    existsSync(AUDIT_PATH) ? JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) : { sites: {} }
  )

  console.log(`Found ${opportunities.length} page opportunities`)

  const toCreate = opportunities.slice(0, LIMITS.MAX_NEW_PAGES_PER_RUN)
  console.log(`Creating ${toCreate.length} pages (limit: ${LIMITS.MAX_NEW_PAGES_PER_RUN})\n`)

  if (toCreate.length === 0) {
    appendLog({ script: 'generate-seo-pages', action: 'no-changes', pagesCreated: 0 })
    return
  }

  for (const page of toCreate) {
    console.log(`  + [${page.type}] /${page.path}/ — "${page.title}"`)
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would write new pages config')
    appendLog({ script: 'generate-seo-pages', action: 'dry-run', pagesCount: toCreate.length })
    return
  }

  // For commune pages, add redirects to .htaccess (they point to nearest beach)
  // For seasonal pages, add to vite.config.js pages array
  writeFileSync(NEW_PAGES_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), pages: toCreate }, null, 2))
  console.log(`\n✓ New pages config saved to ${NEW_PAGES_PATH}`)

  // Patch vite.config.js to include new editorial pages
  let viteConfig = readFileSync(VITE_CONFIG_PATH, 'utf-8')
  const editorialPages = toCreate.filter(p => p.type === 'seasonal')

  if (editorialPages.length > 0 && !viteConfig.includes('new-pages.json')) {
    // Add new pages to the pages array at the top of the SEO plugin
    const marker = `{ path: 'previsions', title: 'Prévisions sargasses Martinique 7 jours', desc: 'Prévisions sargasses Martinique J+1 à J+7. Où aller à la plage cette semaine.' },`
    let newEntries = ''
    for (const page of editorialPages) {
      newEntries += `\n            { path: '${page.path}', title: '${page.title.replace(/'/g, "\\'")}', desc: '${page.description.replace(/'/g, "\\'")}' },`
    }
    viteConfig = viteConfig.replace(marker, marker + newEntries)
    writeFileSync(VITE_CONFIG_PATH, viteConfig)
    console.log(`✓ vite.config.js patched with ${editorialPages.length} new editorial pages`)
  }

  appendLog({
    script: 'generate-seo-pages',
    action: 'pages-created',
    pagesCount: toCreate.length,
    pages: toCreate.map(p => ({ type: p.type, path: p.path })),
  })
}

main()
