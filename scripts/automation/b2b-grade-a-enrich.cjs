#!/usr/bin/env node
/**
 * b2b-grade-a-enrich.cjs — Autonomous 24/7 enricher for Grade A hotel prospects
 *
 * Scrapes each hotel website for REAL contact emails + phones from:
 *   - /contact, /contact/, /contactez-nous, /nous-contacter
 *   - /a-propos, /mentions-legales, /legal
 *   - Homepage, /reservation, /pro
 *   - WHOIS-like patterns on page
 *
 * Output: data/b2b-grade-a-enriched.json
 * Compatible with b2b-cold-outreach.cjs schema.
 *
 * Usage:
 *   node scripts/automation/b2b-grade-a-enrich.cjs              # dry-run
 *   node scripts/automation/b2b-grade-a-enrich.cjs --send       # write output
 *   node scripts/automation/b2b-grade-a-enrich.cjs --verbose    # detailed logs
 */
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const OUTPUT_PATH = path.join(DATA_DIR, 'b2b-grade-a-enriched.json')
const SEND = process.argv.includes('--send')
const VERBOSE = process.argv.includes('--verbose')

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function saveJSON(p, d) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }

// ── Grade A hotel targets ────────────────────────────────────────
const GRADE_A = [
  // MARTINIQUE
  { name:'Hôtel Bakoua', url:'https://hotel-bakoua.fr', town:'Les Trois-Îlets', island:'MQ', fit:'resort', stars:4, beach:'Pointe-du-Bout', lang:'fr' },
  { name:'Le Village Courbaril', url:'https://www.courbarilvillage.com', town:'Les Trois-Îlets', island:'MQ', fit:'resort', stars:4, beach:'Anse à l\'Âne', lang:'fr' },
  { name:'Hôtel Carayou & SPA', url:'https://www.hotel-carayou.com', town:'Les Trois-Îlets', island:'MQ', fit:'hotel', stars:3, beach:'Pointe-du-Bout', lang:'fr' },
  { name:'Bambou Resort', url:'https://www.bambouresort.com', town:'Les Trois-Îlets', island:'MQ', fit:'hotel', stars:3, beach:'Anse Mitan', lang:'fr' },
  { name:'Hauts de Caritan', url:'https://www.booking.com/hotel/mq/les-hauts-de-caritan.html', town:'Sainte-Anne', island:'MQ', fit:'lodge-gite', stars:3, beach:'Anse Caritan', lang:'fr' },

  // GUADELOUPE
  { name:'La Toubana Hôtel & Spa', url:'https://www.toubana.com', town:'Sainte-Anne', island:'GP', fit:'resort', stars:5, beach:'Sainte-Anne', lang:'fr' },
  { name:'Le Relais du Moulin', url:'https://www.relaisdumoulin.com', town:'Sainte-Anne', island:'GP', fit:'hotel', stars:4, beach:'Le Helleux', lang:'fr' },
  { name:'Village Pierre & Vacances', url:'https://www.pierrevacances.com', town:'Sainte-Anne', island:'GP', fit:'resort', stars:3, beach:'Bois Jolan', lang:'fr' },
  { name:'Kaz Ananas', url:'https://kazananas.fr', town:'Sainte-Anne', island:'GP', fit:'lodge-gite', stars:3, beach:'Le Helleux', lang:'fr' },

  // MIAMI
  { name:'Loews Miami Beach Hotel', url:'https://www.loewshotels.com/miami-beach', town:'Miami Beach', island:'florida', fit:'hotel', stars:4, beach:'South Beach', lang:'en' },
  { name:'1 Hotel South Beach', url:'https://www.1hotels.com/south-beach', town:'Miami Beach', island:'florida', fit:'resort', stars:5, beach:'Mid-Beach', lang:'en' },
  { name:'Kimpton Surfcomber', url:'https://www.surfcomber.com', town:'Miami Beach', island:'florida', fit:'hotel', stars:4, beach:'South Beach', lang:'en' },

  // CANCÚN
  { name:'Hyatt Ziva Cancún', url:'https://www.hyatt.com/hyatt-ziva-cancun', town:'Cancún', island:'rivieramaya', fit:'resort', stars:5, beach:'Punta Cancún', lang:'es' },
  { name:'Secrets Maroma Beach', url:'https://www.secretsresorts.com/resorts/maroma-beach-riviera-cancun', town:'Playa Maroma', island:'rivieramaya', fit:'resort', stars:5, beach:'Playa Maroma', lang:'es' },
  { name:'Grand Velas Riviera Maya', url:'https://www.grandvelas.com/riviera-maya', town:'Playa del Carmen', island:'rivieramaya', fit:'resort', stars:5, beach:'Playa del Carmen', lang:'es' },

  // PUNTA CANA
  { name:'Hyatt Zilara Cap Cana', url:'https://www.hyatt.com/hyatt-zilara-cap-cana', town:'Cap Cana', island:'puntacana', fit:'resort', stars:5, beach:'Juanillo Beach', lang:'en' },
  { name:'Sanctuary Cap Cana', url:'https://www.sanctuarycapcana.com', town:'Cap Cana', island:'puntacana', fit:'resort', stars:5, beach:'Juanillo Beach', lang:'en' },
  { name:'Zoetry Agua Punta Cana', url:'https://www.zoetryresorts.com/agua-punta-cana', town:'Uvero Alto', island:'puntacana', fit:'resort', stars:5, beach:'Uvero Alto', lang:'en' },
]

// ── Email/phone extraction ───────────────────────────────────────
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_RE = /(?:\+33|0033|0)[1-9](?:[\s.\-]?\d{2}){4}/g  // FR
const PHONE_US = /(?:\+1|001)?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g  // US
const PHONE_ES = /(?:\+34|0034)[\s.\-]?\d{3}[\s.\-]?\d{3}[\s.\-]?\d{3}/g  // ES
const PHONE_DR = /(?:\+1|001)?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g  // DR (same as US)

const SKIP_EMAIL = /example\.com|sentry\.io|w3\.org|schema\.org|googleusercontent|wixpress|@\d+x\.|\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|css|js)$|sentry|placeholder|test|demo|spam|abuse|postmaster|mailer-daemon|no-?reply|noreply/i
const CONTACT_PATHS = ['/contact', '/contact/', '/contactez-nous', '/nous-contacter', '/a-propos', '/mentions-legales', '/legal', '/reservation', '/reservations', '/pro', '/about', '/about/', '/impressum']

function extractEmails(html) {
  const found = new Set()
  let m
  while ((m = EMAIL_RE.exec(html)) !== null) {
    const e = m[0].toLowerCase()
    if (SKIP_EMAIL.test(e)) continue
    found.add(e)
  }
  return [...found]
}

function extractPhones(html, lang) {
  const found = new Set()
  const re = lang === 'fr' ? PHONE_RE : lang === 'es' ? PHONE_ES : PHONE_US
  let m
  while ((m = re.exec(html)) !== null) {
    found.add(m[0].replace(/\s/g, ''))
  }
  return [...found]
}

function scoreEmail(e) {
  if (e.startsWith('contact@')) return 0
  if (e.startsWith('reservation')) return 1
  if (e.startsWith('info@')) return 2
  if (e.startsWith('accueil@')) return 3
  if (e.startsWith('reception@')) return 4
  if (e.startsWith('manager@')) return 5
  return 6
}

// ── Scraper ──────────────────────────────────────────────────────
async function scrapePage(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SargassesPro/1.0)' },
      redirect: 'follow',
    })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

async function enrichHotel(hotel) {
  const base = hotel.url.replace(/\/$/, '')
  const emails = new Set()
  const phones = new Set()
  const sources = []

  // Try contact pages first (most likely to have real emails)
  for (const path of CONTACT_PATHS) {
    const html = await scrapePage(base + path)
    if (!html) continue
    const e = extractEmails(html)
    const p = extractPhones(html, hotel.lang)
    if (e.length || p.length) {
      sources.push(path)
      e.forEach(x => emails.add(x))
      p.forEach(x => phones.add(x))
    }
    if (VERBOSE && (e.length || p.length)) console.log(`    ${path}: ${e.length} emails, ${p.length} phones`)
    await new Promise(r => setTimeout(r, 500)) // rate limit
  }

  // Also try homepage
  if (emails.size === 0) {
    const html = await scrapePage(base)
    if (html) {
      const e = extractEmails(html)
      const p = extractPhones(html, hotel.lang)
      e.forEach(x => emails.add(x))
      p.forEach(x => phones.add(x))
      if (e.length) sources.push('homepage')
    }
  }

  // Dedup + sort emails
  const sortedEmails = [...emails].sort((a, b) => scoreEmail(a) - scoreEmail(b))
  const bestEmail = sortedEmails[0] || null
  const domain = bestEmail ? bestEmail.split('@')[1] : null

  return {
    ...hotel,
    email: bestEmail,
    allEmails: sortedEmails,
    phone: phones.values().next().value || null,
    allPhones: [...phones],
    sources,
    enrichedAt: new Date().toISOString(),
    status: bestEmail ? 'email_found' : (phones.size > 0 ? 'phone_only' : 'no_contact'),
  }
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('=== B2B Grade A Enrichment ===')
  console.log(`${new Date().toISOString()} — ${GRADE_A.length} targets\n`)

  const existing = loadJSON(OUTPUT_PATH, { contacts: [] })
  const existingNames = new Set((existing.contacts || []).map(c => c.name))
  const toEnrich = GRADE_A.filter(h => !existingNames.has(h.name))
  console.log(`  ${toEnrich.length} new hotels to enrich (${existingNames.size} already done)\n`)

  const results = [...(existing.contacts || [])]
  let found = 0, phoneOnly = 0, nothing = 0

  for (const hotel of toEnrich) {
    console.log(`--- ${hotel.name} (${hotel.island}) ---`)
    const enriched = await enrichHotel(hotel)
    results.push(enriched)

    if (enriched.status === 'email_found') {
      console.log(`  ✅ ${enriched.email} (from: ${enriched.sources.join(', ')})`)
      if (enriched.phone) console.log(`  📞 ${enriched.phone}`)
      found++
    } else if (enriched.status === 'phone_only') {
      console.log(`  📞 Phone only: ${enriched.phone}`)
      phoneOnly++
    } else {
      console.log(`  ❌ No contact found`)
      nothing++
    }
    await new Promise(r => setTimeout(r, 800)) // rate limit between hotels
  }

  // Build output compatible with b2b-cold-outreach.cjs
  const output = {
    _note: 'Grade A hotel prospects — enriched with REAL emails + phones. Auto-generated.',
    updatedAt: new Date().toISOString(),
    count: results.length,
    contacts: results.map(c => ({
      email: c.email || '',
      name: c.name,
      town: c.town,
      island: c.island,
      fit: c.fit,
      hook: '', // will be filled by cold-outreach
      url: c.url,
      beach: c.beach,
      stars: c.stars,
      phone: c.phone || '',
      allEmails: c.allEmails || [],
      allPhones: c.allPhones || [],
      sources: c.sources || [],
      status: c.status,
      lang: c.lang,
      enrichedAt: c.enrichedAt,
    })),
  }

  if (SEND) {
    saveJSON(OUTPUT_PATH, output)
    console.log(`\n✅ Written: ${OUTPUT_PATH}`)
  } else {
    console.log(`\n[Dry-run] Use --send to write output`)
  }

  console.log(`\n=== Summary ===`)
  console.log(`  Email found:    ${found}`)
  console.log(`  Phone only:     ${phoneOnly}`)
  console.log(`  No contact:     ${nothing}`)
  console.log(`  Total enriched: ${results.length}`)
}

main().catch(e => { console.error(`[enrich] Fatal: ${e.message}`); process.exit(1) })
