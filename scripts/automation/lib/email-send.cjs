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
 * N'envoie RIEN tout seul : wrappe `resend.emails.send`. Pas de PII en log.
 */

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
 * Envoie un email "propre". Retourne le résultat brut de Resend ({data,error}).
 * @param resend  instance Resend déjà construite
 * @param opts    { from, to, subject, html, preheader, unsubUrl, text?, replyTo? }
 */
async function sendEmail(resend, { from, to, subject, html, preheader, unsubUrl, text, replyTo }) {
  const payload = {
    from, to, subject,
    html: applyBrand(injectPreheader(html, preheader)),
    text: text || htmlToText(html),
  }
  if (replyTo) payload.replyTo = replyTo
  if (unsubUrl) payload.headers = {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
  return resend.emails.send(payload)
}

module.exports = { sendEmail, htmlToText, injectPreheader, applyBrand, brandHeader, FONT_LINK, FONT_SANS, FONT_DISPLAY }
