#!/usr/bin/env node
/**
 * worker-payments-passthrough.test.cjs — contrat du passthrough statique
 * sg-payments (BUG-2026-033, sprint B2B 2026-09-06).
 *
 * Contexte : c'est sg-payments (fallthrough final) qui répondait 404
 * {"error":"not_found"} sur GET /api/b2b-paylinks.json en production
 * (liens + montants annuels Mollie invisibles dans le modal Pro).
 * Le worker laisse désormais passer ce GET exact vers l'origine Pages.
 *
 * Bundle le VRAI worker (esbuild, entrée TS comme worker-auth.contract),
 * l'exécute en Node avec fetch d'origine simulé, et vérifie :
 *   1. GET /api/b2b-paylinks.json → transmis à l'origine, réponse intacte
 *   2. POST /api/b2b-paylinks.json → 404 dispatch (GET-only, money-path intact)
 *   3. GET /api/unknown-xyz → 404 (fallthrough inchangé)
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
  const out = path.join(os.tmpdir(), `sg-payments-test-${Date.now()}.mjs`)
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'src', 'index.ts')],
    bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent',
  })
  const worker = (await import('file:///' + out.replace(/\\/g, '/'))).default
  ok(typeof worker.fetch === 'function', 'worker bundle OK (export fetch)')

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
    const r = await worker.fetch(new Request('https://sargasses-martinique.com/api/b2b-paylinks.json'), env, {})
    ok(r.status === 200, 'GET b2b-paylinks.json → 200 (passthrough)')
    ok((await r.text()) === ORIGIN_BODY, 'GET b2b-paylinks.json → corps origine intact')
    ok(seen.some((u) => u.endsWith('/api/b2b-paylinks.json')), 'GET b2b-paylinks.json → sous-requête origine émise')
  }
  // 2. POST même chemin → 404 dispatch (GET-only)
  {
    seen.length = 0
    const r = await worker.fetch(new Request('https://sargasses-martinique.com/api/b2b-paylinks.json', { method: 'POST', body: '{}' }), env, {})
    ok(r.status === 404, 'POST b2b-paylinks.json → 404 dispatch (pas de passthrough)')
    ok(seen.length === 0, 'POST b2b-paylinks.json → aucune sous-requête origine')
  }
  // 3. GET inconnu → 404 (fallthrough inchangé)
  {
    const r = await worker.fetch(new Request('https://sargasses-martinique.com/api/unknown-xyz-123'), env, {})
    ok(r.status === 404, 'GET /api/unknown-xyz-123 → 404 (fallthrough inchangé)')
  }

  console.log(`\nworker-payments-passthrough: ${passed} pass / ${failed} fail`)
  try { require('fs').unlinkSync(out) } catch (_) {}
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
