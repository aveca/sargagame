#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const {
  calculateMollieMetrics,
  isSargassesPayment,
  isSargassesSubscription,
  normalizeCurrency,
} = require('../../scripts/automation/mollie-mrr.cjs')

assert.equal(normalizeCurrency({ currency: 'usd' }), 'USD')
assert.equal(normalizeCurrency({}), 'UNKNOWN')

const activeSubs = [
  { amount: { value: '12.00', currency: 'EUR' }, interval: '1 month', metadata: { plan: 'pro_monthly' }, description: 'Sargasses Pro — mensuel' },
  { amount: { value: '120.00', currency: 'EUR' }, interval: '12 months', metadata: { plan: 'brief_monthly' }, description: 'Sargasses Brief — mensuel' },
  { amount: { value: '120.00', currency: 'USD' }, interval: '12 months', metadata: { plan: 'pro_monthly' }, description: 'Sargassum Pro monthly' },
  { amount: { value: '9.99', currency: 'USD' }, interval: '1 month', metadata: { plan: 'brief_monthly' }, description: 'Sargassum Brief monthly' },
  { amount: { value: '8.00' }, interval: '1 month', metadata: { plan: 'pro_monthly' }, description: 'Sargasses Pro monthly' },
  { amount: { value: '999.00', currency: 'EUR' }, interval: '1 month', metadata: { plan: 'wow_pro' }, description: 'BOT-WOW Pro' },
  { amount: { value: '29.00', currency: 'EUR' }, interval: '1 month', metadata: { plan: 'pro_monthly' }, description: 'Pro Annual' },
]

const paid = [
  { amount: { value: '7.99', currency: 'EUR' }, metadata: { pass: 'p7' }, description: 'Sargasses Pass 7 jours' },
  { amount: { value: '790.00', currency: 'EUR' }, description: 'Sargasses Pro — Brief (abonnement annuel)' },
  { amount: { value: '2.00', currency: 'EUR' }, description: 'Other' },
  { amount: { value: '5.99', currency: 'USD' }, metadata: { pass: 'trip7' }, description: 'Sargassum Pass — 1-Day Trip' },
  { amount: { value: '790.00', currency: 'USD' }, description: 'Sargassum Pro — Pro (annual)' },
  { amount: { value: '1.00', currency: 'USD' }, description: 'Other' },
  { amount: { value: '19.99', currency: 'EUR' }, metadata: { pass: 'season' }, description: 'Sargasses Pass Saison' },
  { amount: { value: '4.99', currency: 'EUR' }, metadata: { pass: 'trip7' }, description: 'Sargasses Pass Escale' },
  { amount: { value: '20.00', currency: 'EUR' }, description: 'BOT-WOW Pro' },
  { amount: { value: '3.00', currency: 'EUR' }, description: 'Pro Annual' },
  { amount: { value: '1.00', currency: 'EUR' }, description: 'Sargasses' },
  { amount: { value: '2.00', currency: 'USD' }, description: 'Sargassum' },
]

assert.equal(isSargassesSubscription(activeSubs[0]), true)
assert.equal(isSargassesSubscription(activeSubs[5]), false)
assert.equal(isSargassesPayment(paid[0]), true)
assert.equal(isSargassesPayment(paid[8]), false)
assert.equal(isSargassesPayment(paid[10]), false, 'brand alone is not enough to attribute a payment')

const result = calculateMollieMetrics(activeSubs, paid)

assert.equal(result.mrr.total_eur, 87.83, 'Sargasses EUR MRR includes only scoped EUR subscriptions and B2B annualized revenue')
assert.equal(result.mrr.subscriptions_eur, 22, 'Sargasses EUR subscriptions remain in EUR')
assert.equal(result.mrr.passes_month_eur, 32.97, 'trip7 and season passes are recognized alongside legacy p7')
assert.equal(result.mrr.b2b_month_eur, 790, 'branded Sargasses B2B annual revenue remains in EUR')
assert.equal(result.mrr.by_currency.USD.total, 85.82, 'USD MRR is calculated separately')
assert.equal(result.mrr.by_currency.UNKNOWN.total, 8, 'missing currency is not silently assumed to be EUR')
assert.equal(result.revenue_this_month_eur, 822.97, 'EUR revenue excludes other and unattributed account payments')
assert.equal(result.revenue_this_month_by_currency.USD, 795.99, 'USD Sargasses revenue remains separately visible')
assert.equal(result.currency_breakdown.EUR.count, 4, 'only attributed EUR payments are counted')
assert.equal(result.currency_breakdown.EUR.total_amount, 822.97, 'EUR breakdown contains only Sargasses-attributed revenue')
assert.equal(result.currency_breakdown.USD.total_amount, 795.99, 'USD breakdown uses a currency-neutral field')
assert.equal('total_eur' in result.currency_breakdown.USD, false, 'USD is never labelled as EUR')
assert.equal(result.payments_this_month, 6, 'Sargasses payment count excludes other Mollie products')
assert.equal(result.account_payments_this_month, 12, 'account-level payment count remains visible')
assert.equal(result.active_subscriptions, 5, 'only the two known Sargasses B2B plan families are counted')
assert.equal(result.unattributed_active_subscriptions, 2, 'unmatched subscriptions are not silently attributed')
assert.equal(result.unattributed_payments_this_month, 6, 'unmatched account payments are kept separate')
assert.equal(result.unattributed_revenue_this_month_by_currency.EUR, 26, 'unattributed EUR is reported separately')
assert.equal(result.unattributed_revenue_this_month_by_currency.USD, 3, 'unattributed USD is reported separately')

console.log('MOLLIE_MRR_CURRENCY_TESTS PASS (22 assertions)')
