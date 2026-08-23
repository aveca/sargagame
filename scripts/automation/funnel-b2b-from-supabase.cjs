/**
 * funnel-b2b-from-supabase.cjs — VISIBILITÉ du funnel B2B (le seul qui rapporte).
 *
 * Lit public.analytics_events (écrit best-effort par public/api/b2b-trial.php et
 * public/api/mollie-webhook.php via sg_analytics_event() de mollie-lib.php — MÊME
 * table que le front logAnalyticsEvent) sur une fenêtre glissante, et sort les
 * chiffres qui comptent : essais démarrés / widgets activés / essais→payés, + le
 * taux essai→payé. C'est le tableau de bord du SEUL funnel qui produit du revenu
 * (1 Pro/an = 690€ ≈ 86 pass à 7,99€). Panel revenue 2026-07-02 : « tu pilotes le
 * seul funnel qui rapporte SANS instruments » — ceci comble ce trou.
 *
 * b2b_widget_activated n'est PAS encore émis (le widget est une iframe même-origine :
 * le host de l'hôtel n'est pas visible côté serveur) → compté ici, à 0 jusqu'à ce
 * que le widget passe son host d'intégration. Voir docs/B2B_DELIVERABILITY.md.
 *
 * Ne crashe jamais ; skip propre si SUPABASE_SERVICE_KEY absent.
 * Usage : node scripts/automation/funnel-b2b-from-supabase.cjs [--days=90]
 * Env   : SUPABASE_SERVICE_KEY (GH secret), SUPABASE_URL (optionnel).
 */

const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const OUT_PATH = path.join(__dirname, 'data', 'funnel-b2b-snapshot.json')
const DAYS = (() => { const a = process.argv.find((x) => x.startsWith('--days=')); const n = a ? parseInt(a.slice(7), 10) : 90; return Number.isFinite(n) && n > 0 ? n : 90 })()
const PAGE = 1000 // cap REST Supabase par requête → pagination par Range

const B2B_KEYS = ['b2b_trial_started', 'b2b_widget_activated', 'b2b_trial_to_paid']

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

async function fetchAll(cutoffIso) {
  const rows = []
  const inList = B2B_KEYS.join(',') // noms alphanum → pas de guillemets requis pour PostgREST in.()
  for (let from = 0; ; from += PAGE) {
    const q = `select=event,params,island,ts&event=in.(${inList})&ts=gte.${encodeURIComponent(cutoffIso)}&order=ts.asc`
    let res
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        headers: svcHeaders({ Range: `${from}-${from + PAGE - 1}` }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) { console.error('[funnel-b2b] fetch error:', e && e.message); break }
    if (!res.ok) { console.error(`[funnel-b2b] HTTP ${res.status}: ${await res.text().catch(() => '')}`); break }
    const batch = await res.json().catch(() => [])
    if (!Array.isArray(batch) || !batch.length) break
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

function compute(rows) {
  const counts = { trials: 0, activated: 0, paid: 0 }
  const byIsland = {}
  const paidByPlan = {}
  for (const r of rows) {
    const evt = String(r.event || '')
    const isl = (r.island || 'MQ').toUpperCase()
    byIsland[isl] = byIsland[isl] || { trials: 0, activated: 0, paid: 0 }
    if (evt === 'b2b_trial_started') { counts.trials++; byIsland[isl].trials++ }
    else if (evt === 'b2b_widget_activated') { counts.activated++; byIsland[isl].activated++ }
    else if (evt === 'b2b_trial_to_paid') {
      counts.paid++; byIsland[isl].paid++
      const plan = (r.params && r.params.plan) || 'unknown'
      paidByPlan[plan] = (paidByPlan[plan] || 0) + 1
    }
  }
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  return {
    counts,
    rates: {
      trial_to_paid: pct(counts.paid, counts.trials),
      trial_to_activated: pct(counts.activated, counts.trials),
      activated_to_paid: pct(counts.paid, counts.activated),
    },
    paid_by_plan: paidByPlan,
    by_island: byIsland,
  }
}

async function main() {
  if (!SERVICE_KEY) { console.log('[funnel-b2b] SUPABASE_SERVICE_KEY manquant — skip (aucune agrégation).'); return }
  const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString()
  const rows = await fetchAll(cutoff)
  const f = compute(rows)
  const snapshot = { window_days: DAYS, since: cutoff, total_rows: rows.length, ...f }
  try {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2))
    console.log(`[funnel-b2b] écrit ${OUT_PATH}`)
  } catch (e) { console.error('[funnel-b2b] write error:', e && e.message) }
  console.log(`[funnel-b2b] ${DAYS}j · essais ${f.counts.trials} · activés ${f.counts.activated} · payés ${f.counts.paid} · essai→payé ${f.rates.trial_to_paid}%`)
}

main().catch((e) => { console.error('[funnel-b2b] erreur non fatale:', e && e.message); process.exit(0) })
