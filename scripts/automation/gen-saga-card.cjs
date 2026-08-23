#!/usr/bin/env node
/**
 * gen-saga-card.cjs — « Le Sarga », carte mascotte MAGIQUE/FANTASY.
 *
 * La direction glow/étincelles (3e candidate de la lane jeune) est réservée aux
 * cartes STATIQUES : pas de jank gameplay, le halo brille. Hero = la créature
 * lumineuse ; sous-titre = la plage la plus propre du jour (donnée RÉELLE).
 *
 * Square 1080×1080. Zéro lien sortant, domaine gravé. Build-ahead (non déployé —
 * déploiement social verrouillé jusqu'au funnel OK).
 *
 * RÈGLE D'OR : aucun chiffre inventé. Si aucune plage « propre », on l'annonce
 * honnêtement (« la moins touchée ») au lieu de mentir.
 *
 * Sortie : scripts/automation/share-cards/out/saga-<region>-<date>.png (gitignoré)
 * Usage  : node scripts/automation/gen-saga-card.cjs --region=mq
 */
const path = require('path')
const L = require('./lib/share-card.cjs')
const CR = require('./lib/creature.cjs')

const args = process.argv.slice(2)
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }
const W = 1080, H = 1080, PAD = 72

/** Plage la plus propre du jour (réelle) ; fallback honnête « moins touchée ». */
function pickBeach(region) {
  const sarg = L.loadSarg()
  if (!sarg) return null
  const levels = L.levelsForRegion(sarg, region).filter(l => typeof l.score === 'number')
  if (!levels.length) return null
  const cleans = levels.filter(l => l.status === 'clean')
  const pool = cleans.length ? cleans : levels
  const best = [...pool].sort((a, b) => b.score - a.score)[0]
  return { slug: best.id, name: L.beachName(best.id), score: best.score, status: best.status, clean: cleans.length > 0 }
}

function buildCard(region, b, dateISO) {
  const reg = L.REGION[region]
  const cx = W / 2
  const creature = CR.sargaCreature({ variant: 'magic', x: 340, y: 188, scale: 2.0 })
  const headline = b.clean ? 'LA PLUS PROPRE AUJOURD’HUI' : 'LA MOINS TOUCHÉE AUJOURD’HUI'
  const nameLines = L.wrapLines(b.name, 16)
  const nameY = 660, nameLH = 78
  const afterName = nameY + (nameLines.length - 1) * nameLH
  const pillY = afterName + 40

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${L.commonDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="330" r="320" fill="${L.PALETTE.gold}" opacity="0.05"/>
  <rect width="${W}" height="${H}" fill="url(#vign)"/>
  ${L.wordmark(PAD, 110, 'LE SARGA', { size: 30 })}
  <text x="${W - PAD}" y="110" text-anchor="end" font-family="${L.FONT}" font-size="24" font-weight="700" letter-spacing="1.5" fill="${L.PALETTE.mut}">${L.esc(L.dateLongFR(dateISO))} · ${reg.label}</text>
  ${creature}
  <text x="${cx}" y="588" text-anchor="middle" font-family="${L.FONT}" font-size="26" font-weight="700" letter-spacing="3" fill="${L.PALETTE.teal}">${headline}</text>
  ${nameLines.map((ln, i) => `<text x="${cx}" y="${nameY + i * nameLH}" text-anchor="middle" font-family="${L.FONT}" font-size="76" font-weight="900" letter-spacing="-1" fill="${L.PALETTE.gold}">${L.esc(ln)}</text>`).join('')}
  <g transform="translate(${cx - 100},${pillY})">${L.statusPill(0, 0, b.status)}</g>
  <text x="${cx}" y="${pillY + 132}" text-anchor="middle" font-family="${L.FONT}" font-size="30" font-weight="700" fill="${L.PALETTE.mut}">Beach Score ${b.score}/100</text>
  ${L.domainWatermark(W, H, reg.domain)}
</svg>`
}

async function run() {
  const region = opt('region') || 'mq'
  if (!L.REGION[region]) { console.error('✗ région inconnue: ' + region); process.exit(1) }
  const b = pickBeach(region)
  if (!b) { console.error('✗ pas de plage notée — carte annulée (jamais de fausse donnée).'); process.exit(2) }
  const date = L.todayISO()
  const out = path.join(L.OUT_DIR, `saga-${region}-${date}.png`)
  const r = await L.renderSVG(buildCard(region, b, date), out)
  console.log(`✓ Le Sarga ${region} — ${b.name} (${b.score}/100, ${b.clean ? 'propre' : 'moins touchée'})`)
  console.log(`  carte → ${path.relative(L.ROOT, r.path)} (${(r.bytes / 1024).toFixed(0)} Ko)`)
}

run().catch(e => { console.error('FAIL', e.message); process.exit(1) })
