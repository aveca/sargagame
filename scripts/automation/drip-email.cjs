#!/usr/bin/env node
/**
 * Drip Email Sequence — Sargasses MQ/GP (via Resend)
 *
 * Runs 4x/day in the pipeline (after welcome-email.cjs).
 * Sends timed emails based on days since subscriber signup:
 *
 *   J+3  — Pure value: "X plages propres cette semaine" (no premium push)
 *   J+7  — Intro premium: "Sache samedi des lundi" (soft CTA)
 *   J+14 — Social proof: "Ton weekend sans surprise" (strong CTA)
 *
 * Tracks sent drip steps in data/drip-sent.json to avoid duplicates.
 *
 * Env: RESEND_API_KEY (required)
 * Usage: node scripts/automation/drip-email.cjs
 *        node scripts/automation/drip-email.cjs --force  (ignore time gates)
 */
const fs = require('fs')
const path = require('path')
const { Resend } = require('resend')

const API_KEY = process.env.RESEND_API_KEY
const FORCE = process.argv.includes('--force')
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const DRIP_SENT_PATH = path.join(__dirname, 'data', 'drip-sent.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzCtiAXjUrE2oMctkDzw8S0IPX0jDMkRFSeIOaQ3NOGQ8r8EawuolH9f1qnP7-cxPxKhA/exec'

const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-guadeloupe.com>'
const STRIPE_LINK = 'https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s'

// Drip steps: day threshold + email builder key
const DRIP_STEPS = [
  { key: 'j3',  days: 3  },
  { key: 'j7',  days: 7  },
  { key: 'j14', days: 14 },
]

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}
function saveJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

function daysSince(dateStr) {
  if (!dateStr) return 999
  const d = new Date(dateStr)
  if (isNaN(d)) return 999
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Email templates ──────────────────────────────────────────

function header(title, subtitle) {
  return `<div style="background:#0D1E1C;border-radius:16px 16px 0 0;padding:28px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Sargasses</div>
    <div style="font-size:24px;font-weight:800;color:#fff;line-height:1.1">${title}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:6px">${subtitle}</div>
  </div>`
}

function footer(islandName, domain) {
  return `<div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses ${islandName} · ${domain}<br>
    <a href="https://${domain}" style="color:#999">Se desinscrire</a>
  </div>`
}

function ctaButton(text, url, size = 'normal') {
  const pad = size === 'small' ? '10px 24px' : '14px 32px'
  const fs = size === 'small' ? '13px' : '15px'
  return `<a href="${url}" style="display:inline-block;padding:${pad};
    background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
    color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:${fs};font-weight:700;
    box-shadow:0 4px 16px rgba(232,168,0,.3)">${text}</a>`
}

// J+3 — Pure value, no premium push
function buildJ3(island, cleanCount, topBeaches) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

  const beachList = topBeaches.slice(0, 3).map(b =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
      <div style="font-size:14px;font-weight:700;color:#0D0D0D">${b.name}</div>
      <div style="font-size:12px;color:#686868">${b.commune}</div>
    </td><td style="text-align:right;padding:10px 0;border-bottom:1px solid #f0f0f0">
      <span style="padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:rgba(34,197,94,.1);color:#16A34A">Propre</span>
    </td></tr>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header(`${cleanCount} plages propres`, `Cette semaine en ${name}`)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.5;margin-bottom:16px">
      Salut ! Voici les plages les plus propres cette semaine en ${name}. Donnees satellite mises a jour 4 fois par jour.
    </div>
    <table style="width:100%;border-collapse:collapse">${beachList}</table>
    <div style="text-align:center;margin-top:20px">
      ${ctaButton('Voir toutes les plages', `https://${domain}`)}
    </div>
  </div>
  ${footer(name, domain)}
</div></body></html>`
}

// J+7 — Intro premium (soft CTA)
function buildJ7(island, cleanCount) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header('Sache samedi des lundi', `Previsions 7 jours en ${name}`)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:16px">
      Aujourd'hui, ${cleanCount} plages sont propres en ${name}. Mais qu'en sera-t-il ce weekend ?
    </div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      Avec les <strong>previsions 7 jours</strong>, tu peux planifier ton weekend a l'avance. Plus besoin de verifier le matin meme.
    </div>

    <div style="background:rgba(13,30,28,.03);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#0D0D0D;margin-bottom:10px">Ce que tu debloques :</div>
      <div style="font-size:13px;color:#333;line-height:1.8">
        &#x1f4c5; Previsions 7 jours par plage<br>
        &#x1f514; Alertes push sur tes plages favorites<br>
        &#x1f3d6;&#xfe0f; Accede a toutes les plages, sans limite
      </div>
    </div>

    <div style="text-align:center">
      ${ctaButton('Essai gratuit 7 jours', STRIPE_LINK)}
      <div style="font-size:11px;color:#999;margin-top:8px">4,99 EUR/mois apres l'essai · Annule quand tu veux</div>
    </div>
  </div>

  <div style="background:#fff;padding:16px 20px;border-top:1px solid #f0f0f0;text-align:center">
    <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">Voir la carte maintenant</a>
  </div>
  ${footer(name, domain)}
</div></body></html>`
}

// J+14 — Social proof + strong CTA
function buildJ14(island, cleanCount) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header('Ton weekend sans surprise', `Planifie en ${name}`)  }
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      Ca fait 2 semaines que tu utilises la carte. Tu sais que les sargasses changent vite — <strong>${cleanCount} plages propres</strong> aujourd'hui, peut-etre moins demain.
    </div>

    <div style="background:#0D1E1C;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
      <div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:8px">Des familles de ${name} utilisent deja les previsions pour :</div>
      <div style="font-size:14px;color:#fff;line-height:1.8;text-align:left;padding-left:20px">
        &#x2705; Choisir leur plage des lundi<br>
        &#x2705; Eviter les mauvaises surprises<br>
        &#x2705; Recevoir une alerte si ca change
      </div>
    </div>

    <div style="text-align:center;margin-bottom:16px">
      ${ctaButton('Rejoins-les — essai gratuit', STRIPE_LINK)}
      <div style="font-size:11px;color:#999;margin-top:8px">4,99 EUR/mois · Annule en 1 clic · Un ti-punch coute plus cher</div>
    </div>

    <div style="text-align:center;padding-top:12px;border-top:1px solid #f0f0f0">
      <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">Ou continue gratuitement avec la carte</a>
    </div>
  </div>
  ${footer(name, domain)}
</div></body></html>`
}

// ── Subjects ──────────────────────────────────────────────────

function getSubject(step, island, cleanCount) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  switch (step) {
    case 'j3':  return `${cleanCount} plages propres cette semaine en ${name}`
    case 'j7':  return `Sache samedi des lundi - previsions ${name}`
    case 'j14': return `Ton weekend sans surprise en ${name}`
  }
}

function getHTML(step, island, cleanCount, topBeaches) {
  switch (step) {
    case 'j3':  return buildJ3(island, cleanCount, topBeaches)
    case 'j7':  return buildJ7(island, cleanCount)
    case 'j14': return buildJ14(island, cleanCount)
  }
}

// ── Track to Google Sheet ────────────────────────────────────

async function trackToSheet(data) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email_tracking', ...data, date: new Date().toISOString() }),
    })
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Drip Email Sequence (Resend) ===')

  if (!API_KEY) {
    console.log('RESEND_API_KEY not set — skipping.')
    return
  }

  const resend = new Resend(API_KEY)
  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  const dripSent = loadJSON(DRIP_SENT_PATH, {})
  const beaches = loadJSON(BEACHES_PATH, [])

  if (!subscribers.length) {
    console.log('No subscribers.')
    return
  }

  // Pre-compute beach data per island
  const beachData = {}
  for (const isl of ['MQ', 'GP']) {
    const islBeaches = beaches.filter(b => b.island === isl.toLowerCase())
    const clean = islBeaches.filter(b => b.status === 'clean')
    beachData[isl] = {
      cleanCount: clean.length,
      topBeaches: clean
        .sort((a, b) => (b.kids + b.parking + b.snorkel) - (a.kids + a.parking + a.snorkel))
        .slice(0, 5),
    }
  }

  let totalSent = 0

  for (const sub of subscribers) {
    const email = sub.email
    const island = (sub.island || 'MQ').toUpperCase()
    const age = daysSince(sub.date)
    const record = dripSent[email] || {}

    for (const step of DRIP_STEPS) {
      // Skip if already sent this step or not old enough
      if (record[step.key]) continue
      if (age < step.days && !FORCE) continue

      const { cleanCount, topBeaches } = beachData[island] || beachData['MQ']
      const from = island === 'GP' ? FROM_GP : FROM_MQ
      const subject = getSubject(step.key, island, cleanCount)
      const html = getHTML(step.key, island, cleanCount, topBeaches)

      try {
        const { data, error } = await resend.emails.send({ from, to: email, subject, html })
        if (error) {
          console.log(`  x ${email} [${step.key}]: ${error.message}`)
        } else {
          console.log(`  + ${email} [${step.key}] (${island}, age=${age}d)`)
          record[step.key] = new Date().toISOString()
          totalSent++
          await trackToSheet({
            resend_id: data?.id || '', to: email, subject,
            email_type: `drip_${step.key}`, island, status: 'sent',
            source: sub.source || '',
          })
        }
      } catch (e) {
        console.log(`  x ${email} [${step.key}]: ${e.message}`)
      }

      // Only send one drip per subscriber per run (don't blast all at once)
      break
    }

    dripSent[email] = record
  }

  saveJSON(DRIP_SENT_PATH, dripSent)
  console.log(`\nDrip complete: ${totalSent} email(s) sent.`)
}

main().catch(e => console.error(e))
