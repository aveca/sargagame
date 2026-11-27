#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createEnv, installFetch, jsonResponse } = require('./mollie-worker-harness.cjs')
const { localizeProPricing } = require('../../scripts/lib/localize-pro-pricing.cjs')
const { writeCommercialPages } = require('../../scripts/lib/write-commercial-pages.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const USD = ['florida', 'puntacana', 'rivieramaya', 'tulum']

let n = 0
function t(cond, label) {
  n++
  assert.ok(cond, label)
  console.log('OK  ' + label)
}

async function main() {
  const src = fs.readFileSync(path.join(ROOT, 'workers/sg-payments/index.js'), 'utf8')
  t(!src.includes('Paiement sécurisé via Mollie'), 'la page de paiement ne dit plus via Mollie')
  t(src.includes('Paiement sécurisé via Stripe'), 'la page de paiement dit Stripe')
  t(!src.includes('b2b_concierge_checkout'), 'le checkout B2B ne crée plus de client Mollie')

  const prep = fs.readFileSync(path.join(ROOT, 'scripts/prepare-ftp.cjs'), 'utf8')
  const body = prep.slice(prep.indexOf('function prepareNewRegion'))
  t(!/skip\.add\(['"]offres['"]\)/.test(body) && !/skip\.add\(['"]merci['"]\)/.test(body), 'le packaging USD ne saute ni /offres ni /merci')
  t(body.includes('writeCommercialPages(out, region, root)'), 'le packaging USD réécrit /offres')
  t(body.includes("path.join(root, 'public', 'merci')"), 'le packaging USD copie /merci')

  const { default: worker } = await import(pathToFileURL(path.join(ROOT, 'workers/sg-payments/index.js')).href)
  const state = { mollie: [] }
  const net = installFetch(({ url }) => {
    if (String(url).includes('api.mollie.com')) state.mollie.push(url)
    return jsonResponse({})
  })
  const { env } = createEnv()
  const checkout = await worker.fetch(new Request('https://sargassummiami.com/api/b2b-create-checkout.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://sargassummiami.com' },
    body: JSON.stringify({ prospect_id: 'p', concierge_id: 'c', email: 'a@b.co' })
  }), env, { waitUntil() {} })
  const checkoutJson = await checkout.json()
  t(checkout.status === 410 && checkoutJson.url === 'https://sargassummiami.com/pro/pricing/', 'checkout B2B renvoie 410 vers /pro/pricing/')
  t(state.mollie.length === 0, 'ce 410 ne contacte pas Mollie')
  const page = await worker.fetch(new Request('https://sargasses-martinique.com/api/mollie-pay?plan=pro_annual'), env, { waitUntil() {} })
  const html = await page.text()
  t(page.status === 200 && html.includes('via Stripe') && !html.includes('via Mollie'), 'la page /api/mollie-pay parle de Stripe')
  net.restore()

  for (const id of USD) {
    const region = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8'))
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-usd-'))
    writeCommercialPages(out, region, ROOT)
    const offers = fs.readFileSync(path.join(out, 'offres', 'index.html'), 'utf8')
    t(offers.includes('buy.stripe.com') && (offers.includes('Monthly') || offers.includes('Mensual')), id + ' : /offres a les boutons Pro')
    const pricing = localizeProPricing(out, region, ROOT)
    const pricingHtml = fs.readFileSync(path.join(out, 'pro', 'pricing', 'index.html'), 'utf8')
    t(pricing.copied && pricingHtml.includes('https://' + region.domain + '/pro/pricing/'), id + ' : /pro/pricing localisé')
    t(pricingHtml.includes('buy.stripe.com') && (pricingHtml.includes('>Monthly<') || pricingHtml.includes('>Mensual<')), id + ' : boutons de la page tarifaire')
    fs.rmSync(out, { recursive: true, force: true })
  }
  t(fs.existsSync(path.join(ROOT, 'public/merci/index.html')), '/merci existe dans public')
  console.log(n + ' checks')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
