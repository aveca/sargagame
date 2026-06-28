#!/usr/bin/env node
/**
 * widget-convert — convertit AUTOMATIQUEMENT les hôtels qui ont installé le widget.
 *
 * Un établissement qui colle notre widget sur son site = le lead B2B le plus CHAUD
 * possible (il utilise déjà le produit). widget-install-watch.cjs DÉTECTE l'install
 * (domaine, anonyme) et prévient le fondateur ; ICI on CONTACTE l'hôtel pour le
 * convertir au payant (essai 14j → 79 €/mois), via un mail chaud personnalisé.
 *
 * Source = data/widget-contacts.json (host → {email,name,town,island,tier}), enrichi
 * à la main ou par l'agent d'enrichissement. Dédup committée (widget-converted-sent.json)
 * → un hôtel n'est contacté qu'1×. Dry-run sans SMTP_PASS. Tourne dans le pipeline daily.
 *
 *   node scripts/automation/widget-convert.cjs          # dry-run
 *   node scripts/automation/widget-convert.cjs --send   # envoie
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')
const { payUrlFor } = require('./lib/b2b-paylinks.cjs')

const CONTACTS_PATH = path.join(__dirname, 'data', 'widget-contacts.json')
const SENT_PATH = path.join(__dirname, 'data', 'widget-converted-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const SEND = process.argv.includes('--send')
const FROM = 'Sargasses Pro <alerte@sargasses-martinique.com>'
const REPLY_TO = 'alerte@sargasses-martinique.com'

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function saveJSON(p, d) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }

function cta(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:14px 28px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:800">${text}</a>`
}

function build(c) {
  const island = (c.island || 'MQ').toUpperCase()
  const domain = island === 'GP' ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
  const name = c.name || 'votre établissement'
  const where = c.town ? ` à ${c.town}` : ''
  const price = c.tier === 'territoire' ? 'dès 199 €/mois' : c.tier === 'brief' ? '29 €/mois' : '79 €/mois'
  const proPath = `https://${domain}/?pro=1&utm_source=email&utm_medium=widget_convert`
  const unsub = `https://${domain}/?unsub=1`
  const subject = `Vous avez ajouté Le Veilleur à ${name} — la version Pro ?`
  const preheader = `Vos plages surveillées chaque matin, à votre marque. 14 jours offerts.`
  const inner = `${brandHeader('On a vu ça 👀', 'Sargasses Pro', `Vous suivez déjà vos plages${where}`)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6">Bonjour,</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:10px">Vous avez ajouté notre widget « état des plages » sur le site de <strong>${name}</strong> — merci ! Ça veut dire que la question des sargasses compte pour vos clients.</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">La version <strong>Pro</strong> va plus loin, et tourne toute seule :</div>
    <ul style="font-size:14px;color:#444;line-height:1.7;padding-left:18px;margin:12px 0">
      <li><strong>Widget marque-blanche</strong> (sans notre logo, à vos couleurs)</li>
      <li><strong>Brief quotidien</strong> de VOS plages par email, chaque matin</li>
      <li><strong>Alerte avant l'échouage</strong> + prévision 7 jours</li>
    </ul>
    <div style="font-size:15px;color:#333;line-height:1.6">Je vous l'active <strong>14 jours gratuitement, sans carte</strong>. Ensuite c'est ${price}, sans engagement, stop quand vous voulez.</div>
    <div style="text-align:center;margin-top:18px">${cta('Activer mon essai 14 jours', proPath)}</div>
    ${(() => { const pu = payUrlFor(c.tier || 'pro'); return pu ? `<div style="text-align:center;margin-top:10px;font-size:13px;color:#666">Déjà convaincu ? <a href="${pu}" style="color:#0A1714;font-weight:700">Payez l'année directement →</a></div>` : '' })()}
    <div style="font-size:13px;color:#666;margin-top:14px;line-height:1.5">Une question ? Répondez simplement à cet email.</div>
  </div>
  <div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses Pro · ${domain}<br><a href="${unsub}" style="color:#999">Se désabonner</a>
  </div>`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">${inner}</div></body></html>`
  return { subject, preheader, html, unsub }
}

async function main() {
  console.log('=== Widget → Pro conversion ===')
  if (!SEND || !mailReady()) console.log(SEND ? 'SMTP_PASS manquant — dry-run.' : 'Mode dry-run (pas de --send).')
  const cfg = loadJSON(CONTACTS_PATH, { contacts: {} })
  const contacts = cfg.contacts || {}
  const sent = loadJSON(SENT_PATH, {})
  const bounced = new Set((loadJSON(BOUNCED_PATH, []) || []).map(e => String(e).includes('@') ? emailHash(e) : e))
  const ready = SEND && mailReady()
  let n = 0
  for (const [host, c] of Object.entries(contacts)) {
    if (!c || !c.email || !c.email.includes('@')) continue
    const key = emailHash(c.email)
    if (sent[key]) continue
    if (bounced.has(key)) { console.log(`  - ${host}: bounced, skip`); continue }
    const { subject, preheader, html, unsub } = build(c)
    if (!ready) { console.log(`  ~ ${host} → ${logId(c.email)} would send: "${subject}"`); n++; continue }
    const { data, error } = await sendEmail({ from: FROM, to: c.email, subject, html, preheader, unsubUrl: unsub, replyTo: REPLY_TO })
    if (error) { console.log(`  x ${host} → ${logId(c.email)}: ${error.message}`); continue }
    console.log(`  + ${host} → ${logId(c.email)} (${subject})`)
    sent[key] = { host, date: new Date().toISOString() }
    saveJSON(SENT_PATH, sent)
    n++
  }
  console.log(ready ? `\nEnvoyé : ${n}` : `\nDry-run : ${n} à contacter.`)
}
main().catch(e => { console.error(e); process.exit(1) })
