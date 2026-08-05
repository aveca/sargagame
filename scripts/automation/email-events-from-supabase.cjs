#!/usr/bin/env node
/**
 * email-events-from-supabase.cjs — Agrège les ouvertures et clics email depuis
 * Supabase analytics_events (track-open.php / track-click.php).
 *
 * Lit public.analytics_events sur une fenêtre glissante, déduit les uniques
 * (un même email_id peut être ouvert N fois, on ne compte que le 1er open).
 * Sortie : scripts/automation/data/email-events-snapshot.json (+ résumé stdout).
 * Ne crashe jamais ; skip propre si SUPABASE_SERVICE_KEY absent.
 *
 * Usage : node scripts/automation/email-events-from-supabase.cjs [--days=7]
 * Env   : SUPABASE_SERVICE_KEY (GH secret), SUPABASE_URL (optionnel).
 */

const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const OUT_PATH = path.join(__dirname, 'data', 'email-events-snapshot.json')
const DAYS = (() => { const a = process.argv.find((x) => x.startsWith('--days=')); const n = a ? parseInt(a.slice(7), 10) : 7; return Number.isFinite(n) && n > 0 ? n : 7 })()
const PAGE = 1000

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

async function fetchAll(cutoffIso) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `select=event,params,ts&ts=gte.${encodeURIComponent(cutoffIso)}&event=in.(email_opened,email_clicked)&order=ts.asc`
    let res
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        headers: svcHeaders({ Range: `${from}-${from + PAGE - 1}` }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) { console.error('[email-events] fetch error:', e && e.message); break }
    if (!res.ok) { console.error(`[email-events] HTTP ${res.status}: ${await res.text().catch(() => '')}`); break }
    const batch = await res.json().catch(() => [])
    if (!Array.isArray(batch) || !batch.length) break
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

async function main() {
  if (!SERVICE_KEY) { console.log('[email-events] SUPABASE_SERVICE_KEY absent — skip'); return null }

  const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString()
  console.log(`[email-events] Fetching email_opened + email_clicked since ${cutoff.slice(0, 10)}...`)

  const rows = await fetchAll(cutoff)
  console.log(`[email-events] ${rows.length} raw event(s)`)

  // Agrégation : uniques par email_id (un même email pixelisé N fois = 1 open).
  const uniqueOpens = new Set()
  let totalClicks = 0
  const uniqueClicks = new Set()

  for (const r of rows) {
    const p = r.params || {}
    if (r.event === 'email_opened' && p.email_id) uniqueOpens.add(p.email_id)
    if (r.event === 'email_clicked') {
      totalClicks++
      if (p.email_id) uniqueClicks.add(p.email_id)
    }
  }

  const snapshot = {
    period: `last_${DAYS}d`,
    fetchedAt: new Date().toISOString(),
    opens: {
      total: rows.filter(r => r.event === 'email_opened').length,
      unique: uniqueOpens.size,
    },
    clicks: {
      total: totalClicks,
      unique: uniqueClicks.size,
    },
    clickRate: uniqueOpens.size > 0 ? Math.round((uniqueClicks.size / uniqueOpens.size) * 10000) / 100 : null,
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2), 'utf-8')
  console.log(`[email-events] opens=${snapshot.opens.unique} unique (${snapshot.opens.total} total) | clicks=${snapshot.clicks.unique} unique (${snapshot.clicks.total} total) | clickRate=${snapshot.clickRate}%`)
  return snapshot
}

module.exports = { main }
if (require.main === module) main().catch(() => null)
