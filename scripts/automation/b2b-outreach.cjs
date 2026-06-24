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
 *   3. Envoie 1 email consultatif via Resend (opt-out + reply-to humain)
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
const REPLY_TO = 'contact@sargasses-martinique.com'
const UNSUB = 'mailto:contact@sargasses-martinique.com?subject=STOP'

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

// ── Email consultatif ─────────────────────────────────────────
function buildSubject() { return `L'état réel de vos plages, chaque matin` }

function buildEmailHTML(target) {
  const isGP = target.island === 'gp'
  const site = isGP ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
  const region = isGP ? 'Guadeloupe' : 'Martinique'
  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>Bonjour,</p>
<p>Je vous écris parce que la question « est-ce qu'il y a des sargasses sur la plage aujourd'hui ? » revient sans cesse chez les visiteurs — et y répondre vite, c'est rassurer vos clients et leur éviter une déception.</p>
<p>On a construit <strong>Le Veilleur</strong> : la lecture quotidienne de l'état réel des plages de ${region}, <strong>mesurée au satellite</strong> (Copernicus Marine, indice AFAI par plage), pas devinée — avec une prévision à 7 jours et une alerte <em>avant</em> que les sargasses arrivent.</p>
<p>Concrètement pour un établissement comme le vôtre :</p>
<ul>
  <li>un <strong>brief chaque matin</strong> de l'état de vos plages les plus proches ;</li>
  <li>une <strong>alerte</strong> avant un échouage, pour anticiper auprès de vos clients ;</li>
  <li>de quoi <strong>répondre avec une donnée fiable</strong> plutôt qu'au doigt mouillé.</li>
</ul>
<p><strong>Voyez l'état de vos plages en direct, maintenant</strong> : <a href="https://${site}/">${site}</a> — carte satellite, prévision 7 jours, gratuit.</p>
<p>Et pour recevoir <strong>le brief quotidien de vos plages par email</strong> (100% automatique, sans appel, stop quand vous voulez) : <a href="https://${site}/?pro=1">activez-le en 10 secondes ici</a>.</p>
<p>Bien à vous,<br>
<strong>L'équipe Le Veilleur · Sargasses ${region}</strong><br>
<span style="color:#888;font-size:13px">Données satellite Copernicus Marine · ${site}</span></p>
<hr style="border:none;border-top:1px solid #eee;margin:18px 0">
<p style="color:#999;font-size:12px">Message professionnel adressé à un contact public en lien avec l'activité littorale/touristique. Pour ne plus être contacté·e, répondez <strong>STOP</strong> à cet email — c'est immédiat et définitif.</p>
</body></html>`
}

async function sendEmail(resend, to, target) {
  const subject = buildSubject()
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
