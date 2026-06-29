#!/usr/bin/env node
/**
 * cold-lead-reengage.cjs — NURTURE LONG-TERME : ré-engage les leads DEVENUS FROIDS.
 *
 * Un lead capté il y a des mois, jamais converti, qui ne reçoit plus rien (welcome +
 * drip J7/J14 finis, relance go-live one-shot passée) = revenu dormant. Ce script le
 * recontacte à CADENCE BASSE avec un message honnête et value-first, pour le ramener
 * vers le Pass. C'est le complément long-traîne de pass-expiry-winback (qui, lui, vise
 * les ACHETEURS expirés) : ici on vise les NON-acheteurs refroidis.
 *
 * DÉLIVRABILITÉ D'ABORD (boîte SMTP mutualisée partagée avec le bulletin réel) :
 *   - fenêtre d'âge 60–365 j : on ne touche PAS les leads frais (welcome/drip s'en
 *     chargent) ni les très vieux (>365 j = risque spam-trap / réputation) ;
 *   - cadence 90 j entre deux relances (ledger cold-reengage-sent.json) ;
 *   - CAP À VIE (défaut 3 relances) : après 3 touches froides sans conversion, on
 *     ARRÊTE (pas de harcèlement, protège le domaine) ;
 *   - exclut bounced (bounced-emails.json), désabonnés (flag), B2B/hôtels, emails test ;
 *   - List-Unsubscribe one-click + lien désabo proéminent (via lib email-send) ;
 *   - EUR (MQ/GP) uniquement — copy FR, caisse Mollie EUR live. Les régions USD ont
 *     leur propre cadence (relance-gap --usd) et un brand distinct.
 *
 * DRY-RUN par défaut (0 envoi). Le fondateur bascule --send quand la copy/les volumes
 * lui conviennent (même doctrine que dunning/pass-expiry-winback). Sans subscribers.json
 * (récupéré au runtime/FTP) → no-op gracieux.
 *
 * Usage :
 *   node scripts/automation/cold-lead-reengage.cjs                     # dry-run
 *   node scripts/automation/cold-lead-reengage.cjs --send              # envoie
 *   node scripts/automation/cold-lead-reengage.cjs --min-age=60 --max-age=365
 *   node scripts/automation/cold-lead-reengage.cjs --cadence=90 --max-touches=3 --max=40
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')
const { pickArm, applyArm } = require('./lib/email-ab.cjs')
let AB_VARS = {}; try { AB_VARS = require('./data/email-ab-variants.json') } catch { AB_VARS = {} }

const args = process.argv.slice(2)
const numArg = (name, dflt) => { const a = args.find(x => x.startsWith(`--${name}=`)); const v = a ? parseInt(a.split('=')[1], 10) : NaN; return Number.isFinite(v) ? v : dflt }
const SEND = args.includes('--send')
const MIN_AGE = numArg('min-age', 60)        // jours : en-deçà = encore "chaud" (welcome/drip)
const MAX_AGE = numArg('max-age', 365)       // jours : au-delà = trop vieux (réputation/spam-trap)
const CADENCE = numArg('cadence', 90)        // jours minimum entre deux relances froides
const MAX_TOUCHES = numArg('max-touches', 3) // relances froides à vie par lead
const MAX = numArg('max', 40)                // plafond d'envois par run (boîte SMTP mutualisée)
const THROTTLE_MS = 500

const DATA = path.join(__dirname, 'data')
const SUBSCRIBERS_PATH = path.join(DATA, 'subscribers.json')
const SENT_PATH = path.join(DATA, 'cold-reengage-sent.json')
const BOUNCED_PATH = path.join(DATA, 'bounced-emails.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

const EUR_ISLANDS = new Set(['MQ', 'GP'])
const REGION = {
  MQ: { from: 'Sargasses Martinique <alerte@sargasses-martinique.com>', domain: 'sargasses-martinique.com', brand: 'Sargasses Martinique' },
  GP: { from: 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>', domain: 'sargasses-guadeloupe.com', brand: 'Sargasses Guadeloupe' },
}
const fallback = REGION.MQ
const islandOf = s => (s.island || s.region || 'MQ').toString().toUpperCase()
const isB2B = s => /b2b|pro|hotel|hôtel/i.test(s || '')
const isTestEmail = e => /^test@|(\+test@)|@(test|example)\./i.test(e || '')
const isUnsub = s => s.unsubscribed === true || s.unsubscribed === 1 || /^(1|true|yes|y|oui)$/i.test(String(s.unsubscribed || '').trim())

const loadJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return dflt } }
const saveJson = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
const subscribersList = () => { const d = loadJson(SUBSCRIBERS_PATH, null); if (!d) return null; return Array.isArray(d) ? d : (d.subscribers || Object.values(d || {})) }
const unsubUrl = (email, island) => `${WEBHOOK_URL}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`
const paywallUrl = domain => `https://${domain}/?paywall=1&utm_source=email&utm_medium=cold_reengage&utm_campaign=nurture`
const mapUrl = domain => `https://${domain}/?utm_source=email&utm_medium=cold_reengage`
const leadDate = s => { const raw = s.date || s.createdAt || s.created || s.ts; const t = raw ? new Date(raw).getTime() : NaN; return Number.isFinite(t) ? t : NaN }

// Copy FROIDE — value-first, honnête, sans fausse urgence. On RAPPELLE la valeur (LA
// plage propre chaque matin) et on laisse la porte gratuite ouverte (carte). Le Pass
// est présenté comme l'option, pas comme une dette. brandHeader = entête de marque.
function buildHtml(island) {
  const reg = REGION[island] || fallback
  const cta = paywallUrl(reg.domain)
  const map = mapUrl(reg.domain)
  return brandHeader('La mer a changé depuis ton inscription', reg.brand, 'Le Veilleur veille toujours sur tes plages.') +
    `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
      <p>Tu t'es inscrit·e il y a quelque temps pour suivre les sargasses — on ne t'a pas oublié·e.</p>
      <p>Depuis, le Veilleur s'est affiné : chaque matin il te dit <b>LA plage sans sargasses</b>, avec la prévision 7 jours, 136+ plages et les alertes. La carte reste <b>gratuite</b>.</p>
      <p>Si tu veux le matin sans mauvaise surprise : le <b>Pass</b> est un <b>paiement unique, sans abonnement</b> — 7 jours dès <b>7,99 €</b>, 14 jours <b>14,99 €</b>, 30 jours <b>24,99 €</b>.</p>
      <p style="text-align:center;margin:22px 0"><a href="${cta}" style="display:inline-block;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#190c2c;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:12px">Voir le Pass</a></p>
      <p style="font-size:12px;color:#8a97a5">Paiement unique · sans abonnement · accès immédiat. <a href="${map}" style="color:#0E7C66">Ou reste sur la carte gratuite</a>.</p>
    </div>`
}

async function main() {
  console.log(`=== Cold-lead reengage === mode=${SEND ? 'SEND' : 'DRY-RUN'} | âge ${MIN_AGE}-${MAX_AGE}j | cadence ${CADENCE}j | cap ${MAX_TOUCHES} touches | smtp=${mailReady() ? 'ok' : 'ABSENT'}`)
  if (SEND && !mailReady()) { console.error('SMTP_PASS manquant — impossible d\'envoyer (--send).'); process.exit(1) }

  const subs = subscribersList()
  if (!subs) { console.log('subscribers.json absent — no-op (récupéré au runtime/FTP).'); return }

  const bounced = new Set(loadJson(BOUNCED_PATH, []))
  const sent = loadJson(SENT_PATH, {})
  const now = Date.now()
  const DAY = 86400000

  // Sélection : EUR, non-B2B, non-test, non-désabo, non-bounced, âge dans la fenêtre,
  // cadence respectée, sous le cap à vie.
  const eligible = []
  let noEmail = 0, ageOut = 0, excluded = 0, capped = 0, tooSoon = 0
  for (const s of subs) {
    if (!s || !s.email) { noEmail++; continue }
    const email = String(s.email).trim()
    if (!email.includes('@') || isTestEmail(email)) { excluded++; continue }
    const island = islandOf(s)
    if (!EUR_ISLANDS.has(island)) { excluded++; continue }
    if (isB2B(s.source) || isUnsub(s)) { excluded++; continue }
    const h = emailHash(email)
    if (bounced.has(h)) { excluded++; continue }
    const dt = leadDate(s)
    if (!Number.isFinite(dt)) { ageOut++; continue }       // sans date fiable → on s'abstient (sécurité)
    const ageDays = (now - dt) / DAY
    if (ageDays < MIN_AGE || ageDays > MAX_AGE) { ageOut++; continue }
    const rec = sent[h]
    if (rec && rec.count >= MAX_TOUCHES) { capped++; continue }
    if (rec && rec.last && (now - new Date(rec.last).getTime()) < CADENCE * DAY) { tooSoon++; continue }
    eligible.push({ email, island, h, source: s.source || '', touches: rec ? rec.count : 0 })
  }

  console.log(`subs: ${subs.length} | éligibles: ${eligible.length} | hors-âge: ${ageOut} | exclus: ${excluded} | cap atteint: ${capped} | cadence: ${tooSoon} | sans email: ${noEmail}`)

  let done = 0, fail = 0
  for (const c of eligible) {
    if (done >= MAX) { console.log(`Plafond ${MAX} atteint — relance plus tard (idempotent).`); break }
    const reg = REGION[c.island] || fallback
    const lang = 'fr'
    const abKey = 'em_coldreengage_fr'
    const arm = pickArm(abKey, c.email)
    const base = { subject: 'On veille toujours sur tes plages — le Pass, sans abonnement', preheader: 'Paiement unique dès 7,99 €. La carte reste gratuite.' }
    const out = applyArm(arm, base, (AB_VARS[abKey] && AB_VARS[abKey].ship))

    if (!SEND) {
      console.log(`  ~ [dry] ${logId(c.email)} (${c.island}, touche ${c.touches + 1}/${MAX_TOUCHES}) · « ${out.subject} » [${arm}]`)
      done++
      continue
    }
    try {
      const { error } = await sendEmail({
        from: reg.from, to: c.email, subject: out.subject, html: buildHtml(c.island),
        preheader: out.preheader, unsubUrl: unsubUrl(c.email, c.island),
      })
      if (error) { console.log(`  x ${logId(c.email)}: ${error.message}`); fail++; continue }
      sent[c.h] = { last: new Date().toISOString(), count: c.touches + 1, island: c.island }
      saveJson(SENT_PATH, sent) // flush incrémental (anti re-spam si crash mid-run, cf. leçon emails J2)
      done++
      console.log(`  + ${logId(c.email)} (${c.island}) relancé · touche ${c.touches + 1}/${MAX_TOUCHES}`)
      try {
        await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ type: 'email_tracking', to: c.email, subject: out.subject, email_type: 'cold_reengage', island: c.island, ab_test: abKey, ab_arm: arm, status: 'sent', date: new Date().toISOString() }) })
      } catch {}
      await new Promise(res => setTimeout(res, THROTTLE_MS))
    } catch (e) { console.log(`  x ${logId(c.email)}: ${e.message}`); fail++ }
  }
  if (SEND) saveJson(SENT_PATH, sent)
  console.log(`Done. ${SEND ? done + ' relance(s) envoyée(s)' : done + ' candidat(s) (dry-run)'}${fail ? ` · ${fail} échec(s)` : ''}.`)
}

if (require.main === module) main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
module.exports = { buildHtml, leadDate }
