#!/usr/bin/env node
/**
 * pass-expiry-winback.cjs — RACHAT : relance les acheteurs de PASS dont l'accès a
 * EXPIRÉ, pour qu'ils reprennent un pass. C'est LE levier revenu du modèle pass-only
 * (paiement unique → le revenu s'arrête à l'expiration ; sans relance = 0 rachat).
 *
 * SOURCE = API Mollie (les pass sont des paiements one-time Mollie, PAS des abos
 * Stripe). On liste les paiements 'paid', on calcule l'expiration = paidAt + jours-du-pass
 * (metadata.pass/plan), on GROUPE par email (on prend la dernière expiration : un
 * re-acheteur encore actif n'est jamais relancé), et on cible ceux dont le DERNIER
 * pass a expiré dans la fenêtre récente (défaut 21 j) — jamais les expirations anciennes.
 *
 * Dédup data/pass-expiry-winback-sent.json par paymentId (1 relance par pass acheté →
 * un nouvel achat = nouvel id = re-ciblable au prochain cycle). Idempotent.
 *
 * DRY-RUN par défaut. Clés : MOLLIE_API_KEY (live_… ou test_…) + SMTP_PASS (env OU .env).
 * Sans MOLLIE_API_KEY → no-op gracieux (le script est prêt, le fondateur ajoute le
 * secret + bascule --send quand il veut activer, comme dunning/welcome-paid).
 *
 * Usage:
 *   node scripts/automation/pass-expiry-winback.cjs                  # dry-run
 *   node scripts/automation/pass-expiry-winback.cjs --send           # envoie
 *   node scripts/automation/pass-expiry-winback.cjs --window-days=30 # fenêtre post-expiry (défaut 21)
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')
const { getAllRegions } = require('../../regions/index.cjs')
const { pickArm, applyArm } = require('./lib/email-ab.cjs')
let AB_VARS = {}; try { AB_VARS = require('./data/email-ab-variants.json') } catch { AB_VARS = {} }

const args = process.argv.slice(2)
const DO_SEND = args.includes('--send')
const WINDOW_DAYS = Number((args.find(a => a.startsWith('--window-days=')) || '--window-days=21').split('=')[1]) || 21
const MAX_EMAILS = Number((args.find(a => a.startsWith('--max=')) || '--max=50').split('=')[1]) || 50

function envVal(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const txt = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const m = txt.match(new RegExp('^' + name + '=([^\\r\\n]+)', 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}
const MOLLIE_KEY = envVal('MOLLIE_API_KEY')
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => { if (!process.env[k]) { const v = envVal(k); if (v) process.env[k] = v } })

const SENT_PATH = path.join(__dirname, 'data', 'pass-expiry-winback-sent.json')
const HOOK = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const REGIONS = Object.fromEntries(getAllRegions().map(r => [r.id, r]))
const DOMAINS = { mq: 'sargasses-martinique.com', gp: 'sargasses-guadeloupe.com' }
const regionDomain = island => DOMAINS[island] || (REGIONS[island] && REGIONS[island].domain) || 'sargasses-martinique.com'
const unsubUrl = (email, island) => `${HOOK}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${String(island || 'MQ').toUpperCase()}`
const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const saveJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }

// Jours d'accès d'un pass d'après metadata Mollie (pass/plan). trip/p7=7, pNN=NN,
// p30=30, saison=210. Sub (kind sub_first / plan monthly|annual) = PAS un pass → null.
function passDays(meta) {
  const kind = String(meta.kind || '')
  const plan = String(meta.plan || '')
  if (kind === 'sub_first' || plan === 'monthly' || plan === 'annual' || plan === 'pro') return null
  const key = String(meta.pass || meta.plan || '').toLowerCase()
  if (!key) return null
  if (key === 'trip' || key === 'p7') return 7
  if (key === 'p30') return 30
  if (key === 'saison' || key === 'season') return 210
  const m = key.match(/^p(\d{1,3})$/)
  if (m) return Math.min(365, Math.max(1, parseInt(m[1], 10)))
  return null
}

async function mollie(pathname) {
  const res = await fetch(`https://api.mollie.com/v2/${pathname}`, {
    headers: { Authorization: `Bearer ${MOLLIE_KEY}` },
  })
  const json = await res.json()
  if (json && json.status && json.status >= 400 && json.detail) throw new Error(`Mollie ${pathname}: ${json.detail}`)
  return json
}
// Liste les paiements (pagination via _links.next), cap raisonnable.
async function listPayments(cap = 500) {
  const out = []
  let url = 'payments?limit=250'
  while (out.length < cap) {
    const pg = await mollie(url)
    const items = (pg && pg._embedded && pg._embedded.payments) || []
    out.push(...items)
    const next = pg && pg._links && pg._links.next && pg._links.next.href
    if (!next) break
    url = next.replace('https://api.mollie.com/v2/', '')
  }
  return out
}

// ─── Copy localisée par région (FR/EN/ES). CTA = paywall ON-SITE (?paywall=1). ──
function copy(island) {
  const region = REGIONS[island] || null
  const lang = (region && region.primaryLang) || 'fr'
  const name = (region && region.name) || (island === 'gp' ? 'Guadeloupe' : 'Martinique')
  const brand = lang === 'es' ? 'Sargazo' : lang === 'en' ? 'Sargassum' : 'Sargasses'
  const pay = `https://${regionDomain(island)}/?paywall=1&utm_source=email&utm_medium=winback&utm_campaign=pass_expiry`
  const map = `https://${regionDomain(island)}/?utm_source=email&utm_medium=winback`
  if (lang === 'es') return {
    from: `${brand} ${name} <alerte@sargasses-martinique.com>`,
    subject: `Tu pase expiró — ¿retomamos tus mañanas sin sargazo?`,
    pre: 'Reactiva tu vigía en 1 toque. Pago único, sin suscripción.',
    body: brandHeader('Tu pase expiró', `${brand} ${name}`, 'El mar cambia cada día. Vuelve a tener LA playa correcta cada mañana.') +
      `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
        <p>Tu acceso al Vigía ha terminado. El sargazo no espera — la playa limpia de hoy puede no serlo mañana.</p>
        <p><b>Retoma un pase</b> y vuelve a recibir cada mañana LA playa sin sargazo, con pronóstico de 7 días y alertas.</p>
        <p style="text-align:center;margin:22px 0"><a href="${pay}" style="display:inline-block;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#190c2c;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:12px">Reactivar mi vigía</a></p>
        <p style="font-size:12px;color:#8a97a5">Pago único · sin suscripción · reembolso con un solo email. <a href="${map}" style="color:#0E7C66">O sigue con el mapa gratis</a>.</p>
      </div>`,
  }
  if (lang === 'en') return {
    from: `${brand} ${name} <alerte@sargasses-martinique.com>`,
    subject: `Your pass expired — back to sargassum-free mornings?`,
    pre: 'Reactivate your watcher in one tap. One-time, no subscription.',
    body: brandHeader('Your pass expired', `${brand} ${name}`, 'The sea changes daily. Get THE right beach every morning again.') +
      `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
        <p>Your Watcher access has ended. Sargassum doesn't wait — today's clean beach may not be clean tomorrow.</p>
        <p><b>Grab a pass</b> and get THE sargassum-free beach every morning again, with the 7-day forecast and alerts.</p>
        <p style="text-align:center;margin:22px 0"><a href="${pay}" style="display:inline-block;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#190c2c;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:12px">Reactivate my watcher</a></p>
        <p style="font-size:12px;color:#8a97a5">One-time · no subscription · refunded with one email. <a href="${map}" style="color:#0E7C66">Or keep using the free map</a>.</p>
      </div>`,
  }
  return {
    from: `${brand} ${name} <alerte@sargasses-martinique.com>`,
    subject: `Ton pass a expiré — on reprend tes matins sans sargasses ?`,
    pre: 'Réactive ton veilleur en 1 geste. Paiement unique, sans abonnement.',
    body: brandHeader('Ton pass a expiré', `${brand} ${name}`, 'La mer change chaque jour. Retrouve LA bonne plage chaque matin.') +
      `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
        <p>Ton accès au Veilleur est terminé. Les sargasses n'attendent pas — la plage propre d'aujourd'hui ne le sera peut-être plus demain.</p>
        <p><b>Reprends un pass</b> et retrouve chaque matin LA plage sans sargasses, avec la prévision 7 jours et les alertes.</p>
        <p style="text-align:center;margin:22px 0"><a href="${pay}" style="display:inline-block;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#190c2c;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:12px">Réactiver mon veilleur</a></p>
        <p style="font-size:12px;color:#8a97a5">Paiement unique · sans abonnement · remboursé en un email. <a href="${map}" style="color:#0E7C66">Ou reste sur la carte gratuite</a>.</p>
      </div>`,
  }
}

async function main() {
  console.log(`=== Pass-expiry win-back === mode=${DO_SEND ? 'SEND' : 'DRY-RUN'} | window=${WINDOW_DAYS}j | smtp=${mailReady() ? 'ok' : 'ABSENT'}`)
  if (!MOLLIE_KEY) {
    console.log('MOLLIE_API_KEY absent — no-op (ajoute le secret + --send pour activer le rachat pass).')
    return
  }

  let payments
  try { payments = await listPayments() } catch (e) { console.error('Mollie list échec:', e.message); process.exitCode = 1; return }
  console.log(`Mollie: ${payments.length} paiements récupérés`)

  const now = Date.now()
  const DAY = 86400000
  // Groupe par email → on garde la DERNIÈRE expiration (un re-acheteur encore actif
  // ne doit jamais être relancé). On retient aussi le paymentId de ce dernier pass.
  const byEmail = new Map()
  for (const p of payments) {
    if (p.status !== 'paid') continue
    const meta = p.metadata || {}
    const email = String(meta.email || (p.details && p.details.cardHolder) || '').trim()
    if (!email || !email.includes('@')) continue
    const days = passDays(meta)
    if (!days) continue // abo ou inconnu → pas un pass one-time
    const paidAt = p.paidAt ? new Date(p.paidAt).getTime() : (p.createdAt ? new Date(p.createdAt).getTime() : null)
    if (!paidAt) continue
    const expiry = paidAt + days * DAY
    const island = String(meta.island || 'mq').toLowerCase()
    const cur = byEmail.get(email)
    if (!cur || expiry > cur.expiry) byEmail.set(email, { email, expiry, island, paymentId: p.id, days })
  }

  // Candidats : dernier pass expiré dans la fenêtre [il y a WINDOW_DAYS jours .. maintenant].
  const winStart = now - WINDOW_DAYS * DAY
  const candidates = [...byEmail.values()].filter(c => c.expiry <= now && c.expiry >= winStart)
  console.log(`Acheteurs pass uniques: ${byEmail.size} | expirés dans la fenêtre: ${candidates.length}`)

  const sent = loadJSON(SENT_PATH, {})
  const resend = (mailReady() && DO_SEND) ? {} : null
  let count = 0, skipped = 0
  for (const c of candidates) {
    if (count >= MAX_EMAILS) { console.log(`MAX_EMAILS ${MAX_EMAILS} atteint — stop.`); break }
    if (sent[c.paymentId]) { skipped++; continue } // 1 relance par pass acheté
    const t = copy(c.island)
    const region = REGIONS[c.island] || null
    const lang = (region && region.primaryLang) || 'fr'
    // A/B sujet/preheader si une variante existe (réutilise l'infra welcome/drip).
    const abKey = lang === 'es' ? 'em_winback_es' : lang === 'en' ? 'em_winback_en' : 'em_winback_fr'
    const arm = pickArm(abKey, c.email)
    const out = applyArm(arm, { subject: t.subject, preheader: t.pre }, (AB_VARS[abKey] && AB_VARS[abKey].ship))
    const daysAgo = Math.round((now - c.expiry) / DAY)
    if (!resend) {
      console.log(`  ~ [${DO_SEND ? 'no-smtp' : 'dry'}] ${logId(c.email)} (${c.island}, ${lang}) expiré il y a ${daysAgo}j · « ${out.subject} »`)
      continue
    }
    try {
      const { error } = await sendEmail(resend, {
        from: t.from, to: c.email, subject: out.subject, html: t.body,
        preheader: out.preheader, unsubUrl: unsubUrl(c.email, c.island),
      })
      if (error) { console.log(`  x ${logId(c.email)}: ${error.message}`); continue }
      sent[c.paymentId] = new Date().toISOString()
      saveJSON(SENT_PATH, sent) // flush incrémental anti re-spam (cf. leçon emails J2)
      count++
      console.log(`  + ${logId(c.email)} (${c.island}) relancé · pass expiré il y a ${daysAgo}j`)
      try {
        await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ type: 'email_tracking', to: c.email, subject: out.subject, email_type: 'pass_winback', island: String(c.island).toUpperCase(), ab_test: abKey, ab_arm: arm, status: 'sent', date: new Date().toISOString() }) })
      } catch {}
    } catch (e) { console.log(`  x ${logId(c.email)}: ${e.message}`) }
  }
  console.log(`Done. ${DO_SEND ? count + ' relance(s) envoyée(s)' : candidates.length + ' candidat(s) (dry-run)'}${skipped ? ` · ${skipped} déjà relancé(s)` : ''}.`)
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
module.exports = { passDays, copy }
