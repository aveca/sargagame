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
const FUNNEL_KEYS = ['session_start', 'forecast_lock_click', 'premium_modal_open', 'premium_modal_cta', 'pass_cta', 'conversion', 'email_submit', 'checkout_redirect']

async function fetchAll(cutoffIso) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `select=event,island,ts&ts=gte.${encodeURIComponent(cutoffIso)}&order=ts.asc`
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

function computeFunnel(rows) {
  const f = {}
  for (const k of FUNNEL_KEYS) f[k] = 0
  const byIsland = {}
  for (const r of rows) {
    const evt = String(r.event || '').replace(/^sg_/, '')
    if (Object.prototype.hasOwnProperty.call(f, evt)) {
      f[evt]++
      const isl = (r.island || 'MQ').toUpperCase()
      byIsland[isl] = byIsland[isl] || {}
      byIsland[isl][evt] = (byIsland[isl][evt] || 0) + 1
    }
  }
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  // modal→CTA : pass-only, le CTA réel = pass_cta (+ premium_modal_cta legacy).
  const ctaTotal = f.premium_modal_cta + f.pass_cta
  const rates = {
    session_to_lock: pct(f.forecast_lock_click, f.session_start),
    lock_to_modal: pct(f.premium_modal_open, f.forecast_lock_click),
    modal_to_cta: pct(ctaTotal, f.premium_modal_open),
    cta_to_redirect: pct(f.checkout_redirect, ctaTotal),
    cta_to_conversion: pct(f.conversion, ctaTotal),
  }
  return { counts: f, cta_total: ctaTotal, rates, by_island: byIsland }
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

main().catch((e) => { console.error('[funnel] erreur non fatale:', e && e.message); process.exit(0) })
