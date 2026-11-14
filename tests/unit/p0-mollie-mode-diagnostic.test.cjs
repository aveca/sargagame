#!/usr/bin/env node
'use strict'
/**
 * p0-mollie-mode-diagnostic.test.cjs — P0 « chemin argent » : VÉRIFIER le mode
 * du backend Mollie (TEST vs LIVE) sur les six domaines SANS créer de
 * transaction et SANS jamais exposer la clé.
 *
 * Ce qui est verrouillé ici :
 *   M1. le mode est déduit du préfixe de la clé (`live_` / `test_`) ;
 *   M2. la réponse ne contient NI la clé NI aucun fragment de clé ;
 *   M3. AUCUNE requête sortante vers api.mollie.com n'est un POST
 *       (donc : aucune transaction créée par le diagnostic) ;
 *   M4. `api_mode` rapporte le `mode` renvoyé par l'API Mollie elle-même ;
 *   M5. une clé absente => `unknown` et AUCUN appel sortant ;
 *   M6. une clé refusée (401) => `unauthorized` (le mode reste celui du préfixe).
 *
 * Aucun paiement réel n'est utilisé : la clé est une chaîne de test factice
 * et le `fetch` vers Mollie est intercepté.
 */

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createEnv, installFetch, jsonResponse } = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const ROOT = path.resolve(__dirname, '..', '..')
const WORKER_PATH = path.join(ROOT, 'workers', 'sg-payments', 'index.js')

const MODE_URL = 'https://sargasses-martinique.com/api/mollie-mode'

async function callMode(worker, env) {
  const res = await worker.fetch(new Request(MODE_URL), env, { waitUntil() {} })
  const body = await res.text()
  return { res, body, json: JSON.parse(body) }
}

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // ── M1 + M4 : clé LIVE => mode live, api_mode live ──────────────────────
  {
    const LIVE_KEY = 'live_fake_key_for_tests_never_used'
    const { env } = createEnv({ env: { MOLLIE_API_KEY: LIVE_KEY } })
    const fetchMock = installFetch(async ({ url }) => {
      if (url.includes('api.mollie.com/v2/payments')) {
        return jsonResponse({ _embedded: { payments: [{ id: 'tr_x', mode: 'live' }] } })
      }
      return jsonResponse({ error: 'unexpected_host' }, 500)
    })
    try {
      const { res, body, json } = await callMode(worker, env)
      t(res.status === 200, 'M1 : /api/mollie-mode répond 200')
      t(json.mode === 'live', 'M1 : une clé live_ est déclarée mode=live')
      t(json.api_mode === 'live', 'M4 : api_mode reprend le mode renvoyé par Mollie')
      t(!body.includes(LIVE_KEY), 'M2 : la réponse ne contient PAS la clé')
      t(!body.includes('fake_key'), 'M2 : la réponse ne contient aucun fragment de la clé')
      t(!body.includes('live_fake'), 'M2 : la réponse ne contient pas le préfixe brut de la clé')
      const mollieCalls = fetchMock.calls.filter((c) => c.url.includes('api.mollie.com'))
      t(mollieCalls.length === 1, 'M3 : un seul appel Mollie (lecture de la liste des paiements)')
      t(
        mollieCalls.every((c) => c.method === 'GET'),
        'M3 : AUCUN POST vers api.mollie.com (aucune transaction creee)',
      )
    } finally {
      fetchMock.restore()
    }
  }

  // ── M1 : clé TEST => mode test ──────────────────────────────────────────
  {
    const TEST_KEY = 'test_fake_key_for_tests'
    const { env } = createEnv({ env: { MOLLIE_API_KEY: TEST_KEY } })
    const fetchMock = installFetch(async () => jsonResponse({ _embedded: { payments: [] } }))
    try {
      const { json, body } = await callMode(worker, env)
      t(json.mode === 'test', 'M1 : une clé test_ est déclarée mode=test')
      t(json.api_mode === 'no_payment_yet', 'M4 : api_mode=no_payment_yet quand la liste est vide')
      t(!body.includes(TEST_KEY), 'M2 : la réponse ne contient PAS la clé de test')
    } finally {
      fetchMock.restore()
    }
  }

  // ── M5 : aucune clé => unknown, AUCUN appel sortant ─────────────────────
  {
    const { env } = createEnv()
    delete env.MOLLIE_API_KEY
    const fetchMock = installFetch(async () => jsonResponse({ error: 'unexpected_host' }, 500))
    try {
      const { json } = await callMode(worker, env)
      t(json.mode === 'unknown', 'M5 : sans clé, mode=unknown')
      t(json.api_mode === 'not_checked', 'M5 : sans clé, api_mode=not_checked')
      t(
        fetchMock.calls.filter((c) => c.url.includes('api.mollie.com')).length === 0,
        'M5 : sans clé, AUCUN appel sortant vers Mollie',
      )
    } finally {
      fetchMock.restore()
    }
  }

  // ── M6 : clé refusée par Mollie (401) => unauthorized ───────────────────
  {
    const { env } = createEnv({ env: { MOLLIE_API_KEY: 'live_fake_key_for_tests' } })
    const fetchMock = installFetch(async () => jsonResponse({ status: 401, title: 'Unauthorized' }, 401))
    try {
      const { json } = await callMode(worker, env)
      t(json.mode === 'live', 'M6 : le mode du préfixe reste live')
      t(json.api_mode === 'unauthorized', 'M6 : api_mode=unauthorized signale une clé refusée')
    } finally {
      fetchMock.restore()
    }
  }

  // ── Le diagnostic ne crée AUCUNE route de paiement ──────────────────────
  {
    const { env } = createEnv()
    const fetchMock = installFetch(async () => jsonResponse({ _embedded: { payments: [] } }))
    try {
      await callMode(worker, env)
      const creating = fetchMock.calls.filter(
        (c) => c.url.includes('api.mollie.com') && c.method !== 'GET',
      )
      t(creating.length === 0, 'M3 : le diagnostic ne déclenche aucune création de paiement')
    } finally {
      fetchMock.restore()
    }
  }

  console.log(`\nP0_MOLLIE_MODE_DIAGNOSTIC_TESTS PASS (${n} assertions)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
