#!/usr/bin/env node
/**
 * purge-analytics.cjs — Purge analytics_events > 90 jours (RGPD + table lean).
 *
 * Supabase RLS = anon INSERT only, service_role READ/DELETE.
 * En GH Actions, les exécutions schedule et workflow_dispatch restent en
 * lecture seule. Aucun workflow ne branche `--execute` : la suppression
 * production demeure désactivée tant qu'un chemin protégé n'est pas approuvé.
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
 * SÉCURITÉ (P0.67 §4) — la suppression est DÉSORMAIS REFUSÉE PAR DÉFAUT.
 *
 * Ce script supprime définitivement des lignes de production. Rien
 * d'irréversible ne doit s'exécuter parce qu'un cron s'est déclenché : une
 * suppression en production exige une intention explicite, traçable, portée
 * par un opérateur identifié.
 *
 *   - SANS `--execute` : DRY-RUN. Comptage seul, ZÉRO DELETE émis, exit 0.
 *   - AVEC `--execute`  : il faut AUSSI `--approved-by=<identité>`. Sans
 *     elle, ou avec une identité vide, la suppression est refusée (fail
 *     closed) : zéro DELETE émis, exit 1.
 *   - `--days` est plancher à 90 : la rétention contractuelle ne peut pas
 *     être raccourcie par un argument de ligne de commande.
 *   - Chaque lot DELETE demande `return=representation` + `select=id` :
 *     la réponse porte donc les identifiants RÉELLEMENT supprimés, et non
 *     une simple métadonnée. Le nombre d'identifiants est recoupé avec le
 *     `content-range` ; en cas d'écart la boucle s'arrête sans émettre de
 *     DELETE supplémentaire.
 *   - Après la boucle, le comptage est rejoué : un reliquat inattendu est
 *     signalé comme purge partielle, jamais masqué.
 *
 * Usage :
 *   node scripts/automation/purge-analytics.cjs                       # dry-run
 *   node scripts/automation/purge-analytics.cjs --days=365
 *   node scripts/automation/purge-analytics.cjs --execute --approved-by=ops:p0.67-verification
 *   node ... [--batch=5000] [--max-batches=200] [--budget-seconds=480]
 *
 * Le cron quotidien n'a plus besoin de `--dry` : c'est le comportement par
 * défaut. `--dry` reste accepté sans effet pour la compatibilité des appels
 * existants, mais ne modifie plus rien.
 *
 * `fetch` est injectable (cf. tests/) : aucun test ici ne touche le réseau.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

/** Rétention minimale contractuelle : un `--days` plus court est refusé. */
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
 * Options résolues depuis une ligne de commande — testable sans mutation de
 * `process.argv`, donc sans effet de bord d'un test à l'autre.
 */
function resolveOptions(argv) {
  const daysRequested = argInt('days', argv, MIN_DAYS)
  const approvedBy = (argValue('approved-by', argv) || '').trim()
  const batch = argInt('batch', argv, 5000)
  const maxBatches = argInt('max-batches', argv, 200)
  const budgetSeconds = argInt('budget-seconds', argv, 480)
  return {
    daysRequested,
    // Le plancher de rétention est contractuel : il ne se raccourcit pas.
    days: Math.max(MIN_DAYS, daysRequested),
    execute: argv.includes('--execute'),
    approvedBy,
    batch: Number.isFinite(batch) && batch > 0 ? Math.min(batch, 10000) : 5000,
    maxBatches: Number.isFinite(maxBatches) && maxBatches > 0 ? maxBatches : 200,
    budgetSeconds: Number.isFinite(budgetSeconds) && budgetSeconds > 0 ? budgetSeconds : 480,
  }
}

/**
 * Autorisation de destruction — fail closed.
 * Retourne `null` si la suppression est permise, sinon le motif du refus.
 */
function authorizationRefusal(options) {
  if (!options.execute) return 'mode dry-run par défaut : ajouter --execute pour supprimer'
  if (!options.approvedBy) return '--execute exige --approved-by=<identité opérateur>'
  return null
}

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
 * Identifiants réellement supprimés par un lot.
 *
 * Le DELETE demande `return=representation` + `select=id`, donc le corps de
 * réponse porte les lignes supprimées. Le `content-range` est une
 * métadonnée du moteur : seule la liste des identifiants prouve ce qui a
 * disparu.
 *
 * Une réponse sans corps lisible (`return=minimal`) ou un corps qui n'est
 * pas un tableau donne `null` — l'appelant ne doit JAMAIS confondre
 * « inconnu » avec « zéro supprimé ».
 */
async function deletedIds(res) {
  try {
    const body = await res.json()
    if (!Array.isArray(body)) return null
    return body
      .map((row) => (row && typeof row === 'object' ? row.id : row))
      .filter((id) => id !== undefined && id !== null)
  } catch {
    return null
  }
}

/**
 * Suppression par lots. `fetchImpl` injectable => testable sans réseau.
 *
 * Condition d'arrêt : le nombre de lignes SUPPRIMÉES par le lot, compté sur
 * les identifiants retournés et recoupé avec le `content-range` du DELETE
 * PostgREST — et NON le total de la table. Plafond dur d'itérations +
 * budget temps.
 *
 * Garde-fou : si la liste d'identifiants et le `content-range` ne
 * concordent pas, ou si la liste est illisible, le lot est traité comme
 * douteux : la boucle s'arrête immédiatement et n'émet aucun DELETE de plus.
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
    const q = `ts=lt.${encodeURIComponent(cutoff)}&select=id`
    let res
    try {
      res = await fetchImpl(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        method: 'DELETE',
        headers: svcHeaders({
          Range: `0-${batch - 1}`,
          Prefer: 'return=representation',
        }),
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

    // Métadonnée annoncée par le moteur : `0-<dernier index>/<nb supprimé>`
    const cr = res.headers.get('content-range') || ''
    const m = cr.match(/\/(\d+)\s*$/)
    const claimed = m ? parseInt(m[1], 10) : 0

    // Preuve réelle : les identifiants effectivement retournés.
    const ids = await deletedIds(res)
    if (ids === null) {
      lastError = 'lot sans représentation lisible des identifiants supprimés — arrêt par précaution'
      break
    }
    if (ids.length !== claimed) {
      lastError = `lot incohérent : ${ids.length} identifiant(s) supprimé(s) mais content-range annonce ${claimed} — arrêt par précaution`
      break
    }

    deleted += ids.length
    if (ids.length < batch) break   // plus rien à supprimer
  }
  return { deleted, batches, lastError }
}

async function main(argv) {
  if (!SERVICE_KEY) {
    console.log('[purge] SUPABASE_SERVICE_KEY manquant — skip (aucune purge).')
    return
  }

  const options = resolveOptions(argv || process.argv)
  const refusal = authorizationRefusal(options)
  const cutoff = new Date(Date.now() - options.days * 86400000).toISOString()

  if (options.daysRequested < MIN_DAYS) {
    // Ce n'est pas une autorisation : un `--days` plus court est ramené au
    // plancher, et ça se voit dans les logs.
    console.log(`[purge] --days=${options.daysRequested} < plancher ${MIN_DAYS} → rétention forcée à ${options.days} j`)
  }
  console.log(`[purge] analytics_events avant ${cutoff} (execute=${options.execute}${options.approvedBy ? ' approved-by=' + options.approvedBy : ''})`)

  // Le comptage est une LECTURE (Range 0-0 + count=exact) : il est inoffensif
  // et reste fait dans tous les cas, y compris en dry-run — c'est précisément
  // ce qu'un opérateur veut savoir avant d'autoriser quoi que ce soit.
  let toDelete = 0
  try {
    toDelete = await countRows(cutoff, fetch)
  } catch (e) {
    console.error('[purge] comptage impossible:', e && e.message)
    return
  }

  // Le REFUS ne porte que sur la suppression. ZÉRO DELETE n'est émis sans
  // `--execute --approved-by=<identité>` : c'est la seule garantie qui compte
  // ici, et elle est vérifiée avant le premier appel destructif.
  if (refusal) {
    console.log(`[purge] ${toDelete} ligne(s) seraient supprimées — aucune suppression effectuée (${refusal})`)
    console.log('[purge] pour exécuter : --execute --approved-by=<identité opérateur>')
    return
  }
  console.log(`[purge] ${toDelete} ligne(s) à supprimer (approuvé par ${options.approvedBy})`)

  if (toDelete === 0) return

  const r = await purgeInBatches(cutoff,
    {
      batch: options.batch,
      maxBatches: options.maxBatches,
      budgetSeconds: options.budgetSeconds,
    },
    fetch)
  console.log(`[purge] ${r.deleted} ligne(s) supprimée(s) en ${r.batches} lot(s)`)
  if (r.lastError) console.error('[purge] arrêt anticipé:', r.lastError)

  // Purge incomplète = problème d'hygiène de table, PAS une raison de tuer
  // le pipeline : on se termine proprement (exit 0). Le contrôle de
  // fraîcheur et le Sentinel restent les gardiens de la production.
  const left = await countRows(cutoff, fetch).catch(() => -1)
  if (left > 0) console.error(`[purge] ${left} ligne(s) antérieure(s) au cutoff subsistent — purge partielle`)
  else if (left === 0) console.log('[purge] purge complète')
}

// Exécution directe uniquement : l'import (tests) ne doit pas lancer la purge.
if (require.main === module) {
  const options = resolveOptions(process.argv)
  // `--execute` sans identité d'opérateur est une ERREUR (exit 1) : quelqu'un
  // a demandé une suppression irréversible sans se nommer. En revanche
  // l'absence de `--execute` est le chemin normal du cron quotidien, et un
  // dry-run doit sortir en succès pour ne pas faire échouer l'étape.
  if (options.execute && authorizationRefusal(options)) process.exitCode = 1
  main(process.argv).catch((e) => {
    console.error('[purge] erreur non fatale:', e && e.message)
    // Une intention de suppression DÉJÀ refusée reste refusée (exit 1) ; sur
    // tout autre chemin on conserve le comportement historique tolérant, afin
    // qu'un incident de purge ne fasse jamais échouer le pipeline.
    if (process.exitCode !== 1) process.exit(0)
  })
}

module.exports = {
  main, countRows, deletedIds, purgeInBatches, authorizationRefusal, resolveOptions, MIN_DAYS,
}
