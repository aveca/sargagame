#!/usr/bin/env node
/**
 * b2b-cold-outreach — prospection B2B FROIDE, automatisée et délivrabilité-safe.
 *
 * Source = data/b2b-enriched.json (hôtels MQ/GP avec email RÉEL + hook perso, produit
 * par l'agent d'enrichissement). Envoie une séquence courte et PERSONNALISÉE :
 *   c0  = premier contact (hook réel + offre essai 14j → prix + question fermée)
 *   c4  = relance unique J+4 (la plupart des réponses viennent de la relance)
 *
 * Délivrabilité (directive fondateur : ne jamais passer en spam) :
 *   - WARMUP : cap bas d'envois NEUFS par run (CAP_NEW, défaut 5) → montée lente.
 *   - perso (hook) → jamais 27× le même corps ; plain-text auto (htmlToText).
 *   - List-Unsubscribe + lien désabo ; dédup committée ; bounced filtrés ; replyTo.
 *   - 1 email/établissement/run max ; séquence espacée.
 * Dry-run sans SMTP_PASS. Tourne dans le pipeline daily (--send). NB : on envoie depuis
 * le domaine principal (choix fondateur) — warmup bas = garde-fou.
 *
 *   node scripts/automation/b2b-cold-outreach.cjs           # dry-run
 *   node scripts/automation/b2b-cold-outreach.cjs --send    # envoie
 *   CAP_NEW=8 node scripts/automation/b2b-cold-outreach.cjs --send
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')

const SRC_PATH = path.join(__dirname, 'data', 'b2b-enriched.json')
const SENT_PATH = path.join(__dirname, 'data', 'b2b-cold-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const SEND = process.argv.includes('--send')
const CAP_NEW = parseInt(process.env.CAP_NEW || '5', 10)   // warmup : nouveaux contacts/run
const FROM = 'Sargasses Pro <alerte@sargasses-martinique.com>'
const REPLY_TO = 'alerte@sargasses-martinique.com'
const FOLLOWUP_DAYS = 4

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function saveJSON(p, d) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
function daysSince(iso) { const t = Date.parse(iso); return isNaN(t) ? 999 : Math.floor((Date.now() - t) / 86400000) }

function priceFor(c) { return c.fit === 'lodge-gite' ? '29 €/mois' : c.fit === 'territoire' ? 'dès 199 €/mois' : '79 €/mois' }
function domainFor(c) { return c.island === 'GP' ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com' }

function cta(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:13px 26px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:800">${text}</a>`
}
function shell(inner, c) {
  const domain = domainFor(c)
  const unsub = `https://${domain}/?unsub=1`
  return {
    unsub,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">${inner}
<div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">Sargasses Pro · ${domain}<br><a href="${unsub}" style="color:#999">Se désabonner</a></div>
</div></body></html>`,
  }
}

function buildC0(c) {
  const domain = domainFor(c)
  const pro = `https://${domain}/?pro=1&utm_source=email&utm_medium=b2b_cold&utm_campaign=c0`
  const place = c.town || (c.island === 'GP' ? 'Guadeloupe' : 'Martinique')
  const subject = `${c.name} — l'état de vos plages chaque matin ?`
  const preheader = `Surveillance satellite de vos plages : prévenus avant l'échouage. 14 jours offerts.`
  const inner = `${brandHeader('Sargasses Pro', 'Vos plages, surveillées', `Pour ${c.name}, ${place}`)}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6">Bonjour,</div>
    ${c.hook ? `<div style="font-size:15px;color:#333;line-height:1.6;margin-top:10px">${c.hook}</div>` : ''}
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">Je fais <strong>Le Veilleur</strong> — la surveillance satellite des sargasses plage par plage (les vacanciers s'en servent déjà chaque matin). Pour un établissement comme le vôtre, une plage envahie = clients déçus, avis, parfois remboursements — et vous l'apprenez souvent en même temps qu'eux.</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">Je propose le <strong>brief quotidien de vos plages</strong> (état réel + alerte avant l'échouage + prévision 7 jours), et un <strong>widget « plages surveillées »</strong> pour votre site, qui rassure avant la réservation.</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px"><strong>14 jours gratuits, sans carte.</strong> Ensuite ${priceFor(c)} si vous gardez, sans engagement. Je vous active l'essai aujourd'hui ?</div>
    <div style="text-align:center;margin-top:18px">${cta('Démarrer l’essai 14 jours', pro)}</div>
    <div style="font-size:13px;color:#666;margin-top:14px">Ou répondez simplement « ok » à cet email.</div>
  </div>`
  const s = shell(inner, c)
  return { subject, preheader, html: s.html, unsub: s.unsub }
}

function buildC4(c) {
  const domain = domainFor(c)
  const pro = `https://${domain}/?pro=1&utm_source=email&utm_medium=b2b_cold&utm_campaign=c4`
  const subject = `Re: ${c.name} — l'état de vos plages`
  const preheader = `J'active votre essai 14 jours en 5 minutes, sans engagement.`
  const inner = `${brandHeader('Sargasses Pro', 'Juste au cas où', '')}
  <div style="background:#fff;padding:24px 20px">
    <div style="font-size:15px;color:#333;line-height:1.6">Bonjour,</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:10px">Mon précédent message est peut-être passé sous la pile. La saison sargasses bat son plein — c'est maintenant que le brief quotidien sert le plus.</div>
    <div style="font-size:15px;color:#333;line-height:1.6;margin-top:12px">Je peux activer votre <strong>essai 14 jours gratuit</strong> en 5 minutes, sans engagement. Je le lance ?</div>
    <div style="text-align:center;margin-top:18px">${cta('Activer mon essai', pro)}</div>
    <div style="font-size:13px;color:#666;margin-top:14px">Sinon, répondez « stop » et je ne vous écris plus.</div>
  </div>`
  const s = shell(inner, c)
  return { subject, preheader, html: s.html, unsub: s.unsub }
}

async function main() {
  console.log('=== B2B cold outreach (warmup) ===')
  const ready = SEND && mailReady()
  if (!ready) console.log(SEND ? 'SMTP_PASS manquant — dry-run.' : 'Dry-run (pas de --send).')
  const src = loadJSON(SRC_PATH, { contacts: [] })
  const contacts = src.contacts || []
  const sent = loadJSON(SENT_PATH, {})
  const bounced = new Set((loadJSON(BOUNCED_PATH, []) || []).map(e => String(e).includes('@') ? emailHash(e) : e))
  // Exclure les installeurs de widget : ils reçoivent le mail CHAUD dédié
  // (widget-convert.cjs) — pas de double contact.
  const widgetCfg = loadJSON(path.join(__dirname, 'data', 'widget-contacts.json'), { contacts: {} })
  const widgetEmails = new Set(Object.values(widgetCfg.contacts || {}).map(w => (w.email || '').trim().toLowerCase()).filter(Boolean))

  let newCount = 0, followCount = 0
  for (const c of contacts) {
    if (!c.email || !c.email.includes('@')) continue
    if (widgetEmails.has(c.email.trim().toLowerCase())) continue // → widget-convert.cjs
    const key = emailHash(c.email)
    if (bounced.has(key)) continue
    const rec = sent[key] || {}
    let step = null, built = null
    if (!rec.c0) {
      if (newCount >= CAP_NEW) continue            // warmup : plafond de nouveaux/run
      step = 'c0'; built = buildC0(c); newCount++
    } else if (!rec.c4 && daysSince(rec.c0) >= FOLLOWUP_DAYS) {
      step = 'c4'; built = buildC4(c); followCount++
    } else continue

    if (!ready) { console.log(`  ~ [${step}] ${logId(c.email)} ${c.name} — "${built.subject}"`); continue }
    const { data, error } = await sendEmail({ from: FROM, to: c.email, subject: built.subject, html: built.html, preheader: built.preheader, unsubUrl: built.unsub, replyTo: REPLY_TO })
    if (error) { console.log(`  x [${step}] ${logId(c.email)}: ${error.message}`); continue }
    console.log(`  + [${step}] ${logId(c.email)} ${c.name}`)
    rec[step] = new Date().toISOString()
    sent[key] = rec
    saveJSON(SENT_PATH, sent)
  }
  console.log(ready ? `\nEnvoyé : ${newCount} neufs + ${followCount} relances.` : `\nDry-run : ${newCount} neufs (cap ${CAP_NEW}) + ${followCount} relances.`)
}
main().catch(e => { console.error(e); process.exit(1) })
