/**
 * funnel-b2b-from-supabase.cjs — fail-closed, auditable B2B funnel snapshot.
 *
 * Reads public.analytics_events through Supabase REST. A snapshot is written
 * only after every page has been fetched and validated. Synthetic CI rows are
 * excluded by their exact historical IDs; unknown islands remain UNKNOWN and
 * are never silently attributed to MQ.
 *
 * Usage: node scripts/automation/funnel-b2b-from-supabase.cjs [--days=90]
 * Env: SUPABASE_SERVICE_KEY, optional SUPABASE_URL.
 */

'use strict'

const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const OUT_PATH = path.join(__dirname, 'data', 'funnel-b2b-snapshot.json')
const DAYS = (() => {
  const arg = process.argv.find((x) => x.startsWith('--days='))
  const n = arg ? parseInt(arg.slice(7), 10) : 90
  return Number.isFinite(n) && n > 0 ? n : 90
})()
const PAGE = 1000

const B2B_KEYS = ['b2b_trial_started', 'b2b_widget_activated', 'b2b_trial_to_paid', 'payment_rejected']

// These two rows were inserted by the historical CI fixture and have no
// production payment provenance. Keep the exact IDs auditable and never count
// them as paid conversions. Do not delete or mutate the production rows.
const EXCLUDED_SYNTHETIC_IDS = new Set([488769, 488770])

function hasValidRowId(row) {
  return !!row && row.id !== null && row.id !== undefined && String(row.id).trim() !== '' &&
    Number.isSafeInteger(Number(row.id))
}

function svcHeaders(extra, serviceKey = SERVICE_KEY) {
  return Object.assign({
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Range-Unit': 'items',
    Prefer: 'count=exact',
  }, extra || {})
}

function parseContentRange(value) {
  const match = /^(?:(\d+)-(\d+)|\*)\/(\d+|\*)$/.exec(String(value || '').trim())
  if (!match) throw new Error('Supabase analytics response missing a valid Content-Range header')
  return {
    start: match[1] === undefined ? null : Number(match[1]),
    end: match[2] === undefined ? null : Number(match[2]),
    total: match[3] === '*' ? null : Number(match[3]),
  }
}

async function fetchAll(cutoffIso, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch
  const supabaseUrl = String(options.supabaseUrl || SUPABASE_URL).replace(/\/+$/, '')
  const serviceKey = options.serviceKey === undefined ? SERVICE_KEY : options.serviceKey
  const pageSize = Number.isInteger(options.pageSize) && options.pageSize > 0 ? options.pageSize : PAGE
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation unavailable')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required for a complete B2B funnel snapshot')

  const rows = []
  let expectedTotal = null

  for (let from = 0; ; from += pageSize) {
    const params = new URLSearchParams({
      select: 'id,event,params,island,ts',
      event: 'in.(' + B2B_KEYS.join(',') + ')',
      ts: 'gte.' + cutoffIso,
      order: 'ts.asc,id.asc',
    })
    const url = supabaseUrl + '/rest/v1/analytics_events?' + params.toString()
    let response
    try {
      response = await fetchImpl(url, {
        headers: svcHeaders({ Range: from + '-' + (from + pageSize - 1) }, serviceKey),
        signal: AbortSignal.timeout(30000),
      })
    } catch (error) {
      throw new Error('Supabase analytics fetch failed at offset ' + from + ': ' + (error?.message || 'network error'))
    }

    if (!response || !response.ok) {
      const detail = response && typeof response.text === 'function'
        ? await response.text().catch(() => '')
        : ''
      throw new Error('Supabase analytics HTTP failure at offset ' + from + ': ' +
        (response ? response.status : 'no response') + (detail ? ' ' + detail.slice(0, 300) : ''))
    }

    let batch
    try {
      batch = await response.json()
    } catch (error) {
      throw new Error('Supabase analytics returned invalid JSON at offset ' + from + ': ' + (error?.message || 'parse error'))
    }
    if (!Array.isArray(batch)) throw new Error('Supabase analytics returned a non-array page at offset ' + from)

    const range = parseContentRange(response.headers?.get?.('content-range'))
    if (range.start !== null && range.start !== from) {
      throw new Error('Supabase analytics page offset mismatch: requested ' + from + ', received ' + range.start)
    }
    if (range.start !== null && batch.length !== (range.end - range.start + 1)) {
      throw new Error('Supabase analytics page length does not match Content-Range at offset ' + from)
    }
    if (range.total !== null) {
      if (expectedTotal !== null && range.total !== expectedTotal) {
        throw new Error('Supabase analytics total changed during pagination; refusing partial snapshot')
      }
      expectedTotal = range.total
    }

    rows.push(...batch)

    if (expectedTotal !== null) {
      if (rows.length > expectedTotal) throw new Error('Supabase analytics returned more rows than Content-Range total')
      if (rows.length === expectedTotal) break
      if (!batch.length || batch.length !== pageSize) {
        throw new Error('Supabase analytics pagination ended before the reported total')
      }
    } else if (batch.length < pageSize) {
      break
    }
  }

  if (rows.some((row) => !hasValidRowId(row))) {
    throw new Error('Supabase analytics page contains a row without a valid numeric id')
  }
  return rows
}

function compute(rows) {
  if (!Array.isArray(rows)) throw new TypeError('B2B funnel rows must be an array')
  if (rows.some((row) => !hasValidRowId(row))) {
    throw new Error('B2B funnel rows must include a valid numeric id')
  }

  const excluded = rows.filter((row) => EXCLUDED_SYNTHETIC_IDS.has(Number(row.id)))
  const included = rows.filter((row) => !EXCLUDED_SYNTHETIC_IDS.has(Number(row.id)))
  const counts = { trials: 0, activated: 0, paid: 0, rejected: 0 }
  const byIsland = {}
  const paidByPlan = {}
  const rejectedByTier = {}
  const rejectedByKind = {}
  const rejectedExamples = []

  for (const row of included) {
    const event = String(row.event || '')
    const island = String(row.island || '').trim().toUpperCase() || 'UNKNOWN'
    byIsland[island] = byIsland[island] || { trials: 0, activated: 0, paid: 0 }

    if (event === 'b2b_trial_started') {
      counts.trials++
      byIsland[island].trials++
    } else if (event === 'b2b_widget_activated') {
      counts.activated++
      byIsland[island].activated++
    } else if (event === 'b2b_trial_to_paid') {
      counts.paid++
      byIsland[island].paid++
      const plan = (row.params && row.params.plan) || 'unknown'
      paidByPlan[plan] = (paidByPlan[plan] || 0) + 1
    } else if (event === 'payment_rejected') {
      counts.rejected++
      const params = row.params || {}
      const tier = params.tier || 'unknown'
      const kind = params.kind || 'unknown'
      rejectedByTier[tier] = (rejectedByTier[tier] || 0) + 1
      rejectedByKind[kind] = (rejectedByKind[kind] || 0) + 1
      if (rejectedExamples.length < 20) {
        rejectedExamples.push({
          error: params.error || null,
          value: params.value || null,
          currency: params.currency || null,
          tier,
          kind,
        })
      }
    }
  }

  const percentage = (numerator, denominator) =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0

  return {
    counts,
    rates: {
      trial_to_paid: percentage(counts.paid, counts.trials),
      trial_to_activated: percentage(counts.activated, counts.trials),
      activated_to_paid: percentage(counts.paid, counts.activated),
    },
    paid_by_plan: paidByPlan,
    rejected_by_tier: rejectedByTier,
    rejected_by_kind: rejectedByKind,
    rejected_examples: rejectedExamples,
    by_island: byIsland,
    excluded_synthetic_rows: excluded.length,
  }
}

function buildSnapshot(rows, cutoff, days) {
  const computed = compute(rows)
  return {
    window_days: days,
    since: cutoff,
    total_rows: rows.length,
    included_rows: rows.length - computed.excluded_synthetic_rows,
    ...computed,
  }
}

async function main(options = {}) {
  const serviceKey = options.serviceKey === undefined ? SERVICE_KEY : options.serviceKey
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is missing; refusing to publish a stale or empty snapshot')

  const days = options.days || DAYS
  const now = options.now || new Date()
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString()
  const rows = await fetchAll(cutoff, {
    fetchImpl: options.fetchImpl,
    supabaseUrl: options.supabaseUrl,
    serviceKey,
    pageSize: options.pageSize,
  })
  const snapshot = buildSnapshot(rows, cutoff, days)
  const outPath = options.outPath || OUT_PATH
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const tempPath = outPath + '.' + process.pid + '.tmp'
  try {
    fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2) + '\n')
    fs.renameSync(tempPath, outPath)
  } catch (error) {
    try { fs.unlinkSync(tempPath) } catch {}
    throw new Error('Unable to publish complete B2B funnel snapshot: ' + (error?.message || 'write error'))
  }

  console.log('[funnel-b2b] écrit ' + outPath)
  console.log('[funnel-b2b] ' + days + 'j · essais ' + snapshot.counts.trials +
    ' · activés ' + snapshot.counts.activated + ' · payés ' + snapshot.counts.paid +
    ' · exclus synthétiques ' + snapshot.excluded_synthetic_rows +
    ' · essai→payé ' + snapshot.rates.trial_to_paid + '%')
  if (snapshot.counts.rejected) {
    console.log('[funnel-b2b] ⚠ ' + snapshot.counts.rejected +
      ' paiement(s) refusé(s) par le webhook → à réconcilier : ' +
      JSON.stringify(snapshot.rejected_by_tier))
  }
  return snapshot
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[funnel-b2b] échec — aucun snapshot partiel publié:', error?.message || error)
    process.exitCode = 1
  })
}

module.exports = {
  B2B_KEYS,
  EXCLUDED_SYNTHETIC_IDS,
  parseContentRange,
  fetchAll,
  compute,
  buildSnapshot,
  main,
}
