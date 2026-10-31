#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { calculateMollieMetrics, normalizeCurrency } = require('../../scripts/automation/mollie-mrr.cjs')

assert.equal(normalizeCurrency({ currency: 'usd' }), 'USD')
assert.equal(normalizeCurrency({}), 'UNKNOWN')

const activeSubs = [
  { amount: { value: '12.00', currency: 'EUR' }, interval: '1 month' },
  { amount: { value: '120.00', currency: 'EUR' }, interval: '12 months' },
  { amount: { value: '120.00', currency: 'USD' }, interval: '12 months' },
  { amount: { value: '9.99', currency: 'USD' }, interval: '1 month' },
  { amount: { value: '8.00' }, interval: '1 month' },
]

const paid = [
  { amount: { value: '7.99', currency: 'EUR' }, metadata: { pass: 'p7' }, description: 'Sargasses Pass' },
  { amount: { value: '790.00', currency: 'EUR' }, description: 'Pro Annual' },
  { amount: { value: '2.00', currency: 'EUR' }, description: 'Other' },
  { amount: { value: '5.99', currency: 'USD' }, metadata: { pass: 'p7' }, description: 'Sargassum Pass' },
  { amount: { value: '790.00', currency: 'USD' }, description: 'Pro Annual' },
  { amount: { value: '1.00', currency: 'USD' }, description: 'Other' },
]

const result = calculateMollieMetrics(activeSubs, paid)

assert.equal(result.mrr.total_eur, 87.83, 'legacy EUR MRR must include EUR only')
assert.equal(result.mrr.subscriptions_eur, 22, 'EUR subscriptions remain in EUR')
assert.equal(result.mrr.passes_month_eur, 7.99, 'EUR pass revenue remains in EUR')
assert.equal(result.mrr.b2b_month_eur, 790, 'EUR B2B revenue remains in EUR')
assert.equal(result.mrr.by_currency.USD.total, 85.82, 'USD MRR is calculated separately')
assert.equal(result.mrr.by_currency.UNKNOWN.total, 8, 'missing currency is not silently assumed to be EUR')
assert.equal(result.revenue_this_month_eur, 799.99, 'EUR revenue excludes USD payments')
assert.equal(result.revenue_this_month_by_currency.USD, 796.99, 'USD revenue remains separately visible')
assert.equal(result.currency_breakdown.EUR.count, 3, 'EUR payment count is grouped')
assert.equal(result.currency_breakdown.USD.total_amount, 796.99, 'USD breakdown uses a currency-neutral field')
assert.equal('total_eur' in result.currency_breakdown.USD, false, 'USD is never labelled as EUR')
assert.equal(result.payments_this_month, 6, 'total payment count remains unchanged')

console.log('MOLLIE_MRR_CURRENCY_TESTS PASS (14 assertions)')
