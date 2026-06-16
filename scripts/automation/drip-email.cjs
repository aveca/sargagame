#!/usr/bin/env node
/**
 * Drip Email Sequence — Sargasses MQ/GP (via Resend)
 *
 * Runs 4x/day in the pipeline (after welcome-email.cjs).
 * Sends timed emails based on days since subscriber signup:
 *
 *   J+3  — Pure value: "X plages propres cette semaine" (no premium push)
 *   J+7  — Intro premium: "Sache samedi des lundi" (soft CTA)
 *   J+14 — Social proof: "Ton weekend sans surprise" (strong CTA)
 *
 * Tracks sent drip steps in data/drip-sent.json to avoid duplicates.
 *
 * Env: RESEND_API_KEY (required)
 * Usage: node scripts/automation/drip-email.cjs
 *        node scripts/automation/drip-email.cjs --force  (ignore time gates)
 */
const fs = require('fs')
const path = require('path')
const { Resend } = require('resend')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader } = require('./lib/email-send.cjs')

const API_KEY = process.env.RESEND_API_KEY
const FORCE = process.argv.includes('--force')
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const DRIP_SENT_PATH = path.join(__dirname, 'data', 'drip-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

// GP uses MQ verified domain (free plan = 1 domain)
const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>'
const STRIPE_BASE = 'https://buy.stripe.com/6oU3cxgg36J48Ox6ZZ0co0s'
function stripeLink(step, base) { return `${base || STRIPE_BASE}?utm_source=email&utm_medium=drip_${step}&utm_campaign=sargasses` }
const STRIPE_LINK = STRIPE_BASE // compat
const UNSUB_BASE = WEBHOOK_URL
function unsubUrl(email, island) { return `${UNSUB_BASE}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}` }

// ── Régions du drip ──────────────────────────────────────────
// MQ/GP : FR, données partagées (préfixe 'gp-' pour GP), séquence complète.
// Nouvelles régions : EN/ES — séquence complète j3/j7/j14 (localisée 2026-06-11,
// builders *Region : no-trial, prix région, vraies plages du brief du jour).
// From : domaine Resend vérifié unique (sargasses-martinique.com), le display
// name porte la région.
const REGIONS_DIR = path.join(__dirname, '../../regions')
const COPERNICUS_DIR = path.join(__dirname, '../../public/api/copernicus')
// Mapping sargassum.json ids → beaches-list.json ids (copie de Sargasses_PROD.jsx)
const SARG_TO_BEACH = { 'grande-anse': 'mq014', 'anse-mitan': 'mq011', 'anse-noire': 'mq012', 'tartane': 'mq034', 'anse-madame': 'mq024', 'diamant': 'mq016', 'pt-marin': 'mq008', 'sainte-anne': 'mq004', 'les-salines': 'mq001', 'vauclin': 'mq044', 'gp-grande-anse': 'gp021', 'gp-malendure': 'gp031', 'gp-sainte-anne': 'gp010', 'gp-pt-chateaux': 'gp005', 'gp-gosier': 'gp012', 'gp-caravelle': 'gp009', 'gp-bas-du-fort': 'gp014', 'gp-deshaies': 'gp024', 'gp-moule': 'gp080', 'gp-vieux-fort': 'gp042' }
const REGION_META = {
  MQ: { lang: 'fr', name: 'Martinique', domain: 'sargasses-martinique.com', inRegion: 'en Martinique' },
  GP: { lang: 'fr', name: 'Guadeloupe', domain: 'sargasses-guadeloupe.com', inRegion: 'en Guadeloupe' },
  PUNTACANA: { lang: 'en', regionId: 'puntacana', place: 'Punta Cana', inRegion: 'at Punta Cana', noTrial: true },
  FLORIDA: { lang: 'en', regionId: 'florida', place: 'Miami', inRegion: 'in Miami', noTrial: true },
  RIVIERAMAYA: { lang: 'es', regionId: 'rivieramaya', place: 'Cancún', inRegion: 'en Cancún', noTrial: true },
}
// Statuts localisés cohérents avec l'app (T.fr/en/es + accord féminin ES)
const STATUS_LOC = {
  fr: { clean: 'Propre', moderate: 'Modéré', avoid: 'Alerte' },
  en: { clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid' },
  es: { clean: 'Limpia', moderate: 'Moderada', avoid: 'Alerta' },
}
const DAYS_FULL = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
}
const STATUS_RANK = { clean: 0, moderate: 1, avoid: 2 }

/**
 * Brief réel du matin pour la région du lead — calculé UNIQUEMENT depuis
 * public/api/copernicus[/<région>]/sargassum.json. Aucun chiffre inventé :
 * si la donnée est absente, le brief est null et l'étape j3 est skippée.
 */
function getRegionBrief(islandKey) {
  const meta = REGION_META[islandKey]
  if (!meta) return null
  const isNew = !!meta.regionId
  const dataPath = isNew
    ? path.join(COPERNICUS_DIR, meta.regionId, 'sargassum.json')
    : SARG_PATH
  const data = loadJSON(dataPath, null)
  if (!data || !Array.isArray(data.levels) || !data.levels.length) return null
  const regionCfg = isNew ? loadJSON(path.join(REGIONS_DIR, `${meta.regionId}.json`), {}) : null
  const lvls = data.levels.filter(l => islandKey === 'GP' ? String(l.id).startsWith('gp-')
    : islandKey === 'MQ' ? !String(l.id).startsWith('gp-') : true)
  if (!lvls.length) return null
  const beachesList = isNew ? (regionCfg.beaches || []) : loadJSON(BEACHES_PATH, [])
  const beachInfo = lv => {
    const b = isNew ? beachesList.find(x => x.id === lv.id)
      : beachesList.find(x => x.id === SARG_TO_BEACH[lv.id])
    return {
      name: (b && b.name) || String(lv.id).replace(/^gp-/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      commune: (b && b.commune) || '',
    }
  }
  const fcOf = lv => (data.weekly && data.weekly[lv.id] && data.weekly[lv.id].forecast) || []
  // Dégradations réelles J+1..J+3 : statut du jour J pire que celui d'aujourd'hui
  let degraded = []
  for (const lv of lvls) {
    const fc = fcOf(lv)
    const todayRank = STATUS_RANK[fc[0] && fc[0].status] ?? STATUS_RANK[lv.status] ?? 0
    for (let i = 1; i <= 3 && i < fc.length; i++) {
      const r = STATUS_RANK[fc[i] && fc[i].status]
      if (r != null && r > todayRank) { degraded.push({ lv, dayIdx: i, date: fc[i].date }); break }
    }
  }
  // Jour le plus fréquent parmi les premières dégradations
  let degradeDay = null
  if (degraded.length) {
    const byDate = {}
    for (const d of degraded) byDate[d.date] = (byDate[d.date] || 0) + 1
    const top = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0][0]
    degradeDay = DAYS_FULL[meta.lang][new Date(top + 'T12:00:00Z').getUTCDay()]
  }
  // Meilleure plage du jour (score réel) + statut J+1
  const sorted = [...lvls].sort((a, b) => (b.score || 0) - (a.score || 0))
  const best = sorted[0]
  const bestFc = fcOf(best)
  const bestJ1 = (bestFc[1] && bestFc[1].status) || null
  // Alternative propre du jour ET propre demain (pour la ligne "change pour…")
  const alt = sorted.find(lv => lv.id !== best.id && lv.status === 'clean'
    && (((fcOf(lv)[1] || {}).status || 'clean') === 'clean'))
  return {
    meta,
    stripeBase: isNew ? (regionCfg.paymentLinks && regionCfg.paymentLinks.monthly) || null : STRIPE_BASE,
    best: { ...beachInfo(best), score: best.score ?? null, status: best.status, j1: bestJ1 },
    degradedCount: degraded.length,
    degradeDay,
    bestDegrades: !!(best.status === 'clean' && bestJ1 && bestJ1 !== 'clean'),
    cleanCount: lvls.filter(l => l.status === 'clean').length,
    totalCount: lvls.length,
    pricing: isNew ? (regionCfg.pricing || null) : null,
    alt: alt ? beachInfo(alt).name : null,
  }
}

/**
 * Email quotidien « verdict du matin » — leads SargaCatch (source=sargacatch)
 * + leads 🔔 fiche plage (source=beach_alert, 2026-06-11). Le jeu promet « le
 * verdict arrive demain matin » et le bouton 🔔 promet « être prévenu si ça
 * change » : cet email EST les deux promesses.
 * 100 % donnée réelle (getRegionBrief) ; brief absent = pas d'envoi du jour.
 */
const DAILY_SOURCES = new Set(['sargacatch', 'beach_alert'])
function buildDaily(island, brief, email) {
  const meta = brief.meta
  const lang = meta.lang
  const name = meta.name || meta.place
  const domain = meta.domain || (loadJSON(path.join(REGIONS_DIR, `${meta.regionId}.json`), {}).domain) || ''
  const st = STATUS_LOC[lang][brief.best.status] || brief.best.status
  const score = brief.best.score != null ? ` — ${brief.best.score}/100` : ''
  const dayName = DAYS_FULL[lang][new Date().getDay()]
  const subject = lang === 'fr' ? `🌅 ${brief.best.name} : ${st.toLowerCase()} aujourd'hui${score}`
    : lang === 'es' ? `🌅 ${brief.best.name}: ${st.toLowerCase()} hoy${score}`
    : `🌅 ${brief.best.name}: ${st.toLowerCase()} today${score}`
  const holdLine = brief.best.j1
    ? (brief.best.j1 === 'clean'
      ? (lang === 'fr' ? 'Prévision : propre aussi demain ✅' : lang === 'es' ? 'Pronóstico: limpia también mañana ✅' : 'Forecast: clean tomorrow too ✅')
      : (lang === 'fr' ? `⚠️ Prévision : se dégrade demain${brief.alt ? ` — repli : ${brief.alt}` : ''}`
        : lang === 'es' ? `⚠️ Pronóstico: empeora mañana${brief.alt ? ` — alternativa: ${brief.alt}` : ''}`
        : `⚠️ Forecast: turns worse tomorrow${brief.alt ? ` — fallback: ${brief.alt}` : ''}`))
    : ''
  const title = lang === 'fr' ? `Ton verdict plage — ${dayName}` : lang === 'es' ? `Tu veredicto de playa — ${dayName}` : `Your beach verdict — ${dayName}`
  const sub2 = lang === 'fr' ? 'Satellite Copernicus, ce matin' : lang === 'es' ? 'Satélite Copernicus, esta mañana' : 'Copernicus satellite, this morning'
  const ctaTxt = lang === 'fr' ? 'Voir la carte live →' : lang === 'es' ? 'Ver el mapa en vivo →' : 'See the live map →'
  const html = `${header(title, sub2, lang)}
  <div style="background:#fff;padding:22px 24px">
    <div style="font-size:13px;color:#666;margin-bottom:6px">${lang === 'fr' ? 'La plage du jour' : lang === 'es' ? 'La playa del día' : "Today's pick"}</div>
    <div style="font-size:22px;font-weight:800;color:#0A1714">${brief.best.name}</div>
    ${brief.best.commune ? `<div style="font-size:12px;color:#888">${brief.best.commune}</div>` : ''}
    <div style="display:inline-block;background:${brief.best.status === 'clean' ? '#FFC72C' : brief.best.status === 'moderate' ? '#F59E0B' : '#E8522A'};color:#0A1714;font-weight:800;font-size:14px;padding:7px 14px;border-radius:999px;margin:10px 0">${st}${score}</div>
    ${holdLine ? `<div style="font-size:13px;color:#444;margin:6px 0 0">${holdLine}</div>` : ''}
    ${brief.degradedCount ? `<div style="font-size:12.5px;color:#666;margin-top:10px">${lang === 'fr' ? `${brief.degradedCount} plage(s) se dégradent d'ici 3 jours${brief.degradeDay ? ` (surtout ${brief.degradeDay})` : ''}.` : lang === 'es' ? `${brief.degradedCount} playa(s) empeoran en 3 días${brief.degradeDay ? ` (sobre todo el ${brief.degradeDay})` : ''}.` : `${brief.degradedCount} beach(es) turn worse within 3 days${brief.degradeDay ? ` (mostly ${brief.degradeDay})` : ''}.`}</div>` : ''}
    ${ctaButton(ctaTxt, `https://${domain}/?utm_source=email&utm_medium=daily_verdict`)}
  </div>
  ${footer(name, domain, email, island, lang)}`
  return { subject, html }
}

// Drip steps: day threshold + email builder key
const DRIP_STEPS = [
  { key: 'j3',  days: 3  },
  { key: 'j7',  days: 7  },
  { key: 'j14', days: 14 },
]

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}
function saveJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

// RGPD : l'état persisté ne contient que des hashes. Les entrées legacy
// (clés/valeurs contenant '@') sont hashées en mémoire à la lecture ;
// le fichier est réécrit hashé à la prochaine sauvegarde.
function hashedSet(arr) {
  return new Set((Array.isArray(arr) ? arr : []).map(e => String(e).includes('@') ? emailHash(e) : e))
}
function hashedKeys(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    const key = k.includes('@') ? emailHash(k) : k
    out[key] = Object.assign({}, out[key], v)
  }
  return out
}

function daysSince(dateStr) {
  if (!dateStr) return 999
  let d
  // Handle DD/MM/YYYY HH:MM:SS format (French locale from Google Sheets)
  const frMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/)
  if (frMatch) {
    const [, dd, mm, yyyy, time] = frMatch
    d = new Date(`${yyyy}-${mm}-${dd}T${time || '00:00:00'}`)
  } else {
    d = new Date(dateStr)
  }
  if (isNaN(d)) return 999
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

// Season detection (matches Sargasses_PROD.jsx logic)
const MONTH = new Date().getMonth() // 0-indexed
const IS_HIGH_SEASON = MONTH >= 3 && MONTH <= 8 // April-September

// ── Email templates ──────────────────────────────────────────

// Marque + désabonnement localisés par langue (fuite détectée 2026-06-11 :
// « SARGASSES » + « Se désabonner » partaient sur les emails EN/ES des régions).
function brandWord(lang) { return lang === 'es' ? 'Sargazo' : lang === 'en' ? 'Sargassum' : 'Sargasses' }
function header(title, subtitle, lang = 'fr') {
  return brandHeader(brandWord(lang), title, subtitle)
}

function footer(islandName, domain, email, island, lang = 'fr') {
  const unsubWord = lang === 'es' ? 'Darse de baja' : lang === 'en' ? 'Unsubscribe' : 'Se désabonner'
  return `<div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    ${brandWord(lang)} ${islandName} · ${domain}<br>
    <a href="${unsubUrl(email, island)}" style="color:#999">${unsubWord}</a>
  </div>`
}

function ctaButton(text, url, size = 'normal') {
  const pad = size === 'small' ? '10px 24px' : '14px 32px'
  const fs = size === 'small' ? '13px' : '15px'
  return `<a href="${url}" style="display:inline-block;padding:${pad};
    background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
    color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:${fs};font-weight:700;
    box-shadow:0 4px 16px rgba(232,168,0,.3)">${text}</a>`
}

// J+3 — Le brief réel du matin (exactement ce qu'un abonné a reçu), généré
// depuis le sargassum.json de la région du lead. ZERO MANUAL, zéro chiffre
// inventé. UN seul CTA vers l'essai + réassurance alignée mot pour mot sur
// le paywall.
function buildJ3(island, brief, email) {
  const { meta, best } = brief
  const lang = meta.lang
  const name = meta.name || meta.place
  const domain = meta.domain || (loadJSON(path.join(REGIONS_DIR, `${meta.regionId}.json`), {}).domain) || ''
  const sw = s => STATUS_LOC[lang][s] || s || ''
  const t = (fr, en, es) => lang === 'es' ? es : lang === 'en' ? en : fr

  // Encadré "ce que tu aurais reçu"
  const frame = t('Voici ce que tu aurais reçu ce matin.',
    "This is the brief you'd have woken up to this morning.",
    'Esto es lo que habrías recibido esta mañana.')
  // Ligne brief — statut réel du jour de la meilleure plage + statut J+1 réel
  const communePart = best.commune ? ` (${best.commune})` : ''
  const briefLine = t(
    `Ta meilleure plage aujourd'hui : <strong>${best.name}</strong>${communePart} — ${best.score ?? '—'}/100, ${sw(best.status).toLowerCase()}.${best.j1 ? ` Demain : ${sw(best.j1)}.` : ''}`,
    `Your best beach today: <strong>${best.name}</strong> — ${best.score ?? '—'}/100, ${sw(best.status).toLowerCase()}.${best.j1 ? ` Tomorrow: ${sw(best.j1)}.` : ''}`,
    `Tu mejor playa hoy: <strong>${best.name}</strong> — ${best.score ?? '—'}/100, ${sw(best.status).toLowerCase()}.${best.j1 ? ` Mañana: ${sw(best.j1)}.` : ''}`)
  // Ligne dégradation — UNIQUEMENT si la meilleure plage propre tourne demain
  // (vraie dégradation du forecast) ET qu'une alternative propre existe.
  const degradeLine = (brief.bestDegrades && brief.alt) ? `
    <div style="background:rgba(232,82,42,.06);border:1px solid rgba(232,82,42,.15);border-radius:10px;padding:12px 14px;margin-top:10px;font-size:13px;color:#C0392B;line-height:1.5">
      ${t(
        `${best.name} passe Propre → ${sw(best.j1)} demain — change pour <strong>${brief.alt}</strong>.`,
        `${best.name} goes Clean → ${sw(best.j1)} tomorrow — switch to <strong>${brief.alt}</strong>.`,
        `${best.name} pasa de Limpia a ${sw(best.j1)} mañana — mejor ve a <strong>${brief.alt}</strong>.`)}
    </div>` : ''
  // Ligne monopole — le brief au-dessus EST la donnée (la claim se prouve
  // d'elle-même). GARDE-FOU : aucun angle "institutionnels hebdo" (NOAA SIR
  // est quotidien depuis v1.5).
  const monopole = t(
    `La seule prévision 7 jours, plage par plage, ${meta.inRegion} — fiable à 3 jours, tendance jusqu'à 7.`,
    `The only beach-by-beach 7-day forecast ${meta.inRegion} — solid to day 3, trend through day 7.`,
    `El único pronóstico a 7 días, playa por playa, ${meta.inRegion} — fiable a 3 días, tendencia hasta el día 7.`)
  const ctaText = meta.noTrial
    ? t('Recevoir ce brief chaque matin',
      'Get this brief every morning',
      'Recibir este brief cada mañana')
    : t('Recevoir ce brief chaque matin — 7 jours offerts',
      'Get this brief every morning — 7 days free',
      'Recibir este brief cada mañana — 7 días gratis')
  const reassurance = meta.noTrial
    ? t('Sans engagement · Annulation en 2 clics',
      'No commitment · Cancel in 2 clicks',
      'Sin permanencia · Cancela en 2 clics')
    : t('Sans engagement · Annulation en 2 clics · Rappel avant facturation',
      "No commitment · Cancel in 2 clicks · Reminder before you're billed",
      'Sin permanencia · Cancela en 2 clics · Aviso antes del cobro')
  const dateLong = new Date().toLocaleDateString(lang === 'es' ? 'es-MX' : lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const ctaHref = brief.stripeBase ? stripeLink('j3_brief', brief.stripeBase) : `https://${domain}`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header(`${best.name} — ${best.score ?? '—'}/100`, dateLong, lang)}
  <div style="background:#fff;padding:24px 20px">
    <div style="background:rgba(255,199,44,.08);border:1px solid rgba(255,199,44,.25);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;font-weight:700;color:#B8860B">
      ${frame}
    </div>
    <div style="font-size:15px;color:#333;line-height:1.6">
      ${briefLine}
    </div>
    ${degradeLine}
    <div style="font-size:13px;color:#686868;line-height:1.5;margin-top:16px;padding-top:14px;border-top:1px solid #f0f0f0">
      ${monopole}
    </div>
    <div style="text-align:center;margin-top:20px">
      ${ctaButton(ctaText, ctaHref)}
      <div style="font-size:11px;color:#999;margin-top:8px">${reassurance}</div>
    </div>
  </div>
  ${footer(name, domain, email, island, lang)}
</div></body></html>`
}

// J+7 — Show premium experience (soft CTA, "veilleur" positioning)
function buildJ7(island, cleanCount, email) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header('Arr\u00EAte de v\u00E9rifier', `On surveille ${cleanCount} plages pour toi`)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      ${IS_HIGH_SEASON
        ? `\u00C7a fait une semaine que tu v\u00E9rifies la carte. Les sargasses bougent vite en ce moment. Et si on te pr\u00E9venait <strong>avant</strong> que tu partes\u00A0?`
        : `\u00C7a fait une semaine que tu utilises la carte. Et si tu n'avais <strong>plus besoin de l'ouvrir</strong>\u00A0?`}
    </div>

    <div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">Voil\u00E0 ce que tu recevrais</div>

    <div style="background:#0D1E1C;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.05em;margin-bottom:8px">CHAQUE MATIN \u00C0 7H</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F4F2;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#fff">Ta meilleure plage : Anse Dufour</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5)">Propre \u00B7 12 min \u00B7 mer calme</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(255,199,44,.06);border:1px solid rgba(255,199,44,.15);border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:rgba(200,160,0,.7);letter-spacing:.05em;margin-bottom:8px">ALERTE INSTANTAN\u00C9E</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F514;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">Sainte-Anne a chang\u00E9</div>
          <div style="font-size:12px;color:#666">Propre \u2192 Mod\u00E9r\u00E9 \u2014 va aux Salines</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-size:10px;font-weight:700;color:rgba(22,163,74,.7);letter-spacing:.05em;margin-bottom:8px">RECO DU JOUR</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F3D6;&#xFE0F;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">Samedi : Grande Anse</div>
          <div style="font-size:12px;color:#666">Propre tout le weekend \u00B7 id\u00E9al enfants</div>
        </div>
      </div>
    </div>

    <div style="text-align:center">
      ${ctaButton('Essayer 7 jours gratuit', stripeLink('j7'))}
      <div style="font-size:11px;color:#999;margin-top:8px">Puis 4,99\u00A0\u20AC/mois \u00B7 Annule en 1 clic</div>
    </div>
  </div>

  <div style="background:#fff;padding:16px 20px;border-top:1px solid #f0f0f0;text-align:center">
    <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">Voir la carte maintenant</a>
  </div>
  ${footer(name, domain, email, island)}
</div></body></html>`
}

// J+14 — Last chance: urgency + loss aversion + strong CTA
function buildJ14(island, cleanCount, email) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'

  // Dynamic seasonal urgency
  const now = new Date()
  const seasonStart = new Date(now.getFullYear(), 3, 20) // ~20 April
  const daysToSeason = Math.max(0, Math.ceil((seasonStart - now) / (1000 * 60 * 60 * 24)))
  const urgencyLine = daysToSeason > 0
    ? `La saison sargasses commence dans <strong>${daysToSeason} jours</strong>. Apr\u00E8s, les plages changent chaque jour.`
    : `La saison sargasses est l\u00E0. Les plages changent <strong>chaque jour</strong>.`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header('Ne d\u00E9couvre pas \u00E7a sur la plage', `${cleanCount} plages propres \u2014 pour l'instant`)}
  <div style="background:#fff;padding:24px 20px">

    <div style="background:rgba(232,82,42,.06);border:1px solid rgba(232,82,42,.15);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#C0392B;line-height:1.5">
      ${urgencyLine}
    </div>

    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      Imagine : tu arrives \u00E0 Sainte-Anne samedi avec les enfants. Sargasses partout. Weekend g\u00E2ch\u00E9.
    </div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      Avec le <strong>veilleur sargasses</strong>, tu aurais su vendredi soir. Tu aurais chang\u00E9 pour les Salines. Weekend sauv\u00E9.
    </div>

    <div style="background:#0D1E1C;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F4F2;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#fff">Vendredi 19h \u2014 push notif</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5)">\u00AB\u00A0Sainte-Anne \u2192 mod\u00E9r\u00E9. Va aux Salines (propre)\u00A0\u00BB</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x2705;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">Samedi matin \u2014 brief 7h</div>
          <div style="font-size:12px;color:#666">\u00AB\u00A0Ta meilleure plage : Les Salines \u00B7 propre \u00B7 15 min\u00A0\u00BB</div>
        </div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:16px">
      ${ctaButton('Essayer 7 jours gratuit', stripeLink('j14'))}
      <div style="font-size:11px;color:#999;margin-top:8px">Puis 4,99\u00A0\u20AC/mois \u00B7 Annule en 1 clic \u00B7 Un ti-punch co\u00FBte plus cher</div>
    </div>

    <div style="text-align:center;padding-top:12px;border-top:1px solid #f0f0f0">
      <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">Ou continue avec la carte gratuite</a>
    </div>
  </div>
  ${footer(name, domain, email, island)}
</div></body></html>`
}

// ── J+7 / J+14 nouvelles régions (EN/ES, no-trial, données réelles) ─────────
// Mêmes leviers que les versions FR (veilleur / aversion à la perte) mais :
// plages RÉELLES du brief du jour (jamais d'exemples inventés), copy no-trial
// (USD sans essai depuis 9172bbf), prix depuis regions/<id>.json, CTA vers le
// Payment Link régional. FR (EUR, A/B en cours) strictement intouché.

function buildJ7Region(island, brief, email) {
  const { meta, best } = brief
  const lang = meta.lang
  const t = (en, es) => lang === 'es' ? es : en
  const domain = (loadJSON(path.join(REGIONS_DIR, `${meta.regionId}.json`), {}).domain) || ''
  const price = (brief.pricing && brief.pricing.monthly) || '$9.99'
  const altName = brief.alt || best.name
  const sw = s => STATUS_LOC[lang][s] || s || ''

  const watchedLine = t(
    `You've been checking the map for a week. Sargassum moves fast right now. What if we warned you <strong>before</strong> you head out?`,
    `Llevas una semana revisando el mapa. El sargazo se mueve rápido ahora. ¿Y si te avisáramos <strong>antes</strong> de salir?`)

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header(t('Stop checking', 'Deja de revisar'), t(`We watch ${brief.totalCount} beaches for you`, `Vigilamos ${brief.totalCount} playas por ti`), lang)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">${watchedLine}</div>

    <div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">${t("Here's what you'd get", 'Esto es lo que recibirías')}</div>

    <div style="background:#0D1E1C;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.05em;margin-bottom:8px">${t('EVERY MORNING, 7AM', 'CADA MAÑANA, 7AM')}</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F4F2;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#fff">${t(`Your best beach: ${best.name}`, `Tu mejor playa: ${best.name}`)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5)">${sw(best.status)} · ${best.score ?? '—'}/100 ${t('· this is today’s real data', '· dato real de hoy')}</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(255,199,44,.06);border:1px solid rgba(255,199,44,.15);border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:rgba(200,160,0,.7);letter-spacing:.05em;margin-bottom:8px">${t('INSTANT ALERT', 'ALERTA INSTANTÁNEA')}</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F514;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">${t(`${best.name} just changed`, `${best.name} acaba de cambiar`)}</div>
          <div style="font-size:12px;color:#666">${t(`Clean → Moderate — go to ${altName} instead`, `Limpia → Moderada — mejor ve a ${altName}`)}</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="font-size:10px;font-weight:700;color:rgba(22,163,74,.7);letter-spacing:.05em;margin-bottom:8px">${t('DAILY PICK', 'RECO DEL DÍA')}</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F3D6;&#xFE0F;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">${t(`Saturday: ${altName}`, `Sábado: ${altName}`)}</div>
          <div style="font-size:12px;color:#666">${t('Clean all weekend · sorted by 7-day forecast', 'Limpia todo el finde · según el pronóstico 7 días')}</div>
        </div>
      </div>
    </div>

    <div style="text-align:center">
      ${ctaButton(t('Become the watcher', 'Activar el vigía'), brief.stripeBase ? stripeLink('j7', brief.stripeBase) : `https://${domain}`)}
      <div style="font-size:11px;color:#999;margin-top:8px">${price}${t('/mo · No commitment · Cancel in 2 clicks', '/mes · Sin permanencia · Cancela en 2 clics')}</div>
    </div>
  </div>

  <div style="background:#fff;padding:16px 20px;border-top:1px solid #f0f0f0;text-align:center">
    <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">${t('See the live map', 'Ver el mapa en vivo')}</a>
  </div>
  ${footer(meta.place, domain, email, island, lang)}
</div></body></html>`
}

function buildJ14Region(island, brief, email) {
  const { meta, best } = brief
  const lang = meta.lang
  const t = (en, es) => lang === 'es' ? es : en
  const domain = (loadJSON(path.join(REGIONS_DIR, `${meta.regionId}.json`), {}).domain) || ''
  const price = (brief.pricing && brief.pricing.monthly) || '$9.99'
  const altName = brief.alt || best.name
  const urgencyLine = IS_HIGH_SEASON
    ? t('Sargassum season is on. Beaches change <strong>every day</strong>.', 'La temporada de sargazo está activa. Las playas cambian <strong>cada día</strong>.')
    : t('Sargassum can land overnight. Beaches change <strong>without warning</strong>.', 'El sargazo puede llegar de un día a otro. Las playas cambian <strong>sin aviso</strong>.')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${header(t("Don't find out on the beach", 'No lo descubras en la playa'), t(`${brief.cleanCount} clean beaches — for now`, `${brief.cleanCount} playas limpias — por ahora`), lang)}
  <div style="background:#fff;padding:24px 20px">

    <div style="background:rgba(232,82,42,.06);border:1px solid rgba(232,82,42,.15);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#C0392B;line-height:1.5">
      ${urgencyLine}
    </div>

    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      ${t(`Picture it: you get to ${best.name} on Saturday, towels and kids in tow. Sargassum everywhere. Day ruined.`,
          `Imagínalo: llegas a ${best.name} el sábado con toallas y niños. Sargazo por todas partes. Día arruinado.`)}
    </div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-bottom:20px">
      ${t(`With the <strong>sargassum watcher</strong>, you'd have known Friday night — and switched to ${altName}. Day saved.`,
          `Con el <strong>vigía del sargazo</strong>, lo habrías sabido el viernes por la noche — y habrías ido a ${altName}. Día salvado.`)}
    </div>

    <div style="background:#0D1E1C;border-radius:12px;padding:16px;margin-bottom:10px">
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x1F4F2;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#fff">${t('Friday 7pm — push alert', 'Viernes 7pm — notificación')}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5)">« ${t(`${best.name} → moderate. Go to ${altName} (clean)`, `${best.name} → moderada. Ve a ${altName} (limpia)`)} »</div>
        </div>
      </div>
    </div>

    <div style="background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="display:flex;align-items:center">
        <span style="font-size:22px;margin-right:10px">&#x2705;</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:#333">${t('Saturday 7am — morning brief', 'Sábado 7am — brief matinal')}</div>
          <div style="font-size:12px;color:#666">« ${t(`Your best beach: ${altName} · clean`, `Tu mejor playa: ${altName} · limpia`)} »</div>
        </div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:16px">
      ${ctaButton(t('Get the watcher', 'Activar el vigía'), brief.stripeBase ? stripeLink('j14', brief.stripeBase) : `https://${domain}`)}
      <div style="font-size:11px;color:#999;margin-top:8px">${price}${t('/mo · cancel anytime · less than one beach chair', '/mes · cancela cuando quieras · menos que una silla de playa')}</div>
    </div>

    <div style="text-align:center;padding-top:12px;border-top:1px solid #f0f0f0">
      <a href="https://${domain}" style="color:#E89400;font-size:13px;font-weight:600;text-decoration:none">${t('Or keep using the free map', 'O sigue con el mapa gratis')}</a>
    </div>
  </div>
  ${footer(meta.place, domain, email, island, lang)}
</div></body></html>`
}

// ── Subjects ──────────────────────────────────────────────────

function getSubject(step, island, cleanCount, brief) {
  // j3 \u2014 objet du brief r\u00E9el : urgence authentique UNIQUEMENT si le forecast
  // contient de vraies d\u00E9gradations J+1..J+3 (jamais de compteur bidon),
  // sinon la reco positive du jour. Localis\u00E9 selon la r\u00E9gion du lead.
  if (step === 'j3' && brief) {
    const { meta, best } = brief
    const t = (fr, en, es) => meta.lang === 'es' ? es : meta.lang === 'en' ? en : fr
    const place = meta.place || meta.name
    if (brief.degradedCount > 0 && brief.degradeDay) {
      const n = brief.degradedCount
      return t(
        `${n} plage${n > 1 ? 's' : ''} touch\u00E9e${n > 1 ? 's' : ''} ${brief.degradeDay} ${meta.inRegion}`,
        `Sargassum reaches ${n} ${place} beach${n > 1 ? 'es' : ''} by ${brief.degradeDay}`,
        `El sargazo llega a ${n} playa${n > 1 ? 's' : ''} de ${place} el ${brief.degradeDay}`)
    }
    return t(
      `Ta plage de demain matin : ${best.name} \u2014 ${best.score ?? '\u2014'}/100`,
      `Tomorrow morning's beach: ${best.name} \u2014 ${best.score ?? '\u2014'}/100`,
      `Tu playa de ma\u00F1ana: ${best.name} \u2014 ${best.score ?? '\u2014'}/100`)
  }
  // Nouvelles r\u00E9gions : objets localis\u00E9s (le brief porte la langue + le lieu)
  const rMeta = REGION_META[island]
  if (rMeta && rMeta.regionId && brief) {
    const t = (en, es) => rMeta.lang === 'es' ? es : en
    if (step === 'j7') return IS_HIGH_SEASON
      ? t('Still checking the map every day?', '\u00BFSigues revisando el mapa cada d\u00EDa?')
      : t('What if you never had to open the map?', '\u00BFY si no tuvieras que abrir el mapa?')
    if (step === 'j14') return IS_HIGH_SEASON
      ? t(`Saturday sargassum at ${brief.best.name}. Would you have known?`, `Sargazo el s\u00E1bado en ${brief.best.name}. \u00BFLo habr\u00EDas sabido?`)
      : t("Don't find out on the beach", 'No lo descubras en la playa')
  }
  switch (step) {
    case 'j7':  return IS_HIGH_SEASON
      ? `Tu v\u00E9rifies encore la carte tous les jours\u00A0?`
      : `Et si tu n'avais plus besoin d'ouvrir la carte\u00A0?`
    case 'j14': return IS_HIGH_SEASON
      ? `Samedi, sargasses \u00E0 Sainte-Anne. Tu le savais\u00A0?`
      : `Ne d\u00E9couvre pas les sargasses sur la plage`
  }
}

// Preheader (aperçu inbox) par étape — complète l'objet sans le répéter.
function getPreheader(step, island) {
  const rMeta = REGION_META[island]
  const lang = (rMeta && rMeta.lang) || 'fr'
  const t = (fr, en, es) => lang === 'es' ? es : lang === 'en' ? en : fr
  if (step === 'j3') return t(
    'Le vrai brief satellite de ce matin — ta plage, son score, la tendance 7 jours.',
    "This morning's real satellite brief — your beach, its score, the 7-day trend.",
    'El brief satelital real de esta mañana — tu playa, su score y la tendencia a 7 días.')
  if (step === 'j7') return t(
    "Et si tu n'avais plus jamais à ouvrir la carte ? Le Veilleur s'en charge.",
    'What if you never had to open the map again? The watcher does it for you.',
    '¿Y si nunca más tuvieras que abrir el mapa? El vigía lo hace por ti.')
  if (step === 'j14') return t(
    "Le weekend gâché — ou évité d'un coup d'œil vendredi soir. À toi de voir.",
    'A ruined weekend — or one glance Friday night that saves it. Your call.',
    'Un finde arruinado — o una mirada el viernes que lo salva. Tú decides.')
  return ''
}

function getHTML(step, island, cleanCount, topBeaches, email, brief) {
  const isNewRegion = !!(REGION_META[island] && REGION_META[island].regionId)
  switch (step) {
    case 'j3':  return brief ? buildJ3(island, brief, email) : null
    case 'j7':  return isNewRegion ? (brief ? buildJ7Region(island, brief, email) : null) : buildJ7(island, cleanCount, email)
    case 'j14': return isNewRegion ? (brief ? buildJ14Region(island, brief, email) : null) : buildJ14(island, cleanCount, email)
  }
}

// ── Track to Google Sheet ────────────────────────────────────

async function trackToSheet(data) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email_tracking', ...data, date: new Date().toISOString() }),
    })
  } catch {}
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Drip Email Sequence (Resend) ===')

  if (!API_KEY) {
    console.log('RESEND_API_KEY not set — skipping sends (dry-run).')
  }

  const resend = API_KEY ? new Resend(API_KEY) : null
  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  // State files store email hashes (RGPD) — legacy plaintext entries hashed in memory
  const dripSent = hashedKeys(loadJSON(DRIP_SENT_PATH, {}))
  const beaches = loadJSON(BEACHES_PATH, [])
  const bouncedSet = hashedSet(loadJSON(BOUNCED_PATH, []))

  if (!subscribers.length) {
    console.log('No subscribers.')
    return
  }

  // Pre-compute beach data per island
  const beachData = {}
  for (const isl of ['MQ', 'GP']) {
    const islBeaches = beaches.filter(b => b.island === isl.toLowerCase())
    const clean = islBeaches.filter(b => b.status === 'clean')
    beachData[isl] = {
      cleanCount: clean.length,
      topBeaches: clean
        .sort((a, b) => (b.kids + b.parking + b.snorkel) - (a.kids + a.parking + a.snorkel))
        .slice(0, 5),
    }
  }

  let totalSent = 0
  let wouldSend = 0
  let alreadyDripped = 0
  // Brief j3 par région — calculé une fois par run depuis sargassum.json.
  const briefCache = {}
  const briefFor = isl => (isl in briefCache) ? briefCache[isl] : (briefCache[isl] = getRegionBrief(isl))
  // Throttle nouvelles régions (protège le domaine Resend, bounces à 5,8 %) :
  // max 25 envois j3 nouvelles-régions par run — le reste part aux runs suivants.
  const NEW_REGION_J3_CAP = 25
  let newRegionSent = 0

  for (const sub of subscribers) {
    const email = sub.email
    const key = emailHash(email)
    if (bouncedSet.has(key)) continue
    const island = (sub.island || 'MQ').toUpperCase()
    // Nouvelles régions (PUNTACANA/FLORIDA/RIVIERAMAYA) : séquence complète
    // j3/j7/j14 via les builders *Region (EN/ES, no-trial) depuis 2026-06-11.
    const isNewRegion = island !== 'MQ' && island !== 'GP'
    if (isNewRegion && !REGION_META[island]) continue
    const age = daysSince(sub.date)
    const record = dripSent[key] || {}
    if (Object.keys(record).length) alreadyDripped++

    for (const step of DRIP_STEPS) {
      // Skip if already sent this step or not old enough
      if (record[step.key]) continue
      if (age < step.days && !FORCE) continue
      // Brief réel requis : j3 partout, et TOUTES les étapes des nouvelles
      // régions (les builders EN/ES J7/J14 citent les vraies plages du jour).
      // Si la donnée région est absente, on skippe SANS marquer l'étape
      // (le lead la recevra au prochain run avec data).
      const needsBrief = step.key === 'j3' || isNewRegion
      const brief = needsBrief ? briefFor(island) : null
      if (needsBrief && !brief) continue
      if (isNewRegion && newRegionSent >= NEW_REGION_J3_CAP) continue

      if (!resend) {
        console.log(`  ~ ${logId(email)} [${step.key}] would send (no RESEND_API_KEY)`)
        wouldSend++
        break
      }

      const { cleanCount, topBeaches } = beachData[island] || beachData['MQ']
      // From : domaine Resend vérifié unique (MQ) — le display name porte la région.
      const from = isNewRegion
        ? `${REGION_META[island].lang === 'es' ? 'Sargazo' : 'Sargassum'} ${REGION_META[island].place} <alerte@sargasses-martinique.com>`
        : (island === 'GP' ? FROM_GP : FROM_MQ)
      const subject = getSubject(step.key, island, cleanCount, brief)
      const html = getHTML(step.key, island, cleanCount, topBeaches, email, brief)
      const preheader = getPreheader(step.key, island)
      const unsub = unsubUrl(email, island)

      try {
        const { data, error } = await sendEmail(resend, {
          from, to: email, subject, html, preheader, unsubUrl: unsub,
        })
        if (error) {
          console.log(`  x ${logId(email)} [${step.key}]: ${error.message}`)
        } else {
          console.log(`  + ${logId(email)} [${step.key}] (${island}, age=${age}d)`)
          record[step.key] = new Date().toISOString()
          dripSent[key] = record
          saveJSON(DRIP_SENT_PATH, dripSent) // flush incrémental : un crash/retry mid-run ne resend JAMAIS (root cause incident 17× du 2026-06-11)
          totalSent++
          if (isNewRegion) newRegionSent++
          await trackToSheet({
            resend_id: data?.id || '', to: email, subject,
            email_type: `drip_${step.key}`, island, status: 'sent',
            source: sub.source || '',
          })
        }
      } catch (e) {
        console.log(`  x ${logId(email)} [${step.key}]: ${e.message}`)
      }

      // Only send one drip per subscriber per run (don't blast all at once)
      break
    }

    dripSent[key] = record
  }

  // ── Verdict quotidien — leads SargaCatch (promesse du jeu : « demain matin ») ──
  // Idempotent par jour (record.daily_last), cap par run (protège le domaine
  // Resend), bounced filtrés, brief absent = skip SANS marquer (jamais inventer).
  // Fenêtre 10-20 UTC : les crons tournent à 0/6/12/18 UTC — sans gate, le run
  // de 00 UTC enverrait le « matin » à 20h la veille (MQ = UTC-4). Nominal =
  // 12 UTC (8h MQ/Miami/PC, 7h Cancún), 18 UTC = secours si le run de midi a raté.
  const utcH = new Date().getUTCHours()
  const inMorningWindow = (utcH >= 10 && utcH <= 20) || FORCE
  const todayKey = new Date().toISOString().slice(0, 10)
  const DAILY_CAP = 150
  let dailySent = 0, dailyWould = 0
  for (const sub of subscribers) {
    if (!inMorningWindow) break
    if (!DAILY_SOURCES.has(sub.source || '')) continue
    const email = sub.email
    const key = emailHash(email)
    if (bouncedSet.has(key)) continue
    const island = (sub.island || 'MQ').toUpperCase()
    if (!REGION_META[island]) continue
    const record = dripSent[key] || {}
    if (record.daily_last === todayKey) continue
    const brief = briefFor(island)
    if (!brief) continue
    // Anti-spam « même mail » (directive user 13/06 : « pas spam que les mêmes
    // mails, le contenu doit se mettre à jour avec l'état actuel avant de
    // publier »). Signature = l'état RÉEL publié (plage/statut/score/J+1/
    // dégradations). Identique ET déjà envoyé il y a <7j → on NE renvoie pas.
    // Sinon (l'état a changé, ou heartbeat 7j) → on publie l'état actuel.
    // Pas de PII (nom de plage = donnée publique).
    const dailySig = [brief.best.name, brief.best.status, brief.best.score, brief.best.j1, brief.degradedCount, brief.degradeDay].join('|')
    if (record.daily_sig === dailySig && record.daily_last) {
      const ageDays = Math.floor((new Date(todayKey) - new Date(record.daily_last)) / 864e5)
      if (ageDays < 7) continue
    }
    if (dailySent >= DAILY_CAP) break
    if (!resend) {
      // Dry-run : on rend quand même l'email (atteste que le builder marche) +
      // dump du premier HTML pour inspection visuelle.
      const p = buildDaily(island, brief, email)
      console.log(`  ~ ${logId(email)} [daily] would send: "${p.subject}"`)
      if (!dailyWould) try { fs.writeFileSync(path.join(__dirname, 'data', 'daily-preview.html'), p.html) } catch {}
      dailyWould++
      continue
    }
    const meta = REGION_META[island]
    const from = meta.regionId
      ? `${meta.lang === 'es' ? 'Sargazo' : 'Sargassum'} ${meta.place} <alerte@sargasses-martinique.com>`
      : (island === 'GP' ? FROM_GP : FROM_MQ)
    const { subject, html } = buildDaily(island, brief, email)
    const dl = meta.lang
    const dailyPre = dl === 'es'
      ? `${brief.best.name} y tus otras playas, revisadas por satélite esta mañana.`
      : dl === 'en'
        ? `${brief.best.name} and your other beaches, checked by satellite this morning.`
        : `${brief.best.name} et tes autres plages, vérifiées au satellite ce matin.`
    try {
      const { data, error } = await sendEmail(resend, {
        from, to: email, subject, html, preheader: dailyPre,
        unsubUrl: unsubUrl(email, island),
      })
      if (error) { console.log(`  x ${logId(email)} [daily]: ${error.message}`) }
      else {
        console.log(`  + ${logId(email)} [daily] (${island})`)
        record.daily_last = todayKey
        record.daily_sig = dailySig
        dripSent[key] = record
        saveJSON(DRIP_SENT_PATH, dripSent) // flush incrémental anti-resend
        dailySent++
        await trackToSheet({
          resend_id: data?.id || '', to: email, subject,
          email_type: 'daily_verdict', island, status: 'sent', source: sub.source || 'sargacatch',
        })
      }
    } catch (e) { console.log(`  x ${logId(email)} [daily]: ${e.message}`) }
  }
  if (dailySent || dailyWould) console.log(`Daily verdict: ${dailySent} sent, ${dailyWould} dry-run.`)

  if (!API_KEY) {
    console.log(`\nDry-run: ${alreadyDripped} subscriber(s) recognized as already in drip, ${wouldSend} email(s) would be sent. Nothing saved.`)
    return
  }

  saveJSON(DRIP_SENT_PATH, dripSent)
  console.log(`\nDrip complete: ${totalSent} email(s) sent.`)
}

main().catch(e => console.error(e))
