#!/usr/bin/env node
/**
 * Send B2B Follow-up — envoie les follow-ups B2B PERSONNALISÉS en attente
 * (outbox data/b2b-followups.json), UNE SEULE FOIS chacun.
 *
 * Pour les touches manuelles, chaudes, sur un prospect précis (≠ cold outreach
 * de masse) : correction de widget mal réglé, relance d'un lead, pitch partenaire
 * sur-mesure. Réutilise l'infra SMTP existante (lib/email-send.cjs, boîte alerte@).
 *
 * Anti-doublon : chaque entrée a un `id` ; une fois envoyée, l'id est inscrit dans
 * data/b2b-followup-sent.json (committé par le workflow) → jamais ré-envoyée même
 * si le step retourne 4×/jour.
 *
 * SÉCURITÉ : DRY-RUN par défaut (liste ce qui partirait). Il faut --send ET SMTP
 * configuré (SMTP_PASS) pour envoyer réellement.
 *
 * Usage :
 *   node scripts/automation/send-b2b-followup.cjs           # DRY-RUN
 *   node scripts/automation/send-b2b-followup.cjs --send     # envoie les en attente
 */
const fs = require('fs')
const path = require('path')
const { sendEmail, mailReady, brandHeader, FONT_SANS } = require('./lib/email-send.cjs')
const { logId } = require('./lib/email-hash.cjs')

const OUTBOX = path.join(__dirname, 'data', 'b2b-followups.json')
const MARKER = path.join(__dirname, 'data', 'b2b-followup-sent.json')
const UNSUB_BASE = process.env.WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>'
const SEND = process.argv.includes('--send')

const unsubUrl = (email, island) => `${UNSUB_BASE}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`

function shell(f) {
  const island = f.island === 'GP' ? 'GP' : 'MQ'
  const unsub = unsubUrl(f.to, island)
  const card = `<div style="max-width:560px;margin:0 auto;background:#FDFCF7;border-radius:16px;overflow:hidden;font-family:${FONT_SANS}">
    ${brandHeader(f.kicker || 'Le Veilleur', f.title || '', f.subtitle || '')}
    <div style="padding:24px 24px 6px;color:#1a1726;font-size:15px;line-height:1.62">${f.bodyHtml || ''}</div>
    <div style="padding:14px 24px 22px;color:#9a9a9a;font-size:11px;text-align:center;border-top:1px solid rgba(0,0,0,.06);margin-top:14px">Le Veilleur · veille côtière · <a href="${unsub}" style="color:#9a9a9a">se désabonner</a></div>
  </div>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0B1714;padding:24px 12px">${card}</body></html>`
}

async function main() {
  console.log('=== Send B2B Follow-up (outbox) ===')
  let outbox, marker
  try { outbox = JSON.parse(fs.readFileSync(OUTBOX, 'utf-8')) } catch { console.log('b2b-followups.json absent — rien à envoyer.'); return }
  try { marker = JSON.parse(fs.readFileSync(MARKER, 'utf-8')) } catch { marker = { sent: [] } }
  const sentIds = new Set((marker.sent || []).map(s => s.id || s))

  const pending = (outbox.followups || []).filter(f => f && f.id && f.to && !sentIds.has(f.id))
  if (!pending.length) { console.log('Aucun follow-up en attente (tous déjà envoyés).'); return }
  console.log(`${pending.length} follow-up(s) en attente.`)

  const canSend = SEND && mailReady()
  if (SEND && !mailReady()) console.log('⚠️ --send demandé mais SMTP non configuré (SMTP_PASS) → DRY-RUN.')
  if (!SEND) console.log('DRY-RUN (rien envoyé). Ajoute --send pour envoyer réellement.\n')

  let sent = 0, failed = 0
  for (const f of pending) {
    const from = f.from || (f.island === 'GP' ? FROM_GP : FROM_MQ)
    if (!canSend) { console.log(`  ~ ${f.id} → ${logId(f.to)} : would send "${f.subject}"`); continue }
    try {
      const r = await sendEmail({ from, to: f.to, subject: f.subject, html: shell(f), preheader: f.subtitle || '', unsubUrl: unsubUrl(f.to, f.island === 'GP' ? 'GP' : 'MQ') })
      if (r && r.error) { failed++; console.log(`  ✗ ${f.id} → ${logId(f.to)} : ${r.error.message}`) }
      else {
        sent++
        marker.sent = marker.sent || []
        marker.sent.push({ id: f.id, ts: new Date().toISOString() })
        fs.writeFileSync(MARKER, JSON.stringify(marker, null, 2) + '\n') // persiste après CHAQUE envoi
        console.log(`  ✓ ${f.id} → ${logId(f.to)} envoyé`)
      }
    } catch (e) { failed++; console.log(`  ✗ ${f.id} → ${logId(f.to)} : ${e.message}`) }
  }
  if (canSend) console.log(`\nEnvoyés: ${sent} | échecs: ${failed}`)
  else console.log(`\n(${pending.length} en dry-run — rien envoyé)`)
}

main()
