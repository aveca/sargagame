#!/usr/bin/env node
/**
 * recover-abandoned-cart.cjs — Relance panier abandonné + carte refusée (Stripe → Resend)
 *
 * Récupère les Checkout Sessions NON payées qui ont laissé un email, détecte le
 * MOTIF (carte refusée / 3DS non confirmé / simple abandon) et envoie 1 email de
 * relance adapté, dans la langue de la région, pointant vers le produit exact.
 *   - declined  → « ta carte a été refusée, réessaie avec une autre »
 *   - action    → « un dernier pas : confirme le paiement avec ta banque »
 *   - abandoned → « tu hésites encore ? ta carte des plages t'attend »
 *
 * Exclut les clients déjà actifs et ceux déjà relancés (anti-double-envoi).
 * RGPD : re-fetch depuis Stripe à chaque run (aucun email écrit dans le repo) ;
 * état persisté = hashes only ; logs = hash8 only.
 *
 * Clés : STRIPE_SECRET_KEY + SMTP_PASS (lues depuis process.env OU .env).
 * Usage :
 *   node scripts/automation/recover-abandoned-cart.cjs            # DRY-RUN
 *   node scripts/automation/recover-abandoned-cart.cjs --send     # envoie
 *   ... --since-days=3   # fenêtre (défaut 1 = aujourd'hui UTC)
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')
const { pickArm, applyArm } = require('./lib/email-ab.cjs')
const AB_VARS = require('./data/email-ab-variants.json')
const { getAllRegions } = require('../../regions/index.cjs')

const args = process.argv.slice(2)
const DO_SEND = args.includes('--send')
const SINCE_DAYS = Number((args.find(a => a.startsWith('--since-days=')) || '--since-days=1').split('=')[1]) || 1
// --only=<email|hash|hash-prefix> : relance ciblée d'UN panier précis (le reste reste à la loop planifiée)
const ONLY_RAW = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null
const ONLY_HASH = ONLY_RAW ? (ONLY_RAW.includes('@') ? require('crypto').createHash('sha256').update(ONLY_RAW.trim().toLowerCase()).digest('hex').slice(0, 32) : ONLY_RAW.toLowerCase()) : null

function envVal(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const txt = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const m = txt.match(new RegExp('^' + name + '=([^\\r\\n]+)', 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}
const STRIPE_KEY = envVal('STRIPE_SECRET_KEY')
const MOLLIE_KEY = envVal('MOLLIE_API_KEY') // caisse LIVE — source ADDITIVE de la relance panier (Stripe = legacy run-off)
// Envoi via SMTP (boîte alerte@). Bridge .env → process.env pour que la couche
// d'envoi (qui lit process.env) voie les creds en exécution locale.
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => { if (!process.env[k]) { const v = envVal(k); if (v) process.env[k] = v } })

const SENT_PATH = path.join(__dirname, 'data', 'cart-recovery-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const HOOK = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const FROM_DOMAIN = 'alerte@sargasses-martinique.com' // seul domaine vérifié Resend (free plan)
const FRAUD_CODES = new Set(['fraudulent', 'stolen_card', 'lost_card', 'pickup_card']) // ne JAMAIS inciter à réessayer

const unsubUrl = (email, island) => `${HOOK}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`
const REGIONS = Object.fromEntries(getAllRegions().map(r => [r.id, r]))

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
// ── Mollie (caisse LIVE) — la vraie source de paniers abandonnés aujourd'hui ──
async function mollie(pathname) {
  const res = await fetch(`https://api.mollie.com/v2/${pathname}`, { headers: { Authorization: `Bearer ${MOLLIE_KEY}` } })
  const json = await res.json()
  if (json && json.status >= 400 && json.detail) throw new Error(`Mollie ${pathname}: ${json.detail}`)
  return json
}
async function listAllMollie(cap = 600) {
  const out = []
  let url = 'payments?limit=250'
  while (out.length < cap && url) {
    const pg = await mollie(url)
    out.push(...(((pg._embedded || {}).payments) || []))
    const next = pg._links && pg._links.next && pg._links.next.href
    url = next ? next.replace('https://api.mollie.com/v2/', '') : null
  }
  return out
}
const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const saveJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
const hashedSet = arr => new Set((Array.isArray(arr) ? arr : []).map(e => String(e).includes('@') ? emailHash(e) : e))

// ---- Cadence multi-touch J0 / J1 / J3 -----------------------------------
// État = map hash → { n: relances déjà envoyées, f: 1er contact (ms), l: dernier (ms) }.
// Plusieurs touches espacées récupèrent bien plus qu'un envoi unique (la plus grosse
// fuite mesurée). Rétro-compat : l'ancien format = tableau plat de hashes (relance
// one-touch) → migré en cadence TERMINÉE (n=3) pour ne PAS re-spammer la backlog
// historique ; seuls les NOUVEAUX abandons reçoivent la séquence complète. La fenêtre
// SINCE_DAYS exclut de toute façon les sessions trop vieilles.
const CADENCE_OFFSETS_H = [0, 24, 72] // J0 immédiat · J1 +24h · J3 +72h (depuis le 1er contact)
function loadCadence(p) {
  const raw = loadJSON(p, {})
  if (Array.isArray(raw)) {
    const m = {}
    for (const e of raw) { const h = String(e).includes('@') ? emailHash(e) : e; m[h] = { n: CADENCE_OFFSETS_H.length, f: 0, l: 0 } }
    return m
  }
  return (raw && typeof raw === 'object') ? raw : {}
}
// La relance n°(n+1) est due quand on a dépassé 1er_contact + offset[n]. Renvoie false
// quand la séquence est terminée (n ≥ 3) ou pas encore l'heure → pas de double-envoi
// intra-journée (le script tourne 4×/j).
function cadenceDue(entry, nowMs) {
  const n = entry ? (entry.n || 0) : 0
  if (n >= CADENCE_OFFSETS_H.length) return false
  const first = entry && entry.f ? entry.f : nowMs
  return nowMs >= first + CADENCE_OFFSETS_H[n] * 3600e3
}

// ---- Copy par langue × motif --------------------------------------------
// 3 langues (fr = MQ/GP EUR, es = rivieramaya USD, en = florida/puntacana/barbados USD).
// Prix : EUR = pass d'entrée réel 7,99 € (public/api/mollie-config.example.php `p7`,
// aligné PremiumModal.jsx "Pass dès 7,99 €") — PAS le tripPass legacy 4,99 € de
// regions/*.json (stale, pré-refonte 3-tiers). USD = $5.99 (tier d'entrée USD).
function copy(region, kind) {
  const lang = region.primaryLang === 'fr' ? 'fr' : region.primaryLang === 'es' ? 'es' : 'en'
  const name = region.name
  const price = lang === 'fr' ? '7,99 €' : '$5.99'
  const SHARED = {
    fr: { f1t: 'Carte des plages en direct', f1d: `Vérifie n’importe quelle plage de ${name} en 5 secondes.`,
          f2t: 'Vraies données satellite', f2d: 'Imagerie satellite actualisée 4 fois par jour.',
          f3t: 'Prévision à 7 jours', f3d: 'Planifie tes journées autour des plages propres.',
          unsub: 'Se désabonner' },
    es: { f1t: 'Mapa de playas en vivo', f1d: `Revisa cualquier playa de ${name} en 5 segundos.`,
          f2t: 'Datos satelitales reales', f2d: 'Imágenes de satélite actualizadas 4 veces al día.',
          f3t: 'Pronóstico de 7 días', f3d: 'Planifica tus días alrededor de las playas limpias.',
          unsub: 'Darse de baja' },
    en: { f1t: 'Live beach map', f1d: `Check any ${name} beach in 5 seconds.`,
          f2t: 'Real satellite data', f2d: 'Satellite imagery refreshed 4 times a day.',
          f3t: '7-day forecast', f3d: 'Plan your days around the clear beaches.',
          unsub: 'Unsubscribe' },
  }
  const V = {
    declined: {
      fr: { subject: `Ton paiement n’est pas passé — réessayer avec une autre carte ?`, kicker: 'Presque prêt',
            pre: `C’est souvent un blocage temporaire de la banque — avec une autre carte tu es dedans en 30 secondes.`,
            tagline: 'Ta carte a été refusée — ça arrive. Réessaie avec une autre et c’est bon.',
            body: `Ta banque a refusé le paiement de ton pass ${name}. C’est souvent un blocage temporaire — réessaie avec une autre carte et tu as un accès immédiat :`,
            cta: `Réessayer avec une autre carte — ${price}` },
      es: { subject: `Tu pago no se completó — ¿probar con otra tarjeta?`, kicker: 'Casi listo',
            pre: `Suele ser un bloqueo temporal del banco — con otra tarjeta entras en 30 segundos.`,
            tagline: 'Tu tarjeta fue rechazada — pasa a veces. Prueba con otra y listo.',
            body: `Tu banco rechazó el pago de tu pase de ${name}. Suele ser un bloqueo temporal — prueba con otra tarjeta y tendrás acceso al instante:`,
            cta: `Probar con otra tarjeta — ${price}` },
      en: { subject: `Your payment didn't go through — try another card?`, kicker: 'Almost there',
            pre: `Usually just a temporary bank hold — another card gets you in within 30 seconds.`,
            tagline: 'Your card was declined — it happens. Try another and you’re in.',
            body: `Your bank declined the payment for your ${name} trip pass. It’s usually a temporary block — try another card and you’ll get instant access:`,
            cta: `Try another card — ${price}` },
    },
    action: {
      fr: { subject: `Encore une étape pour confirmer ton paiement`, kicker: 'Dernière étape',
            pre: `Ta banque a juste besoin d’une confirmation rapide — et ton pass ${name} est actif.`,
            tagline: 'Ta banque a juste besoin que tu confirmes le paiement.',
            body: `Tu es à un pas de ton pass ${name}. Ta banque a juste besoin que tu confirmes le paiement — appuie ci-dessous pour terminer :`,
            cta: `Terminer mon paiement — ${price}` },
      es: { subject: `Un último paso para confirmar tu pago`, kicker: 'Un último paso',
            pre: `Tu banco solo necesita una confirmación rápida — y tu pase de ${name} queda activo.`,
            tagline: 'Tu banco solo necesita que confirmes el pago.',
            body: `Estás a un paso de tu pase de ${name}. Tu banco solo necesita que confirmes el pago — toca abajo para terminar:`,
            cta: `Completar mi pago — ${price}` },
      en: { subject: `One last step to confirm your payment`, kicker: 'One last step',
            pre: `Your bank just needs a quick confirmation — then your ${name} pass is live.`,
            tagline: 'Your bank just needs you to confirm the payment.',
            body: `You’re one step away from your ${name} trip pass. Your bank just needs you to confirm the payment — tap below to finish:`,
            cta: `Finish my payment — ${price}` },
    },
    abandoned: {
      fr: { subject: `Tu hésites encore ? Ta prévision des plages de ${name} est prête`, kicker: 'Tu y es presque',
            pre: `Vérifie n’importe quelle plage de ${name} avant d’y aller — propre ou non, en 5 secondes.`,
            tagline: 'Sache quelles plages sont propres — avant d’y aller.',
            body: `Tu étais à un pas de ton pass ${name}. Pas de pression — voici ce qui t’attend :`,
            cta: `Obtenir mon pass — ${price}` },
      es: { subject: `¿Aún lo estás pensando? Tu pronóstico de playas de ${name} está listo`, kicker: 'Casi lo tienes',
            pre: `Mira cualquier playa de ${name} antes de ir — limpia o no, en 5 segundos.`,
            tagline: 'Sabe qué playas están limpias — antes de ir.',
            body: `Estabas a un paso de tu pase de viaje de ${name}. Sin prisa — esto es lo que te espera:`,
            cta: `Obtén tu pase — ${price}` },
      en: { subject: `Still thinking about it? Your ${name} beach forecast is ready`, kicker: "You’re almost there",
            pre: `Check any ${name} beach before you go — clean or not, in 5 seconds.`,
            tagline: 'Know which beaches are clear — before you go.',
            body: `You were one step away from your ${name} trip pass. No rush — here’s what’s waiting for you:`,
            cta: `Get your pass — ${price}` },
    },
  }
  const foot = { fr: 'Paiement unique · sans abonnement · accès immédiat',
                 es: 'Pago único · sin suscripción · acceso inmediato',
                 en: 'One-time pass · no subscription · instant access' }[lang]
  const brand = { fr: 'Sargasses', es: 'Sargazo', en: 'Sargassum' }[lang]
  return { ...SHARED[lang], ...V[kind][lang], foot, brand: `${brand} ${name}` }
}

function buildHTML(region, email, kind) {
  const t = copy(region, kind)
  const domain = region.domain
  // CTA → paywall ON-SITE (Mollie pass, toutes régions EUR+USD). Avant : pointait
  // sur paymentLinks.tripPass = lien Stripe DÉSACTIVÉ (USD) ou, à défaut, le domaine
  // NU (EUR sans paymentLinks) → le lead retombait sur la home et devait re-chercher
  // la caisse. ?paywall=1 rouvre directement le storefront pass on-site.
  const link = `https://${domain}/?paywall=1&utm_source=email&utm_medium=cart_recovery&utm_campaign=recover`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${brandHeader(t.kicker, t.brand, t.tagline)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:14px;color:#444;line-height:1.5;margin-bottom:18px">${t.body}</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:10px 0;vertical-align:top;width:30px;font-size:18px">\u{1F5FA}️</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">${t.f1t}</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">${t.f1d}</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F6F0}️</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">${t.f2t}</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">${t.f2d}</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F4C5}</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">${t.f3t}</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">${t.f3d}</div></td></tr>
    </table>
    <div style="margin-top:22px;text-align:center">
      <a href="${link}" style="display:inline-block;padding:15px 36px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;box-shadow:0 4px 16px rgba(232,168,0,.3)">${t.cta}</a>
      <div style="font-size:11px;color:#999;margin-top:10px">${t.foot}</div>
    </div>
  </div>
  <div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    ${t.brand} · ${domain}<br><a href="${unsubUrl(email, region.id)}" style="color:#999">${t.unsub}</a>
  </div>
</div></body></html>`
}

// Détecte le motif d'échec depuis le PaymentIntent de la session
async function detectKind(session) {
  if (!session.payment_intent) return 'abandoned'
  try {
    const pi = await stripe(`payment_intents/${session.payment_intent}`)
    if (pi.status === 'requires_action') return 'action'
    const err = pi.last_payment_error
    if (err) return FRAUD_CODES.has(err.decline_code) ? 'skip-fraud' : 'declined'
  } catch {}
  return 'abandoned'
}

async function main() {
  if (!STRIPE_KEY) { console.error('STRIPE_SECRET_KEY introuvable (.env)'); process.exit(1) }
  console.log(`=== Cart Recovery === mode=${DO_SEND ? 'SEND' : 'DRY-RUN'} | fenêtre=${SINCE_DAYS}j | smtp=${mailReady() ? 'ok' : 'ABSENT'}`)

  // Clients déjà actifs → exclure
  const subs = await listAll('subscriptions?status=all')
  const activeCustIds = [...new Set(subs.filter(s => s.status === 'active' || s.status === 'trialing').map(s => s.customer))]
  const activeHashes = new Set()
  for (const cid of activeCustIds) { try { const c = await stripe(`customers/${cid}`); if (c.email) activeHashes.add(emailHash(c.email)) } catch {} }

  const cadence = loadCadence(SENT_PATH)
  const NOW = Date.now()
  const bouncedSet = hashedSet(loadJSON(BOUNCED_PATH, [])) // ne JAMAIS écrire à une adresse morte
  const cutoff = NOW - SINCE_DAYS * 864e5
  const sessions = await listAll('checkout/sessions', 400)

  const candidates = []
  const seen = new Set()
  for (const s of sessions) {
    if (s.payment_status === 'paid') continue
    if (s.created * 1000 < cutoff) continue
    const email = s.customer_details?.email || s.customer_email
    if (!email) continue
    const h = emailHash(email)
    if (ONLY_HASH && !h.startsWith(ONLY_HASH)) continue // relance ciblée
    // Skip si déjà vu ce run, client actif, bounce, OU pas encore l'heure de la
    // prochaine touche de cadence (J0/J1/J3 ou séquence terminée).
    if (seen.has(h) || activeHashes.has(h) || bouncedSet.has(h) || !cadenceDue(cadence[h], NOW)) continue
    let island = s.metadata?.island
    if (!island && s.payment_link) { try { island = (await stripe(`payment_links/${s.payment_link}`)).metadata?.island } catch {} }
    const region = REGIONS[island]
    if (!region) { console.log(`  ⏭️  ${logId(email)} : région inconnue (${island || '?'})`); continue }
    const kind = await detectKind(s)
    if (kind === 'skip-fraud') { console.log(`  ⏭️  ${logId(email)} : carte fraud-flagged — pas de relance`); continue }
    seen.add(h)
    candidates.push({ email, region, kind, h, touch: (cadence[h]?.n || 0) + 1 })
  }

  // ── Source MOLLIE (caisse live on-site) — ADDITIVE, FAIL-OPEN, gatée ──────────
  // Par défaut on LOGGE seulement (vérif cloud avec la vraie clé, ZÉRO envoi) ; mettre
  // MOLLIE_CART_RECOVERY=1 (env du step) → les paniers Mollie entrent dans la relance.
  // Un bug ici ne casse JAMAIS la relance Stripe (try/catch). email = metadata.email ;
  // paid vs abandonné = statut Mollie (autoritatif). On exclut tout email ayant un
  // paiement 'paid' (jamais relancer un acheteur), + actifs/bounces/dédup existants.
  const MOLLIE_SEND = process.env.MOLLIE_CART_RECOVERY === '1'
  if (MOLLIE_KEY) {
    try {
      const pays = await listAllMollie(600)
      const paidH = new Set(pays.filter(p => p.status === 'paid').map(p => ((p.metadata || {}).email || '').trim().toLowerCase()).filter(e => e.includes('@')).map(emailHash))
      const ABANDON = { expired: 'abandoned', canceled: 'abandoned', failed: 'declined' } // 'open'/'pending' encore payables → on ne relance PAS
      const mollieCands = []
      for (const p of pays) {
        const kind = ABANDON[p.status]
        if (!kind) continue
        if (new Date(p.createdAt).getTime() < cutoff) continue
        const email = ((p.metadata || {}).email || '').trim()
        if (!email.includes('@')) continue
        const h = emailHash(email)
        if (ONLY_HASH && !h.startsWith(ONLY_HASH)) continue
        if (seen.has(h) || activeHashes.has(h) || bouncedSet.has(h) || paidH.has(h) || !cadenceDue(cadence[h], NOW)) continue
        const region = REGIONS[(p.metadata || {}).island || 'mq']
        if (!region) continue
        seen.add(h)
        mollieCands.push({ email, region, kind, h, touch: (cadence[h]?.n || 0) + 1 })
      }
      console.log(`Mollie paniers abandonnés : ${mollieCands.length} [${MOLLIE_SEND ? 'ENVOI' : 'DRY — log only, MOLLIE_CART_RECOVERY=1 pour activer'}]`)
      for (const c of mollieCands) console.log(`  • ${logId(c.email)} | ${c.region.name} | ${c.kind} | touche J${c.touch === 1 ? '0' : c.touch === 2 ? '1' : '3'}`)
      if (MOLLIE_SEND) candidates.push(...mollieCands)
    } catch (e) { console.log(`  ⚠️ Mollie recovery skip (fail-open): ${e.message}`) }
  }

  const byKind = candidates.reduce((m, c) => ((m[c.kind] = (m[c.kind] || 0) + 1), m), {})
  console.log(`Leads à relancer : ${candidates.length}`, byKind)
  for (const c of candidates) console.log(`  • ${logId(c.email)} | ${c.region.name} (${c.region.primaryLang}) | ${c.kind} | touche J${c.touch === 1 ? '0' : c.touch === 2 ? '1' : '3'} | "${copy(c.region, c.kind).subject}"`)

  if (!candidates.length) return
  if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. Relancer avec --send.'); return }
  if (!mailReady()) { console.error('\n❌ SMTP_PASS absent — impossible d\'envoyer.'); process.exit(1) }

  const resend = null
  let ok = 0
  for (const { email, region, kind, h } of candidates) {
    const t = copy(region, kind)
    const from = `${t.brand} <${FROM_DOMAIN}>`
    const unsub = unsubUrl(email, region.id)
    // A/B — EN uniquement (les 3 variants cart sont EN ; pas de variant ES/FR pour l'instant —
    // un gate en "pas ES" appliquerait à tort la variante EN aux emails FR : bug corrigé ici)
    const _cabKey = region.primaryLang === 'en' ? `em_cart_${kind}_v1` : null
    const _cabArm = _cabKey ? pickArm(_cabKey, email) : 'A'
    const _cabOut = applyArm(_cabArm, { subject: t.subject, preheader: t.pre },
      _cabKey ? AB_VARS[`cart_${kind}.en`]?.ship : null)
    try {
      const { data, error } = await sendEmail(resend, {
        from, to: email, subject: _cabOut.subject, html: buildHTML(region, email, kind),
        preheader: _cabOut.preheader, unsubUrl: unsub,
      })
      if (error) { console.log(`  ❌ ${logId(email)} : ${error.message}`); continue }
      console.log(`  ✅ ${logId(email)} (${region.name}/${kind})`)
      ok++
      // Avance la cadence : +1 touche, fixe le 1er contact si absent, horodate.
      const prev = cadence[h] || { n: 0, f: 0, l: 0 }
      cadence[h] = { n: (prev.n || 0) + 1, f: prev.f || NOW, l: NOW }
      saveJSON(SENT_PATH, cadence) // flush incrémental anti-double-envoi
      try {
        await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'email_tracking', resend_id: data?.id || '', to: email, subject: _cabOut.subject, email_type: `cart_recovery_${kind}`, island: region.id, status: 'sent', ab_test: _cabKey || '', ab_arm: _cabArm, date: new Date().toISOString() }) })
      } catch {}
    } catch (e) { console.log(`  ❌ ${logId(email)} : ${e.message}`) }
  }
  saveJSON(SENT_PATH, cadence)
  console.log(`Done. ${ok}/${candidates.length} envoyés.`)
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
