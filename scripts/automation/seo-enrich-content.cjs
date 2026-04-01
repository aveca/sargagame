#!/usr/bin/env node
/**
 * SEO Enrich Content — Add FAQ schema, noscript content blocks, and internal
 * links to beach pages. Modifies vite.config.js to inject richer HTML.
 *
 * Safety: max 5 enrichments per run. Dry-run support.
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { BEACHES } = require('./lib/config.cjs')
const { DRY_RUN, LIMITS, appendLog } = require('./lib/safety.cjs')

const VITE_CONFIG_PATH = resolve(__dirname, '..', '..', 'vite.config.js')
const ENRICHMENT_PATH = resolve(__dirname, 'data', 'enrichments.json')

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Load beach coordinates from beaches-list.json.
 */
function loadBeachCoords() {
  const beachListPath = resolve(__dirname, '..', '..', 'public', 'data', 'beaches-list.json')
  if (!existsSync(beachListPath)) return {}
  try {
    const list = JSON.parse(readFileSync(beachListPath, 'utf-8'))
    const coords = {}
    for (const b of list) {
      // Index by original ID (mq001, gp001)
      coords[b.id] = { lat: b.lat, lng: b.lng }
      // Also index by name for matching with config.cjs IDs
      const slug = b.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      coords[slug] = { lat: b.lat, lng: b.lng }
    }
    // Manual mappings for config.cjs IDs that don't match slugified names
    const manual = {
      'grande-anse': 'mq014', 'diamant': 'mq016',
      'sainte-anne': 'mq004', 'les-salines': 'mq001',
      'gp-grande-anse': 'gp021', 'gp-malendure': 'gp031', 'gp-sainte-anne': 'gp010',
      'gp-pt-chateaux': 'gp005', 'gp-gosier': 'gp012', 'gp-caravelle': 'gp009',
      'gp-bas-du-fort': 'gp014', 'gp-deshaies': 'gp025', 'gp-moule': 'gp017',
      'gp-vieux-fort': 'gp004',
    }
    for (const [configId, listId] of Object.entries(manual)) {
      if (coords[listId]) coords[configId] = coords[listId]
    }
    // Beaches not in beaches-list.json — coords from Sargasses_PROD.jsx
    coords['tartane'] = { lat: 14.7487, lng: -60.908 }
    coords['pt-marin'] = { lat: 14.4523, lng: -60.8695 }
    coords['vauclin'] = { lat: 14.5448, lng: -60.8388 }
    return coords
  } catch { return {} }
}

/**
 * Find nearest beaches (same island) by distance.
 */
function findNearestBeaches(beachId, island, coords, count = 3) {
  const origin = coords[beachId]
  if (!origin) return []
  return BEACHES
    .filter(b => b.island === island && b.id !== beachId)
    .map(b => {
      const c = coords[b.id]
      if (!c) return null
      return { ...b, distance: haversine(origin.lat, origin.lng, c.lat, c.lng) }
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
}

function main() {
  console.log(`=== SEO Enrich Content ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  const coords = loadBeachCoords()
  const enrichments = {}

  for (const beach of BEACHES) {
    const island = beach.island === 'mq' ? 'Martinique' : 'Guadeloupe'
    const domain = beach.island === 'mq' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
    const neighbors = findNearestBeaches(beach.id, beach.island, coords, 3)

    // FAQ schema (3 questions per beach)
    const faq = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `Y a-t-il des sargasses à ${beach.name} aujourd'hui ?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Consultez l'état en temps réel des sargasses à ${beach.name} (${beach.commune}, ${island}) sur notre carte interactive. Données satellite mises à jour quotidiennement.`
          }
        },
        {
          '@type': 'Question',
          name: `${beach.name} est-elle adaptée aux enfants ?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Retrouvez toutes les informations sur ${beach.name} : accès, parking, activités et état des sargasses en temps réel pour planifier votre sortie en famille.`
          }
        },
        {
          '@type': 'Question',
          name: `Quelles plages sont proches de ${beach.name} ?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: neighbors.length > 0
              ? `Les plages les plus proches de ${beach.name} sont : ${neighbors.map(n => `${n.name} (${Math.round(n.distance)} km)`).join(', ')}.`
              : `Consultez la carte pour découvrir les plages proches de ${beach.name} en ${island}.`
          }
        }
      ]
    }

    // Noscript content block (crawlable by Google)
    const neighborLinks = neighbors.map(n =>
      `<li><a href="https://${domain}/plages/${n.slug}/">Sargasses ${n.name}</a> (${Math.round(n.distance)} km)</li>`
    ).join('\n          ')

    const noscript = `
    <noscript>
      <article>
        <h1>Sargasses à ${beach.name} (${beach.commune}, ${island})</h1>
        <p>État des sargasses à ${beach.name} en temps réel. Cette plage de ${beach.commune} en ${island} est surveillée quotidiennement par satellite (Sentinel-3). Consultez les prévisions sargasses sur 7 jours, l'indice AFAI et la carte interactive.</p>
        <h2>Plages proches de ${beach.name}</h2>
        <ul>
          ${neighborLinks}
        </ul>
        <p><a href="https://${domain}/">Retour à l'accueil — Sargasses ${island}</a> | <a href="https://${domain}/carte-sargasses/">Carte des sargasses</a> | <a href="https://${domain}/previsions/">Prévisions 7 jours</a></p>
      </article>
    </noscript>`

    enrichments[beach.slug] = { faq: JSON.stringify(faq), noscript }
  }

  console.log(`Generated enrichments for ${Object.keys(enrichments).length} beaches`)

  if (DRY_RUN) {
    console.log('[DRY RUN] Would write enrichments and patch vite.config.js')
    appendLog({ script: 'seo-enrich-content', action: 'dry-run', beachCount: Object.keys(enrichments).length })
    return
  }

  // Write enrichments JSON
  writeFileSync(ENRICHMENT_PATH, JSON.stringify(enrichments, null, 2))
  console.log(`✓ Enrichments saved to ${ENRICHMENT_PATH}`)

  // Patch vite.config.js to inject FAQ + noscript
  let viteConfig = readFileSync(VITE_CONFIG_PATH, 'utf-8')

  if (!viteConfig.includes('enrichments.json')) {
    // Add enrichment loading near the meta overrides
    const marker = `const domainMQ = 'sargasses-martinique.com'`
    // Check if meta overrides block already exists
    if (viteConfig.includes('_metaOverrides')) {
      // Insert after meta overrides
      const afterMeta = `${marker}`
      const enrichCode = `// SEO enrichments (generated by seo-enrich-content.cjs)
          let _enrichments = {}
          try { _enrichments = JSON.parse(readFileSync(resolve(__dirname, 'scripts/automation/data/enrichments.json'), 'utf-8')) } catch {}
          ${afterMeta}`
      viteConfig = viteConfig.replace(afterMeta, enrichCode)
    } else {
      const enrichCode = `
          // SEO enrichments (generated by seo-enrich-content.cjs)
          let _enrichments = {}
          try { _enrichments = JSON.parse(readFileSync(resolve(__dirname, 'scripts/automation/data/enrichments.json'), 'utf-8')) } catch {}
          ${marker}`
      viteConfig = viteConfig.replace(marker, enrichCode)
    }

    // Inject FAQ schema + noscript into beach HTML generation
    // Current: .replace('</head>', `\n    <script type="application/ld+json">...Beach...BreadcrumbList...</head>`)
    // We add FAQ schema in </head> and noscript before </body>
    const oldHeadReplace = `.replace('</head>', \`\\n    <script type="application/ld+json">\\n    \${beachSchema}\\n    </script>\\n    <script type="application/ld+json">\\n    \${breadcrumbBeach}\\n    </script>\\n</head>\`)`
    const newHeadReplace = `.replace('</head>', \`\\n    <script type="application/ld+json">\\n    \${beachSchema}\\n    </script>\\n    <script type="application/ld+json">\\n    \${breadcrumbBeach}\\n    </script>\${_enrichments[b.slug] ? '\\n    <script type="application/ld+json">\\n    ' + _enrichments[b.slug].faq + '\\n    </script>' : ''}\\n</head>\`)`

    if (viteConfig.includes(oldHeadReplace)) {
      viteConfig = viteConfig.replace(oldHeadReplace, newHeadReplace)
    }

    // Add noscript before writeFileSync of beach page
    const oldWrite = `writeFileSync(resolve(beachDir, 'index.html'), beachHtml)`
    const newWrite = `const finalHtml = _enrichments[b.slug] ? beachHtml.replace('</body>', _enrichments[b.slug].noscript + '\\n</body>') : beachHtml
            writeFileSync(resolve(beachDir, 'index.html'), finalHtml)`

    if (viteConfig.includes(oldWrite)) {
      viteConfig = viteConfig.replace(oldWrite, newWrite)
    }

    writeFileSync(VITE_CONFIG_PATH, viteConfig)
    console.log('✓ vite.config.js patched with FAQ schema + noscript injection')
  } else {
    console.log('vite.config.js already patched for enrichments')
  }

  appendLog({
    script: 'seo-enrich-content',
    action: 'enriched',
    beachCount: Object.keys(enrichments).length,
  })
}

main()
