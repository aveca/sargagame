#!/usr/bin/env node
/**
 * Incident apology — support automatisé pour les erreurs d'envoi.
 *
 * Mécanisme générique : data/incidents.json liste les incidents avec les
 * destinataires en HASH (SHA-256/32, RGPD — repo public, JAMAIS d'email en
 * clair ici). Ce script résout hash → email via subscribers.json (fetché du
 * Sheet en CI), envoie un court mot d'excuse localisé (FR/EN/ES selon île),
 * marque sent[hash] et s'arrête. Idempotent par hash : re-runs sans danger.
 *
 * Né le 2026-06-11 : boucle retry CI → drip J+3 envoyé ~17× à une abonnée.
 * Pour tout incident futur : ajouter une entrée à incidents.json, le
 * prochain run en fenêtre l'envoie. Aucune intervention manuelle.
 *
 * Fenêtre d'envoi 10-20 UTC (comme le verdict quotidien) : le cron 12:00 UTC
 * = 8h locale Antilles — jamais d'excuse à 2h du matin. --force pour bypass,
 * --dry-run pour prévisualiser.
 *
 * Env: RESEND_API_KEY (absent = dry-run implicite)
 */
const fs = require('fs')
const path = require('path')
const { Resend } = require('resend')
const { emailHash, logId } = require('./lib/email-hash.cjs')

const API_KEY = process.env.RESEND_API_KEY
const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry-run')
const INCIDENTS_PATH = path.join(__dirname, 'data', 'incidents.json')
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

const REGION_META = {
  MQ: { lang: 'fr', display: 'Sargasses Martinique', site: 'sargasses-martinique.com' },
  GP: { lang: 'fr', display: 'Sargasses Guadeloupe', site: 'sargasses-guadeloupe.com' },
  PUNTACANA: { lang: 'en', display: 'Sargassum Punta Cana', site: 'sargassumpuntacana.com' },
  FLORIDA: { lang: 'en', display: 'Sargassum Miami', site: 'sargassummiami.com' },
  RIVIERAMAYA: { lang: 'es', display: 'Sargazo Cancún', site: 'sargassumcancun.com' },
}

// Un seul type pour l'instant ; en ajouter ici si un autre genre d'incident arrive.
const TEMPLATES = {
  apology_duplicate_emails: {
    fr: {
      subject: 'Désolé pour les emails répétés — c\'était un bug, c\'est réparé',
      body: (meta) => `
        <p>Bonjour,</p>
        <p>Vous avez reçu plusieurs fois le même email de notre part. C'était un bug
        de notre automate d'envoi — pas un choix, et encore moins une stratégie.</p>
        <p>C'est réparé, et des protections ont été ajoutées pour que cela ne se
        reproduise plus. Vous n'avez rien à faire.</p>
        <p>Désolé pour le dérangement, et merci de votre patience.</p>
        <p>— L'équipe ${meta.display}</p>`,
    },
    en: {
      subject: 'Sorry about the repeated emails — it was a bug, now fixed',
      body: (meta) => `
        <p>Hi,</p>
        <p>You received the same email from us several times. That was a bug in our
        sending pipeline — not intentional.</p>
        <p>It is fixed, and safeguards are now in place so it cannot happen again.
        Nothing is needed on your side.</p>
        <p>Sorry for the noise, and thank you for your patience.</p>
        <p>— The ${meta.display} team</p>`,
    },
    es: {
      subject: 'Perdón por los correos repetidos — fue un error, ya está arreglado',
      body: (meta) => `
        <p>Hola,</p>
        <p>Recibió varias veces el mismo correo de nuestra parte. Fue un error de
        nuestro sistema de envío — no fue intencional.</p>
        <p>Ya está arreglado, con protecciones para que no vuelva a pasar.
        No necesita hacer nada.</p>
        <p>Perdón por las molestias y gracias por su paciencia.</p>
        <p>— El equipo de ${meta.display}</p>`,
    },
  },
}

const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const unsubUrl = (email, island) => `${WEBHOOK_URL}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`

function wrapHTML(bodyHtml, email, island, meta) {
  const unsubTxt = { fr: 'Se désinscrire', en: 'Unsubscribe', es: 'Darse de baja' }[meta.lang]
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a2b3c;font-size:15px;line-height:1.6">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e5e9ee;margin:24px 0 12px">
    <p style="font-size:12px;color:#8a97a5">${meta.site} · <a href="${unsubUrl(email, island)}" style="color:#8a97a5">${unsubTxt}</a></p>
  </div>`
}

async function trackToSheet(data) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email_tracking', ...data, date: new Date().toISOString() }),
    })
  } catch {}
}

async function main() {
  console.log('=== Incident Apology ===')
  const incidents = loadJSON(INCIDENTS_PATH, [])
  const pending = incidents.filter(i => (i.recipients || []).some(h => !(i.sent || {})[h]))
  if (!pending.length) { console.log('No pending incident recipients.'); return }

  // Fenêtre humaine (cf. daily verdict) : 12:00 UTC = 8h locale Antilles.
  const utcH = new Date().getUTCHours()
  if (!FORCE && !DRY && (utcH < 10 || utcH > 20)) {
    console.log(`Outside send window (${utcH}h UTC, window 10-20) — skipping WITHOUT marking.`)
    return
  }

  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  if (!subscribers.length) { console.log('No subscribers.json — skipping without marking.'); return }
  const byHash = new Map(subscribers.map(s => [emailHash(s.email), s]))
  const resend = API_KEY && !DRY ? new Resend(API_KEY) : null
  let sent = 0

  for (const inc of pending) {
    inc.sent = inc.sent || {}
    const tpl = TEMPLATES[inc.type]
    if (!tpl) { console.log(`  ? incident ${inc.id}: unknown type ${inc.type}`); continue }
    for (const h of inc.recipients) {
      if (inc.sent[h]) continue
      const sub = byHash.get(h)
      if (!sub) { console.log(`  ? ${inc.id}: hash ${h.slice(0, 8)}… not in subscribers (stays pending)`); continue }
      const island = (sub.island || 'MQ').toUpperCase()
      const meta = REGION_META[island] || REGION_META.MQ
      const t = tpl[meta.lang] || tpl.fr
      const from = `${meta.display} <alerte@sargasses-martinique.com>`
      const html = wrapHTML(t.body(meta), sub.email, island, meta)
      if (!resend) {
        console.log(`  ~ [${DRY ? 'dry' : 'no key'}] ${logId(sub.email)} (${island}, ${meta.lang}) « ${t.subject} »`)
        continue
      }
      try {
        const { data, error } = await resend.emails.send({
          from, to: sub.email, subject: t.subject, html,
          headers: {
            'List-Unsubscribe': `<${unsubUrl(sub.email, island)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
        if (error) { console.log(`  x ${logId(sub.email)}: ${error.message}`); continue }
        inc.sent[h] = new Date().toISOString()
        sent++
        console.log(`  + ${logId(sub.email)} (${island}) — incident ${inc.id}`)
        await trackToSheet({ resend_id: data?.id || '', to: sub.email, subject: t.subject, email_type: 'incident_apology', island, status: 'sent', source: inc.id })
      } catch (e) { console.log(`  x ${logId(sub.email)}: ${e.message}`) }
    }
  }

  if (sent) fs.writeFileSync(INCIDENTS_PATH, JSON.stringify(incidents, null, 2), 'utf-8')
  console.log(`Done. ${sent} apology email(s) sent.`)
}

main().catch(e => { console.error(e); process.exit(1) })
