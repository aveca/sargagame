#!/usr/bin/env node
/**
 * b2b-us-enrich.cjs — US B2B hotel prospector for florida/puntacana/rivieramaya
 *
 * Produces an enriched contact dataset of hotels/resorts near target beaches
 * in 3 US regions, using the SAME schema as b2b-enriched.json for direct
 * compatibility with b2b-cold-outreach.cjs (loads c.name / c.town / c.island / etc.)
 *
 * Modes:
 *   node scripts/automation/b2b-us-enrich.cjs                      # dry-run: report only
 *   node scripts/automation/b2b-us-enrich.cjs --send               # write output (idempotent merge)
 *   node scripts/automation/b2b-us-enrich.cjs --csv <path>         # import from CSV
 *   node scripts/automation/b2b-us-enrich.cjs --manual             # generate template CSV to stdout
 *   GOOGLE_PLACES_KEY=xxx node scripts/automation/b2b-us-enrich.cjs --places
 *
 * Output: scripts/automation/data/b2b-us-enriched.json (gitignored — PII)
 *   { _note, updatedAt, count, contacts: [{ email, name, town, island, fit, hook, url, beach, stars, source, enrichedAt }] }
 *
 * Safety:
 *   - Rate-limited to 1 req/s if using API mode
 *   - Emails validated + role-local filtered (same regex as b2b-cold-outreach.cjs)
 *   - Idempotent: skips hotels already in output (by email hash)
 *   - Default dry-run (--send to commit)
 */
const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

// ── paths ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data')
const OUTPUT_PATH = path.join(DATA_DIR, 'b2b-us-enriched.json')

// ── email helpers (mirror b2b-cold-outreach.cjs) ──────────────────
const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i
const ROLE_LOCAL = /^(postmaster|abuse|mailer-daemon|maildaemon|mailer|no-?reply|noreply|donotreply|do-not-reply|bounce|bounces|root|hostmaster|webmaster|spam|nobody|devnull)@/i
function isValidEmail(e) {
  const s = String(e || '').trim().toLowerCase()
  return EMAIL_RE.test(s) && !ROLE_LOCAL.test(s)
}
function emailHash(e) { return createHash('sha256').update(String(e).trim().toLowerCase()).digest('hex').slice(0, 32) }
function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function saveJSON(p, d) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }

// ── beach → island mapping ──────────────────────────────────────
const BEACH_REGION = {
  florida:   ['Miami Beach','South Beach','Clearwater','Cocoa Beach','Fort Lauderdale','Palm Beach','Key West'],
  puntacana: ['Bavaro','Cap Cana','Uvero Alto','Punta Cana Resort Corridor'],
  rivieramaya: ['Cancun Hotel Zone','Playa del Carmen','Tulum','Puerto Morelos','Akumal'],
}

// ── hook generator (personalised per beach + hotel) ─────────────
function makeHook(region, beach, hotel) {
  const EN_HOOKS = {
    florida: [
      `${beach} this morning is clean according to our latest satellite pass — your guests at ${hotel} deserve to know before they step out.`,
      `Sargassum season shifts ${beach} overnight. ${hotel} can alert guests before they hit the sand, with 7-day forecasts, beach by beach.`,
      `Your ${hotel} guests heading to ${beach} expect perfection. We track the coast by satellite every 6 hours — no surprises, no disappointed check-outs.`,
      `${beach} varies block by block. ${hotel} could be the one that always knows the exact all-clear spot, before reviews are written.`,
    ],
    puntacana: [
      `Bavaro Beach drives bookings for ${hotel}. We track the sargassum drift daily by satellite — a beach certainty your guests won't find elsewhere.`,
      `Punta Cana's coastline is stunning but unpredictable. ${hotel} can give guests a daily beach all-clear before they ask at the front desk.`,
      `Cap Cana's pristine image depends on beach quality. ${hotel} can back it with real satellite data, day by day.`,
      `${beach} is your property's crown jewel. Know its state before your guests do, with a simple widget on your site.`,
    ],
    rivieramaya: [
      `Cancun's Hotel Zone sees sargassum pulses that shift overnight. ${hotel} could be the one that always knows first — and warns guests before check-in.`,
      `Playa del Carmen beaches vary by current. ${hotel} can offer guests a real-time beach forecast — a competitive edge for reviews.`,
      `Tulum's coastline is stunning but vulnerable. ${hotel} can show guests exactly where is clean today, with satellite data, not guesswork.`,
      `Puerto Morelos beaches change with every tide. ${hotel} can give guests the daily verdict, measured by satellite, 4 times a day.`,
    ],
  }
  const pool = EN_HOOKS[region]
  return pool ? pool[Math.floor(Math.random() * pool.length)] : `${beach} this morning — ${hotel} can know before guests arrive.`
}

// ── likely email from domain ─────────────────────────────────────
function likelyEmail(url) {
  if (!url) return ''
  let domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].toLowerCase()
  const patterns = ['reservations','info','reservation','contact','guestservices','resort']
  for (const p of patterns) {
    const c = `${p}@${domain}`
    if (isValidEmail(c)) return c
  }
  return `reservations@${domain}`
}

// ── SEED DATASET (~58 resorts across 3 US regions) ──────────────
// Emails are constructed as reservations@{domain} where possible.
// Source = 'seed_constructed' — export to CSV, verify, reimport with --csv.
const SEED = [
  // ── FLORIDA (20) ──────────────────────────────────────────────
  { name:'Fontainebleau Miami Beach',      town:'Miami Beach',    island:'florida', fit:'resort', stars:5, url:'https://fontainebleau.com',     beach:'Miami Beach' },
  { name:'The Setai Miami Beach',          town:'Miami Beach',    island:'florida', fit:'resort', stars:5, url:'https://setai.com',              beach:'Miami Beach' },
  { name:'Faena Hotel Miami Beach',        town:'Miami Beach',    island:'florida', fit:'resort', stars:5, url:'https://faena.com',              beach:'Miami Beach' },
  { name:'Eden Roc Miami Beach',           town:'Miami Beach',    island:'florida', fit:'resort', stars:5, url:'https://edenroc.com',            beach:'Miami Beach' },
  { name:'Loews Miami Beach Hotel',        town:'Miami Beach',    island:'florida', fit:'hotel',  stars:4, url:'https://loewshotels.com',        beach:'South Beach' },
  { name:'1 Hotel South Beach',            town:'Miami Beach',    island:'florida', fit:'resort', stars:5, url:'https://1hotels.com/south-beach',   beach:'South Beach' },
  { name:'The Ritz-Carlton South Beach',   town:'Miami Beach',    island:'florida', fit:'resort', stars:5, url:'https://ritzcarlton.com',        beach:'South Beach' },
  { name:'The Standard Spa Miami Beach',   town:'Miami Beach',    island:'florida', fit:'hotel',  stars:4, url:'https://standardhotels.com',     beach:'Miami Beach' },
  { name:'The Biltmore Hotel',             town:'Coral Gables',   island:'florida', fit:'resort', stars:5, url:'https://biltmorehotel.com',      beach:'Miami Beach' },
  { name:'The Ritz-Carlton Fort Lauderdale', town:'Fort Lauderdale', island:'florida', fit:'resort', stars:5, url:'https://ritzcarlton.com',     beach:'Fort Lauderdale' },
  { name:'W Fort Lauderdale',              town:'Fort Lauderdale',island:'florida', fit:'resort', stars:5, url:'https://whotels.com',            beach:'Fort Lauderdale' },
  { name:'The Westin Fort Lauderdale Beach Resort', town:'Fort Lauderdale', island:'florida', fit:'resort', stars:4, url:'https://westin.com', beach:'Fort Lauderdale' },
  { name:'The Breakers Palm Beach',        town:'Palm Beach',     island:'florida', fit:'resort', stars:5, url:'https://thebreakers.com',        beach:'Palm Beach' },
  { name:'Four Seasons Palm Beach',        town:'Palm Beach',     island:'florida', fit:'resort', stars:5, url:'https://fourseasons.com/palmbeach', beach:'Palm Beach' },
  { name:'The Colony Palm Beach',          town:'Palm Beach',     island:'florida', fit:'resort', stars:5, url:'https://thecolonypalmbeach.com', beach:'Palm Beach' },
  { name:'The Reach Key West',             town:'Key West',       island:'florida', fit:'resort', stars:4, url:'https://thereachkeywest.com',    beach:'Key West' },
  { name:'Sunset Key Cottages',            town:'Key West',       island:'florida', fit:'resort', stars:5, url:'https://sunsetkeycottages.com',  beach:'Key West' },
  { name:'Ocean Key Resort & Spa',         town:'Key West',       island:'florida', fit:'resort', stars:4, url:'https://oceankey.com',           beach:'Key West' },
  { name:'Sandpearl Resort Clearwater Beach', town:'Clearwater',  island:'florida', fit:'resort', stars:4, url:'https://sandpearl.com',          beach:'Clearwater' },
  { name:'Hilton Cocoa Beach Oceanfront',  town:'Cocoa Beach',    island:'florida', fit:'hotel',  stars:4, url:'https://hilton.com/en/hotels/cocbchf', beach:'Cocoa Beach' },

  // ── PUNTA CANA (18) ──────────────────────────────────────────
  { name:'Punta Cana Resort & Club',       town:'Punta Cana',     island:'puntacana', fit:'resort', stars:5, url:'https://puntacana.com',        beach:'Cap Cana' },
  { name:'Eden Roc Cap Cana',              town:'Cap Cana',       island:'puntacana', fit:'resort', stars:5, url:'https://edenroccapcana.com',    beach:'Cap Cana' },
  { name:'Secrets Cap Cana Resort & Spa',  town:'Cap Cana',       island:'puntacana', fit:'resort', stars:5, url:'https://secretsresorts.com',    beach:'Cap Cana' },
  { name:'Tortuga Bay Hotel',              town:'Punta Cana',     island:'puntacana', fit:'resort', stars:5, url:'https://puntacana.com/tortuga-bay', beach:'Punta Cana Resort Corridor' },
  { name:'Riu Republica',                  town:'Bavaro',         island:'puntacana', fit:'resort', stars:4, url:'https://riu.com',              beach:'Bavaro' },
  { name:'Iberostar Selection Bavaro',     town:'Bavaro',         island:'puntacana', fit:'resort', stars:5, url:'https://iberostar.com',        beach:'Bavaro' },
  { name:'Barcelo Bavaro Palace',         town:'Bavaro',         island:'puntacana', fit:'resort', stars:5, url:'https://barcelo.com',          beach:'Bavaro' },
  { name:'Hard Rock Hotel & Casino Punta Cana', town:'Bavaro',    island:'puntacana', fit:'resort', stars:5, url:'https://hardrockhotels.com/puntacana', beach:'Bavaro' },
  { name:'Melia Punta Cana Beach',         town:'Bavaro',         island:'puntacana', fit:'resort', stars:5, url:'https://melia.com',            beach:'Bavaro' },
  { name:'Dreams Punta Cana Resort & Spa', town:'Bavaro',         island:'puntacana', fit:'resort', stars:5, url:'https://dreamsresorts.com',     beach:'Bavaro' },
  { name:'Bahia Principe Bavaro',          town:'Bavaro',         island:'puntacana', fit:'resort', stars:5, url:'https://bahia-principe.com',    beach:'Bavaro' },
  { name:'Excellence Punta Cana',          town:'Uvero Alto',     island:'puntacana', fit:'resort', stars:5, url:'https://excellence-resorts.com', beach:'Uvero Alto' },
  { name:'Secrets Royal Beach Punta Cana', town:'Uvero Alto',     island:'puntacana', fit:'resort', stars:5, url:'https://secretsresorts.com',    beach:'Uvero Alto' },
  { name:'Breathless Punta Cana Resort & Spa', town:'Bavaro',     island:'puntacana', fit:'resort', stars:4, url:'https://breathlessresorts.com', beach:'Bavaro' },
  { name:'Lopesan Costa Bavaro Resort',    town:'Bavaro',         island:'puntacana', fit:'resort', stars:5, url:'https://lopesan.com',          beach:'Bavaro' },
  { name:'Paradisus Palma Real Resort',    town:'Bavaro',         island:'puntacana', fit:'resort', stars:5, url:'https://paradisus.com',        beach:'Bavaro' },
  { name:'Royalton Punta Cana Resort & Casino', town:'Uvero Alto', island:'puntacana', fit:'resort', stars:5, url:'https://royaltonresorts.com',  beach:'Uvero Alto' },
  { name:'Now Larimar Punta Cana',         town:'Bavaro',         island:'puntacana', fit:'hotel',  stars:4, url:'https://nowresorts.com',       beach:'Bavaro' },

  // ── RIVIERA MAYA (20) ─────────────────────────────────────────
  { name:'Le Blanc Spa Resort Cancun',     town:'Cancun',         island:'rivieramaya', fit:'resort', stars:5, url:'https://leblancsparesort.com',     beach:'Cancun Hotel Zone' },
  { name:'Hyatt Ziva Cancun',              town:'Cancun',         island:'rivieramaya', fit:'resort', stars:5, url:'https://hyatt.com',                beach:'Cancun Hotel Zone' },
  { name:'Hilton Cancun',                  town:'Cancun',         island:'rivieramaya', fit:'resort', stars:5, url:'https://hilton.com',               beach:'Cancun Hotel Zone' },
  { name:'JW Marriott Cancun Resort & Spa', town:'Cancun',        island:'rivieramaya', fit:'resort', stars:5, url:'https://marriott.com',             beach:'Cancun Hotel Zone' },
  { name:'Fiesta Americana Cancun',        town:'Cancun',         island:'rivieramaya', fit:'resort', stars:4, url:'https://fiestaamericana.com',      beach:'Cancun Hotel Zone' },
  { name:'Live Aqua Beach Resort Cancun',  town:'Cancun',         island:'rivieramaya', fit:'resort', stars:5, url:'https://liveaquacancun.com',        beach:'Cancun Hotel Zone' },
  { name:'Riu Cancun',                     town:'Cancun',         island:'rivieramaya', fit:'resort', stars:5, url:'https://riu.com',                  beach:'Cancun Hotel Zone' },
  { name:'Secrets The Vine Cancun',        town:'Cancun',         island:'rivieramaya', fit:'resort', stars:5, url:'https://secretsresorts.com',       beach:'Cancun Hotel Zone' },
  { name:'Thompson Playa del Carmen',      town:'Playa del Carmen', island:'rivieramaya', fit:'resort', stars:5, url:'https://thompsonhotels.com',      beach:'Playa del Carmen' },
  { name:'Mahekal Beach Resort',           town:'Playa del Carmen', island:'rivieramaya', fit:'resort', stars:4, url:'https://mahekal.com',             beach:'Playa del Carmen' },
  { name:'Sandos Playacar',                town:'Playa del Carmen', island:'rivieramaya', fit:'resort', stars:4, url:'https://sandos.com',              beach:'Playa del Carmen' },
  { name:'Playacar Palace',                town:'Playa del Carmen', island:'rivieramaya', fit:'resort', stars:5, url:'https://palaceresorts.com',        beach:'Playa del Carmen' },
  { name:'Rosewood Mayakoba',              town:'Playa del Carmen', island:'rivieramaya', fit:'resort', stars:5, url:'https://rosewoodhotels.com',       beach:'Playa del Carmen' },
  { name:'Andaz Mayakoba Resort Riviera Maya', town:'Playa del Carmen', island:'rivieramaya', fit:'resort', stars:5, url:'https://hyatt.com',            beach:'Playa del Carmen' },
  { name:'Azulik Tulum',                   town:'Tulum',          island:'rivieramaya', fit:'resort', stars:5, url:'https://azulik.com',               beach:'Tulum' },
  { name:'Nomade Tulum',                   town:'Tulum',          island:'rivieramaya', fit:'hotel',  stars:4, url:'https://nomadetulum.com',          beach:'Tulum' },
  { name:'Hotel Esencia',                  town:'Tulum',          island:'rivieramaya', fit:'resort', stars:5, url:'https://hotelesencia.com',          beach:'Tulum' },
  { name:'Catalonia Riviera Maya',         town:'Puerto Morelos', island:'rivieramaya', fit:'resort', stars:4, url:'https://cataloniahotels.com',       beach:'Puerto Morelos' },
  { name:'Secrets Akumal Riviera Maya',    town:'Akumal',         island:'rivieramaya', fit:'resort', stars:5, url:'https://secretsresorts.com',        beach:'Akumal' },
  { name:'Grand Sirenis Riviera Maya',     town:'Akumal',         island:'rivieramaya', fit:'resort', stars:4, url:'https://sirenis.com',              beach:'Akumal' },
]

// ── Google Places API mode ──────────────────────────────────────
async function fetchPlacesForBeach(region, beach, apiKey) {
  const results = []
  const q = `${beach} beach hotels resorts near ${region}`
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${apiKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) { console.error(`  ! Places API error for ${beach}: ${res.status}`); return results }
    const data = await res.json()
    if (!data.results) return results
    for (const place of data.results.slice(0, 10)) {
      const name = place.name
      const stars = place.rating ? Math.round(place.rating) : 0
      const placeId = place.place_id
      // Get details for website
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?placeid=${placeId}&fields=name,website,formatted_address,rating&key=${apiKey}`
      await new Promise(r => setTimeout(r, 1100)) // rate limit
      const dRes = await fetch(detailUrl)
      if (!dRes.ok) continue
      const dData = await dRes.json()
      const website = (dData.result && dData.result.website) || ''
      const email = likelyEmail(website)
      results.push({ name, town: beach, island: region, fit: stars >= 5 ? 'resort' : 'hotel', stars: stars || 3, url: website, beach, email, source: 'google_places' })
    }
  } catch (e) { console.error(`  ! Failed to fetch ${beach}: ${e.message}`) }
  return results
}

async function runPlacesMode(apiKey) {
  console.log('  [Google Places API mode]')
  const all = []
  for (const [region, beaches] of Object.entries(BEACH_REGION)) {
    for (const beach of beaches) {
      console.log(`  Fetching ${beach} (${region})...`)
      const hits = await fetchPlacesForBeach(region, beach, apiKey)
      all.push(...hits)
      console.log(`    → ${hits.length} places found`)
      await new Promise(r => setTimeout(r, 1200)) // rate limit between beaches
    }
  }
  return all
}

// ── CSV I/O ──────────────────────────────────────────────────────
function generateTemplateCSV() {
  const lines = ['email,hotel,region,beach,stars,website,source']
  lines.push('reservations@fontainebleau.com,Fountainebleau Miami Beach,florida,Miami Beach,5,https://fontainebleau.com,manual')
  lines.push('reservations@puntacana.com,Punta Cana Resort & Club,puntacana,Cap Cana,5,https://puntacana.com,manual')
  lines.push('reservations@riu.com,Riu Cancun,rivieramaya,Cancun Hotel Zone,5,https://riu.com,manual')
  return lines.join('\n')
}

function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (lines.length < 2) { console.error('CSV must have header + at least 1 row'); return [] }
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const contacts = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim())
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })
    if (!row.email || !row.hotel) continue
    contacts.push({
      email: row.email,
      name: row.hotel,
      town: row.beach || '',
      island: row.region || '',
      fit: row.fit || (parseInt(row.stars) >= 5 ? 'resort' : 'hotel'),
      hook: row.hook || '',
      url: row.website || '',
      beach: row.beach || '',
      stars: parseInt(row.stars) || 3,
      source: row.source || 'manual_csv',
    })
  }
  return contacts
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  const SEND = process.argv.includes('--send')
  const CSV_MODE_idx = process.argv.indexOf('--csv')
  const CSV_PATH = CSV_MODE_idx >= 0 ? process.argv[CSV_MODE_idx + 1] || path.join(DATA_DIR, 'b2b-us-template.csv') : null
  const MANUAL_MODE = process.argv.includes('--manual')
  const PLACES_MODE = process.argv.includes('--places')
  const API_KEY = process.env.GOOGLE_PLACES_KEY

  console.log('=== b2b-us-enrich — US B2B hotels ===')

  // ── manual mode: print CSV template ──
  if (MANUAL_MODE) {
    console.log(generateTemplateCSV())
    return
  }

  // ── build contact list ──
  let contacts = []

  if (PLACES_MODE && API_KEY) {
    contacts = await runPlacesMode(API_KEY)
    if (contacts.length === 0) { console.log('  Places API returned 0 results, falling back to seed.'); contacts = [] }
  }

  if (!PLACES_MODE || contacts.length === 0) {
    // Use seed dataset
    const now = new Date().toISOString()
    contacts = SEED.map(s => ({
      email: likelyEmail(s.url),
      name: s.name,
      town: s.town,
      island: s.island,
      fit: s.fit,
      hook: makeHook(s.island, s.beach, s.name),
      url: s.url,
      beach: s.beach,
      stars: s.stars,
      source: 'seed_constructed',
      enrichedAt: now,
    }))
  }

  // Validate emails
  const valid = contacts.filter(c => isValidEmail(c.email))
  const invalidCount = contacts.length - valid.length
  if (invalidCount > 0) console.log(`  ${invalidCount} entries with invalid/skippable email filtered out.`)

  // ── load existing output for idempotent merge ──
  const existing = loadJSON(OUTPUT_PATH, null)
  let existingContacts = (existing && existing.contacts) || []
  const existingHashes = new Set(existingContacts.map(c => emailHash(c.email)))

  const newContacts = valid.filter(c => !existingHashes.has(emailHash(c.email)))
  const merged = [...existingContacts, ...newContacts]
  const enrichedAt = new Date().toISOString()

  // ── count by region ──
  const byRegion = {}
  merged.forEach(c => { const r = c.island || 'unknown'; byRegion[r] = (byRegion[r] || 0) + 1 })

  if (SEND) {
    saveJSON(OUTPUT_PATH, {
      _note: 'US B2B hotels enriched for florida/puntacana/rivieramaya — generated by b2b-us-enrich.cjs. Compatible with b2b-cold-outreach.cjs (fields: email, name, town, island, fit, hook, url, beach, stars, source, enrichedAt).',
      updatedAt: enrichedAt,
      count: merged.length,
      contacts: merged,
    })
    console.log(`\nWritten: ${OUTPUT_PATH}`)
    console.log(`  Total contacts: ${merged.length} (${newContacts.length} new)`)
    Object.entries(byRegion).sort().forEach(([r, n]) => console.log(`  ${r}: ${n}`))
    console.log(`\nTo verify emails: export to CSV, correct, reimport with --csv <path>`)
  } else {
    console.log(`\nDry-run (use --send to write):`)
    console.log(`  Seed contacts: ${SEED.length}`)
    console.log(`  Valid emails: ${valid.length}`)
    console.log(`  Already in output: ${existingHashes.size}`)
    console.log(`  New contacts to add: ${newContacts.length}`)
    console.log(`  Total after merge: ${merged.length}`)
    Object.entries(byRegion).sort().forEach(([r, n]) => console.log(`  ${r}: ${n}`))
    console.log(`\nUsage:`)
    console.log(`  node scripts/automation/b2b-us-enrich.cjs --send       # write/merge`)
    console.log(`  node scripts/automation/b2b-us-enrich.cjs --manual    # template CSV`)
    console.log(`  GOOGLE_PLACES_KEY=xxx node ... --places               # API mode`)
    console.log(`  node scripts/automation/b2b-us-enrich.cjs --csv <path> # import CSV`)
  }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
module.exports = { isValidEmail, makeHook, likelyEmail, SEED }
