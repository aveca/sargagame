#!/usr/bin/env node
/**
 * Welcome Email — Sargasses MQ/GP (via SMTP, boîte alerte@)
 *
 * Runs 4x/day in the pipeline. Checks a local JSON file for emails
 * that haven't received a welcome email yet. Sends via SMTP (nodemailer).
 *
 * The email list comes from the Apps Script webhook which POSTs new
 * subscriber data back to the repo (via daily pipeline commit).
 *
 * Env: SMTP_PASS (required pour envoyer ; absent = dry-run)
 * Usage: node scripts/automation/welcome-email.cjs
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')
const { pickArm, applyArm } = require('./lib/email-ab.cjs')
const AB_VARS = require('./data/email-ab-variants.json')

const API_KEY = mailReady() // envoi via SMTP (boîte alerte@) — plus de Resend
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const SENT_PATH = path.join(__dirname, 'data', 'welcome-sent.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
// Leads PRO (formulaires /pro/*) : exclus du welcome grand public — ils ont leur
// propre séquence (drip-b2b-email.cjs). Un hôtel ne doit JAMAIS recevoir l'offre 4,99 €.
const B2B_SOURCES = new Set(['b2b_hotel_request', 'b2b_collectivite_request'])
// Sources de CAPTURE qui DÉBLOQUENT réellement 7j premium côté front (rang 1 :
// capture-gate + gap_freemium posent sg_premium_pass_end). Le welcome leur CONFIRME
// l'accès actif + le verdict du matin (qu'ils reçoivent désormais — cf. DAILY_SOURCES
// dans drip-email.cjs). Les autres sources gardent le welcome générique.
const PREMIUM_CAPTURE_SOURCES = new Set(['capture-gate', 'gap_freemium'])

// From address — GP uses MQ verified domain (free plan = 1 domain)
const FROM_MQ = 'Sargasses Martinique <alerte@sargasses-martinique.com>'
const FROM_GP = 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>'
// Nouvelles régions : même domaine vérifié MQ (Resend free = 1 domaine), display name régional.
const { getAllRegions } = require('../../regions/index.cjs')
const NEW_REGIONS = Object.fromEntries(
  getAllRegions().filter(r => r.id !== 'mq' && r.id !== 'gp').map(r => [r.id.toUpperCase(), r])
)
const UNSUB_BASE = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
function unsubUrl(email, island) { return `${UNSUB_BASE}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}` }

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}
function saveJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}
// RGPD : l'état persisté ne contient que des hashes. Toute entrée legacy
// contenant '@' est hashée en mémoire (le fichier sera réécrit hashé au prochain save).
function hashedSet(arr) {
  return new Set((Array.isArray(arr) ? arr : []).map(e => String(e).includes('@') ? emailHash(e) : e))
}

function buildWelcomeHTML(island, cleanCount, email, source) {
  const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
  const domain = island === 'MQ' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
  // 2026-06-17 — checkout ON-SITE (essai retiré, plus de buy.stripe.com) : le CTA
  // email ouvre le paywall on-site via ?paywall=1 (deep-link App → openPremium).
  const stripe = `https://${domain}/?paywall=1&utm_source=email&utm_medium=welcome&utm_campaign=sargasses`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">

  ${brandHeader('Bienvenue parmi nous', `Sargasses ${name}`, 'Le Veilleur surveille l’Atlantique pour toi. Fini les mauvaises surprises.')}

  <div style="background:#fff;padding:24px 20px">
    ${PREMIUM_CAPTURE_SOURCES.has(source) ? `<div style="text-align:center;margin-bottom:18px;padding:14px 16px;background:rgba(255,199,44,.12);border:1px solid rgba(232,168,0,.35);border-radius:12px">
      <div style="font-size:14px;font-weight:800;color:#0D0D0D">✅ Tes 7 jours premium sont actifs</div>
      <div style="font-size:12.5px;color:#686868;line-height:1.45;margin-top:4px">Le verdict du matin — ta meilleure plage du jour — arrive chaque matin dans ta boîte. Prévision 7 jours + alertes dans l'app.</div>
    </div>` : ''}
    ${cleanCount > 0 ? `<div style="text-align:center;margin-bottom:20px;padding:16px;background:rgba(34,197,94,.06);border-radius:12px">
      <div style="font-size:32px;font-weight:800;color:#16A34A">${cleanCount}</div>
      <div style="font-size:13px;color:#686868;margin-top:2px">plages propres en ce moment en ${name}</div>
    </div>` : ''}

    <div style="font-size:14px;color:#444;line-height:1.5;margin-bottom:18px">
      Tu viens de rejoindre les habitants de ${name} protégés par le Veilleur. Voici ce que tu vas recevoir :
    </div>

    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:10px 0;vertical-align:top;width:30px;font-size:18px">\u{1F4E8}</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Bulletin du vendredi</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">Chaque semaine, les plages propres pour ton weekend. Direct dans ta bo\u00EEte.</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F5FA}\uFE0F</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Carte live</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">V\u00E9rifie n\u2019importe quelle plage en 5 secondes avant d\u2019y aller.</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F6F0}\uFE0F</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">Donn\u00E9es satellite</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">Mises \u00E0 jour 4\u00D7/jour. Pas du pifom\u00E8tre, des vraies images Copernicus.</div></td></tr>
    </table>

    <div style="margin-top:22px;text-align:center">
      <a href="https://${domain}" style="display:inline-block;padding:15px 36px;
        background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
        color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;
        box-shadow:0 4px 16px rgba(232,168,0,.3)">Voir la carte maintenant</a>
    </div>
  </div>

  <div style="background:linear-gradient(145deg,#0D1E1C,#0A1714);padding:22px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Pour aller plus loin</div>
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px">Sache samedi d\u00E8s lundi</div>
    <div style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:14px;line-height:1.5">
      Pr\u00E9visions 7 jours + alertes push.<br>Planifie tes sorties plage sans stress.
    </div>
    <a href="${stripe}" style="display:inline-block;padding:11px 26px;
      background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700">Activer mon veilleur</a>
    <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:8px">4,99\u00A0\u20AC/mois \u00B7 Satisfait ou rembours\u00E9 30 jours \u00B7 Annule en 1 clic</div>
  </div>

  <div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    Sargasses ${name} \u00B7 ${domain}<br>
    <a href="${unsubUrl(email, island)}" style="color:#999">Se d\u00E9sabonner</a>
  </div>
</div>
</body>
</html>`
}

// Welcome HTML des nouvelles régions — même gabarit visuel, strings EN/ES.
// Pas de promesse de bulletin hebdo (email-weekend est MQ/GP-only pour l'instant).
function buildWelcomeHTMLRegion(region, cleanCount, email) {
  const es = region.primaryLang === 'es'
  const name = region.name
  const domain = region.domain
  const stripe = region.paymentLinks && region.paymentLinks.monthly
  const monthly = (region.pricing && region.pricing.monthly) || '$9.99'
  const t = es ? {
    kicker: 'Bienvenido a bordo',
    brand: `Sargazo ${name}`,
    tagline: 'Se acabaron las sorpresas al llegar a la playa.',
    cleanLabel: `playas sin sargazo ahora mismo en ${name}`,
    intro: `Acabas de unirte a quienes verifican la playa antes de salir. Esto es lo que recibes:`,
    f1t: 'Mapa en vivo', f1d: 'Verifica cualquier playa en 5 segundos antes de ir.',
    f2t: 'Datos satelitales', f2d: 'Actualizados 4 veces al día con imágenes reales de satélite.',
    f3t: 'Beach Score 0-100', f3d: 'Sargazo, oleaje, viento y sol combinados en una sola nota por playa.',
    cta: 'Ver el mapa ahora',
    upKicker: 'Para ir más lejos', upTitle: 'Sabe el sábado desde el lunes',
    upDesc: 'Pronóstico de 7 días + alertas push.<br>Planifica tus días de playa sin estrés.',
    upCta: 'Activar mi vigía',
    upFoot: `${monthly}/mes · Sin permanencia · Cancela en 1 clic`,
    unsub: 'Darse de baja',
  } : {
    kicker: 'Welcome aboard',
    brand: `Sargassum ${name}`,
    tagline: 'No more nasty surprises when you reach the beach.',
    cleanLabel: `sargassum-free beaches right now in ${name}`,
    intro: `You just joined the people who check the beach before heading out. Here's what you get:`,
    f1t: 'Live map', f1d: 'Check any beach in 5 seconds before you go.',
    f2t: 'Satellite data', f2d: 'Updated 4 times a day from real satellite imagery.',
    f3t: 'Beach Score 0-100', f3d: 'Sargassum, swell, wind and sun blended into one score per beach.',
    cta: 'See the map now',
    upKicker: 'Go further', upTitle: 'Know Saturday by Monday',
    upDesc: '7-day forecast + push alerts.<br>Plan your beach days stress-free.',
    upCta: 'Activate my watcher',
    upFoot: `${monthly}/month · No commitment · Cancel anytime`,
    unsub: 'Unsubscribe',
  }
  const island = region.id.toUpperCase()
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">

  ${brandHeader(t.kicker, t.brand, t.tagline)}

  <div style="background:#fff;padding:24px 20px">
    ${cleanCount > 0 ? `<div style="text-align:center;margin-bottom:20px;padding:16px;background:rgba(34,197,94,.06);border-radius:12px">
      <div style="font-size:32px;font-weight:800;color:#16A34A">${cleanCount}</div>
      <div style="font-size:13px;color:#686868;margin-top:2px">${t.cleanLabel}</div>
    </div>` : ''}

    <div style="font-size:14px;color:#444;line-height:1.5;margin-bottom:18px">${t.intro}</div>

    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:10px 0;vertical-align:top;width:30px;font-size:18px">\u{1F5FA}️</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">${t.f1t}</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">${t.f1d}</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F6F0}️</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">${t.f2t}</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">${t.f2d}</div></td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;font-size:18px">\u{1F3C6}</td>
        <td style="padding:10px 0"><div style="font-size:13px;font-weight:700;color:#0D0D0D">${t.f3t}</div>
        <div style="font-size:12px;color:#686868;line-height:1.4">${t.f3d}</div></td></tr>
    </table>

    <div style="margin-top:22px;text-align:center">
      <a href="https://${domain}" style="display:inline-block;padding:15px 36px;
        background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
        color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;
        box-shadow:0 4px 16px rgba(232,168,0,.3)">${t.cta}</a>
    </div>
  </div>

  ${stripe ? `<div style="background:linear-gradient(145deg,#0D1E1C,#0A1714);padding:22px 24px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#E8A800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${t.upKicker}</div>
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px">${t.upTitle}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:14px;line-height:1.5">${t.upDesc}</div>
    <a href="${stripe}" style="display:inline-block;padding:11px 26px;
      background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);
      color:#0D0D0D;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700">${t.upCta}</a>
    <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:8px">${t.upFoot}</div>
  </div>` : ''}

  <div style="background:#fff;border-radius:0 0 16px 16px;text-align:center;padding:16px;font-size:10px;color:#999">
    ${t.brand} · ${domain}<br>
    <a href="${unsubUrl(email, island)}" style="color:#999">${t.unsub}</a>
  </div>
</div>
</body>
</html>`
}

// Plages propres d'une nouvelle région (levels du sargassum.json régional).
function regionCleanCount(region) {
  const p = path.join(__dirname, `../../public/api/copernicus/${region.id}/sargassum.json`)
  const d = loadJSON(p, {})
  return Array.isArray(d.levels) ? d.levels.filter(l => l.status === 'clean').length : 0
}

async function main() {
  console.log('=== Welcome Email (SMTP) ===')

  const resend = API_KEY ? {} : null

  // Load subscriber list and already-sent list (state files store email hashes — RGPD)
  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  const sentSet = hashedSet(loadJSON(SENT_PATH, []))
  const bouncedSet = hashedSet(loadJSON(BOUNCED_PATH, []))

  // Find new subscribers not yet welcomed (skip bounced) — compare by hash
  const newSubs = subscribers.filter(s => s.email && !B2B_SOURCES.has(s.source) && !sentSet.has(emailHash(s.email)) && !bouncedSet.has(emailHash(s.email)))
  const alreadySent = subscribers.filter(s => s.email && sentSet.has(emailHash(s.email))).length
  console.log(`Subscribers: ${subscribers.length} | already welcomed: ${alreadySent} | new: ${newSubs.length}`)

  if (!newSubs.length) {
    console.log('No new subscribers to welcome.')
    return
  }

  if (!API_KEY) {
    console.log(`SMTP_PASS not set — skipping sends (would send ${newSubs.length}).`)
    return
  }

  console.log(`Found ${newSubs.length} new subscriber(s) to welcome`)

  // Get clean beach count for the email
  const sargData = loadJSON(SARG_PATH, {})
  const beaches = loadJSON(BEACHES_PATH, [])

  for (const sub of newSubs) {
    const island = (sub.island || 'MQ').toUpperCase()
    const newRegion = NEW_REGIONS[island] || null

    let from, subjectLine, htmlBody, preheader
    if (newRegion) {
      // Nouvelle r\u00E9gion : sender via domaine MQ v\u00E9rifi\u00E9, contenu EN/ES.
      const cleanCount = regionCleanCount(newRegion)
      const es = newRegion.primaryLang === 'es'
      from = `${es ? 'Sargazo' : 'Sargassum'} ${newRegion.name} <alerte@sargasses-martinique.com>`
      subjectLine = es
        ? (cleanCount > 0 ? `${cleanCount} playas sin sargazo en ${newRegion.name} \u2014 tu mapa est\u00E1 listo` : `Bienvenido \u2014 tu mapa de sargazo de ${newRegion.name} est\u00E1 listo`)
        : (cleanCount > 0 ? `${cleanCount} sargassum-free beaches in ${newRegion.name} \u2014 your map is ready` : `Welcome \u2014 your ${newRegion.name} sargassum map is ready`)
      htmlBody = buildWelcomeHTMLRegion(newRegion, cleanCount, sub.email)
      preheader = es
        ? `Tu mapa de playas en vivo, actualizado 4×/día — mira cualquier playa en 5 segundos.`
        : `Your live beach map, updated 4×/day — check any beach in 5 seconds.`
    } else {
      const islandBeaches = beaches.filter(b => b.island === island.toLowerCase())
      const cleanCount = islandBeaches.filter(b => b.status === 'clean').length
      from = island === 'GP' ? FROM_GP : FROM_MQ
      const name = island === 'MQ' ? 'Martinique' : 'Guadeloupe'
      subjectLine = cleanCount > 0 ? `${cleanCount} plages propres en ${name} \u2014 ta carte est pr\u00EAte` : `Bienvenue \u2014 ta carte sargasses ${name} est pr\u00EAte`
      htmlBody = buildWelcomeHTML(island, cleanCount, sub.email, sub.source)
      preheader = `Ta carte des plages en direct, mise \u00E0 jour 4\u00D7/jour \u2014 et le bon plan plage chaque vendredi.`
    }

    // A/B email (subject + preheader — levier #1, body/html = control intact)
    const _isEs = newRegion && newRegion.primaryLang === 'es'
    const abTestKey = newRegion
      ? (_isEs ? 'em_welcome_es_v1' : 'em_welcome_en_v1')
      : 'em_welcome_fr_v1'
    const abVarKey = newRegion ? (_isEs ? 'welcome.es' : 'welcome.en') : 'welcome.fr'
    const abArm = pickArm(abTestKey, sub.email)
    const abOut = applyArm(abArm, { subject: subjectLine, preheader }, AB_VARS[abVarKey]?.ship)

    try {
      const unsub = unsubUrl(sub.email, island)
      const { data, error } = await sendEmail(resend, {
        from,
        to: sub.email,
        subject: abOut.subject,
        html: htmlBody,
        preheader: abOut.preheader,
        unsubUrl: unsub,
      })

      if (error) {
        console.log(`  ❌ ${logId(sub.email)}: ${error.message}`)
      } else {
        console.log(`  ✅ ${logId(sub.email)} (${island})`)
        sentSet.add(emailHash(sub.email))
        saveJSON(SENT_PATH, [...sentSet]) // flush incrémental : un crash/retry mid-run ne re-welcome JAMAIS un lead déjà servi
        // Track to Google Sheet
        try {
          await fetch('https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'email_tracking', resend_id: data?.id || '', to: sub.email,
              subject: abOut.subject, email_type: 'welcome', island,
              ab_test: abTestKey, ab_arm: abArm,
              status: 'sent', source: sub.source || '', date: new Date().toISOString()
            })
          })
        } catch {}
      }
    } catch (e) {
      console.log(`  ❌ ${logId(sub.email)}: ${e.message}`)
    }
  }

  // Save updated sent list
  saveJSON(SENT_PATH, [...sentSet])
  console.log('Done.')
}

main().catch(e => console.error(e))
