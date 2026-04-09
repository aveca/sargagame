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

// From address — GP uses MQ verified domain (free plan = 1 domain)
const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>'
const UNSUB_BASE = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
function unsubUrl(email, island) { return `${UNSUB_BASE}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}` }

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}
function saveJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

function buildWelcomeHTML(island, cleanCount, email) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
  const stripe = 'https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">

  <div style="background:linear-gradient(145deg,#0D1E1C,#0A1714);border-radius:16px 16px 0 0;padding:32px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px">Bienvenue parmi nous</div>
    <div style="font-size:28px;font-weight:800;color:#fff;line-height:1.1">Sargasses ${name}</div>
    <div style="font-size:14px;color:rgba(255,255,255,.55);margin-top:8px;line-height:1.4">Fini les mauvaises surprises au bord de l\u2019eau.</div>
  </div>

  <div style="background:#fff;padding:24px 20px">
    ${cleanCount > 0 ? `<div style="text-align:center;margin-bottom:20px;padding:16px;background:rgba(34,197,94,.06);border-radius:12px">
      <div style="font-size:32px;font-weight:800;color:#16A34A">${cleanCount}</div>
      <div style="font-size:13px;color:#686868;margin-top:2px">plages propres en ce moment en ${name}</div>
    </div>` : ''}

    <div style="font-size:14px;color:#444;line-height:1.5;margin-bottom:18px">
      Tu viens de rejoindre les habitants de ${name} qui v\u00E9rifient avant de partir. Voici ce que tu re\u00E7ois :
    </div>

    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:10px 0;vertical-align:top;width:30px;font-size:18px">\u{1F4E8}</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Bulletin du vendredi</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">Chaque semaine, les plages propres pour ton weekend. Direct dans ta bo\u00EEte.</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F5FA}\uFE0F</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Carte live</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">V\u00E9rifie n\u2019importe quelle plage en 5 secondes avant d\u2019y aller.</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F6F0}\uFE0F</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Donn\u00E9es satellite</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">Mises \u00E0 jour 4\u00D7/jour. Pas du pifom\u00E8tre, des vraies images Copernicus.</div></td></tr>
    </table>

    <div style="margin-top:22px;text-align:center">
      <a href="https://${domain}" style="display:inline-block;padding:15px 36px;
        background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
        color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;
        box-shadow:0 4px 16px rgba(232,168,0,.3)">Voir la carte maintenant</a>
    </div>
  </div>

  <div style="background:linear-gradient(145deg,#0D1E1C,#0A1714);padding:22px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Pour aller plus loin</div>
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px">Sache samedi d\u00E8s lundi</div>
    <div style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:14px;line-height:1.5">
      Pr\u00E9visions 7 jours + alertes push.<br>Planifie tes sorties plage sans stress.
    </div>
    <a href="${stripe}" style="display:inline-block;padding:11px 26px;
      background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700">Essayer 7 jours gratuit</a>
    <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:8px">4,99\u00A0\u20AC/mois \u00B7 Sans engagement \u00B7 Annule en 1 clic</div>
  </div>

  <div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses ${name} \u00B7 ${domain}<br>
    <a href="${unsubUrl(email, island)}" style="color:#999">Se d\u00E9sabonner</a>
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

    const subjectLine = cleanCount > 0 ? `${cleanCount} plages propres en ${name} \u2014 ta carte est pr\u00EAte` : `Bienvenue \u2014 ta carte sargasses ${name} est pr\u00EAte`
    try {
      const unsub = unsubUrl(sub.email, island)
      const { data, error } = await resend.emails.send({
        from,
        to: sub.email,
        subject: subjectLine,
        html: buildWelcomeHTML(island, cleanCount, sub.email),
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (error) {
        console.log(`  ❌ ${sub.email}: ${error.message}`)
      } else {
        console.log(`  ✅ ${sub.email} (${island})`)
        sentSet.add(sub.email)
        // Track to Google Sheet
        try {
          await fetch('https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'email_tracking', resend_id: data?.id || '', to: sub.email,
              subject: subjectLine, email_type: 'welcome', island,
              status: 'sent', source: sub.source || '', date: new Date().toISOString()
            })
          })
        } catch {}
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
