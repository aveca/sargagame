#!/usr/bin/env node
/**
 * welcome-paid-mollie.cjs — BIENVENUE aux nouveaux clients PASS (Mollie).
 *
 * Trou identifié : welcome-paid.cjs ne couvre QUE les abonnés Stripe (16 legacy, ne
 * grandit plus). Les acheteurs de PASS Mollie — la base client qui croît réellement —
 * ne recevaient AUCUN email post-achat. Or en modèle pass-only, le revenu = la
 * satisfaction → le RACHAT. Un onboarding propre (réduit les remboursements, ancre la
 * valeur, prime le rachat) est donc un levier revenu direct, complémentaire de
 * pass-expiry-winback (qui, lui, relance à l'EXPIRATION).
 *
 * Bonus SCALE : une ligne « partage Le Veilleur à un ami » nourrit la boucle parrainage
 * (côté offre) au moment de plus forte satisfaction. HONNÊTE : Mollie ne peut PAS
 * créditer (cf. mollie.php) → on ne promet AUCUNE récompense au filleul ; on invite
 * juste à partager. Le code parrain se génère in-app (par device) → le CTA ouvre l'app.
 *
 * SOURCE = API Mollie (paiements 'paid' one-time = pass ; abos exclus). Dédup par
 * emailHash dans data/welcome-paid-mollie-sent.json (1 bienvenue par client, à vie).
 * DRY-RUN par défaut ; le fondateur bascule --send (comme welcome-paid/dunning).
 * Sans MOLLIE_API_KEY → no-op gracieux.
 *
 * Usage:
 *   node scripts/automation/welcome-paid-mollie.cjs                  # dry-run
 *   node scripts/automation/welcome-paid-mollie.cjs --send           # envoie
 *   node scripts/automation/welcome-paid-mollie.cjs --since-days=14  # fenêtre (défaut 14)
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')
const { getAllRegions } = require('../../regions/index.cjs')
const { passDays } = require('./pass-expiry-winback.cjs')

const args = process.argv.slice(2)
const DO_SEND = args.includes('--send')
const SINCE_DAYS = Number((args.find(a => a.startsWith('--since-days=')) || '--since-days=14').split('=')[1]) || 14
const MAX = Number((args.find(a => a.startsWith('--max=')) || '--max=50').split('=')[1]) || 50
const THROTTLE_MS = 500

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

const SENT_PATH = path.join(__dirname, 'data', 'welcome-paid-mollie-sent.json')
const HOOK = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const REGIONS = Object.fromEntries(getAllRegions().map(r => [r.id, r]))
const DOMAINS = { mq: 'sargasses-martinique.com', gp: 'sargasses-guadeloupe.com' }
const regionDomain = island => DOMAINS[island] || (REGIONS[island] && REGIONS[island].domain) || 'sargasses-martinique.com'
const unsubUrl = (email, island) => `${HOOK}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${String(island || 'MQ').toUpperCase()}`
const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const saveJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }

async function mollie(pathname) {
  const res = await fetch(`https://api.mollie.com/v2/${pathname}`, { headers: { Authorization: `Bearer ${MOLLIE_KEY}` } })
  const json = await res.json()
  if (json && json.status && json.status >= 400 && json.detail) throw new Error(`Mollie ${pathname}: ${json.detail}`)
  return json
}
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

// Onboarding localisé (FR/EN/ES). PAS de CTA paywall (ils ont déjà payé) : 1 CTA =
// ouvrir l'app + 1 ligne partage HONNÊTE (aucune promesse de récompense).
function copy(island) {
  const region = REGIONS[island] || null
  const lang = (region && region.primaryLang) || 'fr'
  const name = (region && region.name) || (island === 'gp' ? 'Guadeloupe' : 'Martinique')
  const brand = lang === 'es' ? 'Sargazo' : lang === 'en' ? 'Sargassum' : 'Sargasses'
  const open = `https://${regionDomain(island)}/?utm_source=email&utm_medium=welcome_pass`
  const btn = (label, href) => `<p style="text-align:center;margin:22px 0"><a href="${href}" style="display:inline-block;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#190c2c;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:12px">${label}</a></p>`
  if (lang === 'es') return {
    from: `${brand} ${name} <alerte@sargasses-martinique.com>`,
    subject: 'Tu Vigía está vigilando — tu parte de la mañana 🌅',
    pre: 'Cada mañana, el veredicto de tu playa. Medido por satélite, nunca adivinado.',
    body: brandHeader('Tu Vigía vigila el mar', `${brand} ${name}`, 'Cada mañana, el veredicto de tu playa — medido, no adivinado.') +
      `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
        <p>¡Gracias! Tu Pase está activo. Cada mañana, el Vigía mira el mar mientras duermes — nunca a ti — y te da el veredicto de tu playa, su pronóstico de 7 días y la alerta la mañana en que cambia. Y cuando no estamos seguros, te lo decimos.</p>
        <p><b>Para empezar:</b> abre el mapa, añade tus playas favoritas (♥) y activa las alertas para avisarte la mañana en que una cambia. Si una playa se llena, tu Plan B — las 3 playas limpias más cercanas — ya está ahí.</p>
        ${btn('Abrir mi mapa', open)}
        <p style="font-size:13px;color:#1a2b3c">¿Un amigo sufre con el sargazo? <b>Compártele El Vigía</b> — ayúdale a no perder un día de playa.</p>
        <p style="font-size:12px;color:#8a97a5">Pago único · sin suscripción · acceso inmediato.</p>
        <p style="font-size:10.5px;color:#aab4ad;line-height:1.5;margin-top:14px;border-top:1px solid #eef1ef;padding-top:10px">Acceso inmediato: al activar tu Pase, solicitaste la entrega inmediata de tu previsión de 7 días y reconociste que renuncias a tu derecho de desistimiento de 14 días una vez abierto el acceso (art. L221-28 13° del Código de Consumo francés).</p>
      </div>`,
  }
  if (lang === 'en') return {
    from: `${brand} ${name} <alerte@sargasses-martinique.com>`,
    subject: 'Your Watchman is on watch — your morning dispatch 🌅',
    pre: 'Every morning, your beach verdict. Measured by satellite, never guessed.',
    body: brandHeader('Your Watchman is on watch', `${brand} ${name}`, 'Every morning, your beach verdict — measured, not guessed.') +
      `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
        <p>Thank you! Your Pass is active. Every morning, the Watchman watches the sea while you sleep — never you — and gives you your beach verdict, its 7-day forecast and the alert the morning it turns. And when we're not sure, we tell you.</p>
        <p><b>To start:</b> open the map, add your favourite beaches (♥) and turn on alerts so we warn you the morning one turns. If a beach closes up, your Plan B — the 3 nearest clean beaches — is already there.</p>
        ${btn('Open my map', open)}
        <p style="font-size:13px;color:#1a2b3c">A friend struggling with sargassum? <b>Share the Watchman</b> — help them never waste a beach day.</p>
        <p style="font-size:12px;color:#8a97a5">One-time · no subscription · instant access.</p>
        <p style="font-size:10.5px;color:#aab4ad;line-height:1.5;margin-top:14px;border-top:1px solid #eef1ef;padding-top:10px">Instant access: by activating your Pass, you requested immediate delivery of your 7-day forecast and acknowledged that you waive your 14-day right of withdrawal once access is opened (art. L221-28 13° French Consumer Code / Directive 2011/83/EU).</p>
      </div>`,
  }
  return {
    from: `${brand} ${name} <alerte@sargasses-martinique.com>`,
    subject: 'Ton Veilleur veille — voici ta dépêche du matin 🌅',
    pre: 'Chaque matin, le verdict de ta plage. Mesuré au satellite, jamais deviné.',
    body: brandHeader('Ton Veilleur veille la mer', `${brand} ${name}`, 'Chaque matin, le verdict de ta plage — mesuré, pas deviné.') +
      `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
        <p>Merci ! Ton Pass est actif. Chaque matin, Le Veilleur regarde la mer pendant que tu dors — jamais toi — et te livre le verdict de ta plage, sa prévision 7 jours et l'alerte le matin où ça bascule. Et quand on n'est pas sûrs, on te le dit.</p>
        <p><b>Pour démarrer :</b> ouvre la carte, ajoute tes plages favorites (♥) et active les alertes pour qu'on te prévienne le matin où l'une tourne. Si une plage se ferme, ton Plan B — les 3 plages propres les plus proches — est déjà là.</p>
        ${btn('Ouvrir ma carte', open)}
        <p style="font-size:13px;color:#1a2b3c">Un ami galère avec les sargasses ? <b>Partage-lui Le Veilleur</b> — évite-lui de gâcher une journée plage.</p>
        <p style="font-size:12px;color:#8a97a5">Paiement unique · sans abonnement · accès immédiat.</p>
        <p style="font-size:10.5px;color:#aab4ad;line-height:1.5;margin-top:14px;border-top:1px solid #eef1ef;padding-top:10px">Accès immédiat : en activant ton Pass, tu as demandé la fourniture immédiate de ta prévision 7 jours et reconnu renoncer à ton droit de rétractation de 14 jours une fois l'accès ouvert (art. L221-28 13° C. conso).</p>
      </div>`,
  }
}

async function main() {
  console.log(`=== Welcome PASS (Mollie) === mode=${DO_SEND ? 'SEND' : 'DRY-RUN'} | fenêtre=${SINCE_DAYS}j | smtp=${mailReady() ? 'ok' : 'ABSENT'}`)
  if (!MOLLIE_KEY) { console.log('MOLLIE_API_KEY absent — no-op (ajoute le secret + --send pour activer).'); return }
  if (DO_SEND && !mailReady()) { console.error('SMTP_PASS manquant — impossible d\'envoyer (--send).'); process.exit(1) }

  let payments
  try { payments = await listPayments() } catch (e) { console.error('Mollie list échec:', e.message); process.exitCode = 1; return }
  const now = Date.now()
  const DAY = 86400000
  const since = now - SINCE_DAYS * DAY

  // Acheteurs de PASS récents (paid, one-time = passDays défini, abos exclus), 1 par
  // email (le 1er achat dans la fenêtre suffit à déclencher la bienvenue).
  const byEmail = new Map()
  for (const p of payments) {
    if (p.status !== 'paid') continue
    const meta = p.metadata || {}
    if (!passDays(meta)) continue // abo/inconnu → pas un pass
    const email = String(meta.email || (p.details && p.details.cardHolder) || '').trim()
    if (!email || !email.includes('@')) continue
    const paidAt = p.paidAt ? new Date(p.paidAt).getTime() : (p.createdAt ? new Date(p.createdAt).getTime() : null)
    if (!paidAt || paidAt < since) continue
    const island = String(meta.island || 'mq').toLowerCase()
    const cur = byEmail.get(email)
    if (!cur || paidAt > cur.paidAt) byEmail.set(email, { email, paidAt, island })
  }

  const sent = loadJSON(SENT_PATH, [])
  const sentSet = new Set(Array.isArray(sent) ? sent : [])
  const candidates = [...byEmail.values()]
  console.log(`Acheteurs pass uniques (<${SINCE_DAYS}j): ${candidates.length}`)

  let count = 0, skipped = 0, fail = 0
  for (const c of candidates) {
    if (count >= MAX) { console.log(`MAX ${MAX} atteint — stop.`); break }
    const h = emailHash(c.email)
    if (sentSet.has(h)) { skipped++; continue }
    const t = copy(c.island)
    const region = REGIONS[c.island] || null
    const lang = (region && region.primaryLang) || 'fr'
    if (!DO_SEND) { console.log(`  ~ [dry] ${logId(c.email)} (${c.island}, ${lang})`); count++; continue }
    try {
      const { error } = await sendEmail({ from: t.from, to: c.email, subject: t.subject, html: t.body, preheader: t.pre, unsubUrl: unsubUrl(c.email, c.island) })
      if (error) { console.log(`  x ${logId(c.email)}: ${error.message}`); fail++; continue }
      sentSet.add(h)
      saveJSON(SENT_PATH, [...sentSet]) // flush incrémental (anti re-spam si crash mid-run)
      count++
      console.log(`  + ${logId(c.email)} (${c.island}) bienvenue envoyée`)
      try {
        await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ type: 'email_tracking', to: c.email, subject: t.subject, email_type: 'welcome_pass', island: String(c.island).toUpperCase(), status: 'sent', date: new Date().toISOString() }) })
      } catch {}
      await new Promise(res => setTimeout(res, THROTTLE_MS))
    } catch (e) { console.log(`  x ${logId(c.email)}: ${e.message}`); fail++ }
  }
  if (DO_SEND) saveJSON(SENT_PATH, [...sentSet])
  console.log(`Done. ${DO_SEND ? count + ' bienvenue(s) envoyée(s)' : count + ' candidat(s) (dry-run)'}${skipped ? ` · ${skipped} déjà accueilli(s)` : ''}${fail ? ` · ${fail} échec(s)` : ''}.`)
}

if (require.main === module) main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
module.exports = { copy }
