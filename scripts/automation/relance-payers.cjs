#!/usr/bin/env node
/**
 * Relance Payers — envoi CIBLÉ aux clients PAYANTS (segment data/payers.json
 * produit par fetch-payers.cjs). Pour reparler à ceux qui ont déjà payé : upsell,
 * nouveauté, win-back des résiliés — séparément des simples leads.
 *
 * Réutilise l'infra d'envoi existante (lib/email-send.cjs : SMTP boîte alerte@,
 * preheader, List-Unsubscribe). Contenu éditable sans toucher au code :
 * data/relance-payers-message.json.
 *
 * SÉCURITÉ : DRY-RUN par défaut (liste qui RECEVRAIT, n'envoie rien). Il faut
 * --send ET SMTP configuré pour envoyer réellement. Le segment est déjà filtré des
 * désabonnés et des bounces par fetch-payers.cjs.
 *
 * Usage :
 *   node scripts/automation/fetch-payers.cjs            # 1) construit le segment
 *   node scripts/automation/relance-payers.cjs          # 2) DRY-RUN (qui recevrait)
 *   node scripts/automation/relance-payers.cjs --send   # 3) envoie pour de vrai
 * Options :
 *   --island=MQ|GP|ALL   (défaut ALL)
 *   --status=all|active|past_due|canceled|paid   (défaut all ; liste séparée par virgule OK)
 *   --opted-in-only      (n'envoyer qu'aux payeurs aussi présents dans la liste 'emails')
 *   --limit=N            (cap d'envois pour ce run)
 *   --lang=fr|en         (défaut: MQ/GP→fr, sinon en)
 */
const fs = require('fs')
const path = require('path')
const { sendEmail, mailReady, brandHeader, FONT_SANS } = require('./lib/email-send.cjs')
const { logId } = require('./lib/email-hash.cjs')

const PAYERS_PATH = path.join(__dirname, 'data', 'payers.json')
const MSG_PATH = path.join(__dirname, 'data', 'relance-payers-message.json')
const UNSUB_BASE = process.env.WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>'

const arg = (k, d) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.split('=')[1] : d }
const SEND = process.argv.includes('--send')
const OPTED_ONLY = process.argv.includes('--opted-in-only')
const ISLAND = (arg('island', 'ALL') || 'ALL').toUpperCase()
const STATUS = (arg('status', 'all') || 'all').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
const LIMIT = parseInt(arg('limit', '0'), 10) || 0
const LANG_OVERRIDE = arg('lang', '')

const unsubUrl = (email, island) => `${UNSUB_BASE}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`

function buildHtml(m, email, island) {
  const unsub = unsubUrl(email, island)
  const cta = m.ctaUrl ? `<div style="padding:6px 24px 26px;text-align:center"><a href="${m.ctaUrl}" style="display:inline-block;background:#FFC72C;color:#1a1726;font-weight:800;text-decoration:none;padding:13px 24px;border-radius:12px;font-size:15px">${m.ctaText || 'Ouvrir'}</a></div>` : ''
  const card = `<div style="max-width:560px;margin:0 auto;background:#FDFCF7;border-radius:16px;overflow:hidden;font-family:${FONT_SANS}">
    ${brandHeader(m.kicker, m.title, m.subtitle)}
    <div style="padding:24px 24px 6px;color:#1a1726;font-size:15px;line-height:1.62">${m.bodyHtml || ''}</div>
    ${cta}
    <div style="padding:2px 24px 22px;color:#9a9a9a;font-size:11px;text-align:center">Le Veilleur · veille côtière · <a href="${unsub}" style="color:#9a9a9a">se désabonner</a></div>
  </div>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0B1714;padding:24px 12px">${card}</body></html>`
}

async function main() {
  console.log('=== Relance Payers (segment clients payants) ===')
  let data
  try { data = JSON.parse(fs.readFileSync(PAYERS_PATH, 'utf-8')) }
  catch { console.log(`payers.json absent — lance d'abord : node scripts/automation/fetch-payers.cjs`); return }
  const msg = JSON.parse(fs.readFileSync(MSG_PATH, 'utf-8'))

  let list = (data.payers || [])
    .filter(p => ISLAND === 'ALL' || p.island === ISLAND)
    .filter(p => STATUS.includes('all') || STATUS.includes(p.status))
    .filter(p => !OPTED_ONLY || p.optedIn)
  if (LIMIT > 0) list = list.slice(0, LIMIT)

  console.log(`Cible: ${list.length} payeur(s) | island=${ISLAND} status=${STATUS.join(',')}${OPTED_ONLY ? ' opted-in-only' : ''}${LIMIT ? ` limit=${LIMIT}` : ''}`)
  const canSend = SEND && mailReady()
  if (SEND && !mailReady()) console.log('⚠️ --send demandé mais SMTP non configuré (SMTP_PASS manquant) → bascule en DRY-RUN.')
  if (!SEND) console.log('DRY-RUN (pas d\'envoi). Ajoute --send pour envoyer réellement.\n')

  let sent = 0, failed = 0
  for (const p of list) {
    const island = p.island === 'GP' ? 'GP' : (p.island === 'MQ' ? 'MQ' : 'MQ')
    const lang = LANG_OVERRIDE || (island === 'MQ' || island === 'GP' ? 'fr' : 'en')
    const m = msg[lang] || msg.fr
    const from = island === 'GP' ? FROM_GP : FROM_MQ
    if (!canSend) { console.log(`  ~ ${logId(p.email)} [${p.status}/${island}] would send "${m.subject}"`); continue }
    try {
      const html = buildHtml(m, p.email, island)
      const r = await sendEmail({ from, to: p.email, subject: m.subject, html, preheader: m.subtitle || '', unsubUrl: unsubUrl(p.email, island) })
      if (r && r.error) { failed++; console.log(`  ✗ ${logId(p.email)} — ${r.error.message}`) }
      else { sent++; console.log(`  ✓ ${logId(p.email)} [${p.status}/${island}]`) }
    } catch (e) { failed++; console.log(`  ✗ ${logId(p.email)} — ${e.message}`) }
  }
  if (canSend) console.log(`\nEnvoyés: ${sent} | échecs: ${failed}`)
  else console.log(`\n(${list.length} destinataires en dry-run — rien envoyé)`)
}

main()
