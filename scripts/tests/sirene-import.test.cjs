#!/usr/bin/env node
'use strict'
/**
 * Contract test — SIRENE import (Phase 2).
 * 100 % local : jamais de réseau réel, jamais de Supabase production.
 * Le transport HTTP est TOUJOURS injecté (fixtures + faux PostgREST mémoire).
 */
const { execFileSync } = require('child_process')
const path = require('path')

const sirene = require('../lib/sirene-client.cjs')
const { createStore } = require('../lib/b2b-store.cjs')
const { buildRecords } = require('../automation/sirene-mq-import.cjs')

let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}
function expectThrow(fn, label) {
  try { fn(); ok(false, label + ' (aurait dû lever)') }
  catch (_) { ok(true, label) }
}
async function expectReject(fn, label) {
  try { await fn(); ok(false, label + ' (aurait dû rejeter)') }
  catch (_) { ok(true, label) }
}

const FIXTURE = path.join(__dirname, 'fixtures', 'sirene-mq-sample.json')

// ---------------------------------------------------------------------------
// 1) Validation identifiants (Luhn)
// ---------------------------------------------------------------------------
console.log('— identifiants —')
ok(sirene.isValidSiren('972500011'), 'SIREN valide (Luhn) accepté')
ok(!sirene.isValidSiren('972500012'), 'SIREN Luhn invalide rejeté')
ok(!sirene.isValidSiren('123'), 'SIREN longueur fausse rejeté')
ok(sirene.isValidSiret('97250001100010'), 'SIRET valide (Luhn) accepté')
ok(!sirene.isValidSiret('97250001100011'), 'SIRET Luhn invalide rejeté')
ok(!sirene.isValidSiret('9725000110001'), 'SIRET 13 chiffres rejeté')
ok(sirene.isValidSiret('35600000000048'), 'exception La Poste documentée tolérée')
ok(!sirene.isValidSiret('12345678900000'), 'pas de contournement Luhn hors La Poste')

// ---------------------------------------------------------------------------
// 2) Statuts ACTIVE / INACTIVE / UNKNOWN
// ---------------------------------------------------------------------------
console.log('— statuts —')
ok(sirene.mapStatus('A') === 'active', 'A → active')
ok(sirene.mapStatus('F') === 'inactive', 'F → inactive')
ok(sirene.mapStatus(undefined) === 'unknown', 'absent → unknown')
ok(sirene.mapStatus('X') === 'unknown', 'code inconnu → unknown (jamais deviné)')

// ---------------------------------------------------------------------------
// 3) Normalisation
// ---------------------------------------------------------------------------
console.log('— normalisation —')
const rawList = JSON.parse(require('fs').readFileSync(FIXTURE, 'utf8')).etablissements

{
  const p = sirene.normalizeEstablishment(rawList[0])
  ok(!!p, 'établissement 1 normalisé')
  const c = p.company, e = p.establishment
  ok(c.legal_name === 'HOTEL EXEMPLE MARTINIQUE SA', 'legal_name = dénomination')
  ok(c.trading_name === 'HEM', 'trading_name = sigle')
  ok(c.siren === '972500011', 'siren extrait')
  ok(c.legal_status === 'active', 'unite légale active')
  ok(c.is_micro_enterprise === false, 'SA ≠ micro')
  ok(c.employee_range === '12', 'employee_range = tranche unité légale')
  ok(c.creation_date === '2010-06-15', 'creation_date')
  ok(c.source === 'sirene' && c.source_record_id === c.siren, 'source=sirene, record=siren')
  ok(c.ape_label === null, 'ape_label non inventé (null)')
  ok(e.siret === '97250001100010' && e.nic === '00010', 'SIRET/NIC')
  ok(e.siege === true, 'siège détecté')
  ok(e.status === 'active', 'établissement actif')
  ok(e.establishment_name === 'LAGON TEST', 'enseigne (source) conservée')
  ok(e.address_line1 === '12 RUE DES ALIZES', 'adresse composée depuis la source')
  ok(e.postal_code === '97290' && e.city === 'LE MARIN' && e.region_code === '972',
    'CP/commune/département')
  ok(e.latitude === null && e.longitude === null, 'lat/lon JAMAIS inventés')
}

{
  const p = sirene.normalizeEstablishment(rawList[2]) // EI
  ok(p.company.legal_name === 'DUPONT JEAN', 'EI : nom + prénom (champ légal SIRENE)')
  ok(p.company.is_micro_enterprise === true, 'cj 1000 → micro-entrepreneur')
  ok(p.company.employee_range === '00', 'tranche 00 conservée')
}

{
  const p = sirene.normalizeEstablishment(rawList[3]) // fermée
  ok(p.company.legal_status === 'inactive', 'unite F → inactive')
  ok(p.establishment.status === 'inactive', 'établissement F → inactive')
}

ok(sirene.normalizeEstablishment({ siret: 'abc', siren: 'xyz' }) === null, 'SIRET non numérique → rejeté')
ok(sirene.normalizeEstablishment({ siret: '97251002800012', siren: '972500011' }) === null,
  'SIRET ne contenant pas son SIREN → rejeté')
ok(sirene.normalizeEstablishment({
  siret: '97253004200019', siren: '972530042',
  uniteLegale: { etatAdministratifUniteLegale: 'A' },
}) === null, 'aucune dénomination légale → rejeté (jamais de nom inventé)')
ok(sirene.normalizeEstablishment(null) === null, 'input null → null')

// ---------------------------------------------------------------------------
// 4) buildRecords : dédup + séparation entreprise / établissement
// ---------------------------------------------------------------------------
console.log('— buildRecords —')
{
  const { companies, establishments, stats } = buildRecords(rawList)
  ok(stats.fetched === 6, 'fetched = 6')
  ok(stats.invalid === 1, 'invalid = 1 (Luhn)')
  ok(stats.deduped === 1, 'deduped = 1 (même SIRET)')
  ok(stats.normalized === 4, 'normalized = 4')
  ok(companies.length === 3, 'companies = 3 (dédoublonné par SIREN)')
  ok(establishments.length === 4, 'establishments = 4')
  const hotel = companies.find((c) => c.siren === '972500011')
  ok(!!hotel && companies.filter((c) => c.siren === '972500011').length === 1,
    'un seul enregistrement entreprise par SIREN')
  const statuses = establishments.reduce((m, e) => (m[e.status] = (m[e.status] || 0) + 1, m), {})
  ok(statuses.active === 3 && statuses.inactive === 1, 'statuts établissements 3A/1F')
}

// ---------------------------------------------------------------------------
// 5) Store : DRY-RUN = zéro HTTP / fail-closed / upsert idempotent
// ---------------------------------------------------------------------------
console.log('— store —')

function throwingFetch() { throw new Error('NETWORK FORBIDDEN IN THIS TEST') }

async function storeSuite() {
  {
    const store = createStore({ dryRun: true, fetchFn: throwingFetch })
    await store.upsertCompanies([{ siren: '972500011', legal_name: 'X' }])
    ok(store.http.calls === 0, 'dry-run : ZÉRO appel HTTP')
    ok(store.stats.wouldInsert === 1, 'dry-run : wouldInsert comptabilisé')
    // sans clés, le store dry ne doit jamais crash (pas de config requise en dry)
    const dry2 = createStore({ dryRun: true })
    await dry2.upsertEstablishments([{ siret: '97250001100010' }])
    ok(dry2.stats.wouldInsert === 1, 'dry-run sans config : OK (rien ne sort)')
    let threw = false
    try { await dry2.readIdMap('companies', 'siren', ['972500011']) } catch (_) { threw = true }
    ok(threw, 'dry-run : readIdMap interdit')
  }

  // fail-closed live
  expectThrow(() => createStore({ dryRun: false, fetchFn: throwingFetch }), 'live sans URL → throw')
  expectThrow(() => createStore({ dryRun: false, supabaseUrl: 'https://x', fetchFn: throwingFetch }),
    'live sans clé → throw')
  expectThrow(() => createStore({ dryRun: false, supabaseUrl: 'https://x', serviceKey: 'k' }),
    'live sans fetchFn → throw')

  // faux PostgREST en mémoire — vérifie upsert déterministe + idempotence
  {
    const state = { companies: [], company_establishments: [], data_sources: [] }
    let seq = 0
    const hist = { GET: [], POST: [], PATCH: [] }
    const fetchFn = async (url, init) => {
      hist[init.method].push(url)
      const m = url.match(/\/rest\/v1\/(\w+)(?:\?(.*))?$/)
      const table = m[1]
      const qs = m[2] || ''
      if (init.method === 'GET') {
        const inM = qs.match(/(\w+)=in\.\(([^)]*)\)/)
        let rows = state[table]
        if (inM) {
          const vals = inM[2].split(',').map((s) => s.replace(/^"|"$/g, ''))
          rows = rows.filter((r) => vals.includes(r[inM[1]]))
        }
        const body = JSON.stringify(rows)
        return { ok: true, status: 200, text: async () => body }
      }
      if (init.method === 'POST') {
        const rows = JSON.parse(init.body)
        for (const r of rows) { r.id = 'uuid-' + (++seq); state[table].push(r) }
        return { ok: true, status: 201, text: async () => '' }
      }
      if (init.method === 'PATCH') {
        const idM = qs.match(/id=eq\.([\w-]+)/)
        const row = JSON.parse(init.body)
        const t = state[table].find((r) => r.id === idM[1])
        if (t) Object.assign(t, row)
        return { ok: true, status: 204, text: async () => '' }
      }
      throw new Error('method ' + init.method)
    }

    const store = createStore({
      dryRun: false,
      supabaseUrl: 'https://fake.supabase.co',
      serviceKey: 'test-key',
      fetchFn,
    })

    await store.probeSchema()
    ok(hist.GET.length === 2, 'probeSchema : 2 GET de sondage')

    const { companies, establishments } = buildRecords(rawList)
    await store.upsertCompanies(companies)
    ok(store.stats.inserted === 3 && store.stats.updated === 0, 'import 1 : 3 companies insérées')
    const ids = await store.readIdMap('companies', 'siren', companies.map((c) => c.siren))
    ok(Object.keys(ids).length === 3, 'readIdMap : 3 SIREN résolus')

    const est1 = establishments.map((e) =>
      Object.assign({}, e, { company_id: ids[e.siret.slice(0, 9)] }))
    ok(est1.every((e) => e.company_id), 'chaque établissement rattaché à SA company (jamais inventé)')
    await store.upsertEstablishments(est1)
    ok(store.stats.inserted === 7, 'import 1 : + 4 établissements (7 insertions cumulées)')
    ok(state.companies.length === 3 && state.company_establishments.length === 4,
      'état après import 1 : 3 + 4')

    // Idempotence : rejouer le même import ne crée rien
    const before = {
      c: state.companies.length, e: state.company_establishments.length,
      posts: hist.POST.length,
    }
    const store2 = createStore({
      dryRun: false, supabaseUrl: 'https://fake.supabase.co', serviceKey: 'test-key', fetchFn,
    })
    await store2.upsertCompanies(companies)
    await store2.upsertEstablishments(est1)
    ok(store2.stats.inserted === 0 && store2.stats.updated === 7, 'import 2 : 0 insert, 7 update (maintenance)')
    ok(hist.POST.length === before.posts, 'import 2 : zéro POST')
    ok(state.companies.length === before.c && state.company_establishments.length === before.e,
      'idempotence : aucun doublon')
  }

  // probe fail-closed quand schéma absent
  {
    const notFound = async () => ({ ok: false, status: 404, text: async () => '{"code":"42P01"}' })
    const store = createStore({
      dryRun: false, supabaseUrl: 'https://fake.supabase.co', serviceKey: 'k', fetchFn: notFound,
    })
    let threw = false
    try { await store.probeSchema() } catch (_) { threw = true }
    ok(threw, 'probeSchema fail-closed si table absente (schéma non appliqué)')
  }
}

// ---------------------------------------------------------------------------
// 6) Client SIRENE : token + pages + backoff (mocks)
// ---------------------------------------------------------------------------
console.log('— client sirene (mock) —')

async function clientSuite() {
  await expectReject(() => sirene.fetchToken({ fetchFn: throwingFetch }), 'token sans credentials → throw')

  {
    const fetchFn = async (url, init) => {
      if (url.includes('/token')) {
        ok(String(init.headers.Authorization).startsWith('Basic '), 'token : Basic auth')
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok-1' }) }
      }
      throw new Error('unexpected')
    }
    const t = await sirene.fetchToken({ fetchFn, consumerKey: 'k', consumerSecret: 's' })
    ok(t === 'tok-1', 'token récupéré')
  }
  {
    const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({}) })
    let threw = false
    try { await sirene.fetchToken({ fetchFn, consumerKey: 'k', consumerSecret: 's' }) }
    catch (_) { threw = true }
    ok(threw, 'token 401 → throw (jamais de fallback silencieux)')
  }

  {
    const pages = [
      { header: { total: 2, curseurSuivant: 'CUR2' }, etablissements: [rawList[0]] },
      { header: { total: 2, curseurSuivant: null }, etablissements: [rawList[2]] },
    ]
    let call = 0
    const fetchFn = async (url) => {
      const idx = call++
      return { ok: true, status: 200, json: async () => pages[idx] }
    }
    const got = []
    const res = await sirene.iterateEstablishments({
      fetchFn, token: 't', departement: '972', sleepMs: 0, sleepFn: async () => {},
      onPage: (l) => got.push(...l),
    })
    ok(res.pages === 2 && res.total === 2, 'pagination : 2 pages parcourues')
    ok(got.length === 2, 'les 2 établissements ont été émis')
  }

  {
    // 429 → backoff puis succès ; curseur identique → stop (jamais de boucle infinie)
    let call = 0
    const slept = []
    const fetchFn = async () => {
      call++
      if (call === 1) return { ok: false, status: 429, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ header: { curseurSuivant: 'SAME' }, etablissements: [] }) }
    }
    const res = await sirene.iterateEstablishments({
      fetchFn, token: 't', sleepFn: async (ms) => slept.push(ms), maxPages: 5,
    })
    ok(slept[0] === 30000, '429 → backoff 30 s')
    ok(res.pages === 2 && res.truncated === false, 'curseur identique → arrêt propre')
  }
}

// ---------------------------------------------------------------------------
// 7) Orchestrateur : --from-file en DRY-RUN (process enfant isolé)
// ---------------------------------------------------------------------------
console.log('— orchestrateur (dry-run, fichier) —')
{
  const script = path.join(__dirname, '..', 'automation', 'sirene-mq-import.cjs')
  const out = execFileSync(process.execPath, [script, '--from-file', FIXTURE], {
    encoding: 'utf8', env: Object.assign({}, process.env, {
      SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', // prouver qu'aucune config n'est requise en dry
    }),
  })
  const m = out.match(/\[sirene-import\] SUMMARY (\{[\s\S]*\})/)
  ok(!!m, 'SUMMARY émis')
  const s = m ? JSON.parse(m[1]) : {}
  ok(s.dry_run === true, 'dry_run = true par défaut')
  ok(s.departement === '972', 'Martinique uniquement')
  ok(s.fetched === 6 && s.normalized === 4 && s.invalid === 1 && s.deduped === 1, 'compteurs pipeline')
  ok(s.companies === 3 && s.establishments === 4, 'agrégats entreprises/établissements')
  ok(s.by_status && s.by_status.active === 3 && s.by_status.inactive === 1, 'statuts résumé')
  ok(s.http_calls === 0, 'ZÉRO appel HTTP en dry-run')
  ok(s.writes.wouldInsert > 0 && !s.writes.inserted && !s.writes.updated, 'aucune écriture réelle')
}

{
  // --execute sans secrets → refus explicite (fail-closed), exit 1
  const script = path.join(__dirname, '..', 'automation', 'sirene-mq-import.cjs')
  let code = 0
  let err = ''
  try {
    execFileSync(process.execPath, [script, '--execute', '--from-file', FIXTURE], {
      encoding: 'utf8', stdio: 'pipe',
      env: Object.assign({}, process.env, {
        SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '',
        SIRENE_CONSUMER_KEY: '', SIRENE_CONSUMER_SECRET: '',
      }),
    })
  } catch (e) { code = e.status; err = String(e.stderr || e.stdout || '') }
  ok(code === 1, '--execute sans config → exit 1 (fail-closed)')
  ok(/b2b-store:|manquant|fail-closed/i.test(err), 'message fail-closed présent')
}

// ---------------------------------------------------------------------------
storeSuite()
  .then(clientSuite)
  .then(() => {
    console.log(failures === 0
      ? '\nSIRENE-IMPORT TESTS: ALL PASS'
      : `\nSIRENE-IMPORT TESTS: ${failures} FAILURE(S)`)
    process.exit(failures ? 1 : 0)
  })
  .catch((e) => { console.error(e); process.exit(1) })
