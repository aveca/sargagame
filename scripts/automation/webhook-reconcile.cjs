#!/usr/bin/env node
/**
 * webhook-reconcile.cjs — Réconciliation durable des événements webhook Mollie
 *
 * Relit le journal durable (data/webhook-events/*.json) et retente le mirror
 * Supabase pour les événements en statut `pending` dont le retry est dû.
 *
 * Contexte : quand SUPABASE_SERVICE_KEY est absent, mol_supabase_mirror() skippe
 * silencieusement et le webhook retourne 200. L'événement est alors journalisé
 * avec statut `pending`. Ce script le rattrape asynchrone­ment avec backoff.
 *
 * Usage :
 *   node scripts/automation/webhook-reconcile.cjs        # dry-run (lecture seule)
 *   node scripts/automation/webhook-reconcile.cjs --send # exécute les retries
 *
 * Secrets : SUPABASE_URL, SUPABASE_SERVICE_KEY (GH Actions / CI). Absent → skip propre.
 * Les fichiers du journal contiennent des PII (emails) : ne jamais logger en clair.
 */

const fs = require('fs')
const path = require('path')

const JOURNAL_DIR = path.resolve(__dirname, '../../data/webhook-events')
const SEND = process.argv.includes('--send')
const DRY = !SEND

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim()

let processed = 0
let succeeded = 0
let failed = 0
let skipped = 0

function maskEmail(email) {
  if (!email) return ''
  const at = email.indexOf('@')
  if (at <= 1) return '***'
  return email.slice(0, 2) + '***@' + email.slice(at + 1)
}

function log(label, detail = '') {
  console.log(`  ${label}${detail ? ' · ' + detail : ''}`)
}

function loadJournalFile(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  } catch {
    return null
  }
}

function isDue(record, now) {
  if ((record.status || '') !== 'pending') return false
  if ((record.attempts || 0) >= (record.max_attempts || 10)) return false
  const next = record.next_retry_at || null
  if (next !== null && new Date(next).getTime() > now) return false
  return true
}

function backoffSeconds(attempt) {
  // attempt 1 -> 5s, 2 -> 10s, 3 -> 20s, ... cap 300s (5 min)
  return Math.min(300, Math.max(5, Math.pow(2, attempt - 1) * 5))
}

function buildMirrorPayload(record) {
  // Reconstruit le payload envoyé par mol_b2b_grant_once à Supabase payment_grants.
  const plan = record.plan_key || 'pro_monthly'
  const isMonthly = plan === 'pro_monthly' || plan === 'brief_monthly'
  const durationDays = isMonthly ? 30 : 365
  const now = new Date()
  const expiresAt = new Date(now.getTime() + durationDays * 86400 * 1000)

  const payload = {
    subscription_id: record.id,
    type: 'b2b_pro',
    plan,
    customer_id: record.customer_id || null,
    expires_at: expiresAt.toISOString(),
    granted_at: now.toISOString(),
  }
  if (record.customer_email) {
    payload.email = record.customer_email
  }
  return payload
}

async function supabaseMirror(payload) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_KEY absent — mirror skipped')
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/payment_grants`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`)
  }
  return true
}

function updateJournalFile(eventId, updates) {
  const filepath = path.join(JOURNAL_DIR, `${eventId}.json`)
  const record = loadJournalFile(filepath)
  if (!record) return false
  const merged = { ...record, ...updates }
  const tmp = filepath + '.tmp.' + process.pid
  try {
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2))
    fs.renameSync(tmp, filepath)
    fs.chmodSync(filepath, 0o660)
    return true
  } catch {
    try { fs.unlinkSync(tmp) } catch {}
    return false
  }
}

async function main() {
  console.log('🔄 Webhook Journal Reconciliation')
  console.log('═══════════════════════════════════')
  console.log('')

  if (!fs.existsSync(JOURNAL_DIR)) {
    console.log('Aucun répertoire de journal (rien à réconcilier).')
    process.exit(0)
  }

  if (!SEND) {
    console.log('Mode DRY-RUN (aucun appel Supabase). Utilisez --send pour exécuter.')
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log('⚠️  SUPABASE_URL/SUPABASE_SERVICE_KEY absents — retry impossible (best-effort uniquement).')
  }

  const now = Date.now()
  const files = fs.readdirSync(JOURNAL_DIR).filter(f => f.endsWith('.json'))

  for (const file of files) {
    const filepath = path.join(JOURNAL_DIR, file)
    const record = loadJournalFile(filepath)
    if (!record) {
      log('⚠️  illisible', file)
      skipped++
      continue
    }

    const eventId = record.event_id || file.replace(/\.json$/, '')
    if (!isDue(record, now)) continue

    processed++
    const payload = buildMirrorPayload(record)
    const attempt = (record.attempts || 0) + 1

    log('→ retry', `${eventId} attempt=${attempt} plan=${payload.plan} email=${maskEmail(payload.email)}`)

    if (DRY) {
      // Dry-run : on ne fait pas l'appel, on estime le prochain retry.
      const nextRetry = new Date(now + backoffSeconds(attempt) * 1000).toISOString()
      console.log(`    [dry] next_retry_at=${nextRetry}`)
      continue
    }

    try {
      await supabaseMirror(payload)
      updateJournalFile(eventId, {
        status: 'done',
        attempts: attempt,
        processed_at: new Date().toISOString(),
        mirror_ok: true,
        last_error: null,
      })
      succeeded++
      log('  ✅ done', eventId)
    } catch (err) {
      const maxAttempts = record.max_attempts || 10
      const nextRetry = new Date(now + backoffSeconds(attempt) * 1000).toISOString()
      const updates = {
        attempts: attempt,
        next_retry_at: nextRetry,
        last_error: String(err).slice(0, 300),
        mirror_ok: false,
      }
      if (attempt >= maxAttempts) {
        updates.status = 'failed'
        failed++
        log('  ❌ failed (max attempts)', `${eventId} last_error=${updates.last_error}`)
      } else {
        updates.status = 'pending'
        failed++
        log('  ⚠️  retry later', `${eventId} next=${nextRetry} error=${updates.last_error}`)
      }
      updateJournalFile(eventId, updates)
    }
  }

  console.log('')
  console.log(`Résumé : ${processed} événement(s) retraité(s), ${succeeded} succès, ${failed} échec(s), ${skipped} ignoré(s).`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('❌ Erreur fatale :', err.message)
  process.exit(1)
})
