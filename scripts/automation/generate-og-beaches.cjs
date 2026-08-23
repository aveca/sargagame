#!/usr/bin/env node
/**
 * generate-og-beaches.cjs
 * Génère dynamiquement des images OG (1200x630) pour chaque plage en utilisant la
 * géométrie de la BeachScene (golden hour + Veilleur) et sharp.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib/share-card.cjs')
const sceneSvg = require('../lib/scene-svg.cjs')

const OUT_DIR = path.join(L.ROOT, 'public', 'images', 'og')
fs.mkdirSync(OUT_DIR, { recursive: true })

async function generateOg(beach, status, score, updatedAt) {
  // 1. Construire l'image SVG de base (Golden Hour)
  const lv = { status, score, afai: status === 'clean' ? 0.2 : 0.8 }
  const rawSvg = sceneSvg.buildHeroSvg(beach, lv, { updatedAt }, { phase: 'golden' })
  
  // 2. Extraire le contenu intérieur du SVG retourné
  // La fonction buildHeroSvg renvoie un <svg viewBox="0 0 800 600" ...>...</svg>
  const innerContentMatch = rawSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
  const innerContent = innerContentMatch ? innerContentMatch[1] : ''

  const W = 1200
  const H = 630
  
  // L'original est 800x600. On le scale pour couvrir 1200x630 (scale=1.5, donc 1200x900).
  // On décale en Y de -100 pour centrer.
  const scale = 1.5
  const dy = -100
  
  const statusStr = status === 'clean' ? 'PROPRE' : (status === 'avoid' ? 'À ÉVITER' : 'MODÉRÉ')
  const statusColor = L.STATUS[status] ? L.STATUS[status].color : L.STATUS.clean.color
  const islandName = beach.island === 'mq' ? 'Martinique' : 'Guadeloupe'
  
  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${L.PALETTE.ink}"/>
    
    <g transform="translate(0, ${dy}) scale(${scale})">
      ${innerContent}
    </g>
    
    <!-- Filtre dégradé bas pour lisibilité -->
    <rect x="0" y="${H - 240}" width="${W}" height="240" fill="url(#bottomGrad)"/>
    
    <defs>
      <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${L.PALETTE.ink}" stop-opacity="0"/>
        <stop offset="1" stop-color="${L.PALETTE.ink}" stop-opacity="0.9"/>
      </linearGradient>
    </defs>
    
    <!-- Typographie -->
    <text x="60" y="${H - 120}" font-family="${L.FONT}" font-size="52" font-weight="900" fill="${L.PALETTE.white}">${L.esc(beach.name)}</text>
    <text x="60" y="${H - 60}" font-family="${L.FONT}" font-size="34" font-weight="600" fill="${L.PALETTE.mut}">Sargasses en ${islandName} aujourd'hui · <tspan fill="${statusColor}" font-weight="800">${statusStr}</tspan></text>
    
    <text x="${W - 60}" y="${H - 60}" text-anchor="end" font-family="${L.FONT}" font-size="28" font-weight="800" fill="${L.PALETTE.gold}">LE VEILLEUR</text>
  </svg>`
  
  const outPath = path.join(OUT_DIR, `${beach.slug}.png`)
  await L.renderSVG(ogSvg, outPath)
  return outPath
}

async function run() {
  const sarg = L.loadSarg()
  const listPath = path.join(L.ROOT, 'public', 'data', 'beaches-list.json')
  const beaches = JSON.parse(fs.readFileSync(listPath, 'utf-8'))
  
  console.log(`Generating OG images for ${beaches.length} beaches...`)
  let count = 0
  for (const beach of beaches) {
    const sargId = L.PIPELINE_BEACHES[beach.id] ? beach.id : (beach.slug || beach.id)
    const lvLive = sarg.levels && sarg.levels.find(l => l.id === sargId)
    const status = lvLive ? lvLive.status : (beach.status || 'clean')
    const score = lvLive ? lvLive.score : null
    
    await generateOg(beach, status, score, sarg.updatedAt)
    count++
    if (count % 20 === 0) console.log(`  ... ${count}/${beaches.length}`)
  }
  
  console.log(`✓ Generated ${count} dynamic OG images in public/images/og/`)
}

run().catch(e => {
  console.error('FAIL', e)
  process.exit(1)
})
