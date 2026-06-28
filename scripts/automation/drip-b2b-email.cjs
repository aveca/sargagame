#!/usr/bin/env node
/**
 * Drip Email B2B — Sargasses Pro (via SMTP, boîte alerte@)
 *
 * Séquence de NURTURE B2B, totalement SÉPARÉE du drip grand public :
 *   - cible UNIQUEMENT les leads pro (source b2b_hotel_request / b2b_collectivite_request)
 *   - état dédié data/drip-b2b-sent.json (ne touche JAMAIS drip-sent.json conso)
 *   - produit AUTONOME self-serve : AUCUN appel (ni à prendre, ni à passer), aucune
 *     démo commerciale. Le CTA est toujours « voir mes plages en direct + activer le
 *     brief quotidien gratuit » ou répondre par email. Jamais « caler 15 min ».
 *
 * Cycle de vente (jours depuis le lead) :
 *   b0  — immédiat : bienvenue + ce que Pro fait + PREUVE (fiabilité publiée)
 *   b2  — valeur : l'état réel de vos plages ce matin (la lecture quotidienne)
 *   b6  — confiance + ROI : pourquoi c'est fiable, ce que ça économise
 *   b13 — closing doux : voir la prévision 7 jours en direct, sans appel
 *
 * Sécurité (mêmes garde-fous que drip-email.cjs, leçon incident 17× du 11/06) :
 *   - dedup par HASH (RGPD), flush incrémental après CHAQUE envoi
 *   - bounced filtrés, 1 seul envoi par lead par run
 *   - brief 100 % donnée réelle ; donnée absente = on n'invente pas (skip l'étape)
 *
 * Env: SMTP_PASS (absent → dry-run, rien n'est envoyé ni sauvé)
 * Usage: node scripts/automation/drip-b2b-email.cjs [--force]
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')

const API_KEY = mailReady() // envoi via SMTP (boîte alerte@) — plus de Resend
const FORCE = process.argv.includes('--force')
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const SENT_PATH = path.join(__dirname, 'data', 'drip-b2b-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const TRACK_PATH = path.join(__dirname, '../../public/api/copernicus/track-record.json')

const FROM = 'Sargasses Pro <alerte@sargasses-martinique.com>'
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const PRO_URL = 'https://sargasses-martinique.com/pro'
const REPLY_HINT = 'Répondez simplement à cet email — c\'est nous (l\'équipe Sargasses) qui le recevons.'

// Inclut les nouvelles sources d'INTENTION HAUTE de l'offre chiffrée (B2BModal 28/06 :
// b2b_brief 29€ / b2b_pro 79€ / b2b_territoire) — ces leads veulent l'essai/le produit
// payant, pas un brief gratuit perpétuel. La séquence vend l'essai 14j → abonnement.
const { payUrlFor } = require('./lib/b2b-paylinks.cjs')
const B2B_SOURCES = new Set(['b2b_hotel_request', 'b2b_collectivite_request', 'b2b_brief', 'b2b_pro', 'b2b_territoire'])

// Noms lisibles des 20 plages suivies (miroir track-record / BEACHES_META).
const BEACH_NAMES = {
  'grande-anse': "Grande Anse d'Arlet", 'anse-mitan': 'Anse Mitan', 'anse-noire': 'Anse Noire',
  'tartane': 'Tartane', 'anse-madame': 'Anse Madame', 'diamant': 'Le Diamant',
  'pt-marin': 'Pointe Marin', 'sainte-anne': 'Sainte-Anne', 'les-salines': 'Les Salines', 'vauclin': 'Le Vauclin',
  'gp-grande-anse': 'Grande Anse', 'gp-malendure': 'Malendure', 'gp-sainte-anne': 'Sainte-Anne (GP)',
  'gp-pt-chateaux': 'Pointe des Châteaux', 'gp-gosier': 'Le Gosier', 'gp-caravelle': 'La Caravelle',
  'gp-bas-du-fort': 'Bas du Fort', 'gp-deshaies': 'Deshaies', 'gp-moule': 'Le Moule', 'gp-vieux-fort': 'Vieux-Fort',
}
const STATUS_LOC = { clean: 'propre', moderate: 'modéré', avoid: 'à éviter' }

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}
function saveJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}
function hashedKeys(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    const key = k.includes('@') ? emailHash(k) : k
    out[key] = Object.assign({}, out[key], v)
  }
  return out
}
function hashedSet(arr) {
  return new Set((Array.isArray(arr) ? arr : []).map(e => String(e).includes('@') ? emailHash(e) : e))
}
function daysSince(dateStr) {
  if (!dateStr) return 999
  let d
  const fr = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/)
  d = fr ? new Date(`${fr[3]}-${fr[2]}-${fr[1]}T${fr[4] || '00:00:00'}`) : new Date(dateStr)
  if (isNaN(d)) return 999
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Preuve publiée (le moat) depuis track-record.json — jamais inventée.
function getProof() {
  const d = loadJSON(TRACK_PATH, null)
  if (!d) return null
  const calm = (d.byRegime && d.byRegime.calm) || null
  const pct = calm && calm.cleanReliabilityPct != null ? calm.cleanReliabilityPct : (d.overall && d.overall.statusHitRatePct)
  const n = calm && calm.cleanSamples ? calm.cleanSamples : (d.sampleSize || 0)
  if (pct == null) return null
  return { pct, n, from: d.window && d.window.from, to: d.window && d.window.to }
}

// Brief réel des plages de l'île du lead (best score + nb propres). Donnée
// absente → null (l'étape qui en dépend est skippée, jamais d'invention).
function getBrief(island) {
  const data = loadJSON(SARG_PATH, null)
  if (!data || !Array.isArray(data.levels) || !data.levels.length) return null
  const lv = data.levels.filter(l => island === 'GP' ? String(l.id).startsWith('gp-') : !String(l.id).startsWith('gp-'))
  if (!lv.length) return null
  const sorted = [...lv].sort((a, b) => (b.score || 0) - (a.score || 0))
  const best = sorted[0]
  return {
    bestName: BEACH_NAMES[best.id] || String(best.id).replace(/^gp-/, '').replace(/-/g, ' '),
    bestStatus: STATUS_LOC[best.status] || best.status,
    bestScore: best.score != null ? best.score : null,
    cleanCount: lv.filter(l => l.status === 'clean').length,
    totalCount: lv.length,
    updatedAt: data.updatedAt,
  }
}

function unsubUrl(email, island) { return `${WEBHOOK_URL}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}` }

function shell(inner, name, domain, email, island) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
${inner}
<div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
  Sargasses Pro · ${domain}<br>
  <a href="${unsubUrl(email, island)}" style="color:#999">Se désabonner</a>
</div>
</div></body></html>`
}
function cta(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:14px 30px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;box-shadow:0 4px 16px rgba(232,168,0,.3)">${text}</a>`
}
function proofBlock(proof) {
  if (!proof) return ''
  const win = proof.from ? ` (${proof.from} → ${proof.to})` : ''
  return `<div style="background:#0D1E1C;border-radius:12px;padding:18px;margin:18px 0;text-align:center">
    <div style="font-size:40px;font-weight:800;color:#22C55E;line-height:1">${proof.pct}%</div>
    <div style="font-size:12.5px;color:rgba(255,255,255,.7);margin-top:6px;line-height:1.5">de nos prévisions « mer propre » se sont vérifiées${win} — sur ${Number(proof.n).toLocaleString('fr-FR')} comparaisons. Palmarès daté et auditable, par plage.</div>
  </div>`
}

// ── Builders par étape (FR ; léger swap hôtel ↔ collectivité) ──
function build(step, sub, ctx) {
  const isColl = sub.source === 'b2b_collectivite_request' || sub.source === 'b2b_territoire'
  const isBrief = sub.source === 'b2b_brief' // petit pro (gîte/resto/club) → 29€
  const who = isColl ? 'votre territoire' : 'votre établissement'
  const beaches = isColl ? 'vos plages' : 'votre plage'
  // Prix par tier (grille B2BModal) : territoire 199 · brief 29 · pro/hôtel 79.
  // B2B est PASS-ONLY comme le grand public et l'offre dédiée est EN CONSTRUCTION
  // (paliers Brief/Pro/Territory non câblés — Truth Pack). On ne chiffre donc PAS
  // un abonnement mensuel ici (interdit : « abonnement », « €/mois », « 2 mois offerts »).
  // L'action B2B aujourd'hui = « parlons-en ». Variables prix neutralisées.
  const priceShort = ''
  const priceLong = ''
  const island = (sub.island || 'MQ').toUpperCase()
  const name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
  const domain = island === 'GP' ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
  // Self-serve : le deep-link ?pro=1 ouvre l'activation du brief gratuit dans
  // l'app (aucun appel). Remplace les anciennes landings /pro/* (inexistantes).
  const proPath = `https://${domain}/?pro=1`
  const { proof, brief } = ctx

  if (step === 'b0') {
    const subject = 'Le Veilleur Pro — vos plages, et notre fiabilité publiée'
    const inner = `${brandHeader('Bienvenue', 'Le Veilleur · Veille côtière', `L'état réel de ${beaches} au service de ${who}.`)}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">Merci de votre intérêt. Une plage envahie un matin, c'est un client déçu, parfois un avis amer — et vous l'apprenez souvent en même temps que lui. Le Veilleur vous fait passer de l'autre côté : celui qui connaît la fin de l'histoire avant ses clients. En clair, pour ${who} :</div>
      <ul style="font-size:14px;color:#444;line-height:1.7;padding-left:18px;margin:14px 0">
        <li>L'état réel de ${beaches} <strong>chaque matin</strong>, mesuré au satellite — pas une moyenne d'île.</li>
        <li>L'alerte <strong>avant</strong> l'échouage, pour anticiper le ramassage et prévenir vos clients.</li>
        <li>Une fiabilité que nous <strong>publions et auditons chaque jour</strong>.</li>
      </ul>
      ${proofBlock(proof)}
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:4px">La veille côtière dédiée à ${who} est <strong>en cours de construction</strong> — l'offre se précise. En attendant, voyez l'état réel de ${beaches} en direct, gratuitement, et si l'idée vous parle, on en discute.</div>
      <div style="text-align:center;margin-top:14px">${cta('Voir ' + beaches + ' en direct', proPath)}</div>
      <div style="font-size:12px;color:#888;margin-top:14px;line-height:1.5">${REPLY_HINT} Envie d'aller plus loin ? Répondez « parlons-en ».</div>
    </div>`
    return { subject, html: shell(inner, name, domain, sub.email, island) }
  }

  if (step === 'b2') {
    if (!brief) return null // valeur = donnée réelle ; absente → on attend le prochain run
    const subject = `L'état de ${beaches} ce matin`
    const sc = brief.bestScore != null ? ` — ${brief.bestScore}/100` : ''
    const inner = `${brandHeader('La lecture du jour', 'Sargasses Pro', 'Données satellite Copernicus, ce matin')}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:13px;color:#666;margin-bottom:6px">Meilleure plage suivie aujourd'hui (${name})</div>
      <div style="font-size:22px;font-weight:800;color:#0A1714">${brief.bestName}</div>
      <div style="display:inline-block;background:#FFC72C;color:#0A1714;font-weight:800;font-size:14px;padding:7px 14px;border-radius:999px;margin:10px 0">${brief.bestStatus}${sc}</div>
      <div style="font-size:13px;color:#444;line-height:1.6;margin-top:8px">${brief.cleanCount}/${brief.totalCount} plages suivies sont propres en ce moment. C'est exactement la lecture quotidienne — par plage, avec la prévision 7 jours — que recevrait votre équipe.</div>
      <div style="text-align:center;margin-top:18px">${cta('Le voir sur ' + beaches, proPath)}</div>
      <div style="font-size:12px;color:#888;margin-top:14px;line-height:1.5">${REPLY_HINT}</div>
    </div>`
    return { subject, html: shell(inner, name, domain, sub.email, island) }
  }

  if (step === 'b6') {
    const subject = 'Pourquoi nos prévisions sont fiables — et ce que ça économise'
    const roi = isColl
      ? 'Anticiper, c\'est déployer les engins au bon endroit le bon jour, et documenter l\'effort par une donnée datée — utile pour vos rapports et la transparence.'
      : 'Anticiper, c\'est éviter une journée d\'équipe sur-staffée pour rien, et surtout éviter le client déçu qui annule ou ne revient pas.'
    const inner = `${brandHeader('La preuve, pas la promesse', 'Sargasses Pro', 'Notre fiabilité, publiée et datée')}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">Les cartes gratuites donnent un risque régional, en moyenne. Nous, on lit la côte baie par baie — et surtout, on publie notre taux d'erreur, daté et par régime. C'est ça qu'un outil gratuit ne fait pas.</div>
      ${proofBlock(proof)}
      <div style="font-size:14px;color:#444;line-height:1.6">${roi}</div>
      <div style="text-align:center;margin-top:18px">${cta('Voir le palmarès complet', 'https://' + domain + '/fiabilite/')}</div>
      <div style="font-size:12px;color:#888;margin-top:14px;line-height:1.5">${REPLY_HINT}</div>
    </div>`
    return { subject, html: shell(inner, name, domain, sub.email, island) }
  }

  if (step === 'b13') {
    // B2B sous-construction : pas de checkout abonnement ici (interdit). On boucle
    // sur l'outcome et on demande l'échange humain — « parlons-en » (B2B arc).
    const subject = `Veiller ${beaches} toute la saison — on en parle ?`
    const inner = `${brandHeader('On en parle ?', 'Le Veilleur · Veille côtière', `${beaches}, veillées chaque matin`)}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">Ces derniers jours, vous avez vu ce que donne Le Veilleur sur ${beaches} — l'état réel chaque matin, l'alerte <em>avant</em> l'échouage, la prévision 7 jours, et une fiabilité publiée plutôt que promise.</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">L'outcome est simple : <strong>zéro surprise pour le client qui réserve, donc zéro déception, donc un avis serein.</strong></div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">La veille côtière dédiée aux établissements est <strong>en cours de construction</strong> ; l'offre se précise. Plutôt que de vous vendre un palier qui n'existe pas encore, je préfère vous montrer vos plages et caler ensemble ce qui aurait du sens pour ${who}.</div>
      <div style="text-align:center;margin-top:18px">${cta('Répondre : parlons-en', 'mailto:' + FROM.replace(/.*<|>.*/g, '') + '?subject=' + encodeURIComponent('Veille côtière — ' + name))}</div>
      <div style="font-size:12px;color:#888;margin-top:14px;line-height:1.5">${REPLY_HINT}</div>
    </div>`
    return { subject, html: shell(inner, name, domain, sub.email, island) }
  }
  return null
}

const STEPS = [
  { key: 'b0', days: 0 },
  { key: 'b2', days: 2 },
  { key: 'b6', days: 6 },
  { key: 'b13', days: 13 },
]

async function trackToSheet(data) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email_tracking', ...data, date: new Date().toISOString() }),
    })
  } catch {}
}

async function main() {
  console.log('=== Drip Email B2B (Sargasses Pro) ===')
  if (!API_KEY) console.log('SMTP_PASS non défini — dry-run (rien envoyé ni sauvé).')

  // Sentinelle truthy = SMTP prêt (sendEmail ignore ce 1er arg, back-compat).
  const resend = API_KEY ? {} : null
  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  const sent = hashedKeys(loadJSON(SENT_PATH, {}))
  const bounced = hashedSet(loadJSON(BOUNCED_PATH, []))

  const leads = subscribers.filter(s => s.email && B2B_SOURCES.has(s.source))
  console.log(`Leads B2B: ${leads.length} (sur ${subscribers.length} abonnés)`)
  if (!leads.length) { console.log('Aucun lead B2B.'); return }

  const proof = getProof()
  const briefCache = {}
  const briefFor = isl => (isl in briefCache) ? briefCache[isl] : (briefCache[isl] = getBrief(isl))

  let totalSent = 0, wouldSend = 0
  for (const sub of leads) {
    const key = emailHash(sub.email)
    if (bounced.has(key)) continue
    const island = (sub.island || 'MQ').toUpperCase()
    const age = daysSince(sub.date)
    const record = sent[key] || {}

    for (const step of STEPS) {
      if (record[step.key]) continue
      if (age < step.days && !FORCE) continue
      const ctx = { proof, brief: briefFor(island) }
      const built = build(step.key, sub, ctx)
      if (!built) continue // donnée requise absente → on réessaiera au prochain run

      if (!resend) {
        console.log(`  ~ ${logId(sub.email)} [${step.key}] would send: "${built.subject}"`)
        wouldSend++
        break
      }
      try {
        const { data, error } = await sendEmail(resend, {
          from: FROM, to: sub.email, subject: built.subject, html: built.html,
          unsubUrl: unsubUrl(sub.email, island),
        })
        if (error) { console.log(`  x ${logId(sub.email)} [${step.key}]: ${error.message}`) }
        else {
          console.log(`  + ${logId(sub.email)} [${step.key}] (${sub.source}, age=${age}d)`)
          record[step.key] = new Date().toISOString()
          sent[key] = record
          saveJSON(SENT_PATH, sent) // flush incrémental anti-resend (leçon 11/06)
          totalSent++
          await trackToSheet({ resend_id: data?.id || '', to: sub.email, subject: built.subject, email_type: `b2b_${step.key}`, island, status: 'sent', source: sub.source })
        }
      } catch (e) { console.log(`  x ${logId(sub.email)} [${step.key}]: ${e.message}`) }
      break // un seul envoi par lead par run
    }
    sent[key] = record
  }

  if (!API_KEY) { console.log(`\nDry-run : ${wouldSend} email(s) B2B partiraient. Rien sauvé.`); return }
  saveJSON(SENT_PATH, sent)
  console.log(`\nDrip B2B terminé : ${totalSent} email(s) envoyé(s).`)
}

main().catch(e => console.error(e))
