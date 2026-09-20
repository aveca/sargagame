#!/usr/bin/env node
'use strict'
/**
 * SIRENE → B2B sales engine : import Martinique (département 972).
 *
 *   node scripts/automation/sirene-mq-import.cjs                 # DRY-RUN (défaut)
 *   node scripts/automation/sirene-mq-import.cjs --from-file f.json
 *   node scripts/automation/sirene-mq-import.cjs --execute       # écritures réelles
 *
 * INVARIANTS (voir master task Phase 2) :
 *   - SIRENE = source unique de vérité légale ; aucune autre source ici
 *   - Martinique uniquement (codeDepartementEtablissement:972)
 *   - upsert déterministe SIREN (companies) / SIRET (company_establishments)
 *   - statuts strictement mappés : A→active, F→inactive, sinon unknown
 *   - DRY_RUN par défaut : ZERO écriture, ZERO lecture Supabase
 *   - aucun contact humain créé, aucun email/téléphone dérivé
 *   - aucun envoi, aucun appel, aucune campagne, aucun cron ici
 *   - --execute est FAIL-CLOSED : secrets manquants OU schéma absent → exit 1
 *
 * Secrets (jamais committés, jamais loggés) :
 *   SIRENE_CONSUMER_KEY / SIRENE_CONSUMER_SECRET   (api.insee.fr)
 *   SUPABASE_URL / SUPABASE_SERVICE_KEY            (--execute uniquement)
 */

const fs = require('fs')
const path = require('path')
const sirene = require('../lib/sirene-client.cjs')
const { createStore } = require('../lib/b2b-store.cjs')

function parseArgs(argv) {
  const a = { execute: false, fromFile: null, maxPages: 500, dept: sirene.MQ_DEPARTEMENT }
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--execute') a.execute = true
    else if (k === '--from-file') a.fromFile = argv[++i]
    else if (k === '--max-pages') a.maxPages = parseInt(argv[++i], 10) || 500
    else if (k === '--dept') a.dept = argv[++i]
    else throw new Error('argument inconnu: ' + k)
  }
  return a
}

function readJsonFile(p) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  // Accepte soit une page API { etablissements: [...] } soit un tableau brut.
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.etablissements)) return raw.etablissements
  throw new Error('--from-file : format inattendu (attendu: tableau ou { etablissements })')
}

/** Normalisation + dédup + regroupement entreprise/établissement. Pure. */
function buildRecords(rawList) {
  const seenSiret = new Set()
  const companiesBySiren = new Map()
  const establishments = []
  const stats = { fetched: rawList.length, normalized: 0, invalid: 0, deduped: 0 }

  for (const raw of rawList) {
    const pair = sirene.normalizeEstablishment(raw)
    if (!pair) { stats.invalid++; continue }
    const { company, establishment } = pair
    if (seenSiret.has(establishment.siret)) { stats.deduped++; continue }
    seenSiret.add(establishment.siret)
    if (!companiesBySiren.has(company.siren)) companiesBySiren.set(company.siren, company)
    establishments.push(establishment)
    stats.normalized++
  }

  return {
    companies: Array.from(companiesBySiren.values()),
    establishments,
    stats,
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const dryRun = !args.execute
  const runAt = new Date().toISOString()
  console.log(`[sirene-import] ${dryRun ? 'DRY-RUN (aucune écriture)' : 'EXECUTE'} · dept=${args.dept} · source=sirene`)

  // -- Récupération -----------------------------------------------------------
  let raw
  if (args.fromFile) {
    raw = readJsonFile(args.fromFile)
    console.log(`[sirene-import] fichier local : ${raw.length} établissements bruts`)
  } else {
    const consumerKey = process.env.SIRENE_CONSUMER_KEY
    const consumerSecret = process.env.SIRENE_CONSUMER_SECRET
    if (!consumerKey || !consumerSecret) {
      console.error('[sirene-import] SIRENE_CONSUMER_KEY/SECRET absents — utilisez --from-file ou fournissez les credentials SIRENE')
      process.exit(2)
    }
    const token = await sirene.fetchToken({
      fetchFn: globalThis.fetch, consumerKey, consumerSecret,
    })
    const batches = []
    const result = await sirene.iterateEstablishments({
      fetchFn: globalThis.fetch,
      token,
      departement: args.dept,
      maxPages: args.maxPages,
      onPage: (list, n) => {
        batches.push(...list)
        console.log(`[sirene-import] page ${n} : +${list.length} (cumul ${batches.length})`)
      },
    })
    if (result.truncated) {
      console.error('[sirene-import] ATTENTION : max-pages atteint, import tronqué')
      process.exit(3)
    }
    raw = batches
    console.log(`[sirene-import] SIRENE : ${raw.length} établissements (total annoncé ${result.total})`)
  }

  // -- Normalisation ----------------------------------------------------------
  const { companies, establishments, stats } = buildRecords(raw)
  for (const c of companies) c.source_updated_at = runAt
  for (const e of establishments) e.source_updated_at = runAt

  // -- Store (dry par défaut) ---------------------------------------------------
  const store = createStore({
    dryRun,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    fetchFn: globalThis.fetch,
  })

  if (!dryRun) {
    // Fail-closed : le schéma Phase 1 doit être APPLIQUÉ en prod avant tout écrit.
    try {
      await store.probeSchema()
    } catch (e) {
      console.error('[sirene-import] FAIL-CLOSED : table companies inaccessible (' +
        (e && e.message ? e.message.slice(0, 120) : e) + ') — appliquer le schéma (apply-supabase-schema.yml) d\'abord')
      process.exit(1)
    }
  }

  await store.upsertDataSource({
    key: 'sirene',
    name: 'INSEE SIRENE v3.11',
    provider: 'insee',
    source_type: 'registry',
    version: '3.11',
    base_url: sirene.DEFAULT_BASE_URL,
  })

  await store.upsertCompanies(companies)

  // Lien establishment → company (live uniquement ; en dry-run le plan suffit)
  let estRows = establishments
  if (!dryRun) {
    const sirens = companies.map((c) => c.siren)
    const idBySiren = await store.readIdMap('companies', 'siren', sirens)
    estRows = establishments.map((e) => {
      const siren = e.siret.slice(0, 9)
      return Object.assign({}, e, { company_id: idBySiren[siren] })
    }).filter((e) => e.company_id) // jamais de rattachement inventé
  }
  await store.upsertEstablishments(estRows)

  // -- Résumé synthétique (aucun PII, aucun secret) ------------------------------
  const summary = {
    source: 'sirene',
    departement: args.dept,
    dry_run: dryRun,
    run_at: runAt,
    fetched: stats.fetched,
    normalized: stats.normalized,
    invalid: stats.invalid,
    deduped: stats.deduped,
    companies: companies.length,
    establishments: establishments.length,
    by_status: establishments.reduce((m, e) => {
      m[e.status] = (m[e.status] || 0) + 1
      return m
    }, {}),
    writes: store.stats,
    http_calls: store.http.calls,
  }
  console.log('[sirene-import] SUMMARY ' + JSON.stringify(summary, null, 2))
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[sirene-import] ERREUR :', e && e.message ? e.message : e)
    process.exit(1)
  })
}

module.exports = { parseArgs, buildRecords }
