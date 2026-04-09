#!/usr/bin/env node
/**
 * auto-outreach.cjs — Automated backlink outreach
 *
 * Pipeline:
 *   1. Scrape Google for new articles about sargasses MQ/GP
 *   2. Find contact emails on target sites
 *   3. Send personalized outreach email via Resend
 *   4. Track contacted sites to never re-email
 *
 * Safety: max 5 emails per run. Dedup by domain. Professional tone.
 *
 * Cron: 1x/semaine (Mardi 10h UTC) via content-generation.yml
 *
 * Usage:
 *   node scripts/automation/auto-outreach.cjs
 *   DRY_RUN=1 node scripts/automation/auto-outreach.cjs
 */
'use strict'

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { Resend } = require('resend')

const DRY_RUN = process.env.DRY_RUN === '1'
const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAX_EMAILS_PER_RUN = 5

const DATA_DIR = resolve(__dirname, 'data')
const OUTREACH_LOG = resolve(DATA_DIR, 'outreach-log.json')
const FROM = 'Sargasses Martinique <alerte@sargasses-martinique.com>'

// ── Seed targets (from competitor research 2026-04-09) ────────
const SEED_TARGETS = [
  { domain: 'jumbocar-martinique.com', url: 'https://www.jumbocar-martinique.com/blog-voyage/informations-pratiques/sargasses-martinique', reason: 'Rang #1 "sargasses martinique 2026", recommande de vérifier carte satellite sans linker' },
  { domain: 'jumbocar-guadeloupe.com', url: 'https://www.jumbocar-guadeloupe.com/visitez-la-guadeloupe/informations-pratiques/sargasses', reason: 'Rang #1 "sargasses guadeloupe 2026", recommande carte satellite sans linker' },
  { domain: 'chrissandvoyage.com', url: 'https://www.chrissandvoyage.com/sargasses', reason: 'Promet carte plages sans sargasses mais en a pas' },
  { domain: 'lagons-plages.com', url: 'https://www.lagons-plages.com/sargasses-caraibes.php', reason: 'Article sargasses complet, aucun lien vers outil suivi' },
  { domain: 'chouetteworld.com', url: 'https://chouetteworld.com/plus-belles-plages-de-martinique/', reason: 'Blog famille voyage Martinique, pas de mention sargasses temps réel' },
  { domain: 'zotcar.com', url: 'https://www.zotcar.com/blog/plus-belle-plage-martinique/', reason: 'Loueur voiture, blog plages MQ, pas de lien sargasses' },
  { domain: 'voyage-martinique.fr', url: 'https://www.voyage-martinique.fr/sargasse.html', reason: 'Article sargasses avec données 2024 périmées' },
  { domain: 'couleurvoyage.com', url: 'https://www.couleurvoyage.com/martinique-avis-complet-dun-voyageur-ce-quil-faut-vraiment-savoir/', reason: 'Avis voyage Martinique 2026, mentionne sargasses' },
  { domain: 'evazeo.com', url: 'https://www.evazeo.com/blog/top-10-des-plus-belles-plages-de-martinique/', reason: 'Top 10 plages, pas de vérification sargasses' },
  { domain: 'generationvoyage.fr', url: 'https://generationvoyage.fr/plus-belles-plages-guadeloupe/', reason: 'Top plages GP, pas de mention sargasses' },
  { domain: 'toploc.com', url: 'https://toploc.com/blog/amerique/plages-guadeloupe', reason: 'Top plages GP, location entre particuliers' },
  { domain: 'antilleslocation.com', url: 'https://www.antilleslocation.com/blog-voyage/les-plus-belles-plages-de-la-guadeloupe.html', reason: 'Location Antilles, article plages' },
  { domain: 'espaces.ca', url: 'https://www.espaces.ca/articles/destinations/25273-les-7-plus-belles-plages-de-la-martinique', reason: 'Mag plein air québécois, public nord-américain francophone' },
  { domain: 'airvacances.fr', url: 'https://www.airvacances.fr/sargasses-guadeloupe-martinique-periodes-eviter/', reason: 'Article "quand partir sans sargasses", pas de lien outil temps réel' },
]

// ── Helpers ──────────────────────────────────────────────────

function readJSON(p) {
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

function writeJSON(p, data) {
  mkdirSync(resolve(p, '..'), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

// ── Step 1: Find new targets from Google ──────────────────────

async function scrapeNewTargets() {
  const queries = [
    'sargasses martinique plage 2026',
    'sargasses guadeloupe carte 2026',
    'meilleure plage martinique sargasses',
    'plage guadeloupe sans sargasses',
  ]
  const newTargets = []
  // Pick one query per run (rotate by day)
  const q = queries[Math.floor(Date.now() / 86400000) % queries.length]

  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const xml = await res.text()
    const linkRegex = /<link>(https?:\/\/[^<]+)<\/link>/g
    let match
    while ((match = linkRegex.exec(xml)) !== null) {
      const link = match[1]
      if (link.includes('news.google.com')) continue
      const domain = extractDomain(link)
      if (domain && !domain.includes('sargasses-martinique') && !domain.includes('sargasses-guadeloupe')) {
        newTargets.push({ domain, url: link, reason: `Found via Google News for "${q}"` })
      }
    }
  } catch (e) {
    console.warn(`  Scrape failed: ${e.message}`)
  }

  return newTargets
}

// ── Step 2: Find contact email on a site ──────────────────────

async function findContactEmail(siteUrl) {
  const domain = extractDomain(siteUrl)
  const contactPaths = ['/contact', '/contact/', '/contactez-nous', '/a-propos', '/about', '/mentions-legales']

  // Try contact pages first
  for (const path of contactPaths) {
    try {
      const base = `https://www.${domain}`
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        redirect: 'follow',
      })
      if (!res.ok) continue
      const html = await res.text()
      const emails = extractEmails(html, domain)
      if (emails.length > 0) return emails[0]
    } catch { /* continue */ }
  }

  // Try main page
  try {
    const res = await fetch(siteUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      redirect: 'follow',
    })
    if (res.ok) {
      const html = await res.text()
      const emails = extractEmails(html, domain)
      if (emails.length > 0) return emails[0]
    }
  } catch { /* continue */ }

  // Fallback: try common patterns
  return `contact@${domain}`
}

function extractEmails(html, domain) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const found = new Set()
  let match
  while ((match = emailRegex.exec(html)) !== null) {
    const email = match[0].toLowerCase()
    // Skip tracking pixels, CDN, framework emails
    if (email.includes('example.com')) continue
    if (email.includes('sentry.io')) continue
    if (email.includes('w3.org')) continue
    if (email.includes('schema.org')) continue
    if (email.includes('googleusercontent')) continue
    if (email.endsWith('.png') || email.endsWith('.jpg')) continue
    found.add(email)
  }
  // Prioritize: contact@ > info@ > others
  const sorted = [...found].sort((a, b) => {
    if (a.startsWith('contact@')) return -1
    if (b.startsWith('contact@')) return 1
    if (a.startsWith('info@')) return -1
    if (b.startsWith('info@')) return 1
    return 0
  })
  return sorted
}

// ── Step 3: Build outreach email ──────────────────────────────

function buildEmailHTML(target) {
  const isBeachArticle = target.url.includes('plage') || target.url.includes('beach')
  const isSargasseArticle = target.url.includes('sargass')

  let hook, value
  if (isSargasseArticle) {
    hook = `J'ai lu votre article sur les sargasses et je l'ai trouvé très utile pour les voyageurs.`
    value = `Nous avons développé <strong>la seule carte satellite en temps réel</strong> dédiée aux sargasses en Martinique et Guadeloupe — mise à jour 4 fois par jour avec les données Copernicus Marine (indice AFAI par plage).`
  } else {
    hook = `Votre article sur les plages est une super ressource pour les voyageurs qui préparent leur séjour aux Antilles.`
    value = `Un conseil que vos lecteurs apprécieraient : vérifier l'état des sargasses avant de partir à la plage. Nous proposons <strong>une carte satellite gratuite</strong> mise à jour 4x/jour qui montre quelles plages sont propres aujourd'hui.`
  }

  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p>Bonjour,</p>
<p>${hook}</p>
<p>${value}</p>
<p>Voici ce qu'elle offre :</p>
<ul>
  <li>135 plages surveillées (Martinique + Guadeloupe)</li>
  <li>Prévisions 7 jours par plage</li>
  <li>Alertes H2S (qualité de l'air)</li>
  <li>100% gratuit, pas de pub</li>
</ul>
<p><strong>Seriez-vous ouvert(e) à ajouter un lien vers notre carte dans votre article ?</strong></p>
<p>
  → Martinique : <a href="https://sargasses-martinique.com/">sargasses-martinique.com</a><br>
  → Guadeloupe : <a href="https://sargasses-guadeloupe.com/">sargasses-guadeloupe.com</a>
</p>
<p>Nous proposons aussi un <a href="https://sargasses-martinique.com/widget/">widget embarquable gratuit</a> si vous préférez intégrer directement l'état d'une plage sur votre site.</p>
<p>Merci pour votre travail,<br>
<strong>L'équipe Sargasses Martinique</strong><br>
<span style="color:#888;font-size:13px">Données satellite Copernicus Marine · sargasses-martinique.com</span></p>
</body></html>`
}

function buildSubject(target) {
  if (target.url.includes('sargass')) {
    return `Votre article sargasses + notre carte satellite temps réel ?`
  }
  return `Carte sargasses gratuite pour vos lecteurs ?`
}

// ── Step 4: Send via Resend ───────────────────────────────────

async function sendOutreachEmail(resend, to, target) {
  const subject = buildSubject(target)
  const html = buildEmailHTML(target)

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would send to: ${to}`)
    console.log(`  Subject: ${subject}`)
    return { sent: true, dry: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      replyTo: 'contact@sargasses-martinique.com',
    })
    if (error) {
      console.error(`  Failed: ${error.message}`)
      return { sent: false, error: error.message }
    }
    console.log(`  Sent to ${to} (id: ${data?.id})`)
    return { sent: true, id: data?.id }
  } catch (e) {
    console.error(`  Error: ${e.message}`)
    return { sent: false, error: e.message }
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`=== Auto-Outreach ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  if (!RESEND_API_KEY && !DRY_RUN) {
    console.error('RESEND_API_KEY not set.')
    process.exit(0)
  }

  const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

  // Load outreach log (tracks contacted domains)
  const log = readJSON(OUTREACH_LOG) || { contacted: {}, lastRun: null }
  const contacted = log.contacted || {}

  // Step 1: Gather targets
  console.log('--- Step 1: Gathering targets ---')
  const scraped = await scrapeNewTargets()
  console.log(`  Scraped ${scraped.length} new potential targets`)

  const allTargets = [...SEED_TARGETS, ...scraped]

  // Filter out already-contacted domains
  const fresh = allTargets.filter(t => !contacted[t.domain])
  console.log(`  ${fresh.length} fresh targets (${Object.keys(contacted).length} already contacted)\n`)

  if (fresh.length === 0) {
    console.log('No new targets to contact.')
    log.lastRun = new Date().toISOString()
    writeJSON(OUTREACH_LOG, log)
    return
  }

  // Step 2: Find emails and send (max MAX_EMAILS_PER_RUN)
  let sent = 0
  for (const target of fresh.slice(0, MAX_EMAILS_PER_RUN + 3)) { // try a few extra in case emails fail
    if (sent >= MAX_EMAILS_PER_RUN) break

    console.log(`--- Target: ${target.domain} ---`)
    console.log(`  URL: ${target.url}`)
    console.log(`  Reason: ${target.reason}`)

    // Find email
    const email = await findContactEmail(target.url)
    console.log(`  Email: ${email}`)

    if (!email) {
      console.log('  Skipped: no email found')
      contacted[target.domain] = { date: new Date().toISOString(), status: 'no-email' }
      continue
    }

    // Send
    const result = await sendOutreachEmail(resend, email, target)

    contacted[target.domain] = {
      date: new Date().toISOString(),
      email,
      status: result.sent ? 'sent' : 'failed',
      error: result.error || null,
      url: target.url,
    }

    if (result.sent) sent++
    console.log('')
  }

  // Save log
  log.contacted = contacted
  log.lastRun = new Date().toISOString()
  log.totalSent = Object.values(contacted).filter(c => c.status === 'sent').length
  writeJSON(OUTREACH_LOG, log)

  console.log(`\n=== Done: ${sent} emails sent (${log.totalSent} total all-time) ===`)
}

main().catch(err => {
  console.error(`[auto-outreach] Fatal: ${err.message}`)
  process.exit(0)
})
