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
// payant, pas un brief gratuit perpétuel. La séquence vend l'essai 30j → abonnement.
const { payUrlFor } = require('./lib/b2b-paylinks.cjs')
const B2B_SOURCES = new Set(['b2b_hotel_request', 'b2b_collectivite_request', 'b2b_brief', 'b2b_pro', 'b2b_territoire', 'b2b_trial'])

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

// Domaine public + langue dérivés de l'island (MÊME mapping que /pro/espace/, mollie.php,
// mol_b2b_region_brand côté PHP, b2b-cold-outreach.cjs). Les steps essai t30/t33 sont
// localisés FR/EN/ES (les hôteliers florida/puntacana = EN, rivieramaya = ES) ; sans ça
// un lead USD recevait un email FR vers sargasses-martinique.com.
function regionBrand(island) {
  const i = String(island || '').toLowerCase()
  if (i === 'florida' || i === 'fl') return { domain: 'sargassummiami.com', lang: 'en', name: 'Florida' }
  if (i === 'puntacana' || i === 'pc') return { domain: 'sargassumpuntacana.com', lang: 'en', name: 'Punta Cana' }
  if (i === 'rivieramaya' || i === 'rm') return { domain: 'sargassumcancun.com', lang: 'es', name: 'Cancún' }
  if (i === 'gp') return { domain: 'sargasses-guadeloupe.com', lang: 'fr', name: 'Guadeloupe' }
  return { domain: 'sargasses-martinique.com', lang: 'fr', name: 'Martinique' }
}

// ── Builders par étape (FR ; léger swap hôtel ↔ collectivité) ──
function build(step, sub, ctx) {
  const isColl = sub.source === 'b2b_collectivite_request' || sub.source === 'b2b_territoire'
  const isBrief = sub.source === 'b2b_brief' // petit pro (gîte/resto/club) → 29€
  const who = isColl ? 'votre territoire' : 'votre établissement'
  const beaches = isColl ? 'vos plages' : 'votre plage'
  // Offre B2B ARRÊTÉE et 100 % SELF-SERVE (pricing 2026-06-29) : Pro 79 €/mois ou
  // 690 €/an (2 mois offerts), essai 30 j gratuit sans carte ; Brief
  // 29 €/mois (petit pro), Territory dès 199 €/mois. Tout s'active/se paie sur
  // /pro/espace/ (essai instantané, mensuel hébergé #215, annuel paylink). ZÉRO call :
  // jamais « parlons-en / rendez-vous ». (Ancien cadrage « en construction » = périmé.)
  const island = (sub.island || 'MQ').toUpperCase()
  const name = island === 'GP' ? 'Guadeloupe' : 'Martinique'
  const domain = island === 'GP' ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
  // Hub self-serve : /pro/espace/ (essai 30 j + abo mensuel/annuel). Aucun appel.
  const proPath = `https://${domain}/pro/espace/`
  const { proof, brief } = ctx

  if (step === 'b0') {
    const subject = 'Votre plage, surveillée. Et vos clients prévenus avant vous.'
    const inner = `${brandHeader('Bienvenue', 'Le Veilleur · Veille côtière', `L'état réel de ${beaches} au service de ${who}.`)}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">Vous avez voulu en savoir plus sur Le Veilleur. Sans détour, voici ce qu'il fait pour ${who}.</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">Il regarde la mer, jamais vos clients. Un widget à vos couleurs affiche l'état de ${beaches}. Des alertes plage par plage dès que le vent tourne. Une prévision à 7 jours, chaque matin.</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">Personne n'aime découvrir les algues une fois les valises ouvertes.</div>
      ${proofBlock(proof)}
      <div style="font-size:14px;color:#444;line-height:1.6">La preuve avant la promesse : nous publions nos erreurs, datées et par régime — 76 % à 79 % de prévisions justes selon la saison. Mesuré au satellite, pas deviné. <a href="https://${domain}/fiabilite/" style="color:#0D7C66">Voyez notre taux réel.</a></div>
      <div style="font-size:14px;color:#0D1E1C;line-height:1.6;margin-top:12px">L'essai dure <strong>30 jours, gratuit, sans carte</strong>. Ensuite 79 €/mois ou 690 €/an (2 mois offerts). Tout en libre-service.</div>
      <div style="text-align:center;margin-top:18px">${cta("Démarrer l'essai gratuit 30 jours", proPath)}</div>
      <div style="font-size:12px;color:#888;margin-top:14px;line-height:1.5">${REPLY_HINT}</div>
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
      <div style="font-size:13px;color:#444;line-height:1.6;margin-top:8px">${brief.cleanCount}/${brief.totalCount} plages suivies sont propres en ce moment. C'est exactement la lecture quotidienne — par plage, avec la prévision 7 jours — que recevrait votre équipe. Le cadeau d'abord, sans engagement.</div>
      <div style="font-size:13px;color:#666;line-height:1.55;margin-top:10px">Devenez celui qui connaît la fin de l'histoire avant ses invités. Voyez-le en direct sur ${beaches} : essai 30 jours, sans carte.</div>
      <div style="text-align:center;margin-top:18px">${cta('Voir mes plages en direct — essai 30 jours', proPath)}</div>
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
      <div style="font-size:14px;color:#444;line-height:1.6">${roi} Le palmarès complet, daté, est sur <a href="https://${domain}/fiabilite/" style="color:#0D7C66">/fiabilite/</a>.</div>
      <div style="font-size:14px;color:#0D1E1C;line-height:1.6;margin-top:12px">Essai 30 jours, sans carte. Ensuite 79 €/mois ou 690 €/an (2 mois offerts)${isBrief ? ' · Brief à 29 €/mois pour les plus petits' : ''}. Zéro appel, tout en libre-service.</div>
      <div style="text-align:center;margin-top:18px">${cta('Activer mon essai 30 jours', proPath)}</div>
      <div style="font-size:12px;color:#888;margin-top:14px;line-height:1.5">${REPLY_HINT}</div>
    </div>`
    return { subject, html: shell(inner, name, domain, sub.email, island) }
  }

  if (step === 'b13') {
    // Closing self-serve (offre arrêtée + payable en ligne) : statut + saison qui ne
    // s'arrête pas + UN CTA self-serve (essai/verrouiller l'année). ZÉRO « parlons-en ».
    const subject = `La mer ne s'arrête pas le 1er septembre`
    const inner = `${brandHeader('Toute la saison', 'Le Veilleur · Veille côtière', `${beaches}, veillées chaque matin`)}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">La haute saison passe. Les algues, non. Septembre, octobre : c'est souvent là que ça frappe, quand plus personne ne regarde.</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">Vous, vous pouvez regarder déjà : verdict plage par plage, chaque matin, mesuré au satellite. Et nos erreurs restent publiques — 76 % à 79 % de prévisions justes selon la saison, sur <a href="https://${domain}/fiabilite/" style="color:#0D7C66">/fiabilite/</a>.</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">Restez celui qui connaît la fin de l'histoire avant ses invités, toute la saison.</div>
      <div style="font-size:14px;color:#0D1E1C;line-height:1.6;margin-top:12px">L'essai 30 jours est sans carte et garanti 30 jours. Pour verrouiller l'année : 690 € (2 mois offerts) — sinon 79 €/mois, en un clic.</div>
      <div style="text-align:center;margin-top:18px">${cta("Démarrer l'essai (30 j, sans carte)", proPath)}</div>
      <div style="font-size:12px;color:#888;margin-top:14px;line-height:1.5">${REPLY_HINT}</div>
    </div>`
    return { subject, html: shell(inner, name, domain, sub.email, island) }
  }
  if (step === 't27') {
    // Relance conversion essai → payant (J+27, avant l'expiration J+30). L'offre B2B
    // est ARRÊTÉE et SELF-SERVE (pricing 2026-06-29) : annuel 690 € payable direct via
    // le paylink Mollie, mensuel 79 €/mois depuis l'espace (checkout hébergé #215).
    // Pivot émotionnel = perte de continuité (widget + alertes s'éteignent à la fin).
    const payUrl = payUrlFor('pro') || `https://${domain}/pro/espace/`
    const espace = `https://${domain}/pro/espace/`
    const subject = `Dans 3 jours, votre veille s'éteint`
    const inner = `${brandHeader('Votre essai se termine', 'Le Veilleur · Veille côtière', `${beaches}, veillées chaque matin`)}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">Depuis ~18 jours, votre widget regarde la mer pour vous : sur votre site, plage par plage, le verdict du jour s'affiche tout seul et vos alertes partent dès que la mer bascule. Vous êtes devenu celui qui connaît la fin de l'histoire avant ses invités.</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">Personne, dans un hôtel, n'aime découvrir les algues une fois la serviette posée.</div>
      <div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:12px">Ce verdict n'a rien inventé : il vient du satellite, et on publie notre fiabilité auditée par régime (≈ 76 % à 79 % selon la saison) sur <a href="https://${domain}/fiabilite/" style="color:#0D7C66">/fiabilite/</a>. L'argent ne touche jamais ce chiffre.</div>
      <div style="font-size:15px;color:#0D1E1C;line-height:1.6;margin-top:14px"><strong>Dans ~3 jours, l'essai se termine : le widget et les alertes s'éteignent.</strong> Gardez la veille allumée, sans interruption.</div>
      <div style="text-align:center;margin-top:18px">${cta('Verrouiller l\'année — 690 €', payUrl)}</div>
      <div style="font-size:13px;color:#666;margin-top:12px;text-align:center;line-height:1.55">2 mois offerts vs 79 €/mois. Vous préférez rester souple ? <a href="${espace}" style="color:#0D7C66">Passez en mensuel à 79 €/mois</a> depuis votre espace — résiliable à tout moment.</div>
    </div>`
    return { subject, html: shell(inner, name, domain, sub.email, island) }
  }

  // ── Essai : J+30 (jour d'expiration) et J+33 (J+2 après, dernière chance) ──
  // Réutilise la mécanique de t27 : mêmes CTA (paylink annuel + /pro/espace/ mensuel),
  // même idempotence drip-b2b-sent.json. Localisé FR/EN/ES selon l'island (USD inclus).
  // Copy POSITIVE (mener par le statut/gain) + fiabilité hedgée vers la page honnêteté.
  if (step === 't30' || step === 't33') {
    const rb = regionBrand(sub.island)
    const dom = rb.domain
    const lang = rb.lang
    const payUrl = payUrlFor('pro') || `https://${dom}/pro/espace/`
    const espace = `https://${dom}/pro/espace/`
    // Page honnêteté localisée + bande hedgée (jamais un « 100 % » nu).
    const relPath = lang === 'en' ? '/reliability/' : lang === 'es' ? '/fiabilidad/' : '/fiabilite/'
    const relUrl = `https://${dom}${relPath}`
    const relBand = lang === 'en'
      ? `measured by satellite, audited by regime (≈ 76% to 79% depending on the season; rare calm-season alerts flagged low-confidence) on <a href="${relUrl}" style="color:#0D7C66">${relPath}</a>`
      : lang === 'es'
      ? `medido por satélite, auditado por régimen (≈ 76 % a 79 % según la temporada; las raras alertas de temporada calmada en baja confianza) en <a href="${relUrl}" style="color:#0D7C66">${relPath}</a>`
      : `mesuré au satellite, audité par régime (≈ 76 % à 79 % selon la saison ; les rares alertes de saison calme en faible confiance) sur <a href="${relUrl}" style="color:#0D7C66">${relPath}</a>`
    // « vos plages » localisé pour le sous-titre d'en-tête (beaches est FR par défaut).
    const beachesLoc = lang === 'en' ? (isColl ? 'your beaches' : 'your beach')
      : lang === 'es' ? (isColl ? 'sus playas' : 'su playa') : beaches
    const watched = lang === 'en' ? 'watched every morning' : lang === 'es' ? 'vigiladas cada mañana' : 'veillées chaque matin'

    if (step === 't30') {
      // Jour d'expiration : positif — « gardez la veille allumée », pas la peur.
      const T = lang === 'en' ? {
        sub: `Today, keep your watch on`,
        hdr1: 'Your trial ends today', hdr2: 'Le Veilleur · Coastal watch',
        l1: `For ~30 days, your widget has watched the sea for you — beach by beach, the day's verdict on your site, alerts the moment the sea turns. You became the one who knows how the story ends before your guests do.`,
        l2: `Nothing here was invented: ${relBand}. Money never touches that figure.`,
        l3: `<strong>Today the trial closes.</strong> Keep the watch on, without a gap — stay the one who knows first.`,
        cta: 'Lock in the year — €690',
        alt: `2 months free vs €79/mo. Prefer to stay flexible? <a href="${espace}" style="color:#0D7C66">Switch to €79/mo monthly</a> from your dashboard — cancel anytime.`,
      } : lang === 'es' ? {
        sub: `Hoy, mantenga su vigilancia encendida`,
        hdr1: 'Su prueba termina hoy', hdr2: 'Le Veilleur · Vigilancia costera',
        l1: `Durante ~30 días, su widget vigiló el mar por usted — playa por playa, el veredicto del día en su sitio, alertas en cuanto el mar cambia. Se convirtió en quien conoce el final de la historia antes que sus huéspedes.`,
        l2: `Nada se inventó aquí: ${relBand}. El dinero nunca toca esa cifra.`,
        l3: `<strong>Hoy la prueba se cierra.</strong> Mantenga la vigilancia encendida, sin interrupción — siga siendo quien lo sabe primero.`,
        cta: 'Asegurar el año — 690 €',
        alt: `2 meses gratis vs 79 €/mes. ¿Prefiere flexibilidad? <a href="${espace}" style="color:#0D7C66">Pase a 79 €/mes mensual</a> desde su espacio — cancele cuando quiera.`,
      } : {
        sub: `Aujourd'hui, gardez votre veille allumée`,
        hdr1: 'Votre essai se termine aujourd\'hui', hdr2: 'Le Veilleur · Veille côtière',
        l1: `Depuis ~30 jours, votre widget regarde la mer pour vous — plage par plage, le verdict du jour sur votre site, l'alerte dès que la mer bascule. Vous êtes devenu celui qui connaît la fin de l'histoire avant ses invités.`,
        l2: `Rien ici n'a été inventé : ${relBand}. L'argent ne touche jamais ce chiffre.`,
        l3: `<strong>Aujourd'hui, l'essai se ferme.</strong> Gardez la veille allumée, sans interruption — restez celui qui sait le premier.`,
        cta: 'Verrouiller l\'année — 690 €',
        alt: `2 mois offerts vs 79 €/mois. Vous préférez rester souple ? <a href="${espace}" style="color:#0D7C66">Passez en mensuel à 79 €/mois</a> depuis votre espace — résiliable à tout moment.`,
      }
      const inner = `${brandHeader(T.hdr1, T.hdr2, `${beachesLoc}, ${watched}`)}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">${T.l1}</div>
      <div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:12px">${T.l2}</div>
      <div style="font-size:15px;color:#0D1E1C;line-height:1.6;margin-top:14px">${T.l3}</div>
      <div style="text-align:center;margin-top:18px">${cta(T.cta, payUrl)}</div>
      <div style="font-size:13px;color:#666;margin-top:12px;text-align:center;line-height:1.55">${T.alt}</div>
    </div>`
      return { subject: T.sub, html: shell(inner, rb.name, dom, sub.email, island) }
    }

    // step === 't33' : J+2 après expiration — réactivation, dernière relance positive.
    const T = lang === 'en' ? {
      sub: `Your watch is one click from coming back`,
      hdr1: 'Reactivate your watch', hdr2: 'Le Veilleur · Coastal watch',
      l1: `Your trial closed two days ago — the widget and the per-beach alerts went quiet. The sea didn't: it's exactly off-season, late summer, when an episode lands while no one's watching.`,
      l2: `You don't have to start over: one click brings your watch back, beach by beach, with the 7-day forecast — ${relBand}.`,
      l3: `Be again the one who knows how the story ends before your guests.`,
      cta: 'Turn my watch back on — €690/yr',
      alt: `Rather stay flexible? <a href="${espace}" style="color:#0D7C66">Reactivate at €79/mo monthly</a> — cancel anytime, fully self-serve.`,
    } : lang === 'es' ? {
      sub: `Su vigilancia vuelve con un clic`,
      hdr1: 'Reactive su vigilancia', hdr2: 'Le Veilleur · Vigilancia costera',
      l1: `Su prueba se cerró hace dos días — el widget y las alertas por playa se apagaron. El mar no: es justo temporada baja, fin de verano, cuando un episodio llega sin que nadie mire.`,
      l2: `No tiene que empezar de cero: un clic devuelve su vigilancia, playa por playa, con el pronóstico a 7 días — ${relBand}.`,
      l3: `Vuelva a ser quien conoce el final de la historia antes que sus huéspedes.`,
      cta: 'Reactivar mi vigilancia — 690 €/año',
      alt: `¿Prefiere flexibilidad? <a href="${espace}" style="color:#0D7C66">Reactive a 79 €/mes mensual</a> — cancele cuando quiera, todo en autoservicio.`,
    } : {
      sub: `Votre veille revient en un clic`,
      hdr1: 'Réactivez votre veille', hdr2: 'Le Veilleur · Veille côtière',
      l1: `Votre essai s'est fermé il y a deux jours — le widget et les alertes par plage se sont tus. La mer, non : c'est justement l'arrière-saison, fin d'été, quand un épisode frappe alors que plus personne ne regarde.`,
      l2: `Pas besoin de tout recommencer : un clic rallume votre veille, plage par plage, avec la prévision 7 jours — ${relBand}.`,
      l3: `Redevenez celui qui connaît la fin de l'histoire avant ses invités.`,
      cta: 'Rallumer ma veille — 690 €/an',
      alt: `Vous préférez rester souple ? <a href="${espace}" style="color:#0D7C66">Réactivez en mensuel à 79 €/mois</a> — résiliable à tout moment, 100 % en libre-service.`,
    }
    const inner = `${brandHeader(T.hdr1, T.hdr2, `${beachesLoc}, ${watched}`)}
    <div style="background:#fff;padding:24px 20px">
      <div style="font-size:15px;color:#333;line-height:1.6">${T.l1}</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:12px">${T.l2}</div>
      <div style="font-size:15px;color:#0D1E1C;line-height:1.6;margin-top:14px">${T.l3}</div>
      <div style="text-align:center;margin-top:18px">${cta(T.cta, payUrl)}</div>
      <div style="font-size:13px;color:#666;margin-top:12px;text-align:center;line-height:1.55">${T.alt}</div>
    </div>`
    return { subject: T.sub, html: shell(inner, rb.name, dom, sub.email, island) }
  }
  return null
}

const STEPS = [
  { key: 'b0', days: 0 },
  { key: 'b2', days: 2 },
  { key: 'b6', days: 6 },
  { key: 'b13', days: 13 },
  // Essai (source b2b_trial). Séquence de conversion autour de l'expiration J+30 :
  //   t27 = relance avant expiration · t30 = jour d'expiration (« gardez la veille
  //   allumée ») · t33 = J+2 après (réactivation/dernière chance). Sans t30/t33,
  //   l'essai mourait en silence à J+30. Tous localisés FR/EN/ES (regionBrand).
  { key: 't27', days: 27, trial: true },
  { key: 't30', days: 30, trial: true },
  { key: 't33', days: 33, trial: true },
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
    // Les leads b2b_trial (essai 30 j déjà ACTIVÉ via b2b-trial.php) ne reçoivent PAS
    // la séquence de nurture froide (b0-b13) : ils ont le produit en main. Ils ne
    // reçoivent QUE l'étape d'essai (t18 = relance conversion avant l'expiration).
    const isTrial = sub.source === 'b2b_trial'

    for (const step of STEPS) {
      if (!!step.trial !== isTrial) continue // étapes essai ↔ leads essai uniquement
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
