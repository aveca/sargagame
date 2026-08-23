#!/usr/bin/env node
/**
 * cart-recovery-unified — Récupération panier unifiée J+1 / J+3 / J+5.
 *
 * Lit Supabase analytics_events → événements `sg_pass_cta` SANS `sg_conversion` subséquent.
 * Fenêtres (depuis le timestamp du `sg_pass_cta`) :
 *   J+1 : 24–48 h   (doux)
 *   J+3 : 72–96 h   (ferme)
 *   J+5 : 120–144 h (promo −2 €)
 *
 * Dédup : marqueur `sent_markers/cart-recovery-j{day}-sent.json` (clé = hash8 email + day).
 * Outbox : écrit JSON dans `scripts/automation/data/outbox/` AVANT envoi.
 * Email  : via lib/email-send.cjs → brandHeader + template.
 *
 * Usage :
 *   node scripts/automation/cart-recovery-unified.cjs --day=1        # dry-run (défaut)
 *   node scripts/automation/cart-recovery-unified.cjs --day=3 --hold  # écrit outbox, n'envoie pas
 *   node scripts/automation/cart-recovery-unified.cjs --day=5 --send  # envoie vraiment
 *   node scripts/automation/cart-recovery-unified.cjs --day=1 --cap=20
 *
 * Env (secrets GitHub) :
 *   SUPABASE_SERVICE_KEY  — clé `sb_secret_…` (lecture analytics_events)
 *   SMTP_PASS             — boîte alerte@ (email-send)
 *   SUPABASE_URL          — (optionnel) défaut = projet ci-dessous
 */

const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')

// ── Args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const DAY = (argv.find(a => a.startsWith('--day=')) || '--day=1').split('=')[1]
const MODE = argv.includes('--send') ? 'send' : (argv.includes('--hold') ? 'hold' : 'dry')
const CAP = parseInt((argv.find(a => a.startsWith('--cap=')) || '--cap=50').split('=')[1], 10)

if (!['1', '3', '5'].includes(DAY)) {
  console.error('❌ --day doit être 1, 3 ou 5')
  process.exit(1)
}

// ── Fenêtres (ms) ─────────────────────────────────────────────────────
const WINDOWS = {
  '1': { min: 24 * 3600 * 1000, max: 48 * 3600 * 1000, label: 'J+1' },
  '3': { min: 72 * 3600 * 1000, max: 96 * 3600 * 1000, label: 'J+3' },
  '5': { min: 120 * 3600 * 1000, max: 144 * 3600 * 1000, label: 'J+5' },
}
const WIN = WINDOWS[DAY]
const NOW = Date.now()

// ── Chemins d'état ────────────────────────────────────────────────────
const SENT_MARKER = path.join(__dirname, 'sent_markers', `cart-recovery-j${DAY}-sent.json`)
const OUTBOX_DIR = path.join(__dirname, 'data', 'outbox')

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function saveJSON(p, d) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }

// ── Hash email (RGPD) ─────────────────────────────────────────────────
const emailHash = e => createHash('sha256').update(String(e).trim().toLowerCase()).digest('hex').slice(0, 32)
const logId = e => emailHash(e).slice(0, 8)

// ── Supabase headers ──────────────────────────────────────────────────
function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

// ── Templates par jour (depuis RETENTION_ANALYSIS.md) ──────────────────
function buildEmail(day, email, ctaUrl, domain) {
  const unsubUrl = `https://${domain}/?unsub=1`
  const trackingId = `cart_recovery_j${day}:${new Date().toISOString().slice(0,10).replace(/-/g,'')}:${logId(email)}`

  if (day === '1') {
    // J+1 — doux
    const subject = `Ton pass 30j t'attend — 12,99 €`
    const preheader = `Le verdict du jour est prêt. Il suffit de terminer.`
    const html = `
${brandHeader('Le Veilleur', 'Ton pass t\'attend', 'Le verdict du matin est arrivé — il est encore temps de verrouiller la bonne plage.')}

<div style="background:#fff;padding:24px 20px">
  <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 12px">
    Le Veilleur a scruté ta plage ce matin. Le verdict est tombé — et il est bon.
  </p>
  <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 12px">
    Ce que tu as commencé à verrouiller reste prêt. Un paiement unique, sans abonnement, et tu reçois chaque matin la meilleure plage en un coup d'œil.
  </p>
  <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 18px">
    <strong>Prix : 12,99 €</strong> (MQ/GP) · 9,99 $ (USD) — même tarif qu'aujourd'hui.
  </p>
  <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 18px">
    C'est quoi, exactement ? Le verdict plage par plage, l'alerte quand ça bascule, et 7 jours de prévision.
    Mesuré au satellite, pas deviné. Et on publie nos erreurs : ~76 % de verdicts justes tous régimes confondus, dates et comparaisons à l'appui.
  </p>
  <div style="text-align:center;margin:24px 0">
    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:800">Terminer mon paiement →</a>
  </div>
  <p style="font-size:13px;color:#888;text-align:center;margin:0">Paiement unique · sans abonnement · accès immédiat</p>
</div>

<div style="background:#0D1117;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#889">
  Le Veilleur · ${domain}<br>
  <a href="${unsubUrl}" style="color:#889">Se désabonner</a>
</div>`
    return { subject, preheader, html, unsubUrl, trackingId }
  }

  if (day === '3') {
    // J+3 — ferme
    const subject = `Dernier rappel : ton pass 30j à 12,99 € expire`
    const preheader = `La bonne plage au bon moment, c'est une question de jours.`
    const html = `
${brandHeader('Le Veilleur', 'Dernier rappel', 'Ta session de paiement arrive à expiration.')}

<div style="background:#fff;padding:24px 20px">
  <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 12px">
    Tes plages changent — le Veilleur t'avait prévenu. Ta plage de prédilection passe de Propre à Modéré demain.
    Si tu avais eu le Veilleur, tu saurais déjà où replier : <strong>la crique voisine, propre et dispo</strong>.
  </p>
  <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 18px">
    C'est exactement ce que le pass débloque : le verdict du jour + l'alerte quand ça change, avant même que tu ne prépares tes affaires.
  </p>
  <div style="text-align:center;margin:24px 0">
    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:800">Activer mon pass (paiement unique)</a>
  </div>
  <p style="font-size:13px;color:#888;text-align:center;margin:0">12,99 € · 9,99 $ · sans abonnement · immédiat</p>
</div>

<div style="background:#0D1117;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#889">
  Le Veilleur · ${domain}<br>
  <a href="${unsubUrl}" style="color:#889">Se désabonner</a>
</div>`
    return { subject, preheader, html, unsubUrl, trackingId }
  }

  // J+5 — promo -2€
  const subject = `On garde ton pass 48h — 12,99 € au lieu de 14,99 €`
  const preheader = `Dernier rappel : le pass t'attend, sans coût ni engagement.`
  const html = `
${brandHeader('Le Veilleur', 'On garde ta place', 'Ta session approche de son expiration — le montant reste le même.')}

<div style="background:#fff;padding:24px 20px">
  <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 12px">
    Ta plage est propre ce matin. Le Veilleur le sait depuis cette nuit.
  </p>
  <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 18px">
    Ta session de paiement approche de son expiration. Le montant reste le même — <strong>12,99 € au lieu de 14,99 €</strong> —
    et le pass est à toi immédiatement après le paiement, sans abonnement ni engagement supplémentaire.
  </p>
  <div style="text-align:center;margin:24px 0">
    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:800">Cliquer ici pour finaliser</a>
  </div>
  <p style="font-size:13px;color:#666;text-align:center;margin:0">
    Ou continuer avec la carte gratuite pendant encore quelques jours — mais sans alertes et sans verdict du matin.
  </p>
</div>

<div style="background:#0D1117;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#889">
  — Le Veilleur · ${domain}<br>
  <a href="${unsubUrl}" style="color:#889">Se désabonner</a>
</div>`
  return { subject, preheader, html, unsubUrl, trackingId }
}

// ── Domaine par région (fallback MQ) ──────────────────────────────────
function domainFor(island) {
  const i = String(island || '').toLowerCase()
  if (i === 'gp') return 'sargasses-guadeloupe.com'
  if (i === 'fl' || i === 'florida') return 'sargassummiami.com'
  if (i === 'pc' || i === 'puntacana') return 'sargassumpuntacana.com'
  if (i === 'rm' || i === 'rivieramaya') return 'sargassumcancun.com'
  return 'sargasses-martinique.com'
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== Cart Recovery ${WIN.label} (${MODE}) ===`)

  if (!SERVICE_KEY) { console.log('[cart-recovery] SUPABASE_SERVICE_KEY manquant — skip'); return }
  const ready = MODE === 'send' && mailReady()
  if (MODE === 'send' && !ready) { console.log('[cart-recovery] SMTP_PASS manquant — skip'); return }
  if (MODE !== 'send') console.log(`Mode: ${MODE.toUpperCase()} (cap=${CAP})`)

  // 1) Charger marqueurs déjà envoyés
  const sent = loadJSON(SENT_MARKER, {})

  // 2) Requêter analytics_events : sg_pass_cta dans la fenêtre, sans sg_conversion après
  //    On récupère les événements sg_pass_cta avec leur email + timestamp + island
  const minAgo = NOW - WIN.max
  const maxAgo = NOW - WIN.min
  const minISO = new Date(minAgo).toISOString()
  const maxISO = new Date(maxAgo).toISOString()

  // On borne la requête sur created_at pour ne pas tout scanner
  // Puis on filtre côté client pour la fenêtre exacte et l'absence de conversion
  const q = `event_type=eq.sg_pass_cta&created_at=gte.${minISO}&created_at=lte.${maxISO}&select=email,island,created_at,props&order=created_at.desc&limit=500`
  let ctaEvents = []
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
      headers: svcHeaders(), signal: AbortSignal.timeout(20000)
    })
    if (!res.ok) { console.warn(`[cart-recovery] lecture HTTP ${res.status}`); return }
    ctaEvents = await res.json()
  } catch (e) { console.warn('[cart-recovery] lecture échouée:', e.message); return }

  if (!Array.isArray(ctaEvents) || !ctaEvents.length) {
    console.log('[cart-recovery] aucun sg_pass_cta dans la fenêtre')
    return
  }

  // 3) Pour chaque CTA, vérifier s'il y a un sg_conversion APRÈS ce timestamp pour le même email
  //    On peut faire une requête groupée par email pour les conversions
  const emails = [...new Set(ctaEvents.map(e => e.email).filter(Boolean))]
  let conversionsByEmail = {}
  if (emails.length) {
    // Récupérer conversions pour ces emails APRÈS le minISO de la fenêtre
    const emailFilter = emails.map(e => `"${e}"`).join(',')
    const convQ = `event_type=eq.sg_conversion&email=in.(${emailFilter})&created_at=gte.${minISO}&select=email,created_at&order=created_at.asc&limit=200`
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${convQ}`, {
        headers: svcHeaders(), signal: AbortSignal.timeout(15000)
      })
      if (res.ok) {
        const convs = await res.json()
        for (const c of convs) {
          if (!conversionsByEmail[c.email]) conversionsByEmail[c.email] = []
          conversionsByEmail[c.email].push(new Date(c.created_at).getTime())
        }
      }
    } catch (e) { console.warn('[cart-recovery] lecture conversions échouée:', e.message) }
  }

  // 4) Filtrer : dans la fenêtre exacte + pas de conversion après le CTA
  const candidates = []
  for (const ev of ctaEvents) {
    const ts = new Date(ev.created_at).getTime()
    const age = NOW - ts
    if (age < WIN.min || age > WIN.max) continue // hors fenêtre exacte
    if (!ev.email || !ev.email.includes('@')) continue

    // Vérifier conversion après CE cta précis
    const convs = conversionsByEmail[ev.email] || []
    const hasConvAfter = convs.some(c => c > ts)
    if (hasConvAfter) continue

    // Dédup marqueur
    const key = `${logId(ev.email)}:j${DAY}`
    if (sent[key]) continue

    candidates.push({ email: ev.email.toLowerCase().trim(), island: ev.island || 'mq', ts, key })
  }

  if (!candidates.length) {
    console.log('[cart-recovery] aucun candidat éligible (fenêtre + dédup + conversions)')
    return
  }

  console.log(`[cart-recovery] ${candidates.length} candidat(s) dans la fenêtre ${WIN.label}`)

  // 5) Construire emails, écrire outbox, envoyer
  let sentCount = 0
  let outboxCount = 0

  for (const c of candidates) {
    if (sentCount >= CAP) break

    const domain = domainFor(c.island)
    const ctaUrl = `https://${domain}/?paywall=1&utm_source=email&utm_medium=cart_recovery&utm_campaign=j${DAY}`
    const email = buildEmail(DAY, c.email, ctaUrl, domain)

    // Outbox entry
    const outboxEntry = {
      to: c.email,
      subject: email.subject,
      preheader: email.preheader,
      html: email.html,
      unsubUrl: email.unsubUrl,
      trackingId: email.trackingId,
      day: DAY,
      island: c.island,
      ctaTs: c.ts,
      createdAt: new Date().toISOString()
    }

    const outboxFile = path.join(OUTBOX_DIR, `cart-recovery-j${DAY}-${logId(c.email)}-${Date.now()}.json`)
    saveJSON(outboxFile, outboxEntry)
    outboxCount++

    if (MODE === 'dry') {
      console.log(`  ~ [DRY] ${logId(c.email)} ${c.island} → "${email.subject}"`)
      continue
    }

    if (MODE === 'hold') {
      console.log(`  ⏸ [HOLD] ${logId(c.email)} ${c.island} → outbox écrit`)
      continue
    }

    // MODE === 'send'
    const { data, error } = await sendEmail({
      from: `Le Veilleur <alerte@sargasses-martinique.com>`,
      to: c.email,
      subject: email.subject,
      html: email.html,
      preheader: email.preheader,
      unsubUrl: email.unsubUrl,
      trackingId: email.trackingId
    })

    if (error) {
      console.error(`  ✗ [SEND] ${logId(c.email)}: ${error.message}`)
      continue
    }

    console.log(`  ✓ [SENT] ${logId(c.email)} ${c.island} (msgId: ${data?.id?.slice(0,8)})`)
    sent[c.key] = new Date().toISOString()
    sentCount++
  }

  // 6) Sauvegarder marqueurs
  if (Object.keys(sent).length > loadJSON(SENT_MARKER, {}).length) {
    saveJSON(SENT_MARKER, sent)
    console.log(`[cart-recovery] marqueurs mis à jour (${Object.keys(sent).length} total)`)
  }

  console.log(`\nRésultat: ${outboxCount} outbox, ${sentCount} envoyé${sentCount > 1 ? 's' : ''}, ${candidates.length - sentCount} restant${candidates.length - sentCount > 1 ? 's' : ''} (cap ${CAP})`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })