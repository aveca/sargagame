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
const { emailHash } = require('./lib/email-hash.cjs')

const API_KEY = process.env.RESEND_API_KEY
const FORCE = process.argv.includes('--force')
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const DRIP_SENT_PATH = path.join(__dirname, 'data', 'drip-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

// GP uses MQ verified domain (free plan = 1 domain)
const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>'
const STRIPE_BASE = 'https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s'
function stripeLink(step) { return `${STRIPE_BASE}?utm_source=email&utm_medium=drip_${step}&utm_campaign=sargasses` }
const STRIPE_LINK = STRIPE_BASE // compat
const UNSUB_BASE = WEBHOOK_URL
function unsubUrl(email, island) { return `${UNSUB_BASE}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}` }

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

// RGPD : l'état persisté ne contient que des hashes. Les entrées legacy
// (clés/valeurs contenant '@') sont hashées en mémoire à la lecture ;
// le fichier est réécrit hashé à la prochaine sauvegarde.
function hashedSet(arr) {
  return new Set((Array.isArray(arr) ? arr : []).map(e => String(e).includes('@') ? emailHash(e) : e))
}
function hashedKeys(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    const key = k.includes('@') ? emailHash(k) : k
    out[key] = Object.assign({}, out[key], v)
  }
  return out
}

function daysSince(dateStr) {
  if (!dateStr) return 999
  let d
  // Handle DD/MM/YYYY HH:MM:SS format (French locale from Google Sheets)
  const frMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/)
  if (frMatch) {
    const [, dd, mm, yyyy, time] = frMatch
    d = new Date(`${yyyy}-${mm}-${dd}T${time || '00:00:00'}`)
  } else {
    d = new Date(dateStr)
  }
  if (isNaN(d)) return 999
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

// Season detection (matches Sargasses_PROD.jsx logic)
const MONTH = new Date().getMonth() // 0-indexed
const IS_HIGH_SEASON = MONTH >= 3 && MONTH <= 8 // April-September

// ── Email templates ──────────────────────────────────────────

function header(title, subtitle) {
  return `<div style="background:#0D1E1C;border-radius:16px 16px 0 0;padding:28px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Sargasses</div>
    <div style="font-size:24px;font-weight:800;color:#fff;line-height:1.1">${title}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:6px">${subtitle}</div>
  </div>`
}

function footer(islandName, domain, email, island) {
  return `<div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses ${islandName} · ${domain}<br>
    <a href="${unsubUrl(email, island)}" style="color:#999">Se d\u00E9sabonner</a>
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
function buildJ3(island, cleanCount, topBeaches, email) {
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

  const seasonBanner = IS_HIGH_SEASON
    ? `<div style="background:rgba(232,82,42,.08);border:1px solid rgba(232,82,42,.2);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;font-weight:700;color:#E8522A">
        &#x1f534; Saison sargasses en cours — les plages changent chaque jour
      </div>` : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header(`${cleanCount} plages propres`, IS_HIGH_SEASON ? `Saison active en ${name}` : `Cette semaine en ${name}`)}
  <div style="background:#fff;padding:24px 20px">
    ${seasonBanner}
    <div style="font-size:15px;color:#333;line-height:1.5;margin-bottom:16px">
      ${IS_HIGH_SEASON
        ? `Salut\u00A0! La saison sargasses est l\u00E0. Voici les plages les plus propres aujourd'hui en ${name}. Donn\u00E9es satellite mises \u00E0 jour 4 fois par jour.`
        : `Salut\u00A0! Voici les plages les plus propres cette semaine en ${name}. Donn\u00E9es satellite mises \u00E0 jour 4 fois par jour.`}
    </div>
    <table style="width:100%;border-collapse:collapse">${beachList}</table>
    <div style="text-align:center;margin-top:20px">
      ${ctaButton('Voir toutes les plages', `https://${domain}`)}
    </div>
  </div>
  ${footer(name, domain, email, island)}
</div></body></html>`
}

// J+7 — Show premium experience (soft CTA, "veilleur" positioning)
function buildJ7(island, cleanCount, email) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header('Arr\u00EAte de v\u00E9rifier', `On surveille ${cleanCount} plages pour toi`)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      ${IS_HIGH_SEASON
        ? `\u00C7a fait une semaine que tu v\u00E9rifies la carte. Les sargasses bougent vite en ce moment. Et si on te pr\u00E9venait <strong>avant</strong> que tu partes\u00A0?`
        : `\u00C7a fait une semaine que tu utilises la carte. Et si tu n'avais <strong>plus besoin de l'ouvrir</strong>\u00A0?`}
    </div>

    <div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">Voil\u00E0 ce que tu recevrais</div>

    <div style="background:#0D1E1C;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.05em;margin-bottom:8px">CHAQUE MATIN \u00C0 7H</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F4F2;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#fff">Ta meilleure plage : Anse Dufour</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5)">Propre \u00B7 12 min \u00B7 mer calme</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(255,199,44,.06);border:1px solid rgba(255,199,44,.15);border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:rgba(200,160,0,.7);letter-spacing:.05em;margin-bottom:8px">ALERTE INSTANTAN\u00C9E</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F514;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">Sainte-Anne a chang\u00E9</div>
          <div style="font-size:12px;color:#666">Propre \u2192 Mod\u00E9r\u00E9 \u2014 va aux Salines</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-size:10px;font-weight:700;color:rgba(22,163,74,.7);letter-spacing:.05em;margin-bottom:8px">RECO DU JOUR</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F3D6;&#xFE0F;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">Samedi : Grande Anse</div>
          <div style="font-size:12px;color:#666">Propre tout le weekend \u00B7 id\u00E9al enfants</div>
        </div>
      </div>
    </div>

    <div style="text-align:center">
      ${ctaButton('Essayer 7 jours gratuit', stripeLink('j7'))}
      <div style="font-size:11px;color:#999;margin-top:8px">Puis 4,99\u00A0\u20AC/mois \u00B7 Annule en 1 clic</div>
    </div>
  </div>

  <div style="background:#fff;padding:16px 20px;border-top:1px solid #f0f0f0;text-align:center">
    <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">Voir la carte maintenant</a>
  </div>
  ${footer(name, domain, email, island)}
</div></body></html>`
}

// J+14 — Last chance: urgency + loss aversion + strong CTA
function buildJ14(island, cleanCount, email) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

  // Dynamic seasonal urgency
  const now = new Date()
  const seasonStart = new Date(now.getFullYear(), 3, 20) // ~20 April
  const daysToSeason = Math.max(0, Math.ceil((seasonStart - now) / (1000 * 60 * 60 * 24)))
  const urgencyLine = daysToSeason > 0
    ? `La saison sargasses commence dans <strong>${daysToSeason} jours</strong>. Apr\u00E8s, les plages changent chaque jour.`
    : `La saison sargasses est l\u00E0. Les plages changent <strong>chaque jour</strong>.`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header('Ne d\u00E9couvre pas \u00E7a sur la plage', `${cleanCount} plages propres \u2014 pour l'instant`)}
  <div style="background:#fff;padding:24px 20px">

    <div style="background:rgba(232,82,42,.06);border:1px solid rgba(232,82,42,.15);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#C0392B;line-height:1.5">
      ${urgencyLine}
    </div>

    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      Imagine : tu arrives \u00E0 Sainte-Anne samedi avec les enfants. Sargasses partout. Weekend g\u00E2ch\u00E9.
    </div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      Avec le <strong>veilleur sargasses</strong>, tu aurais su vendredi soir. Tu aurais chang\u00E9 pour les Salines. Weekend sauv\u00E9.
    </div>

    <div style="background:#0D1E1C;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F4F2;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#fff">Vendredi 19h \u2014 push notif</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5)">\u00AB\u00A0Sainte-Anne \u2192 mod\u00E9r\u00E9. Va aux Salines (propre)\u00A0\u00BB</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x2705;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">Samedi matin \u2014 brief 7h</div>
          <div style="font-size:12px;color:#666">\u00AB\u00A0Ta meilleure plage : Les Salines \u00B7 propre \u00B7 15 min\u00A0\u00BB</div>
        </div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:16px">
      ${ctaButton('Essayer 7 jours gratuit', stripeLink('j14'))}
      <div style="font-size:11px;color:#999;margin-top:8px">Puis 4,99\u00A0\u20AC/mois \u00B7 Annule en 1 clic \u00B7 Un ti-punch co\u00FBte plus cher</div>
    </div>

    <div style="text-align:center;padding-top:12px;border-top:1px solid #f0f0f0">
      <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">Ou continue avec la carte gratuite</a>
    </div>
  </div>
  ${footer(name, domain, email, island)}
</div></body></html>`
}

// ── Subjects ──────────────────────────────────────────────────

function getSubject(step, island, cleanCount) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  switch (step) {
    case 'j3':  return IS_HIGH_SEASON
      ? `Saison sargasses : ${cleanCount} plages propres en ${name}`
      : `${cleanCount} plages propres cette semaine en ${name}`
    case 'j7':  return IS_HIGH_SEASON
      ? `Tu v\u00E9rifies encore la carte tous les jours\u00A0?`
      : `Et si tu n'avais plus besoin d'ouvrir la carte\u00A0?`
    case 'j14': return IS_HIGH_SEASON
      ? `Samedi, sargasses \u00E0 Sainte-Anne. Tu le savais\u00A0?`
      : `Ne d\u00E9couvre pas les sargasses sur la plage`
  }
}

function getHTML(step, island, cleanCount, topBeaches, email) {
  switch (step) {
    case 'j3':  return buildJ3(island, cleanCount, topBeaches, email)
    case 'j7':  return buildJ7(island, cleanCount, email)
    case 'j14': return buildJ14(island, cleanCount, email)
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
    console.log('RESEND_API_KEY not set — skipping sends (dry-run).')
  }

  const resend = API_KEY ? new Resend(API_KEY) : null
  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  // State files store email hashes (RGPD) — legacy plaintext entries hashed in memory
  const dripSent = hashedKeys(loadJSON(DRIP_SENT_PATH, {}))
  const beaches = loadJSON(BEACHES_PATH, [])
  const bouncedSet = hashedSet(loadJSON(BOUNCED_PATH, []))

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
  let wouldSend = 0
  let alreadyDripped = 0

  for (const sub of subscribers) {
    const email = sub.email
    const key = emailHash(email)
    if (bouncedSet.has(key)) continue
    const island = (sub.island || 'MQ').toUpperCase()
    // Nouvelles régions (PUNTACANA/FLORIDA/RIVIERAMAYA…) : pas de drip FR.
    // Séquence région-aware EN/ES à écrire avant de retirer ce garde-fou.
    if (island !== 'MQ' && island !== 'GP') continue
    const age = daysSince(sub.date)
    const record = dripSent[key] || {}
    if (Object.keys(record).length) alreadyDripped++

    for (const step of DRIP_STEPS) {
      // Skip if already sent this step or not old enough
      if (record[step.key]) continue
      if (age < step.days && !FORCE) continue

      if (!resend) {
        console.log(`  ~ ${email} [${step.key}] would send (no RESEND_API_KEY)`)
        wouldSend++
        break
      }

      const { cleanCount, topBeaches } = beachData[island] || beachData['MQ']
      const from = island === 'GP' ? FROM_GP : FROM_MQ
      const subject = getSubject(step.key, island, cleanCount)
      const html = getHTML(step.key, island, cleanCount, topBeaches, email)
      const unsub = unsubUrl(email, island)

      try {
        const { data, error } = await resend.emails.send({
          from, to: email, subject, html,
          headers: {
            'List-Unsubscribe': `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
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

    dripSent[key] = record
  }

  if (!API_KEY) {
    console.log(`\nDry-run: ${alreadyDripped} subscriber(s) recognized as already in drip, ${wouldSend} email(s) would be sent. Nothing saved.`)
    return
  }

  saveJSON(DRIP_SENT_PATH, dripSent)
  console.log(`\nDrip complete: ${totalSent} email(s) sent.`)
}

main().catch(e => console.error(e))
