#!/usr/bin/env node
/**
 * welcome-paid.cjs — Email de BIENVENUE aux nouveaux clients PAYANTS (Stripe → Resend).
 *
 * PART 2 de l'onboarding payant (Part 1 = in-app PaidOnboarding). Cible les ABONNÉS
 * Stripe (status active + trialing) créés récemment — PAS la liste leads du Google
 * Sheet (welcome-email.cjs, qui pousse vers le paywall). Ici ils ont DÉJÀ payé :
 * email SANS CTA paywall, 100% onboarding (« ton veilleur est en place, comment ça
 * marche, choisis tes plages »). i18n fr/en/es selon la région.
 *
 * Dédupe via data/welcome-paid-sent.json (hash). Idempotent → re-run sans double-envoi.
 * Dry-run par défaut. Clés : STRIPE_SECRET_KEY + RESEND_API_KEY (process.env OU .env).
 *
 * Usage:
 *   node scripts/automation/welcome-paid.cjs                 # dry-run
 *   node scripts/automation/welcome-paid.cjs --send          # envoie
 *   node scripts/automation/welcome-paid.cjs --since-days=14 # fenêtre (défaut 14j)
 */
const fs = require('fs')
const path = require('path')
const { Resend } = require('resend')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader } = require('./lib/email-send.cjs')
const { getAllRegions } = require('../../regions/index.cjs')

const args = process.argv.slice(2)
const DO_SEND = args.includes('--send')
const SINCE_DAYS = Number((args.find(a => a.startsWith('--since-days=')) || '--since-days=14').split('=')[1]) || 14

function envVal(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const txt = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const m = txt.match(new RegExp('^' + name + '=([^\\r\\n]+)', 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}
const STRIPE_KEY = envVal('STRIPE_SECRET_KEY')
const RESEND_KEY = envVal('RESEND_API_KEY') || envVal('RESEND')

const SENT_PATH = path.join(__dirname, 'data', 'welcome-paid-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const HOOK = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const FROM_DOMAIN = 'alerte@sargasses-martinique.com' // seul domaine vérifié Resend (free plan)
const REGIONS = Object.fromEntries(getAllRegions().map(r => [r.id, r]))
const DOMAINS = { mq: 'sargasses-martinique.com', gp: 'sargasses-guadeloupe.com' }
const regionDomain = island => DOMAINS[island] || (REGIONS[island] && REGIONS[island].domain) || 'sargasses-martinique.com'
const unsubUrl = (email, island) => `${HOOK}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`

async function stripe(pathname) {
  const res = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    headers: { Authorization: `Basic ${Buffer.from(STRIPE_KEY + ':').toString('base64')}` },
  })
  const json = await res.json()
  if (json.error) throw new Error(`Stripe ${pathname}: ${json.error.message}`)
  return json
}
async function listAll(base, cap = 400) {
  let url = base.includes('?') ? `${base}&limit=100` : `${base}?limit=100`
  const out = []
  while (out.length < cap) {
    const pg = await stripe(url)
    out.push(...pg.data)
    if (!pg.has_more) break
    url = (base.includes('?') ? `${base}&limit=100` : `${base}?limit=100`) + `&starting_after=${pg.data[pg.data.length - 1].id}`
  }
  return out
}
const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const saveJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
const hashedSet = arr => new Set((Array.isArray(arr) ? arr : []).map(e => String(e).includes('@') ? emailHash(e) : e))

// ─── Copy par langue (région) — AUCUN CTA paywall (le client a déjà payé) ──────
function copy(region) {
  const lang = region.primaryLang || 'fr'
  const name = region.name
  const app = `https://${regionDomain(region.id)}/?utm_source=email&utm_medium=welcome_paid&utm_campaign=onboarding`
  if (lang === 'es') return {
    subject: 'Tu vigía está activo', kicker: 'Bienvenido', pre: 'Elige tus playas y recibe una alerta cuando el agua cambie.',
    title: 'Tu vigía está activo', sub: 'Gracias por suscribirte. Así sacas el máximo provecho:',
    steps: [['Elige tus playas', 'Abre la app y toca ♥ en 1 a 3 playas. Tu vigía las vigila por ti.'],
            ['Recibe alertas', 'Te avisamos la mañana en que una de ellas cambia — sin spam.'],
            ['Tu brief matinal', 'Cada mañana, el estado de tus playas y la recomendación del día te esperan arriba.']],
    cta: 'Abrir mi vigía', ctaUrl: app, foot: `Gestiona tu suscripción en la app · ${name}`, unsub: 'Darse de baja',
  }
  if (lang === 'en') return {
    subject: 'Your watchman is live', kicker: 'Welcome', pre: 'Pick your beaches and get an alert when the water changes.',
    title: 'Your watchman is live', sub: 'Thanks for subscribing. Here is how to get the most out of it:',
    steps: [['Pick your beaches', 'Open the app and tap ♥ on 1 to 3 beaches. Your watchman keeps an eye on them.'],
            ['Get alerts', 'We warn you the morning one of them changes — no spam.'],
            ['Your morning brief', 'Every morning, your beaches’ status and the daily pick wait at the top of the app.']],
    cta: 'Open my watchman', ctaUrl: app, foot: `Manage your subscription in the app · ${name}`, unsub: 'Unsubscribe',
  }
  return {
    subject: 'Ton veilleur est en place', kicker: 'Bienvenue', pre: 'Choisis tes plages et reçois une alerte quand l’eau change.',
    title: 'Ton veilleur est en place', sub: 'Merci pour ton abonnement. Voici comment en profiter à fond :',
    steps: [['Choisis tes plages', 'Ouvre l’app et touche ♥ sur 1 à 3 plages. Ton veilleur les surveille pour toi.'],
            ['Reçois les alertes', 'On te prévient le matin où l’une d’elles bascule — sans spam.'],
            ['Ton brief du matin', 'Chaque matin, l’état de tes plages et la reco du jour t’attendent en haut de l’app.']],
    cta: 'Ouvrir mon veilleur', ctaUrl: app, foot: `Gère ton abonnement dans l’app · ${name}`, unsub: 'Se désabonner',
  }
}

function buildHTML(region, email) {
  const c = copy(region)
  const steps = c.steps.map((s, i) => `<tr><td style="padding:0 0 15px"><table role="presentation" width="100%"><tr>
      <td width="34" valign="top"><div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#FFE47A,#E8A800);color:#0A2A26;font-weight:800;text-align:center;line-height:28px;font-size:14px">${i + 1}</div></td>
      <td style="padding-left:12px"><div style="font-weight:800;color:#0D0D0D;font-size:15px;margin-bottom:2px">${s[0]}</div><div style="color:#555;font-size:13px;line-height:1.5">${s[1]}</div></td>
    </tr></table></td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#FDFCF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" style="background:#FDFCF7"><tr><td align="center" style="padding:24px 14px">
  <table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.06)">
    <tr><td>${brandHeader(c.kicker, c.title, c.sub)}</td></tr>
    <tr><td style="padding:24px 24px 6px"><table role="presentation" width="100%">${steps}</table></td></tr>
    <tr><td style="padding:6px 24px 26px" align="center">
      <a href="${c.ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FFC72C,#E8A800);color:#0A2A26;font-weight:800;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:12px">${c.cta} →</a>
      <div style="color:#888;font-size:11px;margin-top:18px">${c.foot}</div>
      <div style="margin-top:10px"><a href="${unsubUrl(email, region.id)}" style="color:#aaa;font-size:11px">${c.unsub}</a></div>
    </td></tr>
  </table></td></tr></table></body></html>`
}

async function main() {
  if (!STRIPE_KEY) { console.error('STRIPE_SECRET_KEY introuvable (.env / CI secret)'); process.exit(1) }
  const sent = hashedSet(loadJSON(SENT_PATH, []))
  const bounced = hashedSet(loadJSON(BOUNCED_PATH, []))
  const cutoff = Date.now() - SINCE_DAYS * 86400000
  const subs = [...await listAll('subscriptions?status=active'), ...await listAll('subscriptions?status=trialing')]
  const recent = subs.filter(s => s.created * 1000 >= cutoff)
  console.log(`${subs.length} abonnements (active+trialing) · ${recent.length} créés < ${SINCE_DAYS}j`)

  const queue = []
  for (const s of recent) {
    let email = null
    try { const cust = await stripe(`customers/${s.customer}`); email = cust.email } catch {}
    if (!email || !email.includes('@')) continue
    const h = emailHash(email)
    if (sent.has(h)) continue
    if (bounced.has(h)) { console.log(`  ⏭️  ${logId(email)} : bounced`); continue }
    const region = REGIONS[s.metadata?.island] || REGIONS.mq
    queue.push({ email, island: region.id, region, h })
  }
  console.log(`${queue.length} nouveau(x) payeur(s) à accueillir :`)
  for (const q of queue) console.log(`  • ${logId(q.email)} (${q.island}, ${q.region.primaryLang || 'fr'})`)

  if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. Relancer avec --send.'); return }
  if (!RESEND_KEY) { console.error('\n❌ RESEND_API_KEY absent — impossible d\'envoyer.'); process.exit(1) }
  const resend = new Resend(RESEND_KEY)
  const sentArr = loadJSON(SENT_PATH, [])
  for (const q of queue) {
    const c = copy(q.region)
    try {
      const { data, error } = await sendEmail(resend, {
        from: `Sargasses <${FROM_DOMAIN}>`, to: q.email, subject: c.subject,
        html: buildHTML(q.region, q.email), preheader: c.pre, unsubUrl: unsubUrl(q.email, q.island),
      })
      if (error) { console.log(`  ❌ ${logId(q.email)} : ${error.message || JSON.stringify(error)}`); continue }
      sentArr.push(q.h); saveJSON(SENT_PATH, sentArr)
      console.log(`  ✅ ${logId(q.email)} accueilli`)
      try {
        await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ type: 'email_tracking', resend_id: data?.id || '', to: q.email, subject: c.subject, email_type: 'welcome_paid', island: q.island, status: 'sent', date: new Date().toISOString() }) })
      } catch {}
    } catch (e) { console.log(`  ❌ ${logId(q.email)} : ${e.message}`) }
  }
  console.log('\nTerminé.')
}

module.exports = { copy, buildHTML }
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
