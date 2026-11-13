'use strict'

const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { STRIPE_LIVE_LINKS, decideCheckoutSession, checkoutUrl, linkByAmount } = require('../../scripts/lib/stripe-live-links.cjs')

const keys = Object.keys(STRIPE_LIVE_LINKS)
assert.equal(keys.length, 10)
const amounts = new Set()
for (const [key, row] of Object.entries(STRIPE_LIVE_LINKS)) {
  assert.match(row.url, /^https:\/\/buy\.stripe\.com\//, key)
  assert.equal(amounts.has(row.currency + ':' + row.amount), false, key)
  amounts.add(row.currency + ':' + row.amount)
}

const paid = decideCheckoutSession({
  id: 'cs_test',
  payment_status: 'paid',
  amount_total: 1499,
  currency: 'eur',
  metadata: { price_key: 'p30_eur', brand: 'sargasses' },
  customer_details: { email: 'a@b.co' },
  client_reference_id: 'order-1',
  payment_intent: 'pi_1',
})
assert.equal(paid.action, 'grant')
assert.equal(paid.spec.pass, 'p30')

assert.equal(decideCheckoutSession({ payment_status: 'unpaid', amount_total: 1499, currency: 'eur', customer_details: { email: 'a@b.co' } }).action, 'ignore')
assert.equal(decideCheckoutSession({
  payment_status: 'paid', amount_total: 799, currency: 'eur',
  metadata: { price_key: 'p30_eur' }, customer_details: { email: 'a@b.co' },
}).reason, 'price_key_mismatch')
assert.equal(linkByAmount(69000, 'eur'), 'pro_annual_eur')

const url = new URL(checkoutUrl('trip7_eur', 'ord_1', 'a@b.co'))
assert.equal(url.searchParams.get('client_reference_id'), 'ord_1')
assert.equal(url.searchParams.get('prefilled_email'), 'a@b.co')

const worker = fs.readFileSync(path.join(__dirname, '../../workers/sg-payments/index.js'), 'utf8')
const regional = fs.readFileSync(path.join(__dirname, '../../workers/sargagame/index.js'), 'utf8')
for (const row of Object.values(STRIPE_LIVE_LINKS)) {
  assert.ok(worker.includes(row.url), row.url)
}
for (const key of ['trip7_eur', 'trip7_usd', 'p30_eur', 'p30_usd', 'season_eur', 'season_usd']) {
  assert.ok(regional.includes(STRIPE_LIVE_LINKS[key].url), key)
}
assert.match(worker, /missing_signature/)
assert.match(worker, /status: 400/)
assert.match(worker, /charge\.refunded/)
assert.match(worker, /charge\.dispute\.created/)
assert.match(worker, /payment_status/)

console.log('PASS stripe live links')
