#!/usr/bin/env node
/**
 * purge-analytics.cjs — comptage de rétention analytics_events (> 90 jours).
 *
 * SÉCURITÉ P0.67 §4 :
 * Ce programme est volontairement READ-ONLY. Il calcule le nombre de lignes
 * éligibles, mais ne contient aucun chemin de suppression. Les arguments
 * historiques --execute et --approved-by sont ignorés : ils ne peuvent pas
 * réactiver une opération destructive.
 *
 * Une éventuelle suppression future devra être conçue comme un outil séparé,
 * avec une autorisation opérateur protégée, une sauvegarde vérifiable et une
 * procédure de restauration. Ce script ne pourra pas servir à l'exécuter.
 *
 * La rétention minimale reste de 90 jours. Une demande --days plus courte
 * est ramenée à ce plancher.
 *
 * Toutes les requêtes sont injectables pour les tests hermétiques.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const MIN_DAYS = 90

function argValue(name, argv) {
  const hit = argv.find((x) => x.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3) : null
}

function argInt(name, argv, fallback) {
  const raw = argValue(name, argv)
  if (raw == null) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Seules les options de lecture sont reconnues.
 * Les anciens arguments destructeurs ne sont volontairement pas interprétés.
 */
function resolveOptions(argv) {
  const daysRequested = argInt('days', argv, MIN_DAYS)
  return {
    daysRequested,
    days: Math.max(MIN_DAYS, daysRequested),
  }
}

function svcHeaders(extra, serviceKey) {
  return Object.assign({
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
  }, extra || {})
}

/**
 * Compte les lignes antérieures au cutoff avec une seule requête GET.
 * Un content-range absent ou invalide est une erreur, jamais un zéro implicite.
 */
async function countRows(cutoff, fetchImpl, serviceKey = SERVICE_KEY) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl doit être une fonction')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY manquant')

  const q = 'select=id&ts=lt.' + encodeURIComponent(cutoff)
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
    method: 'GET',
    headers: svcHeaders({ Range: '0-0', Prefer: 'count=exact' }, serviceKey),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }

  const contentRange = res.headers.get('content-range') || ''
  const match = /\/(\d+)\s*$/.exec(contentRange)
  if (!match) throw new Error('content-range absent ou invalide : comptage non vérifiable')

  const total = Number(match[1])
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('total content-range invalide : comptage non vérifiable')
  }
  return total
}

/**
 * Exécute uniquement le comptage. Aucune option CLI ne peut changer ce mode.
 * deps permet de tester le comportement sans réseau ni secret réel.
 */
async function main(argv = process.argv, deps = {}) {
  const serviceKey = deps.serviceKey === undefined ? SERVICE_KEY : deps.serviceKey
  if (!serviceKey) {
    console.log('[purge] SUPABASE_SERVICE_KEY manquant — skip (lecture seule).')
    return { skipped: true }
  }

  const fetchImpl = deps.fetchImpl || globalThis.fetch
  const nowValue = typeof deps.now === 'function'
    ? deps.now()
    : (deps.now === undefined ? Date.now() : deps.now)
  const options = resolveOptions(argv || [])
  const cutoff = new Date(nowValue - options.days * 86400000).toISOString()

  if (options.daysRequested < MIN_DAYS) {
    console.log(`[purge] --days=${options.daysRequested} < plancher ${MIN_DAYS} → comptage limité à ${options.days} j`)
  }

  console.log(`[purge] analytics_events avant ${cutoff} (lecture seule forcée)`)
  try {
    const eligible = await countRows(cutoff, fetchImpl, serviceKey)
    console.log(`[purge] ${eligible} ligne(s) éligible(s) — aucune suppression possible avec cet outil`)
    return { dryRun: true, eligible, cutoff }
  } catch (error) {
    console.error('[purge] comptage impossible :', error && error.message)
    return { dryRun: true, error: true, cutoff }
  }
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error('[purge] erreur non fatale :', error && error.message)
    process.exit(0)
  })
}

module.exports = { main, countRows, resolveOptions, MIN_DAYS }
