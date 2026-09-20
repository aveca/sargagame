#!/usr/bin/env node
'use strict'
/**
 * B2B store — deterministic upsert layer for the B2B sales engine.
 *
 * PostgREST upsert cannot target the PARTIAL unique indexes
 * (companies_siren_uidx has `where siren is not null`), so we do an explicit
 * read-then-write keyed on siren/siret: select existing ids, then POST the
 * new rows and PATCH the existing ones. Idempotent: re-importing the same
 * payload produces zero writes beyond updated_at maintenance.
 *
 * SAFETY:
 *   - dryRun=true  → NO http call at all (not even SELECT) unless the caller
 *                    explicitly opts into a read-through plan (`readPlan: true`)
 *   - live mode is FAIL-CLOSED: missing supabaseUrl/serviceKey/fetchFn throws
 *   - logs contain counts only — never emails, phones or secrets
 */

function fail(msg) { throw new Error('b2b-store: ' + msg) }

function createStore(opts) {
  const o = opts || {}
  const dryRun = o.dryRun !== false // default DRY
  const fetchFn = o.fetchFn
  if (!dryRun) {
    if (!o.supabaseUrl) fail('SUPABASE_URL manquant (fail-closed)')
    if (!o.serviceKey) fail('SUPABASE_SERVICE_KEY manquant (fail-closed)')
    if (typeof fetchFn !== 'function') fail('fetchFn requis (fail-closed)')
  }
  const base = o.supabaseUrl ? String(o.supabaseUrl).replace(/\/+$/, '') : null
  const stats = { inserted: 0, updated: 0, unchanged: 0, wouldInsert: 0, wouldUpdate: 0 }
  const http = { calls: 0 }

  function headers(extra) {
    return Object.assign({
      'apikey': o.serviceKey,
      'Authorization': 'Bearer ' + o.serviceKey,
      'Content-Type': 'application/json',
    }, extra || {})
  }

  async function req(method, path, body, extraHeaders) {
    http.calls++
    const res = await fetchFn(base + '/rest/v1/' + path, {
      method,
      headers: headers(extraHeaders),
      body: body == null ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = new Error('supabase ' + method + ' ' + path + ' -> ' + res.status + ' ' + text.slice(0, 200))
      err.status = res.status
      throw err
    }
    if (res.status === 204) return []
    const text = await res.text()
    return text ? JSON.parse(text) : []
  }

  function chunk(arr, size) {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  function inList(values) {
    return values.map((v) => '"' + String(v).replace(/"/g, '') + '"').join(',')
  }

  // Plan against EXISTING rows (read path — used in both modes when
  // readPlan is allowed; in pure dry-run the caller passes existingByKey={}).
  async function planUpserts(table, keyCol, keyField, rows, existingByKey) {
    const plan = { toInsert: [], toUpdate: [], existingByKey: existingByKey || {} }
    if (existingByKey) return planWithExisting(table, keyCol, keyField, rows, existingByKey, plan)
    // live read
    const keys = rows.map((r) => r[keyField]).filter(Boolean)
    for (const part of chunk(keys, 100)) {
      const got = await req('GET',
        `${table}?select=id,${keyCol}&${keyCol}=in.(${inList(part)})`)
      for (const row of got) plan.existingByKey[row[keyCol]] = row.id
    }
    return planWithExisting(table, keyCol, keyField, rows, plan.existingByKey, plan)
  }

  function planWithExisting(table, keyCol, keyField, rows, existingByKey, plan) {
    for (const row of rows) {
      const key = row[keyField]
      const id = key ? existingByKey[key] : undefined
      if (id) plan.toUpdate.push({ id, row })
      else plan.toInsert.push(row)
    }
    return plan
  }

  /**
   * Upsert rows on `table` keyed by unique textual `keyField` (siren|siret|key).
   * `existingByKey` (optional, map key→uuid) lets DRY-RUN callers compute a
   * plan without any network. Returns updated stats.
   */
  async function upsert(table, keyCol, keyField, rows, options) {
    const opts2 = options || {}
    const ts = opts2.now || new Date().toISOString()
    if (!Array.isArray(rows) || rows.length === 0) return stats

    // DRY-RUN without an existing-map: NEVER touch the network — everything
    // is a candidate insert (caller merges with a snapshot if it has one).
    if (dryRun && !opts2.existingByKey) {
      stats.wouldInsert += rows.length
      return stats
    }

    const plan = await planUpserts(table, keyCol, keyField, rows, opts2.existingByKey)

    if (dryRun) {
      stats.wouldInsert += plan.toInsert.length
      stats.wouldUpdate += plan.toUpdate.length
      return stats
    }

    for (const part of chunk(plan.toInsert, 200)) {
      const payload = part.map((r) => Object.assign({}, r, { updated_at: ts }))
      await req('POST', table, payload, { 'Prefer': 'return=minimal' })
      stats.inserted += payload.length
    }
    for (const u of plan.toUpdate) {
      await req('PATCH', `${table}?id=eq.${u.id}`,
        Object.assign({}, u.row, { updated_at: ts }),
        { 'Prefer': 'return=minimal' })
      stats.updated++
    }
    return stats
  }

  /**
   * Live-only probe: proves the Phase 1 schema is applied (GET 1 row).
   * FAIL-CLOSED: any error (404, 401, 42P01...) throws — no write follows.
   */
  async function probeSchema() {
    if (dryRun) fail('probeSchema interdit en dry-run')
    await req('GET', 'companies?select=id&limit=1')
    await req('GET', 'company_establishments?select=id&limit=1')
    return true
  }

  /**
   * Live-only: resolve keyCol → uuid for a set of keys (post-upsert linking).
   * Throws in dry-run (nothing to resolve against).
   */
  async function readIdMap(table, keyCol, keys) {
    if (dryRun) fail('readIdMap interdit en dry-run')
    const map = {}
    for (const part of chunk(keys.filter(Boolean), 100)) {
      const got = await req('GET', `${table}?select=id,${keyCol}&${keyCol}=in.(${inList(part)})`)
      for (const row of got) map[row[keyCol]] = row.id
    }
    return map
  }

  return {
    dryRun,
    stats,
    http,
    upsert,
    readIdMap,
    probeSchema,
    // Convenience wrappers with the real key columns of the Phase 1 schema.
    upsertCompanies(rows, options) {
      return upsert('companies', 'siren', 'siren', rows, options)
    },
    upsertEstablishments(rows, options) {
      return upsert('company_establishments', 'siret', 'siret', rows, options)
    },
    upsertDataSource(row, options) {
      return upsert('data_sources', 'key', 'key', [row], options)
    },
  }
}

module.exports = { createStore }
