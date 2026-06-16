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

/**
 * Envoie un email "propre". Retourne le résultat brut de Resend ({data,error}).
 * @param resend  instance Resend déjà construite
 * @param opts    { from, to, subject, html, preheader, unsubUrl, text?, replyTo? }
 */
async function sendEmail(resend, { from, to, subject, html, preheader, unsubUrl, text, replyTo }) {
  const payload = {
    from, to, subject,
    html: injectPreheader(html, preheader),
    text: text || htmlToText(html),
  }
  if (replyTo) payload.replyTo = replyTo
  if (unsubUrl) payload.headers = {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
  return resend.emails.send(payload)
}

module.exports = { sendEmail, htmlToText, injectPreheader }
