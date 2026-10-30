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
  'payment_failed', 'sos_checkout_start', 'sos_checkout_redirect', 'sos_checkout_paid', 'sos_checkout_error',
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

const REGION_BY_DOMAIN = {
  'sargasses-martinique.com': 'mq',
  'sargagame.pages.dev': 'mq',
  'sargagame-mq.pages.dev': 'mq',
  'sargasses-guadeloupe.com': 'gp',
  'sargagame-gp.pages.dev': 'gp',
  'sargassummiami.com': 'florida',
  'sargagame-florida.pages.dev': 'florida',
  'sargassumpuntacana.com': 'puntacana',
  'sargagame-puntacana.pages.dev': 'puntacana',
  'sargassumcancun.com': 'rivieramaya',
  'sargagame-rivieramaya.pages.dev': 'rivieramaya',
  'sargazotulum.com': 'tulum',
  'sargagame-tulum.pages.dev': 'tulum',
}

const REGION_ALIASES = {
  mq: 'mq', martinique: 'mq',
  gp: 'gp', guadeloupe: 'gp',
  fl: 'florida', florida: 'florida', miami: 'florida',
  pc: 'puntacana', puntacana: 'puntacana', 'punta-cana': 'puntacana',
  rm: 'rivieramaya', rivieramaya: 'rivieramaya', 'riviera-maya': 'rivieramaya', cancun: 'rivieramaya',
  tu: 'tulum', tulum: 'tulum',
}

function parseEventParams(params) {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {}
  let embedded = {}
  const raw = source.d
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) embedded = raw
  else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) embedded = parsed
    } catch (_) {}
  }
  return { ...embedded, ...source }
}

function normalizeHost(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null
  const host = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '')
  return host || null
}

function normalizeRegion(island, params) {
  const p = parseEventParams(params)
  const host = normalizeHost(p.hostname || p.host || p.domain)
  if (host && REGION_BY_DOMAIN[host]) return REGION_BY_DOMAIN[host]
  const raw = String(p.region || island || '').trim().toLowerCase()
  const rawHost = normalizeHost(raw)
  if (rawHost && REGION_BY_DOMAIN[rawHost]) return REGION_BY_DOMAIN[rawHost]
  return REGION_ALIASES[raw] || raw || 'unknown'
}

function sessionIdFromParams(params) {
  const p = parseEventParams(params)
  const value = p.sid || p.session_id || p.sessionId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function computeFunnel(rows) {
  const f = {}
  for (const k of FUNNEL_KEYS) f[k] = 0
  const byRegion = {}
  const byHost = {}
  const sessionsByRegion = {}
  const sessionsByHost = {}

  for (const r of rows) {
    const params = parseEventParams(r.params)
    const region = normalizeRegion(r.island, params)
    const host = normalizeHost(params.hostname || params.host || params.domain) ||
      (REGION_BY_DOMAIN[normalizeHost(r.island)] ? normalizeHost(r.island) : null)
    const sid = sessionIdFromParams(params)

    if (sid) {
      sessionsByRegion[region] = sessionsByRegion[region] || new Set()
      sessionsByRegion[region].add(sid)
      if (host) {
        sessionsByHost[host] = sessionsByHost[host] || new Set()
        sessionsByHost[host].add(sid)
      }
    }

    const evt = String(r.event || '').replace(/^sg_/, '')
    if (!Object.prototype.hasOwnProperty.call(f, evt)) continue
    f[evt]++

    byRegion[region] = byRegion[region] || {}
    byRegion[region][evt] = (byRegion[region][evt] || 0) + 1
    if (host) {
      byHost[host] = byHost[host] || {}
      byHost[host][evt] = (byHost[host][evt] || 0) + 1
    }
  }

  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  const ctaTotal = f.premium_modal_cta + f.pass_cta
  const rates = {
    session_to_lock: pct(f.forecast_lock_click, f.session_start),
    lock_to_modal: pct(f.premium_modal_open, f.forecast_lock_click),
    modal_to_cta: pct(ctaTotal, f.premium_modal_open),
    // checkout_redirect is retained as a legacy provider-specific event.
    // checkout_started is the cross-provider on-site entry point (Mollie/Stripe/PayPal).
    cta_to_checkout_started: pct(f.checkout_started, ctaTotal),
    checkout_started_to_conversion: pct(f.conversion, f.checkout_started),
    cta_to_redirect: pct(f.checkout_redirect, ctaTotal),
    sos_checkout_start_to_redirect: pct(f.sos_checkout_redirect, f.sos_checkout_start),
    sos_checkout_redirect_to_paid: pct(f.sos_checkout_paid, f.sos_checkout_redirect),
    sos_checkout_start_to_paid: pct(f.sos_checkout_paid, f.sos_checkout_start),
    cta_to_conversion: pct(f.conversion, ctaTotal),
  }
  const distinctSessionsByRegion = Object.fromEntries(
    Object.entries(sessionsByRegion).map(([region, ids]) => [region, ids.size])
  )
  const distinctSessionsByHost = Object.fromEntries(
    Object.entries(sessionsByHost).map(([host, ids]) => [host, ids.size])
  )
  // Keep the legacy key for existing consumers, but normalize its values.
  const byIsland = Object.fromEntries(Object.entries(byRegion).map(([region, counts]) => [region.toUpperCase(), counts]))
  return {
    counts: f,
    cta_total: ctaTotal,
    rates,
    by_region: byRegion,
    by_island: byIsland,
    by_host: byHost,
    distinct_sessions_by_region: distinctSessionsByRegion,
    distinct_sessions_by_host: distinctSessionsByHost,
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

module.exports = { FUNNEL_KEYS, parseEventParams, normalizeHost, normalizeRegion, sessionIdFromParams, computeFunnel }
