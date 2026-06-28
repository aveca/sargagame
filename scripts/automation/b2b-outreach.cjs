#!/usr/bin/env node
/**
 * b2b-outreach.cjs — Prospection B2B sortante (hôtels / clubs de plage /
 * offices de tourisme / mairies littorales MQ + GP).
 *
 * Objectif : un PREMIER contact consultatif, à FAIBLE VOLUME, qui propose
 * « l'état réel de VOS plages chaque matin » pour rassurer leurs clients /
 * administrés. Pas de séquence de relance automatisée sur du froid (anti-spam) —
 * UN seul email par établissement, opt-out clair, le fondateur prend le relais
 * sur les réponses (la conversion B2B est humaine).
 *
 * Pipeline (calqué sur auto-outreach.cjs, mêmes garde-fous) :
 *   1. Découvre des cibles B2B via Google News RSS (requêtes hôtellerie/littoral)
 *   2. Trouve l'email de contact public sur le site
 *   3. Envoie 1 email consultatif via SMTP (lib/email-send.cjs, boîte alerte@ — PAS Resend ; opt-out + reply-to humain)
 *   4. Log dédupliqué (RGPD : hash, jamais d'email en clair)
 *
 * Sécurité :
 *   - DRY_RUN par défaut si pas de SMTP_PASS (rien n'est envoyé)
 *   - MAX 4 emails / run (protège la réputation du domaine)
 *   - dédup par domaine, ET cross-dédup avec outreach-log.json (jamais
 *     re-contacter un domaine déjà touché par l'outreach backlink)
 *   - opt-out dans chaque email + header List-Unsubscribe
 *   - tonalité pro, valeur réelle, zéro push prix
 *
 * Base légale (prospection B2B FR/RGPD) : intérêt légitime, contact pro en
 * rapport direct avec l'activité (gestion de plage / tourisme), opt-out immédiat.
 *
 * Usage :
 *   DRY_RUN=1 node scripts/automation/b2b-outreach.cjs   # simulation
 *   node scripts/automation/b2b-outreach.cjs             # live (si SMTP_PASS)
 */
'use strict'

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail: sendMail, mailReady } = require('./lib/email-send.cjs')

const DRY_RUN = process.env.DRY_RUN === '1'
const MAX_EMAILS_PER_RUN = 4

const DATA_DIR = resolve(__dirname, 'data')
const B2B_LOG = resolve(DATA_DIR, 'b2b-outreach-log.json')
const BACKLINK_LOG = resolve(DATA_DIR, 'outreach-log.json') // cross-dédup
const FROM = 'Sargasses Pro <alerte@sargasses-martinique.com>'
const REPLY_TO = 'alerte@sargasses-martinique.com'
const UNSUB = 'mailto:alerte@sargasses-martinique.com?subject=STOP'

// Requêtes de découverte B2B (rotation 1/run). On vise l'hôtellerie de bord de
// mer et les acteurs littoraux — PAS les blogs voyage (= cible de l'outreach
// backlink, traitée séparément).
const QUERIES = [
  'hôtel bord de mer martinique plage',
  'hôtel guadeloupe plage front de mer',
  'club de plage martinique sargasses',
  'office de tourisme commune littoral guadeloupe',
  'résidence hôtelière plage martinique',
  'camping bord de mer guadeloupe plage',
]

// Domaines à NE JAMAIS contacter (nous-mêmes, plateformes, agrégateurs géants
// sans interlocuteur pertinent).
const BLOCK = [
  'sargasses-martinique', 'sargasses-guadeloupe', 'sargassummiami',
  'sargassumpuntacana', 'sargassumcancun',
  'booking.com', 'tripadvisor', 'airbnb', 'expedia', 'google.', 'facebook.',
  'youtube.', 'instagram.', 'wikipedia.', 'gov.uk', 'amazon.',
]

function readJSON(p) { if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null } }
function writeJSON(p, data) { mkdirSync(resolve(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8') }
function extractDomain(url) { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }
function emailDomain(e) { const at = String(e).lastIndexOf('@'); return at > -1 ? String(e).slice(at + 1).trim().toLowerCase() : '' }
function blocked(domain) { return !domain || BLOCK.some(b => domain.includes(b)) }

function islandOf(domain, url) {
  const s = (domain + ' ' + url).toLowerCase()
  if (s.includes('guadeloupe') || s.includes('gwada') || s.includes('gp')) return 'gp'
  return 'mq' // défaut Martinique
}

// ── Découverte ────────────────────────────────────────────────
async function discoverTargets() {
  const q = QUERIES[Math.floor(Date.now() / 86400000) % QUERIES.length]
  const out = []
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const xml = await res.text()
    const re = /<link>(https?:\/\/[^<]+)<\/link>/g
    let m
    while ((m = re.exec(xml)) !== null) {
      const link = m[1]
      if (link.includes('news.google.com')) continue
      const domain = extractDomain(link)
      if (blocked(domain)) continue
      out.push({ domain, url: link, query: q, island: islandOf(domain, link) })
    }
  } catch (e) { console.warn(`  Découverte échouée: ${e.message}`) }
  // dédup intra-run par domaine
  const seen = new Set(); return out.filter(t => !seen.has(t.domain) && seen.add(t.domain))
}

// ── Contact email (réutilise la logique d'auto-outreach) ──────
async function findContactEmail(siteUrl) {
  const domain = extractDomain(siteUrl)
  const paths = ['/contact', '/contact/', '/contactez-nous', '/nous-contacter', '/a-propos', '/mentions-legales']
  for (const path of paths) {
    try {
      const res = await fetch(`https://www.${domain}${path}`, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }, redirect: 'follow' })
      if (!res.ok) continue
      const e = extractEmails(await res.text(), domain); if (e.length) return e[0]
    } catch { /* next */ }
  }
  try {
    const res = await fetch(siteUrl, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }, redirect: 'follow' })
    if (res.ok) { const e = extractEmails(await res.text(), domain); if (e.length) return e[0] }
  } catch { /* next */ }
  return null // pas de pattern deviné en B2B : on n'envoie qu'à un email RÉEL trouvé
}

function extractEmails(html, domain) {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const found = new Set(); let m
  while ((m = re.exec(html)) !== null) {
    const e = m[0].toLowerCase()
    // Faux positifs : domaines tech + assets image/srcset. Le motif retina
    // `@2x.`/`@3x.` (ex. `logo@2x.webp`, `ile@2x.webp`) matchait la regex email
    // → on l'exclut, + toutes les extensions d'asset (webp/svg/avif… manquaient).
    if (/example\.com|sentry\.io|w3\.org|schema\.org|googleusercontent|wixpress|@\d+x\.|\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|css|js)$/.test(e)) continue
    found.add(e)
  }
  // priorité : contact@ > reservation@ > info@ > accueil@ > mairie@ > même domaine
  const score = e => e.startsWith('contact@') ? 0 : e.startsWith('reservation') ? 1 : e.startsWith('info@') ? 2 : e.startsWith('accueil@') ? 3 : e.startsWith('mairie@') ? 4 : emailDomain(e).includes(domain) ? 5 : 9
  return [...found].sort((a, b) => score(a) - score(b))
}

// ── Email consultatif (région/langue-aware) ──────────────────────────────────
// Les cibles US (florida/puntacana = EN, rivieramaya = ES) ne doivent PAS recevoir
// le copy FR Martinique. Mapping island → {site, region, lang}.
const B2B_REGION = {
  mq:          { site: 'sargasses-martinique.com', region: 'Martinique', lang: 'fr' },
  gp:          { site: 'sargasses-guadeloupe.com', region: 'Guadeloupe', lang: 'fr' },
  florida:     { site: 'sargassummiami.com',       region: 'Florida',    lang: 'en' },
  puntacana:   { site: 'sargassumpuntacana.com',   region: 'Punta Cana', lang: 'en' },
  rivieramaya: { site: 'sargassumcancun.com',      region: 'Riviera Maya', lang: 'es' },
}
function b2bMeta(target) { return B2B_REGION[target.island] || B2B_REGION.mq }

function buildSubject(target) {
  const { lang } = b2bMeta(target)
  if (lang === 'en') return `The real state of your beaches — measured by satellite, every morning`
  if (lang === 'es') return `El estado real de tus playas — medido por satélite, cada mañana`
  return `L'état réel de vos plages — mesuré au satellite, chaque matin`
}

function buildEmailHTML(target) {
  const { site, region, lang } = b2bMeta(target)
  if (lang === 'en') {
    return `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>Hello,</p>
<p>A seaweed-covered beach one morning means a let-down guest, sometimes a sour review, sometimes a refund — and you often find out at the same time they do. "Is there sargassum, right now?" is the question that keeps coming, and answering it fast changes the day.</p>
<p>I'm writing from Martinique: <strong>The Watchman</strong> is an independent project that reads the real state of ${region}'s beaches <strong>measured by satellite</strong> (Copernicus Marine, per-beach AFAI index), never guessed — with a 7-day forecast and an alert <em>before</em> sargassum lands. The same satellite that watches for the traveler can watch your shore.</p>
<p>For a property like yours, concretely:</p>
<ul>
  <li>a <strong>morning brief</strong> on the state of your nearest beaches;</li>
  <li>an <strong>alert</strong> before an influx, to get ahead of it with your guests;</li>
  <li><strong>dated data to answer with</strong> instead of guesswork.</li>
</ul>
<p>And you don't have to take our word for it: our reliability is <strong>published and auditable, by regime</strong>. Over the May 30 – June 28 window, 100% of our "clean water" forecasts proved correct (2,274 comparisons, calm season); across all regimes we run around 76% accuracy, and the rare calm-season alerts are shown as low-confidence. When we miss, we write it down.</p>
<p><strong>See your beaches live, right now</strong>: <a href="https://${site}/">${site}</a> — satellite map, 7-day forecast, free.</p>
<p>A coastal watch dedicated to your property is in the works. If that resonates, <strong>just reply to this email — let's talk</strong>: I'll walk you through your beaches first.</p>
<p>Best,<br>
<strong>The Watchman team · Sargassum ${region}</strong><br>
<span style="color:#888;font-size:13px">Copernicus Marine satellite data · ${site}</span></p>
<hr style="border:none;border-top:1px solid #eee;margin:18px 0">
<p style="color:#999;font-size:12px">Professional message sent to a public contact related to coastal/tourism activity. To stop being contacted, reply <strong>STOP</strong> to this email — it's immediate and permanent.</p>
</body></html>`
  }
  if (lang === 'es') {
    return `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>Hola,</p>
<p>Una playa cubierta de sargazo una mañana es un huésped decepcionado, a veces una reseña amarga, a veces un reembolso — y suele enterarse usted al mismo tiempo que él. La pregunta "¿hay sargazo, ahora mismo?" no para, y responderla rápido cambia el día.</p>
<p>Le escribo desde Martinica: <strong>El Vigía</strong> es un proyecto independiente que lee el estado real de las playas de ${region} <strong>medido por satélite</strong> (Copernicus Marine, índice AFAI por playa), nunca estimado — con un pronóstico a 7 días y una alerta <em>antes</em> de que llegue el sargazo. El mismo satélite que vigila para el viajero puede vigilar su costa.</p>
<p>En concreto para un establecimiento como el suyo:</p>
<ul>
  <li>un <strong>resumen cada mañana</strong> del estado de sus playas más cercanas;</li>
  <li>una <strong>alerta</strong> antes de una llegada, para anticiparse con sus huéspedes;</li>
  <li><strong>datos con fecha para responder</strong> en vez de adivinar.</li>
</ul>
<p>Y no tiene que creernos: nuestra fiabilidad está <strong>publicada y es auditable, por régimen</strong>. En la ventana del 30 de mayo al 28 de junio, el 100% de nuestros pronósticos de "agua limpia" se confirmaron (2.274 comparaciones, temporada tranquila); en todos los regímenes rondamos el 76% de acierto, y las raras alertas de temporada tranquila se muestran como baja confianza. Cuando nos equivocamos, lo escribimos.</p>
<p><strong>Vea sus playas en vivo, ahora</strong>: <a href="https://${site}/">${site}</a> — mapa satelital, pronóstico 7 días, gratis.</p>
<p>Una vigilancia costera dedicada a su establecimiento está en construcción. Si le interesa, <strong>responda a este correo — hablémoslo</strong>: primero le muestro sus playas.</p>
<p>Un saludo,<br>
<strong>El equipo El Vigía · Sargazo ${region}</strong><br>
<span style="color:#888;font-size:13px">Datos satelitales Copernicus Marine · ${site}</span></p>
<hr style="border:none;border-top:1px solid #eee;margin:18px 0">
<p style="color:#999;font-size:12px">Mensaje profesional dirigido a un contacto público vinculado a la actividad costera/turística. Para dejar de recibir contacto, responda <strong>STOP</strong> a este correo — es inmediato y definitivo.</p>
</body></html>`
  }
  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>Bonjour,</p>
<p>Une plage envahie un matin, c'est un client déçu, parfois un avis amer, parfois un remboursement — et vous l'apprenez souvent en même temps que lui. La question « est-ce qu'il y a des sargasses, là, maintenant ? » revient sans cesse, et y répondre vite change la journée.</p>
<p>Je vous écris depuis la Martinique : <strong>Le Veilleur</strong> est un projet indépendant qui lit l'état réel des plages de ${region} <strong>mesuré au satellite</strong> (Copernicus Marine, indice AFAI par plage), jamais deviné — avec une prévision à 7 jours et une alerte <em>avant</em> que les sargasses arrivent. Le même satellite qui veille pour le voyageur peut veiller votre rivage.</p>
<p>Concrètement pour un établissement comme le vôtre :</p>
<ul>
  <li>un <strong>brief chaque matin</strong> de l'état de vos plages les plus proches ;</li>
  <li>une <strong>alerte</strong> avant un échouage, pour anticiper auprès de vos clients ;</li>
  <li>de quoi <strong>répondre avec une donnée datée</strong> plutôt qu'au doigt mouillé.</li>
</ul>
<p>Et on ne vous demande pas de nous croire : notre fiabilité est <strong>publiée et auditable, par régime</strong>. Sur la fenêtre du 30 mai au 28 juin, 100 % de nos prévisions « mer propre » se sont vérifiées (2 274 comparaisons, saison calme) ; tous régimes confondus on tourne autour de 76 % de justesse, et les rares alertes de saison calme sont affichées en faible confiance. On se trompe parfois, on l'écrit.</p>
<p><strong>Voyez l'état de vos plages en direct, maintenant</strong> : <a href="https://${site}/">${site}</a> — carte satellite, prévision 7 jours, gratuit.</p>
<p>Une veille côtière dédiée à votre établissement est en cours de construction. Si l'idée vous parle, <strong>répondez à cet email — parlons-en</strong> : je vous montre vos plages avant d'aller plus loin.</p>
<p>Bien à vous,<br>
<strong>L'équipe Le Veilleur · Sargasses ${region}</strong><br>
<span style="color:#888;font-size:13px">Données satellite Copernicus Marine · ${site}</span></p>
<hr style="border:none;border-top:1px solid #eee;margin:18px 0">
<p style="color:#999;font-size:12px">Message professionnel adressé à un contact public en lien avec l'activité littorale/touristique. Pour ne plus être contacté·e, répondez <strong>STOP</strong> à cet email — c'est immédiat et définitif.</p>
</body></html>`
}

async function sendEmail(resend, to, target) {
  const subject = buildSubject(target)
  const html = buildEmailHTML(target)
  if (DRY_RUN || !resend) {
    console.log(`  [DRY RUN] → ${logId(to)} | sujet: ${subject}`)
    return { sent: true, dry: true }
  }
  try {
    const { data, error } = await sendMail({
      from: FROM, to, subject, html, replyTo: REPLY_TO, unsubUrl: UNSUB,
    })
    if (error) { console.error(`  Échec: ${error.message}`); return { sent: false, error: error.message } }
    console.log(`  Envoyé → ${logId(to)} (id: ${data?.id})`)
    return { sent: true, id: data?.id }
  } catch (e) { console.error(`  Erreur: ${e.message}`); return { sent: false, error: e.message } }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`=== B2B Outreach ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`${new Date().toISOString()}\n`)
  if (!mailReady() && !DRY_RUN) { console.log('SMTP_PASS absent → rien envoyé (set DRY_RUN=1 pour simuler).'); return }
  const resend = mailReady() ? {} : null

  const log = readJSON(B2B_LOG) || { contacted: {}, lastRun: null, totalSent: 0 }
  const contacted = log.contacted || {}
  const backlink = (readJSON(BACKLINK_LOG) || {}).contacted || {} // cross-dédup

  console.log('--- Découverte des cibles ---')
  const discovered = await discoverTargets()
  // + cibles curées (data/b2b-targets.json) : liste de homepages B2B réelles
  // (hôtels, clubs, offices, mairies littorales). Format : [{url,island?}] ou ["https://..."].
  const seedRaw = readJSON(resolve(DATA_DIR, 'b2b-targets.json')) || []
  const seed = (Array.isArray(seedRaw) ? seedRaw : seedRaw.targets || [])
    .map(x => (typeof x === 'string' ? { url: x } : x))
    .filter(x => x && x.url)
    .map(x => { const domain = extractDomain(x.url); return { domain, url: x.url, island: x.island || islandOf(domain, x.url), query: 'seed' } })
    .filter(x => x.domain && !blocked(x.domain))
  const byDomain = new Map()
  for (const t of [...seed, ...discovered]) if (!byDomain.has(t.domain)) byDomain.set(t.domain, t)
  const found = [...byDomain.values()]
  console.log(`  ${discovered.length} via découverte + ${seed.length} curées = ${found.length} uniques`)
  const fresh = found.filter(t => !contacted[t.domain] && !backlink[t.domain])
  console.log(`  ${found.length} trouvées · ${fresh.length} fraîches (${Object.keys(contacted).length} déjà B2B, ${Object.keys(backlink).length} déjà backlink)\n`)
  if (!fresh.length) { console.log('Aucune nouvelle cible.'); log.lastRun = new Date().toISOString(); if (!DRY_RUN) writeJSON(B2B_LOG, log); return }

  let sent = 0
  for (const target of fresh.slice(0, MAX_EMAILS_PER_RUN + 4)) {
    if (sent >= MAX_EMAILS_PER_RUN) break
    console.log(`--- ${target.domain} (${target.island.toUpperCase()}) ---`)
    const email = await findContactEmail(target.url)
    if (!email || blocked(emailDomain(email))) {
      console.log('  Skip : aucun email de contact réel trouvé')
      contacted[target.domain] = { date: new Date().toISOString(), status: 'no-email' }
      continue
    }
    console.log(`  Email : ${logId(email)}`)
    const r = await sendEmail(resend, email, target)
    contacted[target.domain] = {
      date: new Date().toISOString(),
      emailHash: emailHash(email), emailDomain: emailDomain(email),
      island: target.island, status: r.sent ? 'sent' : 'failed', error: r.error || null,
    }
    if (r.sent) sent++
    console.log('')
  }

  log.contacted = contacted
  log.lastRun = new Date().toISOString()
  log.totalSent = Object.values(contacted).filter(c => c.status === 'sent').length
  if (!DRY_RUN) writeJSON(B2B_LOG, log) // dry-run ne brûle pas les cibles
  console.log(`\n=== Fini : ${sent} envoyés ce run (${log.totalSent} au total) ===`)
}

main().catch(e => { console.error(`[b2b-outreach] Fatal: ${e.message}`); process.exit(0) })
