#!/usr/bin/env node
/**
 * Generate social media images for Facebook/WhatsApp posts.
 * Uses sharp + SVG to render data-driven social cards.
 *
 * Usage: node scripts/generate-social-image.cjs
 * Output: public/social-facebook-mq.png, public/social-facebook-gp.png
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const BEACHES_PATH = path.join(__dirname, '..', 'public', 'data', 'beaches-list.json')
const OUTPUT_DIR = path.join(__dirname, '..', 'public')

function getStats(beaches, island) {
  const filtered = beaches.filter(b => b.island === island)
  const clean = filtered.filter(b => b.status === 'clean')
  const moderate = filtered.filter(b => b.status === 'moderate')
  const avoid = filtered.filter(b => b.status === 'avoid')
  const topClean = clean
    .sort((a, b) => ((b.kids ? 1 : 0) + (b.parking ? 1 : 0) + (b.snorkel ? 1 : 0)) - ((a.kids ? 1 : 0) + (a.parking ? 1 : 0) + (a.snorkel ? 1 : 0)))
    .slice(0, 3)
  return { total: filtered.length, clean: clean.length, moderate: moderate.length, avoid: avoid.length, topClean }
}

function buildSVG(island, stats, islandName) {
  const topRows = stats.topClean.map((b, i) => `
    <circle cx="80" cy="${365 + i * 52}" r="8" fill="#22C55E"/>
    <text x="100" y="${370 + i * 52}" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#fff">${b.name}</text>
    <text x="100" y="${390 + i * 52}" font-family="system-ui,sans-serif" font-size="13" fill="rgba(255,255,255,0.5)">${b.commune}</text>
  `).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0D1E1C"/>
      <stop offset="100%" stop-color="#132E2A"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FFE47A"/>
      <stop offset="50%" stop-color="#FFC72C"/>
      <stop offset="100%" stop-color="#E89400"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Decorative dots pattern (right side) -->
  ${Array.from({length: 12}, (_, i) => {
    const y = 60 + i * 44
    const w = 20 + Math.sin(i * 0.8) * 60 + 60
    const colors = ['#22C55E', '#16A34A', '#E8A800', '#22C55E', '#0EA5E9', '#22C55E']
    return `<rect x="${1200 - w - 40}" y="${y}" width="${w}" height="24" rx="12" fill="${colors[i % colors.length]}" opacity="0.15"/>`
  }).join('')}

  <!-- LIVE badge -->
  <circle cx="72" cy="60" r="6" fill="#22C55E"/>
  <text x="86" y="65" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#22C55E" letter-spacing="2">LIVE</text>

  <!-- Title -->
  <text x="60" y="140" font-family="system-ui,sans-serif" font-size="52" font-weight="900" fill="#fff">Sargasses ${islandName}</text>

  <!-- Big number -->
  <text x="60" y="230" font-family="system-ui,sans-serif" font-size="80" font-weight="900" fill="url(#gold)">${stats.clean}</text>
  <text x="${stats.clean >= 10 ? 240 : 160}" y="${230}" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="rgba(255,255,255,0.7)"> plages propres</text>

  <!-- Stats row -->
  <text x="60" y="275" font-family="system-ui,sans-serif" font-size="18" fill="rgba(255,255,255,0.5)">sur ${stats.total} surveillees par satellite · ${stats.moderate} moderees · ${stats.avoid} alertes</text>

  <!-- Separator -->
  <rect x="60" y="310" width="120" height="3" rx="1.5" fill="#E8A800" opacity="0.5"/>

  <!-- Top beaches label -->
  <text x="60" y="348" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#E8A800" letter-spacing="1.5">RECOMMANDEES CE WEEKEND</text>

  <!-- Top beaches -->
  ${topRows}

  <!-- Bottom bar -->
  <rect x="0" y="560" width="1200" height="70" fill="rgba(0,0,0,0.3)"/>
  <text x="60" y="603" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="rgba(255,255,255,0.6)">sargasses-${islandName.toLowerCase()}.com</text>
  <text x="560" y="603" font-family="system-ui,sans-serif" font-size="14" fill="rgba(255,255,255,0.35)">Donnees satellite NOAA · Mis a jour 4x/jour · Bulletin gratuit chaque vendredi</text>
</svg>`
}

async function main() {
  const beaches = JSON.parse(fs.readFileSync(BEACHES_PATH, 'utf-8'))

  for (const [island, name] of [['mq', 'Martinique'], ['gp', 'Guadeloupe']]) {
    const stats = getStats(beaches, island)
    const svg = buildSVG(island, stats, name)
    const outPath = path.join(OUTPUT_DIR, `social-facebook-${island}.png`)

    await sharp(Buffer.from(svg))
      .png({ quality: 90 })
      .toFile(outPath)

    console.log(`Generated ${outPath} (${stats.clean} clean / ${stats.total} total)`)
  }
}

main().catch(e => console.error(e))
