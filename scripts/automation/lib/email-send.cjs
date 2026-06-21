/**
 * email-send.cjs — Couche d'envoi partagée (deliverability-grade) pour TOUS
 * les emails Sargasses. Objectif : propre, non-spammy, cohérent.
 *
 * Apporte à chaque email, sans toucher au contenu :
 *   1. PREHEADER — le texte d'aperçu en boîte de réception (caché dans le corps),
 *      paddé de caractères invisibles pour ne pas "fuiter" le début du HTML.
 *   2. PLAIN-TEXT auto — version texte dérivée du HTML (multipart = meilleur score
 *      anti-spam, fallback clients sans HTML, accessibilité).
 *   3. LIST-UNSUBSCRIBE one-click — header RFC 8058 (déjà attendu par Gmail/Outlook).
 *
 * TRANSPORT : SMTP de la boîte réelle alerte@sargasses-martinique.com (cPanel,
 * premium115.web-hosting.com), via nodemailer — PLUS de Resend. Le From est
 * NORMALISÉ sur cette adresse (le display-name passé par l'appelant est conservé)
 * pour garantir SPF/DKIM : un From sur un autre domaine casserait la délivrabilité.
 * Pas de PII en log.
 */

const nodemailer = require('nodemailer')

// SMTP — boîte alerte@ (cPanel). Host/user/port non sensibles (defaults ici) ;
// seul SMTP_PASS est un secret. Lecture PARESSEUSE de process.env : un script qui
// charge un .env local avant d'envoyer est ainsi pris en compte.
function smtpCfg() {
  return {
    host: process.env.SMTP_HOST || 'premium115.web-hosting.com',
    port: +(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || 'alerte@sargasses-martinique.com',
    pass: process.env.SMTP_PASS || '',
  }
}

// Prêt à envoyer ? (creds présents). Les scripts gatent dessus au lieu de RESEND_API_KEY.
function mailReady() { const c = smtpCfg(); return !!(c.host && c.user && c.pass) }

// Transporter mutualisé (pool) — construit une seule fois (au 1er envoi, creds figés).
let _transporter = null
function getTransport() {
  if (_transporter) return _transporter
  const c = smtpCfg()
  _transporter = nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
    pool: true, maxConnections: 3, maxMessages: 50,
  })
  return _transporter
}

// Force l'adresse From sur la boîte authentifiée (SPF/DKIM), en gardant le
// display-name voulu par l'appelant. "Sargassum Florida <alerte@sargassummiami.com>"
// → "Sargassum Florida <alerte@sargasses-martinique.com>".
function normalizeFrom(from) {
  const addr = smtpCfg().user
  const raw = String(from || '').trim()
  const m = raw.match(/^\s*(.*?)\s*<[^>]*>\s*$/)
  const name = m ? m[1].replace(/^"|"$/g, '').trim() : (raw.includes('@') ? '' : raw)
  return name ? `${name} <${addr}>` : addr
}


// HTML → texte lisible (liens conservés en "libellé (url)").
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
      const label = txt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      return label ? `${label} (${href})` : href
    })
    .replace(/<\/(p|div|tr|table|h[1-6]|li|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&middot;/gi, '·')
    .replace(/&#x[0-9a-f]+;/gi, '').replace(/&#\d+;/g, '').replace(/&[a-z]+;/gi, '')
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Injecte le preheader juste après <body>. Padding invisible (WJ + ZWNJ + NBSP)
// pour empêcher le texte du corps de remplir l'aperçu après le preheader.
function injectPreheader(html, preheader) {
  if (!preheader) return html
  const pad = '&#847;&zwnj;&nbsp;'.repeat(40)
  const ph = `<div style="display:none!important;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FDFCF7;opacity:0">${preheader}${pad}</div>`
  return /<body[^>]*>/i.test(html) ? html.replace(/(<body[^>]*>)/i, `$1${ph}`) : ph + html
}

// ─── Identité visuelle du site (tokens de public/a-propos/colors_and_type.css) ───
// Fonts du site : Anton (display/marque) + Bricolage Grotesque (corps).
const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:wght@400;600;700;800&display=swap" rel="stylesheet">`
const FONT_SANS = "'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',sans-serif"
const FONT_DISPLAY = "'Anton','Bricolage Grotesque',Impact,'Arial Narrow',sans-serif"

/**
 * Header golden-hour de marque (identique au monde du site) : ciel nuit-océan
 * + halo doré (le Veilleur veille la mer), titre en Anton, eyebrow gold.
 * Texte blanc sur fond sombre = contraste garanti (le halo reste discret).
 */
function brandHeader(kicker, title, subtitle) {
  const k = kicker ? `<div style="font-family:${FONT_SANS};font-size:11px;font-weight:800;color:#FFC72C;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px">${kicker}</div>` : ''
  const s = subtitle ? `<div style="font-family:${FONT_SANS};font-size:13px;color:rgba(255,255,255,.62);margin-top:9px;line-height:1.45">${subtitle}</div>` : ''
  return `<div style="background:radial-gradient(120% 90% at 76% -15%, rgba(255,199,44,.30), rgba(255,199,44,0) 55%), linear-gradient(168deg,#0B2230 0%,#0D1E1C 60%,#0A1714 100%);border-radius:16px 16px 0 0;padding:30px 24px 26px;text-align:center">
    ${k}
    <div style="font-family:${FONT_DISPLAY};font-size:31px;font-weight:400;color:#fff;line-height:1.06;letter-spacing:.01em">${title}</div>
    ${s}
  </div>`
}

// Applique l'identité du site à un HTML d'email déjà construit, sans toucher au
// markup : injecte les fonts, bascule le corps sur Bricolage, fond crème exact.
function applyBrand(html) {
  let out = String(html)
    .split("-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif").join(FONT_SANS)
    .split('background:#F7F5EF').join('background:#FDFCF7')
  const head = `${FONT_LINK}<style>@import url('https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:wght@400;600;700;800&display=swap');body,div,td,a,p{font-family:${FONT_SANS}}</style>`
  return /<head[^>]*>/i.test(out) ? out.replace(/(<head[^>]*>)/i, `$1${head}`) : head + out
}

/**
 * Envoie un email "propre" via SMTP (boîte alerte@). Retourne un objet compatible
 * avec l'ancien appelant Resend : { data: { id }, error: null | Error }.
 *
 * Signatures supportées (back-compat) :
 *   sendEmail(opts)                 ← nouveau
 *   sendEmail(legacyResend, opts)   ← ancien (1er arg ignoré)
 * opts = { from, to, subject, html, preheader, unsubUrl, text?, replyTo? }
 */
async function sendEmail(a, b) {
  const opts = (b === undefined) ? a : b
  const { from, to, subject, html, preheader, unsubUrl, text, replyTo } = opts || {}
  if (!mailReady()) {
    return { data: null, error: new Error('SMTP non configuré (SMTP_PASS manquant)') }
  }
  const message = {
    from: normalizeFrom(from),
    to, subject,
    html: applyBrand(injectPreheader(html, preheader)),
    text: text || htmlToText(html),
  }
  if (replyTo) message.replyTo = replyTo
  if (unsubUrl) message.headers = {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
  try {
    const info = await getTransport().sendMail(message)
    return { data: { id: info.messageId }, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

module.exports = {
  sendEmail, mailReady, getTransport, normalizeFrom,
  htmlToText, injectPreheader, applyBrand, brandHeader,
  FONT_LINK, FONT_SANS, FONT_DISPLAY,
}
