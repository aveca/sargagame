/**
 * funnel-from-supabase.cjs — AGRÉGATION DU FUNNEL depuis Supabase (remplace le
 * compteur Apps Script / Code.js action=funnel → plus AUCUN `clasp push`).
 *
 * Lit public.analytics_events (écrit par le front via logAnalyticsEvent, cf.
 * src/supabasePhotos.js) sur une fenêtre glissante, compte les étapes du funnel et
 * calcule les taux — même logique que Code.js (sg_ strippé, pass_cta = vrai CTA
 * pass-only). Sortie : scripts/automation/data/funnel-snapshot.json (+ résumé
 * stdout). Ne crashe jamais ; skip propre si SUPABASE_SERVICE_KEY absent.
 *
 * Revenu = Stripe/Mollie, JAMAIS ce funnel (engagement only) — cf. CLAUDE.md.
 *
 * Usage : node scripts/automation/funnel-from-supabase.cjs [--days=28]
 * Env   : SUPABASE_SERVICE_KEY (GH secret), SUPABASE_URL (optionnel).
 */

const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const OUT_PATH = path.join(__dirname, 'data', 'funnel-snapshot.json')
const DAYS = (() => { const a = process.argv.find((x) => x.startsWith('--days=')); const n = a ? parseInt(a.slice(7), 10) : 28; return Number.isFinite(n) && n > 0 ? n : 28 })()
const PAGE = 1000 // cap REST Supabase par requête → pagination par Range

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

// Étapes comptées (clé = nom event sans le préfixe sg_, comme Code.js).
const FUNNEL_KEYS = [
  'session_start', 'forecast_lock_click', 'premium_modal_open', 'premium_modal_cta',
  'pass_cta', 'conversion', 'email_submit', 'checkout_started', 'checkout_redirect',
  'payment_failed', 'sos_checkout_start', 'sos_checkout_error',
  // Funnel B2B séquentiel (2026-07-02) — miroir de SG_FUNNEL_EVENTS.
  'b2b_offer_view', 'b2b_step', 'b2b_intent', 'b2b_trial_activated',
]

async function fetchAll(cutoffIso) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `select=event,island,params,ts&ts=gte.${encodeURIComponent(cutoffIso)}&order=ts.asc`
    let res
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        headers: svcHeaders({ Range: `${from}-${from + PAGE - 1}` }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) { console.error('[funnel] fetch error:', e && e.message); break }
    if (!res.ok) { console.error(`[funnel] HTTP ${res.status}: ${await res.text().catch(() => '')}`); break }
    const batch = await res.json().catch(() => [])
    if (!Array.isArray(batch) || !batch.length) break
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

const {
  parseEventParams,
  normalizeHost,
  normalizeEvent,
  normalizeRegion,
  classifyAnalyticsHost,
  sessionIdFromParams,
} = require('./funnel-analytics-classification.cjs')

function computeFunnel(rows) {
  const counts = {}
  const observedCounts = {}
  const unverifiedCounts = {}
  for (const k of FUNNEL_KEYS) {
    counts[k] = 0
    observedCounts[k] = 0
    unverifiedCounts[k] = 0
  }

  const byRegion = {}
  const byHost = {}
  const unverifiedByRegion = {}
  const sessionsByRegion = {}
  const observedSessionsByRegion = {}
  const sessionsByHost = {}
  const hostClassCounts = { production: 0, local_test: 0, preview: 0, unknown_host: 0 }

  for (const r of rows) {
    const params = parseEventParams(r.params)
    const attribution = classifyAnalyticsHost(params, r.island)
    const region = attribution.region
    const host = attribution.host
    const sid = sessionIdFromParams(params)
    hostClassCounts[attribution.hostClass]++

    if (sid) {
      observedSessionsByRegion[region] = observedSessionsByRegion[region] || new Set()
      observedSessionsByRegion[region].add(sid)
      if (attribution.hostClass === 'production') {
        sessionsByRegion[region] = sessionsByRegion[region] || new Set()
        sessionsByRegion[region].add(sid)
        if (host) {
          sessionsByHost[host] = sessionsByHost[host] || new Set()
          sessionsByHost[host].add(sid)
        }
      }
    }

    const evt = normalizeEvent(r.event)
    if (!Object.prototype.hasOwnProperty.call(counts, evt)) continue
    observedCounts[evt]++

    if (attribution.hostClass !== 'production') {
      unverifiedCounts[evt]++
      unverifiedByRegion[region] = unverifiedByRegion[region] || {}
      unverifiedByRegion[region][evt] = (unverifiedByRegion[region][evt] || 0) + 1
      continue
    }

    counts[evt]++
    byRegion[region] = byRegion[region] || {}
    byRegion[region][evt] = (byRegion[region][evt] || 0) + 1
    if (host) {
      byHost[host] = byHost[host] || {}
      byHost[host][evt] = (byHost[host][evt] || 0) + 1
    }
  }

  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  const ctaTotal = counts.premium_modal_cta + counts.pass_cta
  const rates = {
    session_to_lock: pct(counts.forecast_lock_click, counts.session_start),
    lock_to_modal: pct(counts.premium_modal_open, counts.forecast_lock_click),
    modal_to_cta: pct(ctaTotal, counts.premium_modal_open),
    cta_to_checkout_started: pct(counts.checkout_started, ctaTotal),
    checkout_started_to_conversion: pct(counts.conversion, counts.checkout_started),
    cta_to_redirect: pct(counts.checkout_redirect, ctaTotal),
    cta_to_conversion: pct(counts.conversion, ctaTotal),
  }
  const toCounts = source => Object.fromEntries(
    Object.entries(source).map(([region, ids]) => [region, ids.size])
  )
  const distinctSessionsByRegion = toCounts(sessionsByRegion)
  const observedDistinctSessionsByRegion = toCounts(observedSessionsByRegion)
  const distinctSessionsByHost = toCounts(sessionsByHost)
  const byIsland = Object.fromEntries(
    Object.entries(byRegion).map(([region, regionCounts]) => [region.toUpperCase(), regionCounts])
  )
  const unverifiedByIsland = Object.fromEntries(
    Object.entries(unverifiedByRegion).map(([region, regionCounts]) => [region.toUpperCase(), regionCounts])
  )
  const verifiedRows = hostClassCounts.production

  return {
    counts,
    observed_counts: observedCounts,
    unverified_counts: unverifiedCounts,
    cta_total: ctaTotal,
    rates,
    by_region: byRegion,
    by_island: byIsland,
    by_host: byHost,
    unverified_by_region: unverifiedByRegion,
    unverified_by_island: unverifiedByIsland,
    distinct_sessions_by_region: distinctSessionsByRegion,
    observed_distinct_sessions_by_region: observedDistinctSessionsByRegion,
    distinct_sessions_by_host: distinctSessionsByHost,
    data_quality: {
      total_rows: rows.length,
      verified_production_rows: verifiedRows,
      local_test_rows: hostClassCounts.local_test,
      preview_rows: hostClassCounts.preview,
      unknown_host_rows: hostClassCounts.unknown_host,
      unverified_rows: rows.length - verifiedRows,
    },
  }
}

async function main() {
  if (!SERVICE_KEY) { console.log('[funnel] SUPABASE_SERVICE_KEY manquant — skip (aucune agrégation).'); return }
  const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString()
  const rows = await fetchAll(cutoff)
  const funnel = computeFunnel(rows)
  const snapshot = { window_days: DAYS, since: cutoff, total_rows: rows.length, ...funnel }
  try {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2))
    console.log(`[funnel] écrit ${OUT_PATH}`)
  } catch (e) { console.error('[funnel] write error:', e && e.message) }
  console.log(`[funnel] ${DAYS}j · ${rows.length} events`)
  console.log('[funnel] counts:', JSON.stringify(funnel.counts))
  console.log('[funnel] rates :', JSON.stringify(funnel.rates))
}

if (require.main === module) {
  main().catch((e) => { console.error('[funnel] erreur non fatale:', e && e.message); process.exit(0) })
}

module.exports = { FUNNEL_KEYS, parseEventParams, normalizeHost, normalizeEvent, normalizeRegion, classifyAnalyticsHost, sessionIdFromParams, computeFunnel }
