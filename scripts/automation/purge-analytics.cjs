#!/usr/bin/env node
/**
 * purge-analytics.cjs — Purge analytics_events > 90 jours (RGPD + table lean).
 *
 * Supabase RLS = anon INSERT only, service_role READ/DELETE.
 * Ce script tourne en GH Actions (schedule daily) avec SUPABASE_SERVICE_KEY.
 *
 * BUG CORRIGÉ (2026-10-20) — cause racine des 157 runs `Daily Copernicus +
 * Deploy` ANNULÉS (job `email-automation` annulé à 30 min, run entier
 * `cancelled`, étapes suivantes sautées dont « Commit email state » →
 * l'anti-doublon des envois était neutralisé) :
 *
 *   1. Le COMPTAGE faisait une requête SELECT par lot de 1000 lignes
 *      (`Range: from-(from+999)`) jusqu'à la dernière page → O(N/1000)
 *      requêtes HTTP, chacune rapatriant 1000 lignes en JSON. Sur une table
 *      de plusieurs centaines de milliers de lignes, le comptage seul
 *      consommait la totalité du budget du job.
 *   2. La SUPPRESSION avait la même complexité, ET sa condition d'arrêt
 *      s'appuyait sur `content-range` (le TOTAL de la table) et non sur le
 *      nombre de lignes supprimées par le lot : la boucle ne s'arrêtait
 *      donc pas, elle vidait toute la table lot par lot jusqu'au timeout.
 *
 * CORRECTION :
 *   - comptage en UNE requête (`Prefer: count=exact` + `Range: 0-0`) → O(1) ;
 *   - suppression par lots de 5000 lignes, avec condition d'arrêt sur le
 *     nombre de lignes SUPPRIMÉES par le lot et plafond dur d'itérations ;
 *   - budget temps global : le script se termine proprement (exit 0) bien
 *     avant le timeout du job — une purge incomplète est un problème
 *     d'hygiène de table, jamais une raison de tuer le pipeline.
 *
 * Usage : node scripts/automation/purge-analytics.cjs [--days=90] [--dry]
 *        [--batch=5000] [--max-batches=200] [--budget-seconds=480]
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const DAYS = (() => {
  const a = process.argv.find((x) => x.startsWith('--days='))
  return a ? parseInt(a.slice(7), 10) : 90
})()
// Fail closed: analytics deletion remains disabled until a separately approved,
// protected-environment execution path is implemented. Scheduled runs are read-only.
const DRY = true
const BATCH = (() => {
  const a = process.argv.find((x) => x.startsWith('--batch='))
  const n = a ? parseInt(a.slice(7), 10) : 5000
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10000) : 5000
})()
const MAX_BATCHES = (() => {
  const a = process.argv.find((x) => x.startsWith('--max-batches='))
  const n = a ? parseInt(a.slice(13), 10) : 200
  return Number.isFinite(n) && n > 0 ? n : 200
})()
const BUDGET_SECONDS = (() => {
  const a = process.argv.find((x) => x.startsWith('--budget-seconds='))
  const n = a ? parseInt(a.slice(16), 10) : 480
  return Number.isFinite(n) && n > 0 ? n : 480
})()

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

/**
 * Nombre de lignes concernées — UNE requête.
 * PostgREST : `Prefer: count=exact` + `Range: 0-0` renvoie le total dans
 * l'en-tête `content-range` (`0-0/N`) sans rapatrier les lignes.
 */
async function countRows(cutoff, fetchImpl) {
  const q = `select=id&ts=lt.${encodeURIComponent(cutoff)}`
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
    headers: svcHeaders({ Range: '0-0', Prefer: 'count=exact' }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const cr = res.headers.get('content-range') || ''
  const m = cr.match(/\/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : 0
}

/**
 * Suppression par lots. `fetchImpl` injectable => testable sans réseau.
 *
 * Condition d'arrêt : le nombre de lignes SUPPRIMÉES par le lot (extrait du
 * `content-range` d'un DELETE PostgREST, qui porte sur les lignes affectées),
 * et NON le total de la table. Plafond dur d'itérations + budget temps.
 */
async function purgeInBatches(cutoff, opts, fetchImpl) {
  const batch = opts.batch
  const maxBatches = opts.maxBatches
  const deadline = Date.now() + opts.budgetSeconds * 1000
  let deleted = 0
  let batches = 0
  let lastError = null

  for (; batches < maxBatches; batches++) {
    if (Date.now() >= deadline) { lastError = 'budget temps épuisé'; break }
    const q = `ts=lt.${encodeURIComponent(cutoff)}`
    let res
    try {
      res = await fetchImpl(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        method: 'DELETE',
        headers: svcHeaders({ Range: `0-${batch - 1}`, Prefer: 'return=minimal' }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) {
      lastError = e && e.message
      break
    }
    if (!res.ok) {
      lastError = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`
      break
    }
    // `content-range` d'un DELETE PostgREST : `0-<dernier index>/<nb supprimé>`
    const cr = res.headers.get('content-range') || ''
    const m = cr.match(/\/(\d+)\s*$/)
    const removed = m ? parseInt(m[1], 10) : 0
    deleted += removed
    if (removed < batch) break   // plus rien à supprimer
  }
  return { deleted, batches, lastError }
}

async function main({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (!SERVICE_KEY) {
    console.log('[purge] SUPABASE_SERVICE_KEY manquant — skip (aucune purge).')
    return
  }
  const cutoff = new Date(now - DAYS * 86400000).toISOString()
  console.log(`[purge] analytics_events avant ${cutoff} (dry=${DRY})`)

  let toDelete = 0
  try {
    toDelete = await countRows(cutoff, fetchImpl)
  } catch (e) {
    console.error('[purge] comptage impossible:', e && e.message)
    return
  }
  console.log(`[purge] ${toDelete} ligne(s) à supprimer`)

  if (toDelete === 0 || DRY) {
    if (DRY) console.log('[purge] dry-run forcé — suppression désactivée en attente d’une autorisation explicite')
    return
  }

  const r = await purgeInBatches(cutoff,
    { batch: BATCH, maxBatches: MAX_BATCHES, budgetSeconds: BUDGET_SECONDS },
    fetchImpl)
  console.log(`[purge] ${r.deleted} ligne(s) supprimée(s) en ${r.batches} lot(s)`)
  if (r.lastError) console.error('[purge] arrêt anticipé:', r.lastError)

  // Purge incomplète = problème d'hygiène de table, PAS une raison de tuer
  // le pipeline : on se termine proprement (exit 0). Le contrôle de
  // fraîcheur et le Sentinel restent les gardiens de la production.
  const left = await countRows(cutoff, fetchImpl).catch(() => -1)
  if (left > 0) console.error(`[purge] ${left} ligne(s) antérieure(s) au cutoff subsistent — purge partielle`)
  else if (left === 0) console.log('[purge] purge complète')
}

// Exécution directe uniquement : l'import (tests) ne doit pas lancer la purge.
if (require.main === module) {
  main().catch((e) => {
    console.error('[purge] erreur non fatale:', e && e.message)
    process.exit(0)
  })
}

module.exports = { countRows, purgeInBatches, main, DRY }
