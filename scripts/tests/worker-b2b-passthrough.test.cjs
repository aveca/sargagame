#!/usr/bin/env node
/**
 * worker-b2b-passthrough.test.cjs — contrat du passthrough statique b2b-api
 * (BUG-2026-033, sprint B2B 2026-09-05).
 *
 * Contexte : la route worker /api/b2b* happait GET /api/b2b-paylinks.json
 * (liens + montants annuels Mollie publiés par le build) → 404, liens annuels
 * invisibles dans le modal Pro. Le worker laisse désormais passer ce GET exact
 * vers l'origine Pages (les sous-requêtes contournent les routes workers).
 *
 * Bundle le VRAI worker (esbuild), l'exécute en Node avec fetch d'origine
 * simulé, et vérifie :
 *   1. GET /api/b2b-paylinks.json → transmis à l'origine, réponse renvoyée telle quelle
 *   2. POST /api/b2b-paylinks.json → PAS de passthrough (404 dispatch, scoping GET-only)
 *   3. GET /api/b2b-nope → 404 (dispatch inchangé, money-path intact)
 *
 * Aucune requête réseau réelle.
 */
'use strict'

const path = require('path')
const os = require('os')

let passed = 0, failed = 0
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label) }
  else { failed++; console.error('  ✗ FAIL:', label) }
}

async function main() {
  const esbuild = require('esbuild')
  const out = path.join(os.tmpdir(), `b2b-api-test-${Date.now()}.mjs`)
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', '..', 'workers', 'b2b-api', 'index.js')],
    bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent',
  })
  const worker = (await import('file:///' + out.replace(/\\/g, '/'))).default
  ok(typeof worker.fetch === 'function', 'worker bundle OK (export fetch)')

  // Origine Pages simulée : ne connaît QUE le statique paylinks.
  const ORIGIN_BODY = JSON.stringify({ links: { pro_annual: { url: 'https://payment-links.mollie.com/payment/TEST', value: '690.00' } } })
  const seen = []
  globalThis.fetch = async (input) => {
    const url = String((input && input.url) || input)
    seen.push(url)
    if (url.endsWith('/api/b2b-paylinks.json')) {
      return new Response(ORIGIN_BODY, { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('origin-404', { status: 404 })
  }

  const env = {}
  // 1. GET paylinks → passthrough origine, réponse intacte
  {
    const r = await worker.fetch(new Request('https://sargasses-martinique.com/api/b2b-paylinks.json'), env)
    ok(r.status === 200, 'GET b2b-paylinks.json → 200 (passthrough)')
    ok((await r.text()) === ORIGIN_BODY, 'GET b2b-paylinks.json → corps origine intact')
    ok(seen.some((u) => u.endsWith('/api/b2b-paylinks.json')), 'GET b2b-paylinks.json → sous-requête origine émise')
  }
  // 2. POST même chemin → PAS de passthrough (dispatch normal → 404, GET-only)
  {
    seen.length = 0
    const r = await worker.fetch(new Request('https://sargasses-martinique.com/api/b2b-paylinks.json', { method: 'POST', body: '{}' }), env)
    ok(r.status === 404, 'POST b2b-paylinks.json → 404 dispatch (pas de passthrough)')
    ok(seen.length === 0, 'POST b2b-paylinks.json → aucune sous-requête origine')
  }
  // 3. GET inconnu → 404 dispatch (comportement inchangé)
  {
    const r = await worker.fetch(new Request('https://sargasses-martinique.com/api/b2b-nope'), env)
    ok(r.status === 404, 'GET /api/b2b-nope → 404 (dispatch inchangé)')
  }

  console.log(`\nworker-b2b-passthrough: ${passed} pass / ${failed} fail`)
  try { require('fs').unlinkSync(out) } catch (_) {}
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
