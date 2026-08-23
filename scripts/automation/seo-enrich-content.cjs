#!/usr/bin/env node
/**
 * SEO Enrich Content — Add FAQ schema + rich noscript content (~1000 words/beach)
 * to help beach pages escape thin-content indexation filter.
 *
 * Sources:
 *   - beaches-list.json (amenities: kids, parking, snorkel, drive time)
 *   - forecast-archive.json (historical status breakdown)
 *   - Nearest beaches (internal linking)
 *
 * Output: enrichments.json consumed by vite.config.js at build time.
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')
const { BEACHES } = require('./lib/config.cjs')
const { DRY_RUN, LIMITS, appendLog } = require('./lib/safety.cjs')
// Map partagée clé d'archive SARG → id beaches-list (même source que vite.config.js).
const { SARG_TO_BEACH } = require('../lib/sarg-to-beach.cjs')

/**
 * Load full beach records (with amenities) from beaches-list.json.
 * Returns a map keyed by slug.
 */
function loadFullBeaches() {
  try {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'public', 'data', 'beaches-list.json'), 'utf-8'))
    const byId = {}
    for (const b of raw) byId[b.id] = b
    return byId
  } catch { return {} }
}

/**
 * Load forecast archive — indexed by snapshot date.
 * Returns { beachSlug: { clean: n, moderate: n, avoid: n, total: n } }
 */
function loadHistoricalStatus() {
  try {
    const arch = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'public', 'api', 'copernicus', 'forecast-archive.json'), 'utf-8'))
    const counts = {}
    for (const snap of arch.snapshots || []) {
      for (const [slug, data] of Object.entries(snap.forecasts || {})) {
        // Les clés de l'archive sont des IDs SARG courts (ex 'les-salines') → on re-clé
        // sur l'id beaches-list (ex 'mq001') pour matcher la jointure plus bas. Clé non
        // mappée = ignorée (ne crée pas d'entrée orpheline jamais jointe).
        const id = SARG_TO_BEACH[slug]
        if (!id) continue
        if (!counts[id]) counts[id] = { clean: 0, moderate: 0, avoid: 0, total: 0 }
        const todayStatus = data.forecast?.[0]?.status
        if (todayStatus === 'clean') counts[id].clean++
        else if (todayStatus === 'moderate') counts[id].moderate++
        else if (todayStatus === 'avoid') counts[id].avoid++
        counts[id].total++
      }
    }
    return counts
  } catch { return {} }
}

/**
 * Build a rich noscript content block (~1000 words) for a single beach.
 * Optimized for Google's crawlable-but-not-thin threshold.
 */
function buildRichNoscript({ beach, fullRecord, neighbors, history, island, domain }) {
  const commune = beach.commune || ''
  const amenities = []
  if (fullRecord?.kids) amenities.push('adaptée aux enfants')
  if (fullRecord?.snorkel) amenities.push('propice au snorkeling et palmes-masque-tuba')
  if (fullRecord?.parking) amenities.push('parking accessible à proximité')
  const drive = typeof fullRecord?.drive === 'number' ? fullRecord.drive : null

  // Historical narrative — turns raw counts into readable sentences
  let histNarrative = ''
  if (history && history.total >= 3) {
    const pctClean = Math.round((history.clean / history.total) * 100)
    const pctMod = Math.round((history.moderate / history.total) * 100)
    const pctAvoid = Math.round((history.avoid / history.total) * 100)
    const dominant = pctClean >= 60 ? 'majoritairement propre'
      : pctAvoid >= 40 ? 'régulièrement impactée par les sargasses'
      : pctMod >= 40 ? 'fluctuante avec des épisodes modérés'
      : 'variable selon les vents dominants'
    histNarrative = `Sur les ${history.total} derniers jours surveillés par satellite, <strong>${beach.name}</strong> a été ${dominant} : ${history.clean} jours en statut propre (${pctClean}%), ${history.moderate} jours en statut modéré (${pctMod}%), et ${history.avoid} jours en statut d'alerte sargasses (${pctAvoid}%). Ces observations continues permettent d'anticiper les fenêtres favorables pour planifier une baignade ou une sortie famille.`
  } else {
    histNarrative = `La plage de <strong>${beach.name}</strong> est surveillée en continu par les satellites Sentinel-3 du programme européen Copernicus. L'historique des observations est actualisé chaque jour, ce qui permet de repérer rapidement les fenêtres de baignade favorables et d'anticiper l'arrivée éventuelle de sargasses sur la côte.`
  }

  const amenityText = amenities.length > 0
    ? `Cette plage de ${commune} est ${amenities.join(', ')}.`
    : `Cette plage de ${commune} fait partie des sites surveillés de ${island}.`

  const driveText = drive !== null
    ? `Elle se situe à environ <strong>${drive} minutes</strong> en voiture du chef-lieu, ce qui en fait une destination accessible pour une sortie à la journée.`
    : ''

  const neighborLinks = neighbors.map(n =>
    `<li><a href="https://${domain}/plages/${n.slug}/">Sargasses à ${n.name}</a> — ${Math.round(n.distance)} km de ${beach.name}</li>`
  ).join('\n          ')

  const neighborText = neighbors.length > 0
    ? neighbors.map(n => `${n.name} (${Math.round(n.distance)} km)`).join(', ')
    : 'les autres plages surveillées de l\'île'

  return `
    <noscript>
      <article>
        <header>
          <h1>Sargasses à ${beach.name} — état en temps réel (${island})</h1>
          <p><em>Prévisions sargasses pour ${beach.name}, ${commune}, ${island}. Données satellite Sentinel-3 mises à jour quotidiennement.</em></p>
        </header>

        <section>
          <h2>État actuel et surveillance satellite</h2>
          <p>La plage de <strong>${beach.name}</strong>, située à ${commune} en ${island}, fait l'objet d'une surveillance satellite continue dans le cadre de notre service de prévisions sargasses. L'indice AFAI (Alternative Floating Algae Index), dérivé des images Sentinel-3 du programme Copernicus Marine, permet de détecter la présence et la densité des radeaux de sargasses flottantes jusqu'à 40 km au large de la côte. ${amenityText} ${driveText}</p>
          <p>Les données sont mises à jour toutes les 3 heures via notre pipeline automatisé, ce qui permet aux visiteurs de ${beach.name} de consulter l'état le plus récent avant de se déplacer. La carte interactive affiche les plages propres, modérément touchées et en alerte, avec un code couleur conforme aux seuils NOAA/AOML (Wang & Hu 2016).</p>
        </section>

        <section>
          <h2>Historique récent des sargasses à ${beach.name}</h2>
          <p>${histNarrative}</p>
          <p>Les sargasses suivent des cycles saisonniers marqués par les courants du Gulf Stream et les vents d'alizé. En ${island}, la saison principale s'étend typiquement d'avril à septembre, avec des pics d'échouage souvent observés entre mai et juillet. Toutefois, l'évolution du climat et la variabilité des courants peuvent décaler ces fenêtres : c'est précisément pour cette raison que nous proposons une surveillance 365 jours par an plutôt qu'une information saisonnière figée.</p>
        </section>

        <section>
          <h2>Comment lire les prévisions de ${beach.name}</h2>
          <p>Pour chaque plage surveillée, trois états sont possibles selon l'indice AFAI observé :</p>
          <ul>
            <li><strong>Propre (vert)</strong> — AFAI inférieur à 0,15. Pas de sargasses détectées ou présence très faible. Baignade recommandée.</li>
            <li><strong>Modéré (orange)</strong> — AFAI entre 0,15 et 0,40. Présence variable, vigilance recommandée surtout pour les enfants et les personnes sensibles aux émanations de sulfure d'hydrogène.</li>
            <li><strong>Alerte (rouge)</strong> — AFAI supérieur à 0,40. Échouage significatif probable ou en cours. Baignade déconseillée tant que la situation n'est pas revenue à la normale.</li>
          </ul>
          <p>Notre système combine plusieurs signaux pour chaque prévision : observation satellite du jour, indice AFAI continu (qui différencie 0,05 de 0,14, tous deux classés « propre »), prévision à J+1 et J+3, détection de bancs en approche dans un rayon de 40 km, et mémoire des plages régulièrement impactées. Le Beach Score 0-100 synthétise ces facteurs pour permettre une comparaison rapide entre plages voisines.</p>
        </section>

        <section>
          <h2>Plages proches de ${beach.name}</h2>
          <p>Si ${beach.name} n'est pas accessible pour une raison ou une autre — échouage en cours, marée défavorable, fréquentation — vous pouvez vous rabattre sur ${neighborText}. Ces plages proches partagent souvent des conditions similaires mais peuvent présenter un état sargasses différent selon l'orientation de la côte et les courants locaux.</p>
          <ul>
          ${neighborLinks}
          </ul>
        </section>

        <section>
          <h2>Sources et méthodologie</h2>
          <p>Les prévisions sargasses pour ${beach.name} s'appuient sur les données publiques du programme Copernicus Marine Service (Union Européenne), via l'API ERDDAP de la NOAA/AOML (Atlantic Oceanographic and Meteorological Laboratory). Les seuils d'interprétation de l'indice AFAI suivent les recommandations de la publication scientifique de Wang & Hu (2016, Geophysical Research Letters) ainsi que le Sargassum Inundation Report v1.4 du NOAA. Notre application ne remplace pas l'observation terrain : en cas de doute, nous recommandons de consulter les bulletins locaux des communes et les signalements citoyens.</p>
          <p>Pour explorer l'ensemble des plages de ${island}, consultez notre <a href="https://${domain}/carte-sargasses/">carte interactive des sargasses</a>, nos <a href="https://${domain}/previsions/">prévisions 7 jours</a>, ou notre <a href="https://${domain}/alertes/">système d'alertes instantanées</a>. Pour ne plus avoir à vérifier manuellement chaque matin, le service premium envoie un brief quotidien à 7h avec la meilleure plage du jour.</p>
        </section>

        <footer>
          <p><a href="https://${domain}/">Retour à l'accueil — Sargasses ${island}</a> · <a href="https://${domain}/plages/">Toutes les plages</a> · <a href="https://${domain}/carte-sargasses/">Carte</a> · <a href="https://${domain}/previsions/">Prévisions</a></p>
        </footer>
      </article>
    </noscript>`
}

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
  const fullBeachesById = loadFullBeaches()
  const historicalStatus = loadHistoricalStatus()
  const enrichments = {}

  for (const beach of BEACHES) {
    const island = beach.island === 'mq' ? 'Martinique' : 'Guadeloupe'
    const domain = beach.island === 'mq' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
    const neighbors = findNearestBeaches(beach.id, beach.island, coords, 3)
    const fullRecord = fullBeachesById[beach.id] || null
    const history = historicalStatus[beach.id] || null

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

    // Rich noscript content block (~1000 words, crawlable by Google)
    const noscript = buildRichNoscript({ beach, fullRecord, neighbors, history, island, domain })

    // Data-driven meta title/description — uses historical % to create clickable differentiator
    // in SERP. Example: "Les Salines: 86% propres sur 7j (Martinique) — Prévisions sargasses"
    let metaTitle = null
    let metaDesc = null
    if (history && history.total >= 3) {
      const pctClean = Math.round((history.clean / history.total) * 100)
      const pctAvoid = Math.round((history.avoid / history.total) * 100)
      const days = history.total
      if (pctClean >= 60) {
        metaTitle = `${beach.name}: propre ${pctClean}% du temps (${days}j) — Sargasses ${island}`
        metaDesc = `Sur ${days} jours surveillés, ${beach.name} (${beach.commune}) a été propre ${pctClean}% du temps. État en temps réel, prévisions 7 jours, carte interactive ${island}.`
      } else if (pctAvoid >= 40) {
        metaTitle = `${beach.name}: ${pctAvoid}% en alerte sargasses (${days}j) — Alternatives`
        metaDesc = `${beach.name} a connu ${pctAvoid}% de jours en alerte sargasses sur ${days} jours. Consultez l'état en temps réel, les prévisions, et les plages propres à proximité (${island}).`
      } else {
        const pctMod = Math.round((history.moderate / history.total) * 100)
        metaTitle = `${beach.name}: ${pctMod}% modéré, ${pctClean}% propre (${days}j) — ${island}`
        metaDesc = `Historique sargasses ${beach.name} (${beach.commune}): ${pctClean}% propre, ${pctMod}% modéré, ${pctAvoid}% alerte sur ${days} jours. Prévisions 7 jours en temps réel.`
      }
    }

    enrichments[beach.slug] = { faq: JSON.stringify(faq), noscript, metaTitle, metaDesc }
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
