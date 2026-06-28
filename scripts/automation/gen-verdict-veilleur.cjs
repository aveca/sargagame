#!/usr/bin/env node
/**
 * gen-verdict-veilleur.cjs — « Le Verdict du Veilleur ».
 * Une image carrée auto-publiable du verdict le plus TRANCHÉ du jour, tirée de
 * la donnée satellite réelle. Mécanique double-emploi : acquisition (verdict
 * net, partageable) + preuve de fiabilité (le backtest qui parle).
 *
 * Sélection du verdict le plus tranché :
 *   - S'il existe une plage « à éviter » → c'est l'alerte du jour (négatif).
 *   - Sinon → le meilleur spot propre du jour (positif), en privilégiant à
 *     score quasi égal une plage FIABLE (pour pouvoir montrer sa crédibilité).
 *
 * GARDE-FOU streak/crédibilité : la ligne « N jours d'affilée » et le taux de
 * fiabilité ne s'affichent QUE pour les plages dont le backtest ≥ 85 %
 * (share-card.SEUIL_FIABILITE). Broadcaster une fiabilité sur une plage qu'on
 * prévoit mal = fausse info = risque réputation. Streak affiché si ≥ 3 jours
 * (en-dessous on s'appuie sur le taux backtest, plus robuste).
 *
 * GARDE-FOU partage : aucun lien sortant — domaine gravé dans l'image, et la
 * légende FB mentionne le domaine en texte (un lien tue la portée organique).
 *
 * GARDE-FOU déploiement : la publication FB est CÂBLÉE mais VERROUILLÉE
 * (DEPLOY_LOCKED). On construit maintenant, on branche quand le funnel
 * convertira. Même `--go` ne publie pas sans SARGA_DEPLOY_UNLOCK=1. La fonction
 * réutilise la session .fb-session et les délais anti-spam de fb-post-video.cjs.
 *
 * Usage :
 *   node scripts/automation/gen-verdict-veilleur.cjs --region=mq          # image + légende + file d'attente
 *   node scripts/automation/gen-verdict-veilleur.cjs --region=mq --publish # tente la publi (verrouillée par défaut)
 *   node scripts/automation/gen-verdict-veilleur.cjs --region=mq --preview=avoid # aperçu layout ALERTE (mock)
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib/share-card.cjs')

const args = process.argv.slice(2)
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null }
const PUBLISH = args.includes('--publish')
const GO = args.includes('--go')

const W = 1080, H = 1080, PAD = 72
const DEPLOY_LOCKED = true // ⛔ déploiement verrouillé tant que le funnel ne convertit pas
const STREAK_MIN_SHOW = 3  // streak affiché à partir de 3 jours d'affilée
const QUEUE_PATH = path.join(L.DATA_DIR, 'verdict-queue.json')
const SENT_PATH = path.join(L.DATA_DIR, 'verdict-sent.json')

// Groupes FB (mêmes cibles que fb-post-video.cjs)
const GROUPS = {
  mq: { url: 'https://www.facebook.com/groups/169026757271139/', name: 'SOS Sargasses Martinique' },
  gp: { url: 'https://www.facebook.com/groups/1264655221572269/', name: 'Destination Guadeloupe' },
}

/** Choisit le verdict le plus tranché de la région + sa crédibilité réelle. */
function pickVerdict(region) {
  const sarg = L.loadSarg()
  const bt = L.loadBacktest()
  const reliable = L.reliableBeaches(bt)
  const levels = L.levelsForRegion(sarg, region).filter(l => typeof l.score === 'number')
  if (!levels.length) return null

  const scoreOf = sl => (sarg.scores && sarg.scores[sl.id]) || {}
  let hero, type
  const avoids = levels.filter(l => l.status === 'avoid').sort((a, b) => (b.afai || 0) - (a.afai || 0))
  if (avoids.length) {
    hero = avoids[0]; type = 'avoid'
  } else {
    const cleans = levels.filter(l => l.status === 'clean').sort((a, b) => (b.score || 0) - (a.score || 0))
    const pool = cleans.length ? cleans : [...levels].sort((a, b) => (b.score || 0) - (a.score || 0))
    const top = pool[0]
    // À score quasi égal (≤6), préférer une plage fiable pour porter la crédibilité
    const relNear = pool.find(l => reliable.has(l.id) && (top.score - l.score) <= 6)
    hero = relNear || top
    type = 'go'
  }

  const isReliable = reliable.has(hero.id)
  const hitRate = isReliable && bt.byBeach[hero.id] ? bt.byBeach[hero.id].statusHitRate : null
  const streak = isReliable ? L.currentStreak(bt, hero.id) : 0
  const sc = scoreOf(hero)
  return {
    region, slug: hero.id, name: L.beachName(hero.id), type,
    score: hero.score, status: hero.status,
    reason: sc.reason || hero.reason || '',
    strengths: sc.strengths || [], weaknesses: sc.weaknesses || [],
    isReliable, hitRate, streak,
    archiveDays: bt && bt.archiveDays ? bt.archiveDays : null,
  }
}

/** Ligne de crédibilité — uniquement vraie, jamais inventée. */
function credibilityText(v) {
  if (!v.isReliable || v.hitRate == null) return null
  const parts = [`${v.hitRate}% vérifiées au satellite ici, tous régimes confondus`]
  if (v.archiveDays) parts.push(`backtest ${v.archiveDays} jours, daté`)
  if (v.streak >= STREAK_MIN_SHOW) parts.push(`${v.streak} matins d’affilée sans se tromper`)
  return parts.join(' · ')
}

function buildCard(v) {
  const reg = L.REGION[v.region]
  const isGo = v.type === 'go'
  const accent = isGo ? L.PALETTE.teal : (L.STATUS.avoid.color)
  const eyebrow = isGo ? 'LE VERDICT DU MATIN' : 'L’ALERTE DU MATIN'
  // Colonne nom à gauche, gouttière droite réservée à l'anneau (jamais de collision)
  const nameLines = L.wrapLines(v.name, 12)
  const reasonLines = v.reason ? L.wrapLines(v.reason, 40).slice(0, 2) : []
  const cred = credibilityText(v)

  const nameY = 360
  const nameFont = nameLines.length > 1 ? 72 : 88
  const ringX = W - PAD - 86, ringY = 318, ringR = 80

  // Carte crédibilité (si plage fiable) — texte wrappé pour ne jamais déborder
  let credBlock = ''
  if (cred) {
    const credLines = L.wrapLines(cred, 44).slice(0, 2)
    const cy = 762, ch = 70 + credLines.length * 38
    const txtX = PAD + 116
    credBlock = `<rect x="${PAD}" y="${cy}" width="${W - PAD * 2}" height="${ch}" rx="26" fill="${L.PALETTE.card}" stroke="${L.PALETTE.gold}" stroke-opacity="0.5"/>
      <path d="M ${PAD + 44} ${cy + 58} l 20 22 l 40 -46" fill="none" stroke="${L.PALETTE.gold}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${txtX}" y="${cy + 48}" font-family="${L.FONT}" font-size="25" font-weight="800" letter-spacing="2" fill="${L.PALETTE.gold}">CE QUE LE VEILLEUR A DÉJÀ VU JUSTE</text>
      ${credLines.map((ln, i) => `<text x="${txtX}" y="${cy + 86 + i * 38}" font-family="${L.FONT}" font-size="27" font-weight="600" fill="${L.PALETTE.white}">${L.esc(ln)}</text>`).join('')}`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${L.commonDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 30}" cy="60" r="220" fill="${accent}" opacity="0.07"/>
  <rect width="${W}" height="${H}" fill="url(#vign)"/>

  <!-- En-tête -->
  ${L.wordmark(PAD, 116, 'LE VEILLEUR', { size: 28 })}
  <text x="${W - PAD}" y="116" text-anchor="end" font-family="${L.FONT}" font-size="24" font-weight="700" letter-spacing="3" fill="${L.PALETTE.mut}">${L.esc(reg.label)}</text>
  <text x="${PAD}" y="156" font-family="${L.FONT}" font-size="23" font-weight="600" letter-spacing="1" fill="${L.PALETTE.mut}">${L.esc(L.dateLongFR(L.todayISO()))}</text>

  <!-- Eyebrow verdict -->
  <text x="${PAD}" y="262" font-family="${L.FONT}" font-size="34" font-weight="900" letter-spacing="3" fill="${accent}">${L.esc(eyebrow)}</text>

  <!-- Nom de la plage -->
  ${nameLines.map((ln, i) => `<text x="${PAD}" y="${nameY + i * (nameFont + 4)}" font-family="${L.FONT}" font-size="${nameFont}" font-weight="900" fill="${L.PALETTE.white}" letter-spacing="-2">${L.esc(ln)}</text>`).join('')}

  <!-- Anneau de score (gouttière droite réservée) -->
  <circle cx="${ringX}" cy="${ringY}" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="12"/>
  <circle cx="${ringX}" cy="${ringY}" r="${ringR}" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"
    stroke-dasharray="${(v.score / 100 * 2 * Math.PI * ringR).toFixed(1)} ${(2 * Math.PI * ringR).toFixed(1)}"
    transform="rotate(-90 ${ringX} ${ringY})"/>
  <text x="${ringX}" y="${ringY + 4}" text-anchor="middle" font-family="${L.FONT}" font-size="56" font-weight="900" fill="${L.PALETTE.white}">${v.score}</text>
  <text x="${ringX}" y="${ringY + 42}" text-anchor="middle" font-family="${L.FONT}" font-size="20" font-weight="700" letter-spacing="1" fill="${L.PALETTE.mut}">/ 100</text>

  <!-- Verdict mot + raison -->
  <text x="${PAD}" y="${nameY + nameLines.length * (nameFont + 4) + 36}" font-family="${L.FONT}" font-size="36" font-weight="900" letter-spacing="2" fill="${accent}">${L.esc(isGo ? 'PROPRE' : 'À ÉVITER')} <tspan fill="${L.PALETTE.mut}" font-weight="700" font-size="30" letter-spacing="0">· mesuré au satellite, pas deviné</tspan></text>
  ${reasonLines.map((ln, i) => `<text x="${PAD}" y="${nameY + nameLines.length * (nameFont + 4) + 96 + i * 40}" font-family="${L.FONT}" font-size="30" font-weight="500" fill="${L.PALETTE.mut}">${L.esc(ln)}</text>`).join('')}

  ${credBlock}
  ${L.domainWatermark(W, H, reg.domain)}
</svg>`
}

/** Légende FB (sans lien — domaine en texte, meilleure portée organique). */
function caption(v) {
  const reg = L.REGION[v.region]
  const head = v.type === 'go'
    ? `🌊 Le Verdict du Veilleur — ${reg.name}\n\nChaque matin, Le Veilleur regarde la mer pour toi.\n\n✅ ${v.name} : propre ce matin. ${v.score}/100, mesuré au satellite Copernicus — pas deviné.`
    : `🌊 Le Verdict du Veilleur — ${reg.name}\n\nChaque matin, Le Veilleur regarde la mer pour toi.\n\n⚠️ ${v.name} : sargasses détectées au large. À éviter ce matin — mesuré au satellite Copernicus, pas deviné. Passe au Plan B.`
  const cred = credibilityText(v)
  const credLine = cred ? `\n\n🛰️ ${cred}.` : ''
  const honesty = '\n\nRien de magique — et quand on se trompe, on l’écrit.'
  return `${head}${credLine}${honesty}\n\nLa carte complète, baie par baie, mise à jour 4×/jour — gratuite sur ${reg.domain}`
}

function alreadySentToday(region) {
  const log = L.loadJSON(SENT_PATH, {})
  return log[`${region}-${L.todayISO()}`] === true
}
function markSent(region) {
  const log = L.loadJSON(SENT_PATH, {})
  log[`${region}-${L.todayISO()}`] = true
  fs.writeFileSync(SENT_PATH, JSON.stringify(log, null, 2))
}

/**
 * Publication FB — câblée mais VERROUILLÉE. Réutilise .fb-session et le délai
 * anti-spam de fb-post-video.cjs (frappe lente, attentes). Ne publie jamais
 * sans SARGA_DEPLOY_UNLOCK=1, et jamais sans --go.
 */
async function publishImage(imagePath, text, region) {
  if (DEPLOY_LOCKED && process.env.SARGA_DEPLOY_UNLOCK !== '1') {
    console.log('⛔ Publication VERROUILLÉE (funnel pas encore réparé). Image + légende prêtes ; brancher plus tard.')
    console.log('   Pour débloquer (le moment venu) : SARGA_DEPLOY_UNLOCK=1 … --publish --go')
    return false
  }
  if (alreadySentToday(region)) { console.log('• déjà publié aujourd’hui pour ' + region + ' — anti-spam, on saute.'); return false }
  const group = GROUPS[region]
  const { chromium } = require(path.join(L.ROOT, 'node_modules', 'playwright'))
  const ctx = await chromium.launchPersistentContext(path.join(L.ROOT, '.fb-session'), {
    headless: args.includes('--headless'), viewport: { width: 1280, height: 900 }, locale: 'fr-FR',
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    if (!(await page.evaluate(() => !document.querySelector('input[name="email"]')))) {
      console.error('✗ session FB expirée — se reconnecter (pattern fb-scrape).'); await ctx.close(); return false
    }
    await page.goto(group.url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4500)
    await page.keyboard.press('Escape').catch(() => {})
    const triggers = ['div[role="button"]:has-text("Écrivez quelque chose")', 'div[role="button"]:has-text("Exprimez-vous")', 'div[role="button"]:has-text("Quoi de neuf")']
    let opened = false
    for (const sel of triggers) { const el = page.locator(sel).first(); if (await el.isVisible().catch(() => false)) { await el.click(); opened = true; break } }
    if (!opened) { console.error('✗ composer introuvable'); await ctx.close(); return false }
    const dialog = page.locator('div[role="dialog"]').last()
    await dialog.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    let box = dialog.locator('div[role="textbox"]').first()
    if (!(await box.count())) box = page.locator('div[role="textbox"]').last()
    await box.click({ timeout: 10000 })
    await box.type(text, { delay: 18 }) // délai anti-spam (même que fb-post-video)
    let fileInput = dialog.locator('input[type="file"]').first()
    if (!(await fileInput.count())) {
      const pv = dialog.locator('div[aria-label*="hoto"], div[role="button"]:has-text("Photo")').first()
      if (await pv.isVisible().catch(() => false)) { await pv.click(); await page.waitForTimeout(900) }
      fileInput = dialog.locator('input[type="file"]').first()
    }
    if (!(await fileInput.count())) fileInput = page.locator('input[type="file"]').last()
    await fileInput.setInputFiles(imagePath)
    await page.waitForTimeout(4000)
    const publishBtn = dialog.locator('div[aria-label="Publier"][role="button"], div[role="button"]:has-text("Publier")').last()
    if (!GO) { console.log('DRY-RUN — image attachée, rien publié. Relancer avec --go (et unlock).'); await ctx.close(); return false }
    if (!(await publishBtn.isVisible().catch(() => false))) { console.error('✗ bouton Publier indisponible'); await ctx.close(); return false }
    await publishBtn.click()
    await dialog.waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(5000)
    markSent(region)
    console.log('✓ publié dans ' + group.name)
    await ctx.close(); return true
  } catch (e) { console.error('FAIL publish', e.message); await ctx.close().catch(() => {}); return false }
}

/**
 * Aperçu du layout ALERTE (--preview=avoid). En saison calme tout est propre,
 * donc le chemin « à éviter » ne s'exerce jamais sur la donnée live : ce mode
 * force un verdict avoid (données MOCK, clairement étiqueté) pour vérifier le
 * rendu rouge. N'écrit RIEN dans la file et ne publie jamais.
 */
async function previewAvoid(region) {
  const bt = L.loadBacktest()
  const rel = L.reliableBeaches(bt)
  const lvls = L.levelsForRegion(L.loadSarg(), region)
  const lvl = lvls.find(l => rel.has(l.id)) || lvls[0] // plage fiable si possible (teste aussi le bloc crédibilité)
  const v = {
    region, slug: lvl.id, name: L.beachName(lvl.id), type: 'avoid', score: 22, status: 'avoid',
    reason: 'Banc de sargasses détecté au large, échouage en cours.',
    isReliable: rel.has(lvl.id), hitRate: rel.has(lvl.id) ? bt.byBeach[lvl.id].statusHitRate : null,
    streak: rel.has(lvl.id) ? L.currentStreak(bt, lvl.id) : 0,
    archiveDays: bt && bt.archiveDays ? bt.archiveDays : null,
  }
  const out = path.join(L.OUT_DIR, `verdict-${region}-PREVIEW-avoid.png`)
  const res = await L.renderSVG(buildCard(v), out)
  console.log('⚠️ APERÇU layout ALERTE — données MOCK (vérif rendu uniquement, hors file/queue/publi)')
  console.log(`  image → ${path.relative(L.ROOT, res.path)} (${res.width}×${res.height}, ${(res.bytes / 1024).toFixed(0)} Ko)`)
}

async function run() {
  const region = opt('region') || 'mq'
  if (!L.REGION[region]) { console.error('✗ région inconnue: ' + region); process.exit(1) }

  if (opt('preview') === 'avoid') { await previewAvoid(region); return }

  const v = pickVerdict(region)
  if (!v) { console.error('✗ aucune plage notée — verdict annulé (jamais de fausse donnée).'); process.exit(2) }

  const date = L.todayISO()
  const out = path.join(L.OUT_DIR, `verdict-${region}-${date}.png`)
  const res = await L.renderSVG(buildCard(v), out)
  const cap = caption(v)

  // File d'attente (contrat pour le branchement fb-post-groups au déploiement)
  const queue = L.loadJSON(QUEUE_PATH, { _comment: 'Verdicts prêts à publier. Généré par gen-verdict-veilleur.cjs. Publication verrouillée jusqu’à réparation du funnel.', items: [] })
  queue.items = (queue.items || []).filter(it => it.key !== `${region}-${date}`)
  queue.items.push({ key: `${region}-${date}`, region, date, type: v.type, beach: v.name, score: v.score, image: path.relative(L.ROOT, out), caption: cap, group: GROUPS[region].name, reliableLine: credibilityText(v), createdAt: new Date().toISOString() })
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2))

  console.log(`✓ Verdict du Veilleur ${region} — ${v.type === 'go' ? 'GO' : 'ALERTE'} : ${v.name} (${v.score}/100)`)
  console.log(`  fiabilité : ${v.isReliable ? v.hitRate + '% backtest' + (v.streak >= STREAK_MIN_SHOW ? ', streak ' + v.streak + 'j' : ' (streak ' + v.streak + 'j, masqué <' + STREAK_MIN_SHOW + ')') : 'NON fiable → aucun streak affiché (garde-fou)'}`)
  console.log(`  image     → ${path.relative(L.ROOT, res.path)} (${res.width}×${res.height}, ${(res.bytes / 1024).toFixed(0)} Ko)`)
  console.log(`  file      → ${path.relative(L.ROOT, QUEUE_PATH)}`)
  console.log('  légende   :')
  console.log(cap.split('\n').map(l => '    ' + l).join('\n'))

  if (PUBLISH) { console.log(''); await publishImage(out, cap, region) }
}

run().catch(e => { console.error('FAIL', e.message); process.exit(1) })
