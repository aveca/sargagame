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

const FORCE = process.argv.includes('--force')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

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
  const beachRows = topBeaches.map(b => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
        <div style="font-size:15px;font-weight:700;color:#0D0D0D">${b.name}</div>
        <div style="font-size:12px;color:#686868;margin-top:2px">${b.commune} · ${b.drive} min</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right">
        <span style="display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;
          background:${b.status === 'clean' ? 'rgba(34,197,94,.1);color:#16A34A' : 'rgba(184,122,0,.1);color:#B87A00'}">
          ${b.status === 'clean' ? 'Propre' : 'Modere'}
        </span>
      </td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  <div style="background:#0D1E1C;border-radius:16px 16px 0 0;padding:24px;text-align:center">
    <div style="font-size:12px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.08em">Bulletin weekend</div>
    <div style="font-size:24px;font-weight:800;color:#fff;margin-top:8px">Sargasses ${islandName}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:4px">Ce weekend — tes plages propres</div>
  </div>

  <div style="background:#fff;padding:20px">
    <div style="display:flex;gap:12px;margin-bottom:20px;text-align:center">
      <div style="flex:1;padding:12px;background:rgba(34,197,94,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#16A34A">${stats.clean}</div>
        <div style="font-size:11px;color:#686868">propres</div>
      </div>
      <div style="flex:1;padding:12px;background:rgba(184,122,0,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#B87A00">${stats.moderate}</div>
        <div style="font-size:11px;color:#686868">a surveiller</div>
      </div>
      <div style="flex:1;padding:12px;background:rgba(232,82,42,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#E8522A">${stats.avoid}</div>
        <div style="font-size:11px;color:#686868">alertes</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;color:#0D0D0D;margin-bottom:10px">Plages recommandees ce weekend :</div>
    <table style="width:100%;border-collapse:collapse">${beachRows}</table>
  </div>

  <!-- Premium upsell -->
  <div style="background:#0D1E1C;padding:20px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Premium</div>
    <div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:6px">Sache samedi des lundi</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:14px;line-height:1.4">
      Previsions 7 jours + alertes push.<br>
      Rejoins les familles qui planifient leur weekend a l'avance.
    </div>
    <a href="https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s" style="display:inline-block;padding:12px 28px;
      background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;
      box-shadow:0 4px 16px rgba(232,168,0,.3)">Essai gratuit 7 jours</a>
    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:8px">4,99 EUR/mois apres l'essai · Annule quand tu veux</div>
  </div>

  <div style="text-align:center;padding:20px;background:#fff;border-radius:0 0 16px 16px;border-top:1px solid #f0f0f0">
    <a href="https://${domain}" style="display:inline-block;padding:14px 32px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;
      box-shadow:0 4px 16px rgba(232,168,0,.3)">Voir la carte en temps reel</a>
    <div style="font-size:11px;color:#999;margin-top:12px">Donnees satellite NOAA · Mis a jour 4x/jour</div>
  </div>

  <div style="text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses ${islandName} · sargasses-${islandName.toLowerCase()}.com<br>
    <a href="https://${domain}" style="color:#999">Se desinscrire</a>
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

  let sargData, beaches
  try { sargData = JSON.parse(fs.readFileSync(SARG_PATH, 'utf-8')) } catch { console.error('No sargassum.json'); return }
  try { beaches = JSON.parse(fs.readFileSync(BEACHES_PATH, 'utf-8')) } catch { beaches = [] }

  const beachMap = {}
  for (const b of beaches) beachMap[b.id] = b

  for (const island of ['mq', 'gp']) {
    const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
    const domain = island === 'mq' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
    const islandBeaches = beaches.filter(b => b.island === island)

    const stats = {
      clean: islandBeaches.filter(b => b.status === 'clean').length,
      moderate: islandBeaches.filter(b => b.status === 'moderate').length,
      avoid: islandBeaches.filter(b => b.status === 'avoid').length,
    }

    // Top 5 clean beaches (prefer with kids + parking)
    const topBeaches = islandBeaches
      .filter(b => b.status === 'clean')
      .sort((a, b) => (b.kids + b.parking + b.snorkel) - (a.kids + a.parking + a.snorkel))
      .slice(0, 5)

    const html = buildEmailHTML(island, topBeaches, stats, domain)

    console.log(`\n${islandName}: ${stats.clean} propres, ${stats.moderate} moderees, ${stats.avoid} alertes`)
    console.log(`Top 5: ${topBeaches.map(b => b.name).join(', ')}`)

    // Send to Apps Script which will dispatch to all subscribers
    const subject = `Ce weekend : ${stats.clean} plages propres en ${islandName}`
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

  console.log('\nDone.')
}

main().catch(e => console.error(e))
