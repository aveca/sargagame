#!/usr/bin/env node
/**
 * dunning-past-due.cjs — Relance « renouvellement raté » (Stripe past_due → Resend/SMTP).
 *
 * Le canal qui MANQUAIT : aucun script ne relançait un abonné dont le renouvellement
 * a échoué (carte expirée/refusée). Stripe Smart Retries re-débite tout seul, mais
 * n'envoie PAS d'email→portail sur ce plan. On ajoute EXACTEMENT ça, et rien d'autre :
 *
 *   1 SEUL email factuel par abonné qui ENTRE en past_due → lien Customer Portal Stripe
 *   pour mettre à jour sa carte. Pas de relance répétée (Smart Retries gère la cadence
 *   de re-débit). Dédup par hash (data/dunning-sent.json) → idempotent, jamais de doublon.
 *
 * Churn involontaire = 20-40% du churn, le plus récupérable. À 4,99€/14 actifs, 1 récup
 * = +7% MRR. Le past_due du 20/06 est l'occasion vivante.
 *
 * Dry-run par défaut. Clés : STRIPE_SECRET_KEY + SMTP_PASS (process.env OU .env).
 *
 * Usage:
 *   node scripts/automation/dunning-past-due.cjs            # dry-run (n'envoie rien)
 *   node scripts/automation/dunning-past-due.cjs --send     # envoie (si SMTP prêt)
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')
const { getAllRegions } = require('../../regions/index.cjs')

const args = process.argv.slice(2)
const DO_SEND = args.includes('--send')
const MAX_EMAILS = 25 // garde-fou réputation domaine (past_due = faible volume)

function envVal(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const txt = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const m = txt.match(new RegExp('^' + name + '=([^\\r\\n]+)', 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}
const STRIPE_KEY = envVal('STRIPE_SECRET_KEY')
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => { if (!process.env[k]) { const v = envVal(k); if (v) process.env[k] = v } })

const SENT_PATH = path.join(__dirname, 'data', 'dunning-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const HOOK = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const FROM_DOMAIN = 'alerte@sargasses-martinique.com'
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
async function stripePost(pathname, params) {
  const res = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(STRIPE_KEY + ':').toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const json = await res.json()
  if (json.error) throw new Error(`Stripe POST ${pathname}: ${json.error.message}`)
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

// Lien « mettre à jour ma carte » : session Customer Portal Stripe (le canal officiel).
// Fallback honnête vers la home si la création échoue (l'utilisateur gère in-app via "J'ai déjà un abonnement").
async function portalUrl(customerId, region) {
  try {
    const s = await stripePost('billing_portal/sessions', { customer: customerId, return_url: `https://${regionDomain(region.id)}/` })
    return s.url
  } catch { return `https://${regionDomain(region.id)}/?portal=1` }
}

// ─── Copy par langue (région). Factuel, zéro culpabilisation, zéro fausse urgence. ──
function copy(region) {
  const lang = region.primaryLang || 'fr'
  if (lang === 'es') return {
    brand: 'Sargazo', subject: 'Tu pago no se realizó — actualiza tu tarjeta', kicker: 'Tu suscripción',
    pre: 'Tu último pago no se realizó. Actualiza tu tarjeta en 1 minuto para no perder tu vigía.',
    title: 'Tu pago no se realizó', sub: 'Tu tarjeta fue rechazada en la renovación. Vuelve a intentarlo en 1 minuto — sin perder tu acceso.',
    cta: 'Actualizar mi tarjeta', foot: 'Si ya lo resolviste, ignora este email.', unsub: 'Darse de baja',
  }
  if (lang === 'en') return {
    brand: 'Sargassum', subject: 'Your payment didn’t go through — update your card', kicker: 'Your subscription',
    pre: 'Your last payment failed. Update your card in 1 minute to keep your watchman.',
    title: 'Your payment didn’t go through', sub: 'Your card was declined at renewal. Fix it in 1 minute — no loss of access.',
    cta: 'Update my card', foot: 'If you already sorted it out, ignore this email.', unsub: 'Unsubscribe',
  }
  return {
    brand: 'Sargasses', subject: 'Ton paiement n’est pas passé — mets à jour ta carte', kicker: 'Ton abonnement',
    pre: 'Ton dernier paiement a échoué. Mets à jour ta carte en 1 minute pour garder ton veilleur.',
    title: 'Ton paiement n’est pas passé', sub: 'Ta carte a été refusée au renouvellement. Règle ça en 1 minute — sans perdre ton accès.',
    cta: 'Mettre à jour ma carte', foot: 'Si c’est déjà réglé, ignore cet email.', unsub: 'Se désabonner',
  }
}

function buildHTML(region, email, link) {
  const c = copy(region)
  const domain = regionDomain(region.id)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#FDFCF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" style="background:#FDFCF7"><tr><td align="center" style="padding:24px 14px">
  <table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06),0 12px 32px rgba(0,0,0,.06)">
    <tr><td>${brandHeader(c.kicker, c.title, c.sub)}</td></tr>
    <tr><td style="padding:8px 24px 26px" align="center">
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#FFC72C,#E8A800);color:#0A2A26;font-weight:800;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:12px">${c.cta} →</a>
      <div style="color:#888;font-size:12px;margin-top:18px">${c.foot}</div>
      <div style="color:#aaa;font-size:11px;margin-top:14px">${c.brand} · ${domain} · <a href="${unsubUrl(email, region.id)}" style="color:#aaa">${c.unsub}</a></div>
    </td></tr>
  </table></td></tr></table></body></html>`
}

async function main() {
  if (!STRIPE_KEY) { console.error('STRIPE_SECRET_KEY introuvable (.env / CI secret)'); process.exit(1) }
  console.log(`=== Dunning past_due === mode=${DO_SEND ? 'SEND' : 'DRY-RUN'} | smtp=${mailReady() ? 'ok' : 'ABSENT'}`)

  const sent = hashedSet(loadJSON(SENT_PATH, []))
  const bounced = hashedSet(loadJSON(BOUNCED_PATH, []))
  const pastDue = await listAll('subscriptions?status=past_due')
  console.log(`${pastDue.length} abonnement(s) past_due`)

  const queue = []
  for (const s of pastDue) {
    let email = null
    try { const cust = await stripe(`customers/${s.customer}`); email = cust.email } catch {}
    if (!email || !email.includes('@')) continue
    const h = emailHash(email)
    if (sent.has(h)) { console.log(`  ⏭️  ${logId(email)} : déjà relancé`); continue }
    if (bounced.has(h)) { console.log(`  ⏭️  ${logId(email)} : bounced`); continue }
    const region = REGIONS[s.metadata?.island] || REGIONS.mq
    queue.push({ email, customer: s.customer, region, h })
  }
  console.log(`${queue.length} relance(s) à envoyer :`)
  for (const q of queue) console.log(`  • ${logId(q.email)} (${q.region.id}, ${q.region.primaryLang || 'fr'})`)

  if (!queue.length) { console.log('Aucun past_due à relancer.'); return }
  if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. Relancer avec --send.'); return }
  if (!mailReady()) { console.error('\n❌ SMTP_PASS absent — impossible d\'envoyer.'); process.exit(1) }

  const resend = null
  const sentArr = loadJSON(SENT_PATH, [])
  let ok = 0
  for (const q of queue.slice(0, MAX_EMAILS)) {
    const c = copy(q.region)
    const link = await portalUrl(q.customer, q.region)
    try {
      const { data, error } = await sendEmail(resend, {
        from: `${c.brand} <${FROM_DOMAIN}>`, to: q.email, subject: c.subject,
        html: buildHTML(q.region, q.email, link), preheader: c.pre, unsubUrl: unsubUrl(q.email, q.region.id),
      })
      if (error) { console.log(`  ❌ ${logId(q.email)} : ${error.message || JSON.stringify(error)}`); continue }
      sentArr.push(q.h); saveJSON(SENT_PATH, sentArr); ok++
      console.log(`  ✅ ${logId(q.email)} relancé`)
      try {
        await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ type: 'email_tracking', resend_id: data?.id || '', to: q.email, subject: c.subject, email_type: 'dunning_past_due', island: q.region.id, status: 'sent', date: new Date().toISOString() }) })
      } catch {}
    } catch (e) { console.log(`  ❌ ${logId(q.email)} : ${e.message}`) }
  }
  console.log(`\nTerminé — ${ok} relance(s) envoyée(s).`)
}

module.exports = { copy, buildHTML }
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
