#!/usr/bin/env node
/**
 * purge-analytics.cjs — Purge analytics_events > 90 jours (RGPD + table lean).
 *
 * Supabase RLS = anon INSERT only, service_role READ/DELETE.
 * Ce script tourne en GH Actions (schedule daily) avec SUPABASE_SERVICE_KEY.
 *
 * Usage : node scripts/automation/purge-analytics.cjs [--days=90] [--dry]
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const DAYS = (() => {
  const a = process.argv.find((x) => x.startsWith('--days='))
  return a ? parseInt(a.slice(7), 10) : 90
})()
const DRY = process.argv.includes('--dry')

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

async function main() {
  if (!SERVICE_KEY) {
    console.log('[purge] SUPABASE_SERVICE_KEY manquant — skip (aucune purge).')
    return
  }
  const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString()
  console.log(`[purge] analytics_events avant ${cutoff} (dry=${DRY})`)

  // 1) Compter les lignes à supprimer
  let toDelete = 0
  for (let from = 0; ; from += 1000) {
    const q = `select=id&ts=lt.${encodeURIComponent(cutoff)}&order=ts.asc`
    let res
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        headers: svcHeaders({ Range: `${from}-${from + 999}` }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) {
      console.error('[purge] fetch error:', e && e.message)
      break
    }
    if (!res.ok) {
      console.error(`[purge] HTTP ${res.status}: ${await res.text().catch(() => '')}`)
      break
    }
    const batch = await res.json().catch(() => [])
    if (!Array.isArray(batch) || !batch.length) break
    toDelete += batch.length
    if (batch.length < 1000) break
  }

  console.log(`[purge] ${toDelete} ligne(s) à supprimer`)

  if (toDelete === 0 || DRY) {
    if (DRY) console.log('[purge] --dry → aucune suppression effectuée')
    return
  }

  // 2) Supprimer par lots (DELETE REST Supabase = range header)
  let deleted = 0
  for (let from = 0; ; from += 1000) {
    const q = `ts=lt.${encodeURIComponent(cutoff)}`
    let res
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        method: 'DELETE',
        headers: svcHeaders({ Range: `${from}-${from + 999}`, Prefer: 'return=minimal' }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) {
      console.error('[purge] delete error:', e && e.message)
      break
    }
    if (!res.ok) {
      console.error(`[purge] DELETE HTTP ${res.status}: ${await res.text().catch(() => '')}`)
      break
    }
    const count = parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10)
    deleted += count
    if (count < 1000) break
  }

  console.log(`[purge] ${deleted} ligne(s) supprimée(s)`)
}

main().catch((e) => {
  console.error('[purge] erreur non fatale:', e && e.message)
  process.exit(0)
})