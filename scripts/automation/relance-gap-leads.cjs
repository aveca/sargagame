#!/usr/bin/env node
/**
 * Relance GO-LIVE capture — Sargasses MQ/GP (via SMTP, lib email-send)
 *
 * Pendant la coupure paiement (Stripe mort, attente validation Mollie on-site), le
 * paywall est en mode CAPTURE : il enrôle l'email (sources gap_freemium / mollie_waitlist
 * / onsite_checkout / pay_intent / paypal_sub) au lieu de charger. CE SCRIPT = la relance
 * à dégainer AU GO-LIVE Mollie : « C'est rouvert — ton accès Premium pour 4,99 €/mois. »
 * Convertit les leads capturés pendant l'attente en abonnés dès la réouverture.
 *
 * One-shot, idempotent (data/relance-gap-sent.json), throttlé (plafond Resend ~100/j).
 * Nécessite scripts/automation/data/subscribers.json (récupéré au runtime/FTP).
 * Usage : node scripts/automation/relance-gap-leads.cjs              (dry-run sans SMTP_PASS)
 *         SMTP_PASS=… node scripts/automation/relance-gap-leads.cjs --send [--max=90]
 */
const fs = require('fs')
const path = require('path')
const { emailHash } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')

const SEND = process.argv.includes('--send')
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const SENT_PATH = path.join(__dirname, 'data', 'relance-gap-sent.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
// Toutes les sources de CAPTURE pendant la coupure paiement (= leads à relancer au
// go-live). gap_freemium = 7j offerts contre email ; mollie_waitlist = waitlist pure ;
// onsite_checkout/pay_intent/paypal_sub = haute intention enrôlée avant paiement ;
// capture-gate (= ~85% du trafic forecast, la plus GROSSE poche) / chasse / map_world =
// surfaces de capture email omises jusqu'ici → elles aussi à relancer au go-live.
const CAPTURE_SOURCES = new Set(['gap_freemium', 'mollie_waitlist', 'onsite_checkout', 'pay_intent', 'paypal_sub', 'capture-gate', 'chasse', 'map_world'])
// Plafond par run pour la boîte SMTP cPanel (alerte@, premium115.web-hosting.com via
// nodemailer — PAS Resend, cf. lib/email-send.cjs) : les boîtes mutualisées ont une
// limite d'envoi horaire. --max=N pour override ; relancer plus tard reprend où on
// s'est arrêté (idempotent : déjà-envoyés skippés via relance-gap-sent.json).
const MAX = (() => { const a = process.argv.find(x => x.startsWith('--max=')); return a ? parseInt(a.split('=')[1], 10) : 90 })()
const THROTTLE_MS = 400 // ~2,5 envois/s, doux pour la boîte SMTP mutualisée

const REGION = {
  MQ: { from: 'Sargasses Martinique <alerte@sargasses-martinique.com>', domain: 'sargasses-martinique.com' },
  GP: { from: 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>', domain: 'sargasses-guadeloupe.com' },
}
const fallback = REGION.MQ

function loadJson(p, dflt) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return dflt } }
function subscribersList() {
  const d = loadJson(SUBSCRIBERS_PATH, [])
  return Array.isArray(d) ? d : (d.subscribers || Object.values(d || {}))
}
function unsubUrl(email, island) { return `${WEBHOOK_URL}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}` }
function paywallUrl(domain) { return `https://${domain}/?paywall=1&utm_source=email&utm_medium=relance_gap&utm_campaign=reopen` }

function buildHtml(domain, island) {
  const cta = paywallUrl(domain)
  return `${brandHeader ? brandHeader(island) : ''}
<div style="font-family:system-ui,-apple-system,Arial;max-width:480px;margin:0 auto;padding:24px 20px;color:#1a1a1a">
  <div style="font:700 12px/1 system-ui;letter-spacing:1.5px;color:#E8A800;text-transform:uppercase;margin-bottom:10px">LE VEILLEUR · PASS</div>
  <h1 style="font-size:23px;margin:0 0 8px">C'est rouvert — ne gâche plus un jour de plage 🌅</h1>
  <p style="font-size:15px;color:#444;margin:0 0 6px">Le Veilleur te dit chaque matin LA plage sans sargasses : prévision 7 jours, 136+ plages, alertes.</p>
  <p style="font-size:15px;color:#444;margin:0 0 20px"><b>Un pass, paiement unique — pas d'abonnement.</b> Dès <b>7,99 €</b> · le Pass 30 jours à <b>14,99 €</b> (0,50 €/jour).</p>
  <a href="${cta}" style="display:inline-block;background:linear-gradient(135deg,#E8A800,#F0C040);color:#1a1a1a;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Activer mon pass →</a>
  <p style="font-size:11px;color:#bbb;margin:22px 0 0">Paiement unique · pas d'abonnement · remboursé en un email · ${domain}</p>
</div>`
}

;(async () => {
  const ready = mailReady()
  if (SEND && !ready) { console.error('SMTP_PASS manquant — impossible d\'envoyer (--send).'); process.exit(1) }
  const sent = loadJson(SENT_PATH, {})
  const subs = subscribersList().filter(s => s && CAPTURE_SOURCES.has(s.source))
  console.log(`leads capture: ${subs.length} | plafond: ${MAX} | mode: ${SEND && ready ? 'SEND' : 'DRY-RUN'}`)
  let done = 0, skip = 0, fail = 0
  for (const s of subs) {
    if (done >= MAX) { console.log(`Plafond ${MAX} atteint — relance le script demain pour la suite (idempotent).`); break }
    const email = (s.email || '').trim()
    if (!email || !email.includes('@')) { skip++; continue }
    const h = emailHash(email)
    if (sent[h]) { skip++; continue }
    const island = (s.island || s.region || 'MQ').toString().toUpperCase()
    const reg = REGION[island] || fallback
    if (!SEND || !ready) { console.log(`  [dry] → ${email} (${island})`); done++; continue }
    const r = await sendEmail({
      from: reg.from, to: email,
      subject: 'C\'est rouvert — ton pass plage t\'attend (paiement unique)',
      html: buildHtml(reg.domain, island),
      preheader: 'Un pass, pas d\'abonnement — dès 7,99 €. Ne rate plus une journée plage.',
      unsubUrl: unsubUrl(email, island),
    })
    if (r.error) { console.error(`  [fail] ${email}: ${r.error.message}`); fail++; continue }
    sent[h] = { date: new Date().toISOString(), island, source: s.source }
    done++
    fs.writeFileSync(SENT_PATH, JSON.stringify(sent, null, 2)) // persiste à chaque envoi (reprise si crash mid-run)
    await new Promise(res => setTimeout(res, THROTTLE_MS))
  }
  if (SEND && ready) fs.writeFileSync(SENT_PATH, JSON.stringify(sent, null, 2))
  console.log(`Terminé — envoyés/dry: ${done} · skip: ${skip} · échecs: ${fail}`)
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
