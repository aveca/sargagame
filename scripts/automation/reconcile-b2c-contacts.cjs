#!/usr/bin/env node
/**
 * reconcile-b2c-contacts.cjs — Segmentation contacts B2C opt-in (P3)
 *
 * Lit le CSV des contacts B2C (passé en argument, JAMAIS commité en clair),
 * les valide, déduit les doublons, identifie les bounces via
 * bounced-emails.json (hashes SHA-256), et — si les clés Supabase sont
 * disponibles — croise avec b2c_alerts (désinscrits) et payment_grants
 * (acheteurs).
 *
 * Sortie : scripts/automation/data/b2c-segmentation.json (SANS PII : emails
 * hashés SHA-256 tronqués, jamais en clair).
 *
 * Secrets optionnels (env) : SUPABASE_URL, SUPABASE_SERVICE_KEY
 * CSV requis : premier argument = chemin du fichier CSV (Date,Email,Island,Source,unsubscribed)
 *
 * Usage :
 *   node scripts/automation/reconcile-b2c-contacts.cjs /chemin/vers/Sargasses\ Emails\ -\ Emails.csv [--send]
 *   sans --send : dry-run (affiche sur stdout)
 *   avec --send : écrit scripts/automation/data/b2c-segmentation.json
 */
const fs = require('fs')
const path = require('path')
const { emailHash } = require('./lib/email-hash.cjs')

const OUT_PATH = path.join(__dirname, 'data', 'b2c-segmentation.json')
const SEND = process.argv.includes('--send')
const CSV_PATH = process.argv.find(a => !a.startsWith('--') && a.endsWith('.csv'))

const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEST_PATTERNS = [/test@example\.com/i, /127\.0\.0\.1/, /localhost/i, /mock/i, /^test@/i]

function readCsv(csvPath) {
  if (!fs.existsSync(csvPath)) throw new Error('CSV introuvable : ' + csvPath)
  const raw = fs.readFileSync(csvPath, 'utf8')
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0)
  const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',')
    const row = {}
    for (let j = 0; j < header.length; j++) row[header[j]] = (vals[j] || '').replace(/^"|"$/g, '').trim()
    rows.push(row)
  }
  return { header, rows }
}

function isValidEmail(email) {
  if (!email || !EMAIL_RE.test(email)) return false
  const lower = email.toLowerCase()
  for (const pat of TEST_PATTERNS) if (pat.test(lower)) return false
  return true
}

function isTestEmail(email) {
  if (!email) return false
  const lower = email.toLowerCase()
  for (const pat of TEST_PATTERNS) if (pat.test(lower)) return true
  return false
}

async function loadSupabase(url, key) {
  // b2c_alerts : actif / désinscrit / placeholder
  let alerts = []
  try {
    const q = `${url.replace(/\/$/, '')}/rest/v1/b2c_alerts?select=email,active,unsubscribed,unsubscribe_token,island,created_at&order=created_at.desc`
    const r = await fetch(q, { headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' } })
    if (r.ok) alerts = await r.json()
  } catch { /* supabase indisponible, on continue sans */ }

  // payment_grants : acheteurs
  let grants = []
  try {
    const q2 = `${url.replace(/\/$/, '')}/rest/v1/payment_grants?select=email,type,pass,plan,currency,expires_at&order=created_at.desc`
    const r2 = await fetch(q2, { headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' } })
    if (r2.ok) grants = await r2.json()
  } catch { /* supabase indisponible */ }

  return { alerts, grants }
}

async function main() {
  const bounced = new Set()
  try {
    const b = JSON.parse(fs.readFileSync(BOUNCED_PATH, 'utf8'))
    for (const h of b) bounced.add(h)
  } catch { /* bounced-emails.json absent */ }

  const sbUrl = (process.env.SUPABASE_URL || '').trim()
  const sbKey = (process.env.SUPABASE_SERVICE_KEY || '').trim()
  let sb = { alerts: [], grants: [] }
  if (sbUrl && sbKey) {
    try { sb = await loadSupabase(sbUrl, sbKey) } catch (e) { console.warn('[b2c] Supabase indisponible:', e.message) }
  }

  // Index Supabase par hash d'email (pas de PII en clair)
  const alertByHash = new Map()
  for (const a of sb.alerts) alertByHash.set(emailHash(String(a.email || '')), a)
  const buyerByHash = new Map()
  for (const g of sb.grants) buyerByHash.set(emailHash(String(g.email || '')), g)

  // Lecture CSV
  if (!CSV_PATH) {
    console.error('Usage: node reconcile-b2c-contacts.cjs <chemin_csv> [--send]')
    process.exit(1)
  }
  const { header, rows } = readCsv(CSV_PATH)

  const seen = new Set()
  const segments = { active: [], unsubscribed: [], bounced: [], buyer: [], nonBuyer: [], test: [], b2b: [] }
  let duplicates = 0, invalid = 0, total = rows.length

  for (const row of rows) {
    const email = String(row.Email || '').trim()
    const island = String(row.Island || '').trim()
    const source = String(row.Source || '').trim()
    const h = emailHash(email)

    // Doublons exacts (même email)
    if (seen.has(h)) { duplicates++; continue }
    seen.add(h)

    // Invalides / test
    if (!isValidEmail(email)) { invalid++; segments.test.push({ emailHash: h, island, source, reason: 'invalid_or_test' }); continue }
    if (isTestEmail(email)) { segments.test.push({ emailHash: h, island, source, reason: 'test_pattern' }); continue }

    // B2B : sources pro ou île pro
    const isB2B = /pro|b2b|hotel|agency|collectiv/i.test(source) || /pro|b2b|hotel|agency|collectiv/i.test(island)
    if (isB2B) { segments.b2b.push({ emailHash: h, island, source }); continue }

    // Bounce
    if (bounced.has(h)) { segments.bounced.push({ emailHash: h, island, source }); continue }

    // Désinscrit (Supabase)
    const alert = alertByHash.get(h)
    if (alert && (alert.unsubscribed === true || String(alert.active).toLowerCase() === 'false')) {
      segments.unsubscribed.push({ emailHash: h, island, source, token: alert.unsubscribe_token || null })
      continue
    }

    // Acheteur (Supabase payment_grants)
    const grant = buyerByHash.get(h)
    if (grant) {
      segments.buyer.push({ emailHash: h, island, source, pass: grant.pass, plan: grant.plan, currency: grant.currency, expiresAt: grant.expires_at })
      continue
    }

    // Actif par défaut
    segments.active.push({ emailHash: h, island, source })
  }

  const summary = {
    totalRows: total,
    uniqueValid: seen.size - invalid - (segments.test.filter(x => x.reason === 'test_pattern').length) - duplicates,
    duplicates,
    invalid,
    bySegment: {
      active: segments.active.length,
      unsubscribed: segments.unsubscribed.length,
      bounced: segments.bounced.length,
      buyer: segments.buyer.length,
      nonBuyer: segments.nonBuyer.length,
      test: segments.test.length,
      b2b: segments.b2b.length,
    },
    supabase: { alertsLoaded: sb.alerts.length, grantsLoaded: sb.grants.length },
    sourceFile: path.basename(CSV_PATH),
    generatedAt: new Date().toISOString(),
  }

  const report = { summary, segments }

  console.log('=== Segmentation B2C ===')
  console.log(`Lignes CSV : ${total}`)
  console.log(`Uniques valides : ${summary.uniqueValid}`)
  console.log(`Doublons : ${duplicates} | Invalides : ${invalid}`)
  console.log(`Actifs : ${segments.active.length} | Non-acheteurs : ${segments.nonBuyer.length}`)
  console.log(`Acheteurs : ${segments.buyer.length} | Désinscrits : ${segments.unsubscribed.length}`)
  console.log(`Bounces : ${segments.bounced.length} | Test : ${segments.test.length} | B2B : ${segments.b2b.length}`)
  console.log(`Supabase : ${sb.alerts.length} alertes, ${sb.grants.length} grants`)

  if (SEND) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
    console.log(`\nRapport écrit → ${path.relative(process.cwd(), OUT_PATH)}`)
  } else {
    console.log('\n(Dry-run : passez --send pour écrire le fichier)')
  }
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
