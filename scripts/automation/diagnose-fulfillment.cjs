#!/usr/bin/env node
'use strict'

/**
 * diagnose-fulfillment.cjs — Diagnostic strictement GET-only du fulfillment.
 *
 * Aucun RPC de grant n'est appelé : tester sg_upsert_payment_grant par POST
 * créerait potentiellement un vrai entitlement. L'existence du RPC doit être
 * vérifiée par migration/catalogue SQL en lecture seule, jamais par exécution.
 *
 * Le rapport local est écrit dans os.tmpdir(), jamais dans le dépôt.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const OUT_PATH = path.join(os.tmpdir(), 'sargagame-fulfillment-diagnosis.json')
const MOLLIE_BASE = 'https://api.mollie.com/v2'

async function mollieGet(url, key) {
  const requestUrl = url.startsWith('http') ? url : new URL(url, MOLLIE_BASE).toString()
  const res = await fetch(requestUrl, { headers: { Authorization: 'Bearer ' + key } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mollie GET failed: HTTP ${res.status}`)
  return body
}

async function listAll(basePath, key, cap = 500) {
  const out = []
  let url = basePath
  let pages = 0
  while (out.length < cap && url) {
    const page = await mollieGet(url, key)
    const embedded = page._embedded || {}
    const items = embedded.payments || embedded['payment-links'] || embedded.paymentLinks ||
      embedded.refunds || Object.values(embedded)[0] || []
    out.push(...items)
    url = page._links?.next?.href || null
    pages += 1
    if (pages > 200) throw new Error('Mollie pagination exceeded safety cap')
  }
  return out.slice(0, cap)
}

async function supabaseGrants(url, key) {
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/payment_grants?select=payment_id,type,pass,plan,currency,expires_at,granted_at&order=created_at.desc&limit=100`
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Supabase grants GET failed: HTTP ${res.status}`)
  return await res.json()
}

async function main() {
  const mollieKey = (process.env.MOLLIE_API_KEY || '').trim()
  const sbUrl = (process.env.SUPABASE_URL || '').trim()
  const sbKey = (process.env.SUPABASE_SERVICE_KEY || '').trim()

  // Fail before making any network request if the full read-only contract is absent.
  if (!mollieKey || !sbUrl || !sbKey) {
    throw new Error('MOLLIE_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_KEY are all required; no API request was made.')
  }
  if (!mollieKey.startsWith('live_') && !mollieKey.startsWith('test_')) {
    throw new Error('MOLLIE_API_KEY prefix is not recognized; no API request was made.')
  }

  const grants = await supabaseGrants(sbUrl, sbKey)
  const links = await listAll('/v2/payment-links', mollieKey)
  const diagnosis = {
    generatedAt: new Date().toISOString(),
    mode: mollieKey.startsWith('live_') ? 'LIVE' : 'TEST',
    checks: {
      rpc_exists: null,
      rpc_check: 'not_probed_read_only',
      supabase_grants_count: Array.isArray(grants) ? grants.length : null,
      payment_links_count: links.length,
      links_with_webhook: links.filter(link => Boolean(link.webhookUrl)).length,
      links_without_webhook: links.filter(link => !link.webhookUrl).length,
    },
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(diagnosis, null, 2), { mode: 0o600 })
  console.log('=== Diagnostic fulfillment (GET only) ===')
  console.log('RPC existence: NOT PROBED (no write-capable RPC is executed)')
  console.log(`Supabase grants read: ${diagnosis.checks.supabase_grants_count}`)
  console.log(`Mollie payment links read: ${diagnosis.checks.payment_links_count}`)
  console.log(`Links with webhook: ${diagnosis.checks.links_with_webhook}`)
  console.log('No payment, grant, refund, webhook or production record was modified.')
}

main().catch(error => {
  console.error('Diagnostic failed:', error.message)
  process.exitCode = 1
})
