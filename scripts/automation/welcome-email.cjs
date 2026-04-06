#!/usr/bin/env node
/**
 * Welcome Email — Sargasses MQ/GP (via Resend)
 *
 * Runs 4x/day in the pipeline. Checks a local JSON file for emails
 * that haven't received a welcome email yet. Sends via Resend API.
 *
 * The email list comes from the Apps Script webhook which POSTs new
 * subscriber data back to the repo (via daily pipeline commit).
 *
 * Env: RESEND_API_KEY (required)
 * Usage: node scripts/automation/welcome-email.cjs
 */
const fs = require('fs')
const path = require('path')
const { Resend } = require('resend')

const API_KEY = process.env.RESEND_API_KEY
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const SENT_PATH = path.join(__dirname, 'data', 'welcome-sent.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')

// From address — must match verified domain in Resend
const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-guadeloupe.com>'

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}
function saveJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

function buildWelcomeHTML(island, cleanCount) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
  const stripe = 'https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">

  <div style="background:#0D1E1C;border-radius:16px 16px 0 0;padding:28px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Bienvenue</div>
    <div style="font-size:26px;font-weight:800;color:#fff;line-height:1.1">Sargasses ${name}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:6px">Tu ne seras plus jamais surpris.</div>
  </div>

  <div style="background:#fff;padding:24px 20px">
    ${cleanCount > 0 ? `<div style="text-align:center;margin-bottom:20px;padding:14px;background:rgba(34,197,94,.06);border-radius:10px">
      <div style="font-size:28px;font-weight:800;color:#16A34A">${cleanCount}</div>
      <div style="font-size:12px;color:#686868">plages propres aujourd'hui en ${name}</div>
    </div>` : ''}

    <div style="font-size:15px;font-weight:700;color:#0D0D0D;margin-bottom:14px">Ce que tu vas recevoir :</div>

    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:10px 0;vertical-align:top;width:30px;font-size:18px">📧</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Chaque vendredi</div>
        <div style="font-size:12px;color:#686868">Le bulletin weekend — quelles plages sont propres.</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">🗺️</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Carte en temps reel</div>
        <div style="font-size:12px;color:#686868">Verifie ta plage en 5 secondes.</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">🛰️</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Donnees satellite</div>
        <div style="font-size:12px;color:#686868">Mis a jour 4 fois par jour.</div></td></tr>
    </table>

    <div style="margin-top:20px;text-align:center">
      <a href="https://${domain}" style="display:inline-block;padding:14px 32px;
        background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
        color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;
        box-shadow:0 4px 16px rgba(232,168,0,.3)">Voir la carte maintenant</a>
    </div>
  </div>

  <div style="background:#0D1E1C;padding:20px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Premium</div>
    <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:6px">Tendance 7 jours + alertes</div>
    <div style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:12px;line-height:1.4">
      Sache a l'avance si ta plage sera propre ce weekend.
    </div>
    <a href="${stripe}" style="display:inline-block;padding:10px 24px;
      background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700">Essai gratuit 7 jours</a>
    <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:6px">4,99 EUR/mois · Annule quand tu veux</div>
  </div>

  <div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses ${name} · ${domain}
  </div>
</div>
</body>
</html>`
}

async function main() {
  console.log('=== Welcome Email (Resend) ===')

  if (!API_KEY) {
    console.log('RESEND_API_KEY not set — skipping.')
    return
  }

  const resend = new Resend(API_KEY)

  // Load subscriber list and already-sent list
  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  const sent = loadJSON(SENT_PATH, [])
  const sentSet = new Set(sent)

  // Find new subscribers not yet welcomed
  const newSubs = subscribers.filter(s => s.email && !sentSet.has(s.email))

  if (!newSubs.length) {
    console.log('No new subscribers to welcome.')
    return
  }

  console.log(`Found ${newSubs.length} new subscriber(s) to welcome`)

  // Get clean beach count for the email
  const sargData = loadJSON(SARG_PATH, {})
  const beaches = loadJSON(BEACHES_PATH, [])

  for (const sub of newSubs) {
    const island = (sub.island || 'MQ').toUpperCase()
    const islandBeaches = beaches.filter(b => b.island === island.toLowerCase())
    const cleanCount = islandBeaches.filter(b => b.status === 'clean').length
    const from = island === 'GP' ? FROM_GP : FROM_MQ
    const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'

    try {
      const { error } = await resend.emails.send({
        from,
        to: sub.email,
        subject: `Bienvenue — Sargasses ${name}`,
        html: buildWelcomeHTML(island, cleanCount),
      })

      if (error) {
        console.log(`  ❌ ${sub.email}: ${error.message}`)
      } else {
        console.log(`  ✅ ${sub.email} (${island})`)
        sentSet.add(sub.email)
      }
    } catch (e) {
      console.log(`  ❌ ${sub.email}: ${e.message}`)
    }
  }

  // Save updated sent list
  saveJSON(SENT_PATH, [...sentSet])
  console.log('Done.')
}

main().catch(e => console.error(e))
