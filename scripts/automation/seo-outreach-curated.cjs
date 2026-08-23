#!/usr/bin/env node
/**
 * seo-outreach-curated.cjs — Backlink outreach to a CURATED high-authority
 * prospect list (DMOs, tourism boards, municipal beach-conditions pages, local
 * news, hotel groups) researched per market and stored in
 *   scripts/automation/data/seo-growth/backlink-prospects.json
 *
 * This complements auto-outreach.cjs (which scrapes fresh Google-News targets):
 * here we approach the FEW, hand-picked, durable high-authority sites whose
 * links move the needle most for the nascent EN/ES domains.
 *
 * DELIVERABILITY FIRST (founder rule: "don't burn the email"):
 *   • Tiny volume — MAX 2 sends per run.
 *   • REAL email only — we fetch the prospect's site and send ONLY if a genuine
 *     contact address is found on-page. NO guessed contact@domain fallback
 *     (guessed sends bounce → hurt the sender domain). Skipped prospects are
 *     NOT recorded, so they retry next run once a real address surfaces.
 *   • Dedup for life — a prospect domain is emailed at most once, ever.
 *   • Value-first — we offer a free, always-current, citable resource (live map
 *     + embeddable widget + press/data kit), never a bare "please link to us".
 *     Every email carries a one-line opt-out.
 *   • Gated — needs SMTP_PASS; intl (US/MX/DR) needs OUTREACH_INTL=1; DRY_RUN=1
 *     prints without sending and writes nothing.
 *
 * Cron: wired as a low-volume step in weekly-outreach.yml (after auto-outreach).
 *
 * Usage:
 *   DRY_RUN=1 OUTREACH_INTL=1 node scripts/automation/seo-outreach-curated.cjs
 *   SMTP_PASS=… OUTREACH_INTL=1 node scripts/automation/seo-outreach-curated.cjs
 */
'use strict'

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { resolve, dirname } = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, mailReady, normalizeFrom } = require('./lib/email-send.cjs')

const DRY_RUN = process.env.DRY_RUN === '1'
const OUTREACH_INTL = process.env.OUTREACH_INTL === '1'
const MAX_PER_RUN = Number(process.env.CURATED_MAX || 2)
const REPLY_TO = 'alerte@sargasses-martinique.com'

const DATA_DIR = resolve(__dirname, 'data', 'seo-growth')
const PROSPECTS_PATH = resolve(DATA_DIR, 'backlink-prospects.json')
const LEDGER_PATH = resolve(DATA_DIR, 'curated-outreach-sent.json')

const OWN_DOMAINS = [
  'sargasses-martinique.com', 'sargasses-guadeloupe.com',
  'sargassummiami.com', 'sargassumpuntacana.com', 'sargassumcancun.com',
]

// Market routing: each curated market → the sending identity + language + the
// live map / press / widget URLs woven into the pitch. Replies always route to
// the warmed FR box (same as auto-outreach), even when From is a region domain.
function marketProfile(marketStr) {
  const s = (marketStr || '').toLowerCase()
  if (/florida|miami/.test(s)) return { key: 'us', lang: 'en', region: 'Florida', intl: true,
    from: 'Sargassum Florida <alerte@sargassummiami.com>', site: 'https://sargassummiami.com/',
    press: 'https://sargassummiami.com/press/', widget: 'https://sargassummiami.com/widget/' }
  if (/punta cana|dominican/.test(s)) return { key: 'dr', lang: 'en', region: 'Punta Cana', intl: true,
    from: 'Sargassum Punta Cana <alerte@sargassumpuntacana.com>', site: 'https://sargassumpuntacana.com/',
    press: 'https://sargassumpuntacana.com/press/', widget: 'https://sargassumpuntacana.com/widget/' }
  if (/cancún|cancun|riviera maya|quintana/.test(s)) return { key: 'mx', lang: 'es', region: 'Cancún y la Riviera Maya', intl: true, recognized: true,
    from: 'Sargazo Cancún <alerte@sargassumcancun.com>', site: 'https://sargassumcancun.com/',
    press: 'https://sargassumcancun.com/prensa/', widget: 'https://sargassumcancun.com/widget/' }
  if (/martinique|guadeloupe|antilles/.test(s)) return { key: 'fr', lang: 'fr', region: 'Martinique et Guadeloupe', intl: false, recognized: true,
    from: 'Sargasses Martinique <alerte@sargasses-martinique.com>', site: 'https://sargasses-martinique.com/',
    press: 'https://sargasses-martinique.com/recherche/', widget: 'https://sargasses-martinique.com/widget/' }
  // Unrouted market (e.g. a staged-prelaunch market with no live sending identity):
  // recognized:false so the caller SKIPS it — never email a market with the wrong identity.
  return { key: 'unknown', lang: 'fr', region: '', intl: false, recognized: false,
    from: 'Sargasses Martinique <alerte@sargasses-martinique.com>', site: 'https://sargasses-martinique.com/',
    press: 'https://sargasses-martinique.com/recherche/', widget: 'https://sargasses-martinique.com/widget/' }
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

function extractEmails(html, domain) {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const found = new Set()
  let m
  while ((m = re.exec(html)) !== null) {
    const e = m[0].toLowerCase()
    if (/example\.com|sentry\.io|w3\.org|schema\.org|googleusercontent|\.png$|\.jpg$|\.gif$|\.svg$|\.webp$|wixpress|sentry|cloudflare/.test(e)) continue
    found.add(e)
  }
  // Prefer role inboxes that actually read external mail.
  return [...found].sort((a, b) => {
    const rank = x => x.startsWith('press@') ? 0 : x.startsWith('media@') ? 1 : x.startsWith('contact@') ? 2 : x.startsWith('info@') ? 3 : x.startsWith('hello@') ? 4 : 5
    return rank(a) - rank(b)
  })
}

// REAL email only — no guessed fallback. Returns null if none found on-site.
async function findRealEmail(siteUrl) {
  const domain = extractDomain(siteUrl)
  if (!domain) return null
  const paths = ['', '/contact', '/contact/', '/contact-us', '/about', '/about/', '/press', '/media', '/newsroom', '/prensa', '/contacto']
  const bases = [siteUrl.replace(/\/$/, ''), `https://www.${domain}`, `https://${domain}`]
  const tried = new Set()
  for (const base of bases) {
    for (const p of paths) {
      const u = base + p
      if (tried.has(u)) continue
      tried.add(u)
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(8000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SargassumMapBot/1.0)' } })
        if (!res.ok) continue
        const html = await res.text()
        const emails = extractEmails(html, domain)
        if (emails.length) return emails[0]
      } catch { /* keep trying */ }
    }
  }
  return null
}

const wrap = inner => `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">${inner}</body></html>`

function buildHtml(prospect, copy, m) {
  // Prefer the per-market researched body; always append the citable assets +
  // a one-line opt-out so the message stays value-first and deliverability-safe.
  const body = (copy && copy.body) ? copy.body.replace(/\n/g, '<br>') : ''
  const assets = m.lang === 'fr'
    ? `<p>Concrètement&nbsp;: une <a href="${m.site}">carte satellite en temps réel</a> (état par plage, 4×/j), un <a href="${m.widget}">widget gratuit à intégrer</a>, et un <a href="${m.press}">kit data libre de citation</a>.</p>`
    : m.lang === 'es'
      ? `<p>En concreto: un <a href="${m.site}">mapa satelital en vivo</a> (estado por playa, 4×/día), un <a href="${m.widget}">widget gratuito para integrar</a> y un <a href="${m.press}">kit de datos libre de citar</a>.</p>`
      : `<p>Concretely: a <a href="${m.site}">live satellite map</a> (per-beach status, 4×/day), a <a href="${m.widget}">free embeddable widget</a>, and a <a href="${m.press}">free-to-cite data/press kit</a>.</p>`
  const optout = m.lang === 'fr'
    ? `<p style="color:#888;font-size:12px">Si ce n'est pas pertinent, répondez simplement « non merci » et nous ne réécrirons pas.</p>`
    : m.lang === 'es'
      ? `<p style="color:#888;font-size:12px">Si no es relevante, responda “no, gracias” y no volveremos a escribir.</p>`
      : `<p style="color:#888;font-size:12px">If this isn't a fit, just reply "no thanks" and we won't write again.</p>`
  return wrap(`${body ? `<p>${body}</p>` : ''}${assets}${optout}`)
}

function loadLedger() {
  if (existsSync(LEDGER_PATH)) { try { return JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) } catch { /* reset */ } }
  return { contacted: {}, lastRun: null, totalSent: 0 }
}

function saveLedger(led) {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true })
  writeFileSync(LEDGER_PATH, JSON.stringify(led, null, 2))
}

async function main() {
  console.log(`=== Curated backlink outreach ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`Intl (US/MX/DR): ${OUTREACH_INTL ? 'ON' : 'off'} · max/run: ${MAX_PER_RUN}`)
  if (!existsSync(PROSPECTS_PATH)) { console.log('No prospects file — nothing to do.'); return }
  if (!mailReady() && !DRY_RUN) { console.log('SMTP_PASS not set — skipping (no send).'); return }

  const markets = JSON.parse(readFileSync(PROSPECTS_PATH, 'utf8'))
  const led = loadLedger()

  // Flatten prospects → candidates, attach market profile, drop own domains,
  // drop already-contacted, gate intl, rank high-authority first.
  const candidates = []
  for (const mk of markets) {
    if (mk.status === 'staged-prelaunch') continue // market prepared but its domain isn't live yet — never email (would promise a resource that doesn't exist for that market)
    const m = marketProfile(mk.market)
    if (!m.recognized) continue // no live sending identity for this market → skip (prevents mis-routing to the FR default)
    if (m.intl && !OUTREACH_INTL) continue
    for (const p of (mk.prospects || [])) {
      const domain = extractDomain(p.url)
      if (!domain || OWN_DOMAINS.some(d => domain.includes(d))) continue
      if (led.contacted[domain]) continue
      candidates.push({ p, domain, m, copy: mk.outreach, authority: p.authority || 'medium' })
    }
  }
  const rank = a => a === 'high' ? 0 : a === 'medium' ? 1 : 2
  candidates.sort((a, b) => rank(a.authority) - rank(b.authority))
  console.log(`Eligible prospects: ${candidates.length}`)

  let sent = 0
  for (const c of candidates) {
    if (sent >= MAX_PER_RUN) break
    const email = await findRealEmail(c.p.url)
    if (!email) { console.log(`  skip ${c.domain} — no real contact email found on-site (will retry).`); continue }
    const subject = (c.copy && c.copy.subject) || `Free-to-cite live sargassum map for ${c.m.region}`
    if (DRY_RUN) {
      console.log(`  [DRY] → ${c.domain} (${c.m.key}/${c.authority}) ${logId(email)} · "${subject}"`)
      sent++
      continue
    }
    try {
      const { data, error } = await sendEmail({ from: c.m.from, to: email, subject, html: buildHtml(c.p, c.copy, c.m), replyTo: REPLY_TO })
      if (error) { console.log(`  fail ${c.domain}: ${error.message} (not recorded → retry)`); continue }
      led.contacted[c.domain] = { date: new Date().toISOString(), status: 'sent', emailHash: emailHash(email), authority: c.authority, market: c.m.key }
      led.totalSent = (led.totalSent || 0) + 1
      sent++
      console.log(`  sent → ${c.domain} (${logId(email)}, id ${data?.id})`)
    } catch (e) {
      console.log(`  error ${c.domain}: ${e.message} (not recorded → retry)`)
    }
  }

  led.lastRun = new Date().toISOString()
  if (!DRY_RUN) saveLedger(led)
  console.log(`Done. ${sent} curated outreach email(s) ${DRY_RUN ? 'previewed' : 'sent'}. Lifetime: ${led.totalSent || 0}.`)
}

main().catch(e => { console.error(e); process.exit(0) })
