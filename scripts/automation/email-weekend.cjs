#!/usr/bin/env node
/**
 * Weekend Email Bulletin — Sargasses MQ/GP
 *
 * Sends a formatted HTML email every Friday to all captured emails
 * via SMTP from the real alerte@sargasses-martinique.com mailbox (cPanel) —
 * NO MORE Apps Script/MailApp (which could only send from the owner's Gmail).
 *
 * Setup:
 * 1. Subscriber list comes from data/subscribers.json (fetch-subscribers.cjs)
 * 2. SMTP creds via env: SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
 *
 * Usage:
 *   node scripts/automation/email-weekend.cjs
 *   node scripts/automation/email-weekend.cjs --force  (ignore day check)
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const nodemailer = require('nodemailer')
const { injectPreheader, applyBrand, htmlToText } = require('./lib/email-send.cjs')
const { emailHash, logId } = require('./lib/email-hash.cjs')

// SMTP — boîte alerte@ (cPanel). Envoi depuis le VRAI alerte@sargasses-martinique.com
// (plus de MailApp/gmail). Lit process.env (CI) OU le .env local (comme welcome-paid.cjs).
function envVal(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const m = t.match(new RegExp('^' + name + '=([^\\r\\n]+)', 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}
const SMTP_HOST = envVal('SMTP_HOST'), SMTP_PORT = +envVal('SMTP_PORT') || 465
const SMTP_USER = envVal('SMTP_USER'), SMTP_PASS = envVal('SMTP_PASS')
// Leads PRO exclus du bulletin grand public (drip B2B dédié — jamais l'offre Pass conso).
const B2B_SOURCES = new Set(['b2b_hotel_request', 'b2b_collectivite_request'])
// Liste d'abonnés fetchée au runtime par fetch-subscribers.cjs (RGPD : gitignored,
// déjà filtrée des désabonnés + bounces + dédupliquée).
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const sleep = ms => new Promise(r => setTimeout(r, ms))
function loadSubscribers() {
  try { return JSON.parse(fs.readFileSync(SUBSCRIBERS_PATH, 'utf-8')) } catch { return [] }
}

const FORCE = process.argv.includes('--force')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const SENT_PATH = path.join(__dirname, 'data/weekend-sent.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
function unsubUrl(island) { return `${WEBHOOK_URL}?action=unsubscribe&email={{EMAIL}}&island=${island.toUpperCase()}` }

const SARG_TO_BEACH = {
  "grande-anse":"mq014","anse-mitan":"mq011","anse-noire":"mq012","tartane":"mq034",
  "anse-madame":"mq024","diamant":"mq016","pt-marin":"mq008","sainte-anne":"mq004",
  "les-salines":"mq001","vauclin":"mq044",
  "gp-grande-anse":"gp021","gp-malendure":"gp031","gp-sainte-anne":"gp010",
  "gp-pt-chateaux":"gp005","gp-gosier":"gp012","gp-caravelle":"gp009",
  "gp-bas-du-fort":"gp014","gp-deshaies":"gp024","gp-moule":"gp080","gp-vieux-fort":"gp042"
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data)
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      // Apps Script always returns 302 — that means doPost executed successfully
      // The redirect goes to googleusercontent.com which returns the JSON response
      // We treat 302 as success (doPost ran, emails dispatched server-side)
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    req.write(payload); req.end()
  })
}

function buildEmailHTML(island, topBeaches, stats, domain) {
  const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
  const beachRows = topBeaches.map(b => {
    const hasScore = typeof b.unifiedScore === 'number'
    const color = b.unifiedColor || (b.status === 'clean' ? '#16A34A' : '#B87A00')
    const label = b.unifiedLabel || (b.status === 'clean' ? 'Propre' : 'Mod\u00E9r\u00E9')
    const reasonLine = hasScore && b.unifiedReason
      ? `<div style="font-size:11px;color:#888;margin-top:3px;font-style:italic">${b.unifiedReason}</div>`
      : ''
    const badgeInner = hasScore
      ? `<div style="font-size:16px;font-weight:800;color:${color};line-height:1">${b.unifiedScore}<span style="font-size:10px;font-weight:600;opacity:.7">/100</span></div>
         <div style="font-size:9px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${label}</div>`
      : `<span style="display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${color}1a;color:${color}">${label}</span>`
    // Capture ground-truth : « j'y suis → confirme l'état » → page /confirme/ (POST
    // au clic seulement). Transforme le bulletin en capteur terrain (le moat #2).
    const confirmLink = b.id
      ? `<a href="https://${domain}/confirme/?b=${encodeURIComponent(b.id)}&r=${island}&n=${encodeURIComponent(b.name)}&lang=fr" style="display:inline-block;margin-top:7px;font-size:11px;font-weight:700;color:#0E7C66;text-decoration:none">📍 J'y suis — confirme l'état</a>`
      : ''
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;vertical-align:top">
        <div style="font-size:15px;font-weight:700;color:#0D0D0D">${b.name}</div>
        <div style="font-size:12px;color:#686868;margin-top:2px">${b.commune} · ${b.drive} min</div>
        ${reasonLine}
        ${confirmLink}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle">
        ${badgeInner}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Le Bulletin du Veilleur</title>
</head>
<body style="margin:0; padding:0; background-color:#F7F5EF; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F7F5EF;">Ton verdict plages pour samedi ${islandName} : ${stats.clean} propres, ${stats.moderate} a surveiller. Ne decouvre pas les sargasses sur place.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F7F5EF;">
<tr>
<td align="center" style="padding:16px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">

<!-- ============ HEADER ============ -->
<tr>
<td style="background-color:#0B2230; background-image:linear-gradient(135deg,#0B2230 0%,#0D1E1C 55%,#0A1714 100%); border-radius:18px 18px 0 0; padding:34px 32px 30px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:3px; color:#FFC72C; text-transform:uppercase;">Le bulletin du Veilleur</td>
</tr>
<tr>
<td style="padding-top:10px; font-family:'Anton','Bricolage Grotesque','Helvetica Neue',Arial,sans-serif; font-size:42px; line-height:1.04; font-weight:800; color:#FFFFFF; letter-spacing:-0.5px;">Plages ${islandName}</td>
</tr>
<tr>
<td style="padding-top:12px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:16px; line-height:1.5; color:#C9D6D2;">Le Veilleur a scruté l'Atlantique toute la semaine. Voici où poser ta serviette ce weekend.</td>
</tr>
</table>
</td>
</tr>

<!-- ============ LE MOT DU VEILLEUR (editorial voice) ============ -->
<tr>
<td style="background-color:#FFFFFF; padding:22px 28px 6px 28px; border-left:1px solid #ECE8DE; border-right:1px solid #ECE8DE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FBF9F3; border-left:4px solid #FFC72C; border-radius:4px 12px 12px 4px;">
<tr>
<td style="padding:16px 20px 16px 18px;">
<div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:2px; color:#B87A00; text-transform:uppercase;">Le mot du Veilleur</div>
<div style="padding-top:8px; font-family:Georgia,'Times New Roman',serif; font-style:italic; font-size:16px; line-height:1.55; color:#3A4A46;">Je scrute l'Atlantique pour toi toute la semaine, mais ce bulletin n'est qu'un coup d'&oelig;il hebdo. Voici ton verdict pour samedi &mdash; pose ta serviette l&agrave; o&ugrave; c'est d&eacute;gag&eacute;.</div>
</td>
</tr>
</table>
</td>
</tr>

<!-- ============ STATS ROW ============ -->
<tr>
<td style="background-color:#FFFFFF; padding:16px 18px 8px 18px; border-left:1px solid #ECE8DE; border-right:1px solid #ECE8DE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td width="33.33%" align="center" valign="top" style="padding:0 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F0FAF2; border:1px solid #C9EBD2; border-radius:14px;">
<tr><td align="center" style="padding:16px 6px 14px 6px;">
<div style="font-family:'Anton','Helvetica Neue',Arial,sans-serif; font-size:34px; line-height:1; font-weight:800; color:#16A34A;">${stats.clean}</div>
<div style="padding-top:6px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:0.5px; color:#16A34A; text-transform:uppercase;">propres</div>
</td></tr>
</table>
</td>
<td width="33.33%" align="center" valign="top" style="padding:0 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF8EC; border:1px solid #F2E2BE; border-radius:14px;">
<tr><td align="center" style="padding:16px 6px 14px 6px;">
<div style="font-family:'Anton','Helvetica Neue',Arial,sans-serif; font-size:34px; line-height:1; font-weight:800; color:#B87A00;">${stats.moderate}</div>
<div style="padding-top:6px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:0.5px; color:#B87A00; text-transform:uppercase;">à surveiller</div>
</td></tr>
</table>
</td>
<td width="33.33%" align="center" valign="top" style="padding:0 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FDEFEA; border:1px solid #F6D2C5; border-radius:14px;">
<tr><td align="center" style="padding:16px 6px 14px 6px;">
<div style="font-family:'Anton','Helvetica Neue',Arial,sans-serif; font-size:34px; line-height:1; font-weight:800; color:#E8522A;">${stats.avoid}</div>
<div style="padding-top:6px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:0.5px; color:#E8522A; text-transform:uppercase;">alertes</div>
</td></tr>
</table>
</td>
</tr>
</table>
</td>
</tr>

<!-- ============ TOP 5 LIST ============ -->
<tr>
<td style="background-color:#FFFFFF; padding:20px 28px 8px 28px; border-left:1px solid #ECE8DE; border-right:1px solid #ECE8DE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:'Anton','Bricolage Grotesque','Helvetica Neue',Arial,sans-serif; font-size:22px; line-height:1.2; font-weight:800; color:#0D1E1C; letter-spacing:-0.3px;">Top 5 pour samedi</td>
</tr>
<tr>
<td style="padding-top:4px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:1.5; color:#5A6B66;">Classées par score sur 100. Plus le score est haut, plus la plage est dégagée.</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="background-color:#FFFFFF; padding:8px 28px 22px 28px; border-left:1px solid #ECE8DE; border-right:1px solid #ECE8DE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${beachRows}</table>
</td>
</tr>

<!-- ============ PREMIUM UPSELL (climax) ============ -->
<tr>
<td style="background-color:#FFFFFF; padding:6px 28px 26px 28px; border-left:1px solid #ECE8DE; border-right:1px solid #ECE8DE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0B2230; background-image:linear-gradient(150deg,#0B2230 0%,#0D1E1C 60%,#0A1714 100%); border-radius:18px; border:1px solid #16302E;">
<tr>
<td style="padding:30px 28px 8px 28px;">
<div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:3px; color:#FFC72C; text-transform:uppercase;">Le Pass Veilleur</div>
</td>
</tr>
<tr>
<td style="padding:8px 28px 0 28px;">
<div style="font-family:'Anton','Bricolage Grotesque','Helvetica Neue',Arial,sans-serif; font-size:30px; line-height:1.12; font-weight:800; color:#FFFFFF; letter-spacing:-0.4px;">Sache dès lundi où aller samedi.</div>
</td>
</tr>
<tr>
<td style="padding:14px 28px 0 28px;">
<div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.6; color:#C9D6D2;">Ce bulletin t'offre le verdict du weekend. Le Pass, c'est moi qui veille chaque matin pour toi : les 7 prochains jours, plage par plage, plus une alerte sur ton téléphone dès qu'une plage propre se charge. <strong style="color:#FFFFFF;">Ne découvre plus les sargasses sur place</strong> &mdash; tu pars en sachant.</div>
</td>
</tr>
<tr>
<td style="padding:18px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td valign="top" width="26" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.5; color:#FFC72C;">&#10003;</td>
<td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.5; color:#E4EEEB; padding-bottom:8px;">Prévision 7 jours, mise à jour 4×/jour</td>
</tr>
<tr>
<td valign="top" width="26" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.5; color:#FFC72C;">&#10003;</td>
<td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.5; color:#E4EEEB; padding-bottom:8px;">Alertes push : la plage sans sargasses, chaque matin</td>
</tr>
<tr>
<td valign="top" width="26" style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.5; color:#FFC72C;">&#10003;</td>
<td style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.5; color:#E4EEEB;">Toutes les plages de l'île, pas seulement le Top 5</td>
</tr>
</table>
</td>
</tr>
<!-- bulletproof gold CTA -->
<tr>
<td style="padding:24px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#FFC72C" style="border-radius:12px; background-image:linear-gradient(180deg,#FFC72C 0%,#E8A800 100%);">
<a href="https://${domain}/?paywall=1&utm_source=email&utm_medium=weekend_bulletin&utm_campaign=sargasses" target="_blank" style="display:block; padding:17px 24px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:17px; font-weight:800; letter-spacing:0.2px; color:#0B2230; text-decoration:none;">Activer mon Pass Veilleur &#8594;</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:14px 28px 30px 28px;">
<div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:13px; line-height:1.5; color:#9FB2AD;">Dès 7,99 € · paiement unique, sans abonnement · remboursé en un email</div>
</td>
</tr>
</table>
</td>
</tr>

<!-- ============ SECONDARY CTA ============ -->
<tr>
<td style="background-color:#FFFFFF; padding:4px 28px 30px 28px; border-left:1px solid #ECE8DE; border-right:1px solid #ECE8DE; border-radius:0 0 18px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F7F5EF; border:1px solid #ECE8DE; border-radius:16px;">
<tr>
<td align="center" style="padding:24px 24px 10px 24px;">
<div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.5; color:#0D1E1C; font-weight:600;">Tu veux juste vérifier l'état d'une plage maintenant ?</div>
</td>
</tr>
<tr>
<td align="center" style="padding:6px 24px 4px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#FFC72C" style="border-radius:12px; background-image:linear-gradient(180deg,#FFC72C 0%,#E8A800 100%);">
<a href="https://${domain}" target="_blank" style="display:block; padding:15px 30px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:800; color:#0B2230; text-decoration:none;">Voir la carte en temps réel</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:12px 24px 22px 24px;">
<div style="font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; line-height:1.5; color:#7A8A85;">Prévision satellite pour samedi · Mise à jour 4×/jour</div>
</td>
</tr>
</table>
</td>
</tr>

<!-- ============ FOOTER ============ -->
<tr>
<td align="center" style="padding:26px 28px 36px 28px;">
<div style="font-family:'Anton','Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:800; letter-spacing:1px; color:#0D1E1C; text-transform:uppercase;">Le Veilleur</div>
<div style="padding-top:8px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; line-height:1.6; color:#9AA8A3;">Ta vigie sargasses pour ${islandName}.<br>&copy; ${new Date().getFullYear()} Le Veilleur · Tous droits réservés</div>
<div style="padding-top:12px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; line-height:1.6; color:#9AA8A3;"><a href="${unsubUrl(island)}" target="_blank" style="color:#7A8A85; text-decoration:underline;">Me désabonner</a></div>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`
}

// ── Régions USD (florida/puntacana = EN, rivieramaya = ES) ───────────────────
// Le bulletin était MQ/GP-only. Ces régions ont leurs propres données
// (public/api/copernicus/<id>/sargassum.json) + leurs plages (region.beaches).
const { getAllRegions } = require('../../regions/index.cjs')

// Classement top 5 (score×10 + équipements), filtré score≥40 & pas "avoid",
// repli clean/moderate. Même logique que MQ/GP.
function rankBeaches(beaches) {
  const rank = b => {
    const s = typeof b.unifiedScore === 'number' ? b.unifiedScore : -1
    const amen = (b.kids ? 1 : 0) + (b.parking ? 1 : 0) + (b.snorkel ? 1 : 0)
    return s * 10 + amen
  }
  const cand = beaches.filter(b => typeof b.unifiedScore === 'number' && b.unifiedScore >= 40 && b.status !== 'avoid')
  return (cand.length >= 3 ? cand : beaches.filter(b => b.status === 'clean' || b.status === 'moderate'))
    .sort((a, b) => rank(b) - rank(a)).slice(0, 5)
}

function computeStats(beaches) {
  return {
    clean: beaches.filter(b => b.status === 'clean').length,
    moderate: beaches.filter(b => b.status === 'moderate').length,
    avoid: beaches.filter(b => b.status === 'avoid').length,
  }
}

// Label localisé dérivé du score : les labels du pipeline sont en FR (SUPER/BON/
// MOYEN) même pour les régions EN/ES → on ne les réutilise PAS.
function scoreLabel(score, status, lang) {
  if (typeof score === 'number') {
    if (lang === 'es') return score >= 75 ? 'EXCELENTE' : score >= 55 ? 'BUENO' : score >= 40 ? 'REGULAR' : 'EVITAR'
    return score >= 75 ? 'GREAT' : score >= 55 ? 'GOOD' : score >= 40 ? 'OK' : 'AVOID'
  }
  if (lang === 'es') return status === 'clean' ? 'LIMPIA' : status === 'avoid' ? 'EVITAR' : 'MODERADO'
  return status === 'clean' ? 'CLEAN' : status === 'avoid' ? 'AVOID' : 'MODERATE'
}

// Fusionne prévision samedi + scores depuis le sargassum.json régional dans
// region.beaches (id direct, pas de mapping SARG_TO_BEACH).
function prepareRegionBeaches(region, saturdayDate) {
  let sd
  try {
    sd = JSON.parse(fs.readFileSync(path.join(__dirname, `../../public/api/copernicus/${region.id}/sargassum.json`), 'utf-8'))
  } catch { return [] }
  const levels = {}
  for (const lv of (sd.levels || [])) levels[lv.id] = lv
  const scores = sd.scores || {}
  return (region.beaches || []).map(b => {
    const lv = levels[b.id] || {}
    const sc = scores[b.id] || {}
    const wk = (sd.weekly && sd.weekly[b.id]) || {}
    const satF = (wk.forecast || []).find(f => f.date === saturdayDate)
    const score = typeof sc.score === 'number' ? sc.score : (typeof lv.score === 'number' ? lv.score : undefined)
    return {
      ...b,
      status: (satF && satF.status) || lv.status || b.status || 'clean',
      unifiedScore: score,
      unifiedColor: sc.color || lv.color,
      unifiedReason: sc.reason || lv.reason, // déjà localisé par le pipeline (EN/ES)
    }
  })
}

function buildRegionSubject(region, lang, topBeaches, stats) {
  const name = region.name
  const top = topBeaches[0]
  const best = top && typeof top.unifiedScore === 'number' ? top.unifiedScore : null
  if (best !== null && best >= 70) {
    const lbl = scoreLabel(best, top.status, lang)
    return lang === 'es'
      ? `Este fin de semana en ${name}: ${top.name} ${best}/100 ${lbl}`
      : `This weekend in ${name}: ${top.name} ${best}/100 ${lbl}`
  }
  if (stats.clean > 0) {
    const lead = top ? (lang === 'es' ? `, ${top.name} a la cabeza` : `, ${top.name} leading`) : ''
    return lang === 'es'
      ? `Este fin de semana: ${stats.clean} playa${stats.clean > 1 ? 's' : ''} limpia${stats.clean > 1 ? 's' : ''} en ${name}${lead}`
      : `This weekend: ${stats.clean} clean beach${stats.clean > 1 ? 'es' : ''} in ${name}${lead}`
  }
  if (top) return lang === 'es' ? `Este fin de semana en ${name}: ${top.name}, tu mejor opción` : `This weekend in ${name}: ${top.name}, your best option`
  return lang === 'es' ? `Este fin de semana en ${name}: el mapa de playas en vivo` : `This weekend in ${name}: the live beach map`
}

function buildEmailHTMLRegion(region, lang, topBeaches, stats) {
  const es = lang === 'es'
  const name = region.name
  const domain = region.domain
  const brand = es ? 'Sargazo' : 'Sargassum'
  const monthly = (region.pricing && region.pricing.monthly) || '$9.99'
  // CTA premium → paywall ON-SITE (Mollie pass) pour TOUTES les régions. paymentLinks.monthly
  // = lien Stripe DÉSACTIVÉ côté USD → on ne s'en sert plus (sinon CTA mort dans le bulletin USD).
  const payLink = `https://${domain}/?paywall=1&utm_source=email&utm_medium=weekend_bulletin`
  const t = es ? {
    eyebrow: 'El Boletín del Vigía', title: `Playas de ${name}`,
    sub: 'El Vigía vigiló el mar. Aquí está tu fin de semana.',
    clean: 'limpias', watch: 'a vigilar', alerts: 'alertas',
    top: 'Top 5 para el sábado — puntuación sobre 100:',
    premiumKick: 'Premium', premiumTitle: 'Sabe el sábado desde el lunes',
    premiumDesc: 'Pronóstico de 7 días + alertas push.<br>Únete a quienes planifican su fin de semana con antelación.',
    premiumCta: 'Activar mi pase', priceNote: 'Desde $5.99 · pago único, sin suscripción · reembolso en un email',
    mapCta: 'Ver el mapa en vivo', mapNote: 'Pronóstico satelital para el sábado · Actualizado 4×/día',
    unsub: 'Darse de baja',
  } : {
    eyebrow: "The Watchman's Bulletin", title: `${name} Beaches`,
    sub: 'The Watchman scanned the sea. Here is your weekend.',
    clean: 'clean', watch: 'watch', alerts: 'alerts',
    top: 'Top 5 for Saturday — score out of 100:',
    premiumKick: 'Premium', premiumTitle: 'Know Saturday by Monday',
    premiumDesc: '7-day forecast + push alerts.<br>Join the families who plan their weekend ahead.',
    premiumCta: 'Activate my Pass', priceNote: 'From $5.99 · one-time, no subscription · refund in one email',
    mapCta: 'See the live map', mapNote: 'Satellite forecast for Saturday · Updated 4×/day',
    unsub: 'Unsubscribe',
  }
  const beachRows = topBeaches.map(b => {
    const hasScore = typeof b.unifiedScore === 'number'
    const color = b.unifiedColor || (b.status === 'clean' ? '#16A34A' : '#B87A00')
    const label = scoreLabel(b.unifiedScore, b.status, lang)
    const reasonLine = b.unifiedReason
      ? `<div style="font-size:11px;color:#888;margin-top:3px;font-style:italic">${b.unifiedReason}</div>`
      : ''
    const badgeInner = hasScore
      ? `<div style="font-size:16px;font-weight:800;color:${color};line-height:1">${b.unifiedScore}<span style="font-size:10px;font-weight:600;opacity:.7">/100</span></div>
         <div style="font-size:9px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${label}</div>`
      : `<span style="display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${color}1a;color:${color}">${label}</span>`
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;vertical-align:top">
        <div style="font-size:15px;font-weight:700;color:#0D0D0D">${b.name}</div>
        <div style="font-size:12px;color:#686868;margin-top:2px">${b.commune || ''}</div>
        ${reasonLine}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle">
        ${badgeInner}
      </td>
    </tr>`
  }).join('')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  <div style="background:radial-gradient(120% 90% at 76% -15%, rgba(255,199,44,.30), rgba(255,199,44,0) 55%), linear-gradient(168deg,#0B2230 0%,#0D1E1C 60%,#0A1714 100%);border-radius:16px 16px 0 0;padding:30px 24px 26px;text-align:center">
    <div style="font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:11px;font-weight:800;color:#FFC72C;text-transform:uppercase;letter-spacing:.14em">${t.eyebrow}</div>
    <div style="font-family:'Anton','Bricolage Grotesque',Impact,'Arial Narrow',sans-serif;font-size:29px;font-weight:400;color:#fff;margin-top:9px;letter-spacing:.01em">${t.title}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:4px">${t.sub}</div>
  </div>

  <div style="background:#fff;padding:20px">
    <div style="display:flex;gap:12px;margin-bottom:20px;text-align:center">
      <div style="flex:1;padding:12px;background:rgba(34,197,94,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#16A34A">${stats.clean}</div>
        <div style="font-size:11px;color:#686868">${t.clean}</div>
      </div>
      <div style="flex:1;padding:12px;background:rgba(184,122,0,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#B87A00">${stats.moderate}</div>
        <div style="font-size:11px;color:#686868">${t.watch}</div>
      </div>
      <div style="flex:1;padding:12px;background:rgba(232,82,42,.06);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#E8522A">${stats.avoid}</div>
        <div style="font-size:11px;color:#686868">${t.alerts}</div>
      </div>
    </div>
    <div style="font-size:13px;font-weight:700;color:#0D0D0D;margin-bottom:10px">${t.top}</div>
    <table style="width:100%;border-collapse:collapse">${beachRows}</table>
  </div>

  <div style="background:#0D1E1C;padding:20px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t.premiumKick}</div>
    <div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:6px">${t.premiumTitle}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:14px;line-height:1.4">${t.premiumDesc}</div>
    <a href="${payLink}" style="display:inline-block;padding:12px 28px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;box-shadow:0 4px 16px rgba(232,168,0,.3)">${t.premiumCta}</a>
    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:8px">${t.priceNote}</div>
  </div>

  <div style="text-align:center;padding:20px;background:#fff;border-radius:0 0 16px 16px;border-top:1px solid #f0f0f0">
    <a href="https://${domain}" style="display:inline-block;padding:14px 32px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;box-shadow:0 4px 16px rgba(232,168,0,.3)">${t.mapCta}</a>
    <div style="font-size:11px;color:#999;margin-top:12px">${t.mapNote}</div>
  </div>

  <div style="text-align:center;padding:16px;font-size:10px;color:#999;line-height:1.6">
    <b style="color:#0D1E1C">${brand} ${name}</b> · ${domain}<br>
    © ${new Date().getFullYear()} ${brand} ${name} · ${es ? 'datos Copernicus Marine' : 'Copernicus Marine data'}<br>
    <a href="${unsubUrl(region.id)}" style="color:#999">${t.unsub}</a>
  </div>
</div>
</body>
</html>`
}

// Gate predicates (purs, testables). Alignés sur le runner GitHub (UTC) : le
// cron, le marqueur de dedup (clé = date UTC via toISOString) et ce jour-check
// partagent désormais le MÊME fuseau. getUTCDay()===5 = vendredi UTC — identique
// à getDay() sur un runner UTC (zéro changement en prod), mais déterministe
// partout (testable hors-UTC, plus de fragilité local-vs-UTC).
function isSendDay(d = new Date()) { return d.getUTCDay() === 5 }
function sentKey(d = new Date()) { return d.toISOString().split('T')[0] }

// Dédup INCRÉMENTALE par destinataire (RGPD : hashes only, comme drip-sent).
// AVANT : le marqueur {lastSent} n'était écrit qu'en TOUTE FIN de run → un crash
// après MQ mais avant GP/USD re-spammait le bulletin ENTIER au prochain run (le
// check lastSent===today ne voyait rien d'écrit). MAINTENANT : on persiste après
// CHAQUE envoi → un crash mid-run ne ré-envoie qu'aux destinataires manquants.
// L'état n'est valable que pour AUJOURD'HUI (date != today ⇒ on repart à zéro,
// migre aussi l'ancien format {lastSent}).
function loadSent(todayKey) {
  let data
  try { data = JSON.parse(fs.readFileSync(SENT_PATH, 'utf-8')) } catch { data = null }
  if (!data || typeof data !== 'object' || data.date !== todayKey || !data.sent || typeof data.sent !== 'object') {
    data = { date: todayKey, sent: {} }
  }
  return data
}
function persistSent(data) {
  try { fs.writeFileSync(SENT_PATH, JSON.stringify(data)) } catch (e) { console.log(`  ⚠️ persist marqueur: ${e.message}`) }
}

async function main() {
  console.log('=== Weekend Email Bulletin ===')

  if (!isSendDay() && !FORCE) {
    console.log(`Not Friday (UTC day=${new Date().getUTCDay()}). Use --force to override.`)
    return
  }

  // Dédup par destinataire (incrémentale, voir loadSent). FORCE = ignore l'état
  // (ré-envoi complet), mais on enregistre quand même les envois du jour.
  const todayKey = sentKey()
  const sentState = loadSent(todayKey)
  const alreadySent = FORCE ? new Set() : new Set(Object.keys(sentState.sent))
  persistSent(sentState) // grave la date du jour même si 0 envoi
  if (alreadySent.size) console.log(`Dédup : ${alreadySent.size} destinataire(s) déjà servi(s) aujourd'hui — seront sautés.`)

  // SMTP transporter (boîte alerte@). Fail-fast si creds absents — JAMAIS de
  // fallback gmail (c'est précisément ce qu'on supprime).
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('SMTP_HOST/USER/PASS manquants — impossible d\'envoyer le bulletin.')
    process.exitCode = 1
    return
  }
  const subscribers = loadSubscribers()
  if (!subscribers.length) {
    console.error('subscribers.json vide/absent — lance fetch-subscribers.cjs avant.')
    process.exitCode = 1
    return
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    pool: true, maxConnections: 3, maxMessages: 50,
  })

  let sargData, beaches
  try { sargData = JSON.parse(fs.readFileSync(SARG_PATH, 'utf-8')) } catch { console.error('No sargassum.json'); return }
  try { beaches = JSON.parse(fs.readFileSync(BEACHES_PATH, 'utf-8')) } catch { beaches = [] }

  // Build Saturday forecast map (tomorrow from Friday = Saturday)
  const saturday = new Date()
  saturday.setDate(saturday.getDate() + 1)
  const saturdayDate = saturday.toISOString().split('T')[0]
  const satStatusMap = {}
  for (const [sargId, beachData] of Object.entries(sargData.weekly || {})) {
    const satForecast = (beachData.forecast || []).find(f => f.date === saturdayDate)
    if (satForecast) satStatusMap[sargId] = satForecast.status
  }
  const usedForecast = Object.keys(satStatusMap).length > 0
  console.log(`Saturday forecast (${saturdayDate}): ${usedForecast ? Object.keys(satStatusMap).length + ' beaches' : 'none, using current'}`)

  // Merge weekend status + unified score into beaches
  // Prefer Saturday forecast status over current, and attach score/label/reason
  // from pipeline levels so the email can rank by year-round experiential quality
  const beachMap = {}
  for (const b of beaches) beachMap[b.id] = b
  for (const level of (sargData.levels || [])) {
    const beachId = SARG_TO_BEACH[level.id]
    if (beachId && beachMap[beachId]) {
      beachMap[beachId].status = satStatusMap[level.id] || level.status
      if (typeof level.score === 'number') {
        beachMap[beachId].unifiedScore = level.score
        beachMap[beachId].unifiedLabel = level.label
        beachMap[beachId].unifiedColor = level.color
        beachMap[beachId].unifiedReason = level.reason
      }
    }
  }

  for (const island of ['mq', 'gp']) {
    const islandName = island === 'mq' ? 'Martinique' : 'Guadeloupe'
    const domain = island === 'mq' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
    const islandBeaches = beaches.filter(b => b.island === island)

    const stats = {
      clean: islandBeaches.filter(b => b.status === 'clean').length,
      moderate: islandBeaches.filter(b => b.status === 'moderate').length,
      avoid: islandBeaches.filter(b => b.status === 'avoid').length,
    }

    // Top 5 beaches ranked by unified score (year-round quality)
    // Falls back to clean+amenities for beaches without pipeline score
    const rank = b => {
      const s = typeof b.unifiedScore === 'number' ? b.unifiedScore : -1
      const amen = (b.kids || 0) + (b.parking || 0) + (b.snorkel || 0)
      return s * 10 + amen
    }
    const scoreCandidates = islandBeaches.filter(b =>
      typeof b.unifiedScore === 'number' && b.unifiedScore >= 40 && b.status !== 'avoid'
    )
    const topBeaches = (scoreCandidates.length >= 3
      ? scoreCandidates
      : islandBeaches.filter(b => b.status === 'clean' || b.status === 'moderate')
    )
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 5)

    const preheader = `Tes meilleures plages notées pour samedi — score sur 100, prévision satellite à jour.`
    const html = applyBrand(injectPreheader(buildEmailHTML(island, topBeaches, stats, domain), preheader))

    const bestScore = topBeaches[0]?.unifiedScore
    const bestLabel = topBeaches[0]?.unifiedLabel
    console.log(`\n${islandName}: ${stats.clean} propres, ${stats.moderate} moderees, ${stats.avoid} alertes`)
    console.log(`Top 5: ${topBeaches.map(b => `${b.name}${typeof b.unifiedScore === 'number' ? ` (${b.unifiedScore})` : ''}`).join(', ')}`)

    // Send to Apps Script which will dispatch to all subscribers
    // Subject framing (open-rate optimization, growth-actions log 2026-04-17 ×3,
    // re-confirmed 2026-06-13): lead with the score ONLY when it's genuinely good
    // (>=70 = BON/EXCELLENT). Below that the unified label reads "MOYEN" and a
    // subject like "Anse Madame 66/100 MOYEN" buries the real story — e.g. 41 clean
    // beaches the same weekend. Sub-70 → abundance framing + the named top pick.
    const STRONG_SCORE = 70
    const clean = stats.clean
    let subject
    if (typeof bestScore === 'number' && bestScore >= STRONG_SCORE) {
      subject = `Ce weekend en ${islandName} : ${topBeaches[0].name} ${bestScore}/100 ${bestLabel || ''}`.trim()
    } else if (clean > 0) {
      const lead = topBeaches[0] ? `, ${topBeaches[0].name} en tête` : ''
      subject = `Ce weekend : ${clean} plage${clean > 1 ? 's' : ''} propre${clean > 1 ? 's' : ''} en ${islandName}${lead}`
    } else {
      subject = topBeaches[0]
        ? `Ce weekend en ${islandName} : ${topBeaches[0].name}, ta meilleure option`
        : `Ce weekend en ${islandName} : la carte des plages en direct`
    }
    // Envoi SMTP depuis alerte@ à chaque abonné de l'île (perso {{EMAIL}} pour
    // le lien de désabonnement + header List-Unsubscribe one-click RFC 8058).
    const from = `Sargasses ${islandName} <alerte@sargasses-martinique.com>`
    const text = htmlToText(html)
    const recipients = subscribers.filter(s =>
      s.email && s.email.includes('@') &&
      (s.island || 'MQ').toUpperCase() === island.toUpperCase() &&
      !B2B_SOURCES.has(s.source)
    )
    let sent = 0, failed = 0, skipped = 0
    for (const sub of recipients) {
      const h = emailHash(sub.email)
      if (alreadySent.has(h)) { skipped++; continue }
      const enc = encodeURIComponent(sub.email)
      const personalHtml = html.replace(/\{\{EMAIL\}\}/g, enc)
      const personalText = text.replace(/\{\{EMAIL\}\}/g, enc)
      const unsub = unsubUrl(island).replace('{{EMAIL}}', enc)
      try {
        await transporter.sendMail({
          from, to: sub.email, subject,
          html: personalHtml, text: personalText,
          headers: {
            'List-Unsubscribe': `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
        sent++
        sentState.sent[h] = 1; persistSent(sentState) // marqueur incrémental anti re-spam
        if (sent % 25 === 0) await sleep(1500) // douceur pour l'hôte mutualisé
      } catch (e) {
        failed++
        console.log(`  ❌ ${logId(sub.email)}: ${e.message}`)
      }
    }
    console.log(`${islandName}: envoyé ${sent}/${recipients.length} (échecs ${failed}, sautés ${skipped})`)

    // Track aggregate in Sheet (best-effort, non bloquant)
    try {
      await post(WEBHOOK_URL, {
        type: 'email_tracking',
        to: `all_${island}`,
        subject,
        email_type: 'weekend_bulletin',
        island: island.toUpperCase(),
        status: 'sent',
        count: sent,
        date: new Date().toISOString(),
      })
    } catch {}
  }

  // ── Bulletin régions USD (florida/puntacana = EN, rivieramaya = ES) ─────────
  // Mêmes données satellite, mais lues par région + HTML/sujet localisés.
  const USD_REGIONS = getAllRegions().filter(r => r.id !== 'mq' && r.id !== 'gp')
  for (const region of USD_REGIONS) {
    const lang = region.primaryLang === 'es' ? 'es' : 'en'
    const rb = prepareRegionBeaches(region, saturdayDate)
    const rTop = rankBeaches(rb)
    if (!rTop.length) { console.log(`${region.name}: aucune plage à classer, skip`); continue }
    const rStats = computeStats(rb)
    const rSubject = buildRegionSubject(region, lang, rTop, rStats)
    const rPre = lang === 'es'
      ? 'Tus mejores playas para el sábado — puntuación sobre 100, pronóstico satelital al día.'
      : 'Your best beaches ranked for Saturday — score out of 100, fresh satellite forecast.'
    const rHtml = applyBrand(injectPreheader(buildEmailHTMLRegion(region, lang, rTop, rStats), rPre))
    const rText = htmlToText(rHtml)
    const rFrom = `${lang === 'es' ? 'Sargazo' : 'Sargassum'} ${region.name} <alerte@sargasses-martinique.com>`
    const rRecipients = subscribers.filter(s =>
      s.email && s.email.includes('@') &&
      (s.island || '').toUpperCase() === region.id.toUpperCase() &&
      !B2B_SOURCES.has(s.source)
    )
    let rSent = 0, rFailed = 0, rSkipped = 0
    for (const sub of rRecipients) {
      const h = emailHash(sub.email)
      if (alreadySent.has(h)) { rSkipped++; continue }
      const enc = encodeURIComponent(sub.email)
      const personalHtml = rHtml.replace(/\{\{EMAIL\}\}/g, enc)
      const personalText = rText.replace(/\{\{EMAIL\}\}/g, enc)
      const unsub = unsubUrl(region.id).replace('{{EMAIL}}', enc)
      try {
        await transporter.sendMail({
          from: rFrom, to: sub.email, subject: rSubject,
          html: personalHtml, text: personalText,
          headers: {
            'List-Unsubscribe': `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
        rSent++
        sentState.sent[h] = 1; persistSent(sentState) // marqueur incrémental anti re-spam
        if (rSent % 25 === 0) await sleep(1500)
      } catch (e) {
        rFailed++
        console.log(`  ❌ ${logId(sub.email)}: ${e.message}`)
      }
    }
    console.log(`${region.name} (${lang}): envoyé ${rSent}/${rRecipients.length} (échecs ${rFailed}, sautés ${rSkipped})`)
    try {
      await post(WEBHOOK_URL, {
        type: 'email_tracking', to: `all_${region.id}`, subject: rSubject,
        email_type: 'weekend_bulletin', island: region.id.toUpperCase(),
        status: 'sent', count: rSent, date: new Date().toISOString(),
      })
    } catch {}
  }

  transporter.close()

  // L'état est déjà persisté incrémentalement après chaque envoi ; flush final
  // de sécurité (no-op si rien de neuf). Marque aussi lastSent pour rétro-compat.
  sentState.lastSent = todayKey
  persistSent(sentState)

  console.log('\nDone.')
}

// Auto-run uniquement en exécution directe ; require()-able pour tests (gates).
if (require.main === module) {
  main().catch(e => { console.error(e); process.exitCode = 1 })
}

module.exports = { main, isSendDay, sentKey, buildEmailHTML, buildEmailHTMLRegion, buildRegionSubject, prepareRegionBeaches, rankBeaches, computeStats }
