#!/usr/bin/env node
'use strict'

/**
 * b2b-paylinks-worker-catalog.test.cjs — garde-fou du catalogue B2B SERVI PAR
 * LA WORKER (`GET /api/b2b-paylinks.json`, workers/sg-payments/index.js).
 *
 * DÉFAUT RÉEL MESURÉ (2026-11-26) : la worker publiait `{ url, amount, currency }`
 * seuls. Or `selectB2bPaylink()` (src/lib/b2b-paylink-offer.mjs — CTA annuel du
 * paywall B2B) et `urlFromCatalog()` (scripts/automation/lib/b2b-paylinks.cjs —
 * emails B2B) exigent `reachable === true` + une `value` pour le prix affiché :
 * le garde renvoyait null → CTA annuel muet, retombée silencieuse /?pro=1.
 *
 * Ce test verrouille le contrat : `value` + `reachable: true` sur les tiers
 * dont la page de paiement est prouvée vivante (GET /api/mollie-pay?plan=…
 * → 200), et AUCUN prix touché (`value` = miroir de `amount`). Les tiers sans
 * page de paiement (brief_annual, territory_annual → 404) restent absents.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createEnv } = require('./mollie-worker-harness.cjs')

const ROOT = path.resolve(__dirname, '..', '..')

let n = 0
function t(cond, label) {
  n++
  assert.ok(cond, label)
  console.log('OK  ' + label)
}

async function main() {
  const { default: worker } = await import(pathToFileURL(path.join(ROOT, 'workers/sg-payments/index.js')).href)
  const { env } = createEnv()
  const res = await worker.fetch(new Request('https://sargasses-martinique.com/api/b2b-paylinks.json'), env, { waitUntil() {} })
  const json = await res.json()
  t(res.status === 200, 'GET /api/b2b-paylinks.json → 200')
  const links = json.links
  t(!!links, 'le corps expose `links`')

  t(!!links.pro_annual && links.pro_annual.reachable === true, 'pro_annual expose reachable: true (page /api/mollie-pay?plan=pro_annual → 200, vérifié live)')
  t(links.pro_annual.value === '690.00', 'pro_annual expose value=690.00 (miroir du prix — AUCUN prix changé)')
  t(links.pro_annual.amount === 690, 'pro_annual amount inchangé (690)')
  t(links.pro_annual.currency === 'EUR', 'pro_annual currency EUR')
  t(links.pro_annual.url.endsWith('/api/mollie-pay?plan=pro_annual'), 'pro_annual URL = page de paiement self-serve')

  t(!!links.pro_annual_usd && links.pro_annual_usd.reachable === true, 'pro_annual_usd expose reachable: true (page → 200, vérifié live)')
  t(links.pro_annual_usd.value === '790.00', 'pro_annual_usd expose value=790.00')
  t(links.pro_annual_usd.amount === 790, 'pro_annual_usd amount inchangé (790)')
  t(links.pro_annual_usd.url.endsWith('/api/mollie-pay?plan=pro_annual_usd'), 'pro_annual_usd URL = page de paiement self-serve')

  t(links.brief_annual === undefined && links.territory_annual === undefined, 'tiers SANS page de paiement live (404) : absents du catalogue')

  // Contrat consommateur : le sélecteur du paywall rend un CTA exploitable.
  const { selectB2bPaylink } = await import(pathToFileURL(path.join(ROOT, 'src/lib/b2b-paylink-offer.mjs')).href)
  assert.deepEqual(selectB2bPaylink(links, 'pro', false), { url: links.pro_annual.url, amt: '690 €' })
  console.log('OK  selectB2bPaylink(pro) → CTA 690 € à partir du catalogue servi')
  assert.deepEqual(selectB2bPaylink(links, 'pro', true), { url: links.pro_annual_usd.url, amt: '$790' })
  console.log('OK  selectB2bPaylink(pro, new region) → CTA $790')
  assert.equal(selectB2bPaylink(links, 'brief', false), null, 'brief sans page vivante → pas de CTA')
  console.log('OK  selectB2bPaylink(brief) → null (page 404 : garde correct)')

  // Le cache ne doit pas figer un catalogue réparé.
  const cache = res.headers.get('Cache-Control')
  t(/no-store/.test(cache || ''), 'Cache-Control: no-store (pas de catalogue figé)')
  console.log('b2b-paylinks-worker-catalog: OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})