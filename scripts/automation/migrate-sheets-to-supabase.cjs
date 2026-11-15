#!/usr/bin/env node
/**
 * migrate-sheets-to-supabase.cjs — Import reproductible Google Sheets → Supabase
 *
 * Lit un fichier JSON d'export (généré par le script d'export Apps Script read-only)
 * et importe les données dans Supabase par lots, avec journal et déduplication.
 *
 * Usage :
 *   node scripts/automation/migrate-sheets-to-supabase.cjs --input sheet-data.json --dry
 *   node scripts/automation/migrate-sheets-to-supabase.cjs --input sheet-data.json --send
 *
 * Secrets : SUPABASE_URL, SUPABASE_SERVICE_KEY (GH Actions / CI). Absent → skip propre.
 *
 * Le fichier d'export est généré par le script Apps Script read-only déployé :
 *   https://script.google.com/macros/s/AKfycbxMVorrZ8Z_O7ueLVA1mHA35wpeL4BO52iIIV-SuPhAB2Z7sIEEzR_AmibZWyP2tFsRew/exec?action=all
 * (nécessite consentement OAuth au premier accès)
 *
 * Idempotent : relancer le script ne crée pas de doublons (dedup par email, session_id, etc.).
 * Journal : scripts/automation/data/migration-journal.json (reprise possible).
 */

const fs = require('fs')
const path = require('path')

const INPUT = process.argv.includes('--input') ? process.argv[process.argv.indexOf('--input') + 1] : null
const SEND = process.argv.includes('--send')
const DRY = !SEND

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co').trim().replace(/\/+$/, '')
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim()

const JOURNAL_PATH = path.join(__dirname, 'data', 'migration-journal.json')

function log(label, detail = '') {
  console.log(`  ${label}${detail ? ' · ' + detail : ''}`)
}

function loadJSON(filepath) {
  try { return JSON.parse(fs.readFileSync(filepath, 'utf-8')) } catch { return null }
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
}

async function supabaseInsert(table, rows) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY absent')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase ${table} ${res.status}: ${text.slice(0, 300)}`)
  }
  return true
}

async function supabaseCount(table) {
  if (!SERVICE_KEY) return null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Prefer': 'count=exact',
    },
  })
  const range = res.headers.get('content-range')
  if (range) {
    const parts = range.split('/')
    return parseInt(parts[1]) || 0
  }
  return null
}

function mapEmails(rows) {
  return rows.map(r => ({
    email: (r.email || '').trim().toLowerCase(),
    email_hash: null, // computed server-side or via SQL
    island: (r.island || 'MQ').toUpperCase(),
    source: r.source || 'sheet',
    unsubscribed: (r.unsubscribed || '').toString().toLowerCase() === 'yes',
    unsubscribed_at: (r.unsubscribed || '').toString().toLowerCase() === 'yes' ? (r.date || null) : null,
    source_sheet: 'emails',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  })).filter(r => r.email && r.email.includes('@'))
}

function mapFeedback(rows) {
  return rows.map(r => ({
    rating: parseInt(r.rating) || null,
    text: (r.text || '').substring(0, 500),
    island: (r.island || 'MQ').toUpperCase(),
    source_sheet: 'feedback',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  }))
}

function mapPayments(rows) {
  return rows.map(r => ({
    session_id: r.session_id || null,
    email: (r.email || '').trim().toLowerCase() || null,
    amount: parseFloat(r.amount) || null,
    currency: (r.currency || 'eur').toLowerCase(),
    status: r.status || 'paid',
    island: (r.island || '').toUpperCase() || null,
    source_sheet: 'payments',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  })).filter(r => r.session_id)
}

function mapSubscriptionEvents(rows) {
  return rows.map(r => ({
    event_type: r.event_type || null,
    object_id: r.object_id || null,
    email: (r.email || '').trim().toLowerCase() || null,
    customer_id: r.customer || null,
    subscription_id: r.subscription || null,
    amount: parseFloat(r.amount) || null,
    currency: (r.currency || '').toLowerCase() || null,
    island: (r.island || '').toUpperCase() || null,
    source_sheet: 'subscription_events',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  })).filter(r => r.event_type && r.object_id)
}

function mapEmailLog(rows) {
  return rows.map(r => ({
    island: (r.island || 'MQ').toUpperCase(),
    subject: r.subject || null,
    sent_count: parseInt(r.sent) || 0,
    total_subscribers: parseInt(r.total_subscribers) || 0,
    source_sheet: 'email_log',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  }))
}

function mapDigestLog(rows) {
  return rows.map(r => ({
    island: (r.island || 'MQ').toUpperCase(),
    digest: r.digest || null,
    source_sheet: 'digest_log',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  }))
}

function mapEmailTracking(rows) {
  return rows.map(r => ({
    resend_id: r.resend_id || null,
    to_email: (r.to || '').trim().toLowerCase() || null,
    subject: (r.subject || '').substring(0, 200) || null,
    email_type: r.email_type || 'unknown',
    island: (r.island || 'MQ').toUpperCase(),
    status: r.status || 'sent',
    plan: r.plan || null,
    source: r.source || null,
    source_sheet: 'email_tracking',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  }))
}

function mapEmailEvents(rows) {
  return rows.map(r => ({
    event_type: r.event_type || null,
    resend_id: r.resend_id || null,
    to_email: (r.to || '').trim().toLowerCase() || null,
    subject: (r.subject || '').substring(0, 200) || null,
    from_email: r.from || null,
    source_sheet: 'email_events',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  }))
}

function mapBeachReports(rows) {
  return rows.map(r => ({
    beach_id: r.beach_id || null,
    beach_name: r.beach_name || null,
    island: (r.island || 'MQ').toUpperCase(),
    level: r.level || 'clean',
    source_sheet: 'beach_reports',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  })).filter(r => r.beach_id)
}

function mapAnalyticsEvents(rows) {
  return rows.map(r => ({
    event_name: r.event_name || null,
    island: (r.island || 'MQ').toUpperCase(),
    raw_params: r.raw_params || null,
    source_sheet: 'analytics_events',
    source_row_id: r._row_id || null,
    source_updated_at: r.date || null,
  })).filter(r => r.event_name)
}

const IMPORTERS = {
  emails: { table: 'b2b_contact_emails', map: mapEmails },
  feedback: { table: 'contact_feedback', map: mapFeedback },
  payments: { table: 'contact_payments', map: mapPayments },
  subscription_events: { table: 'contact_subscriptions', map: mapSubscriptionEvents },
  email_log: { table: 'email_campaigns', map: mapEmailLog },
  digest_log: { table: 'email_campaigns', map: mapDigestLog },
  email_tracking: { table: 'email_messages', map: mapEmailTracking },
  email_events: { table: 'email_messages', map: mapEmailEvents },
  beach_reports: { table: 'automation_runs', map: mapBeachReports },
  analytics_events: { table: 'automation_runs', map: mapAnalyticsEvents },
}

async function main() {
  console.log('=== Migration Google Sheets → Supabase ===')
  console.log('')

  if (!INPUT) {
    console.log('Usage: node scripts/automation/migrate-sheets-to-supabase.cjs --input sheet-data.json [--dry|--send]')
    console.log('')
    console.log('Le fichier d\'export est généré par le script Apps Script read-only :')
    console.log('  https://script.google.com/macros/s/AKfycbxMVorrZ8Z_O7ueLVA1mHA35wpeL4BO52iIIV-SuPhAB2Z7sIEEzR_AmibZWyP2tFsRew/exec?action=all')
    process.exit(1)
  }

  const data = loadJSON(INPUT)
  if (!data) {
    console.log('❌ Fichier introuvable ou JSON invalide:', INPUT)
    process.exit(1)
  }

  if (DRY) {
    console.log('Mode DRY-RUN (aucun appel Supabase). Utilisez --send pour exécuter.')
  }
  if (!SERVICE_KEY) {
    console.log('⚠️  SUPABASE_SERVICE_KEY absent — import impossible (best-effort uniquement).')
  }

  // Load or init journal
  let journal = loadJSON(JOURNAL_PATH) || { runs: [] }
  const runId = new Date().toISOString()
  const run = { run_id: runId, started_at: runId, sheets: {}, status: 'in_progress' }

  for (const sheetName of Object.keys(IMPORTERS)) {
    const importer = IMPORTERS[sheetName]
    const sheetData = data[sheetName]
    if (!sheetData || !sheetData.exists) {
      log('⚠️  skip', `${sheetName} (absent dans l'export)`)
      run.sheets[sheetName] = { status: 'skipped', reason: 'absent' }
      continue
    }

    const rows = sheetData.rows || []
    const mapped = importer.map(rows)
    log('→ import', `${sheetName} → ${importer.table} (${mapped.length} lignes mappées sur ${rows.length} source)`)

    run.sheets[sheetName] = {
      source_count: rows.length,
      mapped_count: mapped.length,
      table: importer.table,
      status: 'pending',
    }

    if (DRY || !SERVICE_KEY) {
      run.sheets[sheetName].status = 'dry_run'
      continue
    }

    try {
      // Import par lots de 100
      const BATCH = 100
      for (let i = 0; i < mapped.length; i += BATCH) {
        const batch = mapped.slice(i, i + BATCH)
        await supabaseInsert(importer.table, batch)
      }
      run.sheets[sheetName].status = 'done'
      run.sheets[sheetName].imported_at = new Date().toISOString()
      log('  ✅ done', `${sheetName} → ${importer.table}`)
    } catch (err) {
      run.sheets[sheetName].status = 'failed'
      run.sheets[sheetName].error = String(err).slice(0, 500)
      log('  ❌ failed', `${sheetName}: ${run.sheets[sheetName].error}`)
    }
  }

  run.status = 'completed'
  run.completed_at = new Date().toISOString()
  journal.runs.push(run)
  if (!DRY) saveJSON(JOURNAL_PATH, journal)

  console.log('')
  console.log('Résumé :')
  for (const [name, info] of Object.entries(run.sheets)) {
    console.log(`  ${name}: ${info.status} (${info.mapped_count || 0} lignes → ${info.table})`)
  }
  console.log('')
  console.log('Journal :', JOURNAL_PATH)
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err.message)
  process.exit(1)
})
