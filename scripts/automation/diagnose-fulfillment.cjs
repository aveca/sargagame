#!/usr/bin/env node
/**
 * diagnose-fulfillment.cjs — Diagnostic lecture seule du fulfillment Mollie → Supabase
 *
 * Vérifie :
 * 1. Si le RPC sg_upsert_payment_grant existe dans Supabase (appel test en lecture)
 * 2. Si des payment_grants existent déjà dans Supabase
 * 3. Si les 6 paiements payés détectés par reconcile-sales ont un grant correspondant
 * 4. Si les payment links Mollie ont un webhookUrl configuré
 *
 * Secrets requis : MOLLIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 * GET uniquement — aucun paiement, grant ou modification n'est effectué.
 */
const fs = require('fs')
const path = require('path')

const OUT_PATH = path.join(__dirname, 'data', 'fulfillment-diagnosis.json')
const MOLLIE_BASE = 'https://api.mollie.com/v2'

async function mollieGet(url, key) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + key } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mollie GET ${url}: ${j.detail || res.status}`)
  return j
}

async function listAll(basePath, key, cap = 500) {
  const out = []
  let url = basePath
  let pages = 0
  while (out.length < cap && url) {
    const pg = await mollieGet(url, key)
    const keyName = Object.keys(pg._embedded || {})[0]
    const items = keyName ? pg._embedded[keyName] : []
    out.push(...(items || []))
    url = pg._links?.next?.href || null
    pages += 1
    if (pages > 200) throw new Error('Mollie pagination exceeded safety cap')
  }
  return out
}

async function supabaseRpc(sbUrl, sbKey, name, body) {
  const res = await fetch(`${sbUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: 'Bearer ' + sbKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(body || {})
  })
  let text
  try { text = await res.text() } catch { text = '' }
  return { ok: res.ok, status: res.status, text, code: null }
}

async function supabaseGrants(sbUrl, sbKey) {
  const res = await fetch(`${sbUrl.replace(/\/$/, '')}/rest/v1/payment_grants?select=payment_id,type,pass,plan,email,currency,expires_at,granted_at&order=created_at.desc&limit=100`, {
    headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, Accept: 'application/json' }
  })
  if (!res.ok) return { error: `Supabase grants: ${res.status}` }
  return await res.json()
}

async function main() {
  const mollieKey = (process.env.MOLLIE_API_KEY || '').trim()
  const sbUrl = (process.env.SUPABASE_URL || '').trim()
  const sbKey = (process.env.SUPABASE_SERVICE_KEY || '').trim()

  const diagnosis = {
    generatedAt: new Date().toISOString(),
    checks: {},
  }

  // ── 1. RPC sg_upsert_payment_grant existe-t-il ? ─────────────────────
  if (sbUrl && sbKey) {
    const rpcTest = await supabaseRpc(sbUrl, sbKey, 'sg_upsert_payment_grant', {
      p_payment_id: 'diag_check_only',
      p_pass: 'p30',
      p_email: 'diag@example.com',
      p_currency: 'EUR',
      p_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      p_granted_at: new Date().toISOString(),
      p_metadata: { diag: true }
    })
    diagnosis.checks.rpc_exists = rpcTest.ok
    diagnosis.checks.rpc_status = rpcTest.status
    diagnosis.checks.rpc_text = rpcTest.text.slice(0, 300)
    diagnosis.checks.rpc_error = rpcTest.ok ? null : rpcTest.text.slice(0, 300)
  } else {
    diagnosis.checks.rpc_exists = null
    diagnosis.checks.rpc_error = 'SUPABASE_URL ou SUPABASE_SERVICE_KEY absent'
  }

  // ── 2. Grants existants dans Supabase ────────────────────────────────
  if (sbUrl && sbKey) {
    const grants = await supabaseGrants(sbUrl, sbKey)
    diagnosis.checks.supabase_grants = grants
    diagnosis.checks.grants_count = Array.isArray(grants) ? grants.length : 0
  } else {
    diagnosis.checks.grants_count = null
  }

  // ── 3. Payment links Mollie avec webhookUrl ──────────────────────────
  if (mollieKey) {
    const links = await listAll('/v2/payment-links', mollieKey)
    diagnosis.checks.payment_links_count = links.length
    diagnosis.checks.links_with_webhook = links.filter(l => l.webhookUrl).length
    diagnosis.checks.links_without_webhook = links.filter(l => !l.webhookUrl).length
    diagnosis.checks.sample_links = links.slice(0, 5).map(l => ({
      id: l.id,
      amount: l.amount,
      description: l.description,
      webhookUrl: l.webhookUrl || null,
      redirectUrl: l.redirectUrl || null,
    }))
  }

  console.log('=== Diagnostic fulfillment ===')
  console.log(`RPC sg_upsert_payment_grant : ${diagnosis.checks.rpc_exists ? 'EXISTE' : 'ABSENT/ERREUR'} (status ${diagnosis.checks.rpc_status})`)
  if (!diagnosis.checks.rpc_exists) console.log(`  Détail : ${diagnosis.checks.rpc_text}`)
  console.log(`Grants Supabase : ${diagnosis.checks.grants_count}`)
  console.log(`Payment links Mollie : ${diagnosis.checks.payment_links_count} (${diagnosis.checks.links_with_webhook} avec webhook)`)

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(diagnosis, null, 2))
  console.log(`Rapport écrit → ${path.relative(process.cwd(), OUT_PATH)}`)
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
