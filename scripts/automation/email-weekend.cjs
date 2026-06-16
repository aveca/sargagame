#!/usr/bin/env node
/**
 * Weekend Email Bulletin — Sargasses MQ/GP
 *
 * Sends a formatted HTML email every Friday to all captured emails
 * via Google Apps Script (which uses MailApp.sendEmail).
 *
 * Setup:
 * 1. The Apps Script at WEBHOOK_URL must handle type="weekend_email"
 * 2. It reads emails from the Sheet and sends HTML email to each
 *
 * Usage:
 *   node scripts/automation/email-weekend.cjs
 *   node scripts/automation/email-weekend.cjs --force  (ignore day check)
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { injectPreheader, applyBrand } = require('./lib/email-send.cjs')

const FORCE = process.argv.includes('--force')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const SENT_PATH = path.join(__dirname, 'data/weekend-sent.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
function unsubUrl(island) { return `${WEBHOOK_URL}?action=unsubscribe&email={{EMAIL}}&island=${island.toUpperCase()}` }

const SARG_TO_BEACH = {
  "grande-anse":"mq014","anse-mitan":"mq011","anse-noire":"mq012","tartane":"mq034",
  "anse-madame":"mq024","diamant":"mq016","pt-marin":"mq008","sainte-anne":"mq004",
  "les-salines":"mq001","vauclin":"mq044",
  "gp-grande-anse":"gp021","gp-malendure":"gp031","gp-sainte-anne":"gp010",
  "gp-pt-chateaux":"gp005","gp-gosier":"gp012","gp-caravelle":"gp009",
  "gp-bas-du-fort":"gp014","gp-deshaies":"gp024","gp-moule":"gp080","gp-vieux-fort":"gp042"
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data)
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      // Apps Script always returns 302 — that means doPost executed successfully
      // The redirect goes to googleusercontent.com which returns the JSON response
      // We treat 302 as success (doPost ran, emails dispatched server-side)
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    req.write(payload); req.end()
  })
}

function buildEmailHTML(island, topBeaches, stats, domain) {
  const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
  const beachRows = topBeaches.map(b => {
    const hasScore = typeof b.unifiedScore === 'number'
    const color = b.unifiedColor || (b.status === 'clean' ? '#16A34A' : '#B87A00')
    const label = b.unifiedLabel || (b.status === 'clean' ? 'Propre' : 'Mod\u00E9r\u00E9')
    const reasonLine = hasScore && b.unifiedReason
      ? `<div style="font-size:11px;color:#888;margin-top:3px;font-style:italic">${b.unifiedReason}</div>`
      : ''
    const badgeInner = hasScore
      ? `<div style="font-size:16px;font-weight:800;color:${color};line-height:1">${b.unifiedScore}<span style="font-size:10px;font-weight:600;opacity:.7">/100</span></div>
         <div style="font-size:9px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${label}</div>`
      : `<span style="display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${color}1a;color:${color}">${label}</span>`
    // Capture ground-truth : « j'y suis → confirme l'état » → page /confirme/ (POST
    // au clic seulement). Transforme le bulletin en capteur terrain (le moat #2).
    const confirmLink = b.id
      ? `<a href="https://${domain}/confirme/?b=${encodeURIComponent(b.id)}&r=${island}&n=${encodeURIComponent(b.name)}&lang=fr" style="display:inline-block;margin-top:7px;font-size:11px;font-weight:700;color:#0E7C66;text-decoration:none">📍 J'y suis — confirme l'état</a>`
      : ''
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;vertical-align:top">
        <div style="font-size:15px;font-weight:700;color:#0D0D0D">${b.name}</div>
        <div style="font-size:12px;color:#686868;margin-top:2px">${b.commune} · ${b.drive} min</div>
        ${reasonLine}
        ${confirmLink}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle">
        ${badgeInner}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  <div style="background:radial-gradient(120% 90% at 76% -15%, rgba(255,199,44,.30), rgba(255,199,44,0) 55%), linear-gradient(168deg,#0B2230 0%,#0D1E1C 60%,#0A1714 100%);border-radius:16px 16px 0 0;padding:30px 24px 26px;text-align:center">
    <div style="font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:11px;font-weight:800;color:#FFC72C;text-transform:uppercase;letter-spacing:.14em">Bulletin weekend</div>
    <div style="font-family:'Anton','Bricolage Grotesque',Impact,'Arial Narrow',sans-serif;font-size:29px;font-weight:400;color:#fff;margin-top:9px;letter-spacing:.01em">Plages ${islandName}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:4px">Ce weekend — tes meilleures plages not\u00E9es</div>
  </div>

  <div style="background:#fff;padding:20px">
    <div style="display:flex;gap:12px;margin-bottom:20px;text-align:center">
      <div style="flex:1;padding:12px;background:rgba(34,197,94,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#16A34A">${stats.clean}</div>
        <div style="font-size:11px;color:#686868">propres</div>
      </div>
      <div style="flex:1;padding:12px;background:rgba(184,122,0,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#B87A00">${stats.moderate}</div>
        <div style="font-size:11px;color:#686868">\u00E0 surveiller</div>
      </div>
      <div style="flex:1;padding:12px;background:rgba(232,82,42,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#E8522A">${stats.avoid}</div>
        <div style="font-size:11px;color:#686868">alertes</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;color:#0D0D0D;margin-bottom:10px">Top 5 pour samedi &mdash; score sur 100 :</div>
    <table style="width:100%;border-collapse:collapse">${beachRows}</table>
  </div>

  <!-- Premium upsell -->
  <div style="background:#0D1E1C;padding:20px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Premium</div>
    <div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:6px">Sache samedi d\u00E8s lundi</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:14px;line-height:1.4">
      Pr\u00E9visions 7 jours + alertes push.<br>
      Rejoins les familles qui planifient leur weekend \u00E0 l'avance.
    </div>
    <a href="https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s?utm_source=email&utm_medium=weekend_bulletin&utm_campaign=sargasses" style="display:inline-block;padding:12px 28px;
      background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;
      box-shadow:0 4px 16px rgba(232,168,0,.3)">Essai gratuit 7 jours</a>
    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:8px">4,99\u00A0\u20AC/mois apr\u00E8s l'essai \u00B7 Annule quand tu veux</div>
  </div>

  <div style="text-align:center;padding:20px;background:#fff;border-radius:0 0 16px 16px;border-top:1px solid #f0f0f0">
    <a href="https://${domain}" style="display:inline-block;padding:14px 32px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;
      box-shadow:0 4px 16px rgba(232,168,0,.3)">Voir la carte en temps r\u00E9el</a>
    <div style="font-size:11px;color:#999;margin-top:12px">Pr\u00E9vision satellite pour samedi \u00B7 Mise \u00E0 jour 4\u00D7/jour</div>
  </div>

  <div style="text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses ${islandName} · sargasses-${islandName.toLowerCase()}.com<br>
    <a href="${unsubUrl(island)}" style="color:#999">Se d\u00E9sabonner</a>
  </div>
</div>
</body>
</html>`
}

async function main() {
  console.log('=== Weekend Email Bulletin ===')

  const dayOfWeek = new Date().getDay()
  if (dayOfWeek !== 5 && !FORCE) {
    console.log(`Not Friday (day=${dayOfWeek}). Use --force to override.`)
    return
  }

  // Deduplication: only send once per Friday
  const todayKey = new Date().toISOString().split('T')[0]
  try {
    const sent = JSON.parse(fs.readFileSync(SENT_PATH, 'utf-8'))
    if (sent.lastSent === todayKey && !FORCE) {
      console.log(`Already sent today (${todayKey}). Use --force to resend.`)
      return
    }
  } catch {}

  let sargData, beaches
  try { sargData = JSON.parse(fs.readFileSync(SARG_PATH, 'utf-8')) } catch { console.error('No sargassum.json'); return }
  try { beaches = JSON.parse(fs.readFileSync(BEACHES_PATH, 'utf-8')) } catch { beaches = [] }

  // Build Saturday forecast map (tomorrow from Friday = Saturday)
  const saturday = new Date()
  saturday.setDate(saturday.getDate() + 1)
  const saturdayDate = saturday.toISOString().split('T')[0]
  const satStatusMap = {}
  for (const [sargId, beachData] of Object.entries(sargData.weekly || {})) {
    const satForecast = (beachData.forecast || []).find(f => f.date === saturdayDate)
    if (satForecast) satStatusMap[sargId] = satForecast.status
  }
  const usedForecast = Object.keys(satStatusMap).length > 0
  console.log(`Saturday forecast (${saturdayDate}): ${usedForecast ? Object.keys(satStatusMap).length + ' beaches' : 'none, using current'}`)

  // Merge weekend status + unified score into beaches
  // Prefer Saturday forecast status over current, and attach score/label/reason
  // from pipeline levels so the email can rank by year-round experiential quality
  const beachMap = {}
  for (const b of beaches) beachMap[b.id] = b
  for (const level of (sargData.levels || [])) {
    const beachId = SARG_TO_BEACH[level.id]
    if (beachId && beachMap[beachId]) {
      beachMap[beachId].status = satStatusMap[level.id] || level.status
      if (typeof level.score === 'number') {
        beachMap[beachId].unifiedScore = level.score
        beachMap[beachId].unifiedLabel = level.label
        beachMap[beachId].unifiedColor = level.color
        beachMap[beachId].unifiedReason = level.reason
      }
    }
  }

  for (const island of ['mq', 'gp']) {
    const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
    const domain = island === 'mq' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
    const islandBeaches = beaches.filter(b => b.island === island)

    const stats = {
      clean: islandBeaches.filter(b => b.status === 'clean').length,
      moderate: islandBeaches.filter(b => b.status === 'moderate').length,
      avoid: islandBeaches.filter(b => b.status === 'avoid').length,
    }

    // Top 5 beaches ranked by unified score (year-round quality)
    // Falls back to clean+amenities for beaches without pipeline score
    const rank = b => {
      const s = typeof b.unifiedScore === 'number' ? b.unifiedScore : -1
      const amen = (b.kids || 0) + (b.parking || 0) + (b.snorkel || 0)
      return s * 10 + amen
    }
    const scoreCandidates = islandBeaches.filter(b =>
      typeof b.unifiedScore === 'number' && b.unifiedScore >= 40 && b.status !== 'avoid'
    )
    const topBeaches = (scoreCandidates.length >= 3
      ? scoreCandidates
      : islandBeaches.filter(b => b.status === 'clean' || b.status === 'moderate')
    )
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 5)

    const preheader = `Tes meilleures plages notées pour samedi — score sur 100, prévision satellite à jour.`
    const html = applyBrand(injectPreheader(buildEmailHTML(island, topBeaches, stats, domain), preheader))

    const bestScore = topBeaches[0]?.unifiedScore
    const bestLabel = topBeaches[0]?.unifiedLabel
    console.log(`\n${islandName}: ${stats.clean} propres, ${stats.moderate} moderees, ${stats.avoid} alertes`)
    console.log(`Top 5: ${topBeaches.map(b => `${b.name}${typeof b.unifiedScore === 'number' ? ` (${b.unifiedScore})` : ''}`).join(', ')}`)

    // Send to Apps Script which will dispatch to all subscribers
    // Subject framing (open-rate optimization, growth-actions log 2026-04-17 ×3,
    // re-confirmed 2026-06-13): lead with the score ONLY when it's genuinely good
    // (>=70 = BON/EXCELLENT). Below that the unified label reads "MOYEN" and a
    // subject like "Anse Madame 66/100 MOYEN" buries the real story — e.g. 41 clean
    // beaches the same weekend. Sub-70 → abundance framing + the named top pick.
    const STRONG_SCORE = 70
    const clean = stats.clean
    let subject
    if (typeof bestScore === 'number' && bestScore >= STRONG_SCORE) {
      subject = `Ce weekend en ${islandName} : ${topBeaches[0].name} ${bestScore}/100 ${bestLabel || ''}`.trim()
    } else if (clean > 0) {
      const lead = topBeaches[0] ? `, ${topBeaches[0].name} en tête` : ''
      subject = `Ce weekend : ${clean} plage${clean > 1 ? 's' : ''} propre${clean > 1 ? 's' : ''} en ${islandName}${lead}`
    } else {
      subject = topBeaches[0]
        ? `Ce weekend en ${islandName} : ${topBeaches[0].name}, ta meilleure option`
        : `Ce weekend en ${islandName} : la carte des plages en direct`
    }
    const res = await post(WEBHOOK_URL, {
      type: 'weekend_email',
      island: island.toUpperCase(),
      subject,
      html,
      date: new Date().toISOString(),
    })

    console.log(`Sent to webhook: status=${res.status}`)

    // Track in Sheet
    try {
      await post(WEBHOOK_URL, {
        type: 'email_tracking',
        to: `all_${island}`,
        subject,
        email_type: 'weekend_bulletin',
        island: island.toUpperCase(),
        status: 'dispatched',
        date: new Date().toISOString(),
      })
    } catch {}
  }

  // Mark as sent for deduplication
  try { fs.writeFileSync(SENT_PATH, JSON.stringify({ lastSent: todayKey })) } catch {}

  console.log('\nDone.')
}

main().catch(e => console.error(e))
