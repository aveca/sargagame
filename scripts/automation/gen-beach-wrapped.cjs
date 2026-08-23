#!/usr/bin/env node
/**
 * gen-beach-wrapped.cjs — « Mon été Sargasses » : carte de partage perso de fin
 * de saison, façon Spotify Wrapped. Mécanique double-emploi : acquisition
 * (le partage se voit) + amorce de la capture ground-truth (l'utilisateur
 * s'approprie sa saison).
 *
 * GARDE-FOU : aucun lien sortant. Le domaine est gravé DANS l'image (un lien
 * tue le partage natif). Deux formats : 1080×1350 (4:5, feed FB/IG, défaut) et
 * 1080×1920 (9:16, story/Reel/TikTok) via --format=story.
 *
 * BUILD-AHEAD : le générateur prend en entrée un « profil de saison » (contrat
 * ci-dessous). Le pipeline first-party (collect.php / stats.php) le remplira
 * plus tard ; en attendant, sans --profile on fabrique un profil de démo dérivé
 * de la donnée RÉELLE des plages, pour pouvoir vérifier le rendu.
 *
 * Contrat profil (JSON) :
 *   {
 *     "region": "mq" | "gp",
 *     "season": "Été 2026",
 *     "daysChecked": <int>,        // jours où l'utilisateur a consulté
 *     "favoriteBeachSlug": "<slug pipeline>",  // optionnel ; sinon meilleure plage du jour
 *     "cleanDaysFound": <int>,     // jours « propre » trouvés sur sa plage préférée
 *     "alertsAvoided": <int>       // alertes sargasses esquivées
 *   }
 *
 * Usage :
 *   node scripts/automation/gen-beach-wrapped.cjs --region=mq
 *   node scripts/automation/gen-beach-wrapped.cjs --region=mq --format=story
 *   node scripts/automation/gen-beach-wrapped.cjs --profile=chemin/profil.json
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib/share-card.cjs')

const args = process.argv.slice(2)
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }

const W = 1080, PAD = 72

/** Profil de démo dérivé de la donnée réelle (jamais commité — sert au rendu). */
function demoProfile(region) {
  const sarg = L.loadSarg()
  const levels = L.levelsForRegion(sarg, region)
  // Plage préférée = meilleure plage propre du jour (donnée réelle)
  const cleans = levels.filter(l => l.status === 'clean').sort((a, b) => (b.score || 0) - (a.score || 0))
  const fav = cleans[0] || levels[0]
  return {
    _demo: true,
    region,
    season: 'Été 2026',
    daysChecked: 47,
    favoriteBeachSlug: fav ? fav.id : null,
    cleanDaysFound: 38,
    alertsAvoided: 9,
  }
}

function bigStatCard(x, y, w, h, number, unit, label, accent) {
  const numColor = accent || L.PALETTE.gold
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="${L.PALETTE.card}" stroke="${L.PALETTE.cardLine}"/>
    <text x="${x + 40}" y="${y + 120}" font-family="${L.FONT}" font-size="104" font-weight="900" fill="${numColor}">${L.esc(number)}<tspan font-size="44" font-weight="800" dx="8" fill="${L.PALETTE.mut}">${L.esc(unit || '')}</tspan></text>
    <text x="${x + 42}" y="${y + 165}" font-family="${L.FONT}" font-size="27" font-weight="600" fill="${L.PALETTE.mut}">${L.esc(label)}</text>`
}

function build(profile, format) {
  const isStory = format === 'story'
  const H = isStory ? 1920 : 1350
  const region = profile.region === 'gp' ? 'gp' : 'mq'
  const reg = L.REGION[region]
  const favName = profile.favoriteBeachSlug ? L.beachName(profile.favoriteBeachSlug) : 'Ma plage'
  // Score réel de la plage préférée si dispo (sinon on n'affiche pas de score)
  const sarg = L.loadSarg()
  const favLevel = (sarg.levels || []).find(l => l.id === profile.favoriteBeachSlug)
  const favScore = favLevel && typeof favLevel.score === 'number' ? favLevel.score : null
  const favStatus = favLevel ? favLevel.status : 'clean'

  // Ancrages verticaux selon le format (les blocs sont les mêmes, l'espace varie)
  const lay = isStory
    ? { headY: 132, titleY: 380, titleF: 104, heroY: 760, heroH: 226, favY: 1052, favH: 248, halfY: 1356, halfH: 214 }
    : { headY: 120, titleY: 250, titleF: 96, heroY: 500, heroH: 200, favY: 724, favH: 208, halfY: 956, halfH: 188 }
  const cardX = PAD, cardW = W - PAD * 2
  const halfW = (cardW - 32) / 2

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${L.commonDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 40}" cy="${lay.headY}" r="240" fill="${L.PALETTE.teal}" opacity="0.07"/>
  <circle cx="120" cy="${H - 120}" r="200" fill="${L.PALETTE.gold}" opacity="0.05"/>
  <rect width="${W}" height="${H}" fill="url(#vign)"/>

  <!-- En-tête -->
  ${L.wordmark(PAD, lay.headY, 'SARGASSES', { size: 26 })}
  <text x="${W - PAD}" y="${lay.headY}" text-anchor="end" font-family="${L.FONT}" font-size="24" font-weight="700" letter-spacing="3" fill="${L.PALETTE.mut}">${L.esc(reg.label)}</text>

  <!-- Titre -->
  <text x="${PAD}" y="${lay.titleY}" font-family="${L.FONT}" font-size="${lay.titleF}" font-weight="900" fill="${L.PALETTE.white}" letter-spacing="-2">MON ÉTÉ</text>
  <text x="${PAD}" y="${lay.titleY + lay.titleF + 8}" font-family="${L.FONT}" font-size="${lay.titleF}" font-weight="900" fill="url(#goldgrad)" letter-spacing="-2">SARGASSES</text>
  <text x="${PAD}" y="${lay.titleY + lay.titleF + 62}" font-family="${L.FONT}" font-size="30" font-weight="700" letter-spacing="6" fill="${L.PALETTE.teal}">${L.esc(profile.season.toUpperCase())}</text>

  <!-- Stat héro : jours vérifiés -->
  ${bigStatCard(cardX, lay.heroY, cardW, lay.heroH, String(profile.daysChecked), 'jours', "à checker ma plage avant de partir", L.PALETTE.gold)}

  <!-- Plage préférée -->
  <rect x="${cardX}" y="${lay.favY}" width="${cardW}" height="${lay.favH}" rx="30" fill="${L.PALETTE.card}" stroke="${L.PALETTE.cardLine}"/>
  <text x="${cardX + 42}" y="${lay.favY + 56}" font-family="${L.FONT}" font-size="25" font-weight="700" letter-spacing="3" fill="${L.PALETTE.teal}">MA PLAGE DE L'ÉTÉ</text>
  <text x="${cardX + 40}" y="${lay.favY + 128}" font-family="${L.FONT}" font-size="64" font-weight="900" fill="${L.PALETTE.white}">${L.esc(favName)}</text>
  ${favScore != null
      ? `<text x="${cardX + 42}" y="${lay.favY + 178}" font-family="${L.FONT}" font-size="27" font-weight="600" fill="${L.PALETTE.mut}">${favScore}/100 aujourd'hui</text>
         <circle cx="${cardX + cardW - 92}" cy="${lay.favY + 104}" r="58" fill="none" stroke="${(L.STATUS[favStatus] || L.STATUS.clean).color}" stroke-width="8" opacity="0.9"/>
         <text x="${cardX + cardW - 92}" y="${lay.favY + 120}" text-anchor="middle" font-family="${L.FONT}" font-size="48" font-weight="900" fill="${L.PALETTE.white}">${favScore}</text>`
      : ''}

  <!-- 2 demi-cartes -->
  ${bigStatCard(cardX, lay.halfY, halfW, lay.halfH, String(profile.cleanDaysFound), '', 'jours sans sargasses', L.PALETTE.teal)}
  ${bigStatCard(cardX + halfW + 32, lay.halfY, halfW, lay.halfH, String(profile.alertsAvoided), '', 'alertes esquivées', '#6AC15A')}

  <!-- Pied : domaine gravé (aucun lien) -->
  ${L.domainWatermark(W, H, reg.domain)}
</svg>`
  return { svg, region }
}

async function run() {
  const profilePath = opt('profile')
  let profile
  if (profilePath) {
    profile = L.loadJSON(path.resolve(profilePath))
    if (!profile) { console.error('✗ profil illisible: ' + profilePath); process.exit(1) }
  } else {
    profile = demoProfile(opt('region') || 'mq')
  }

  const format = opt('format') === 'story' ? 'story' : 'feed'
  const { svg, region } = build(profile, format)
  const date = L.todayISO()
  const tag = profile._demo ? 'demo' : (profile.userId || 'user')
  const out = path.join(L.OUT_DIR, `wrapped-${region}-${tag}-${format}-${date}.png`)
  const res = await L.renderSVG(svg, out)
  console.log(`✓ Beach Wrapped ${region} (${format}) → ${path.relative(L.ROOT, res.path)}`)
  console.log(`  ${res.width}×${res.height} · ${(res.bytes / 1024).toFixed(0)} Ko${profile._demo ? ' · PROFIL DÉMO (donnée réelle plage)' : ''}`)
}

run().catch(e => { console.error('FAIL', e.message); process.exit(1) })
