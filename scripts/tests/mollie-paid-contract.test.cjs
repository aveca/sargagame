#!/usr/bin/env node
/**
 * mollie-paid-contract.test.cjs — Contrat d'agrégation du bloc « vérité Mollie »
 * de daily-metrics.json (scripts/automation/lib/mollie-aggregate.cjs).
 *
 * Contexte 2026-08-25 : alerte « mollie.paid vide depuis le 18/08 » → CAUSE
 * PROUVÉE correcte (dernière vente réelle 2026-07-19 sortie de la fenêtre 30j,
 * 0 paiement paid depuis — API Mollie). Ces tests verrouillent la sémantique
 * pour qu'une future régression du collector soit détectée par CI, pas par une
 * session d'investigation.
 *
 * Run : node scripts/tests/mollie-paid-contract.test.cjs
 */
const assert = require('assert')
const { aggregateMolliePayments } = require('../automation/lib/mollie-aggregate.cjs')

const NOW = Date.parse('2026-08-25T12:00:00Z')
const SINCE = NOW - 30 * 864e5 // 2026-07-26T12:00:00Z
const pay = (createdAt, value, currency, extra = {}) => ({
  createdAt, status: 'paid', amount: { value, currency }, resource: 'payment', mode: 'live', ...extra,
})

let n = 0
const t = (name, fn) => { fn(); n++; console.log(`  ok ${n} — ${name}`) }

// ── Cas 1 : paiement payé → mollie.paid contient 1 ─────────────────────────
t('Cas 1 — un paiement paid dans la fenêtre → paid {USD:{count:1,total:5.99}}', () => {
  const r = aggregateMolliePayments([[pay('2026-08-01T10:00:00Z', '5.99', 'USD', { metadata: { email: 'a@x.com' } })]], SINCE)
  assert.deepStrictEqual(r.paid, { USD: { count: 1, total: 5.99 } })
  assert.strictEqual(r.lastPaidAt, '2026-08-01T10:00:00Z')
})

// ── Cas 2 : aucun paiement payé → paid = {} + lastPaidAt renseigné ─────────
t('Cas 2 — zéro paid (fenêtre vide) → paid {} mais lastPaidAt = vente hors fenêtre', () => {
  const r = aggregateMolliePayments([[pay('2026-07-19T03:46:00Z', '5.99', 'USD')]], SINCE)
  assert.deepStrictEqual(r.paid, {})
  assert.strictEqual(r.lastPaidAt, '2026-07-19T03:46:00Z') // info « 0 vente DEPUIS » préservée
})

// ── Cas 3 : statuts non payés → exclus des compteurs ───────────────────────
t('Cas 3 — open/pending/expired/canceled/failed → jamais dans paid/refunds/payers', () => {
  const rows = ['open', 'pending', 'expired', 'canceled', 'failed'].map((s, i) => ({
    createdAt: '2026-08-20T0' + i + ':00:00Z', status: s, amount: { value: '14.99', currency: 'EUR' }, metadata: { email: 'x@y.com' },
  }))
  const r = aggregateMolliePayments([rows], SINCE)
  assert.deepStrictEqual(r.paid, {})
  assert.strictEqual(r.refunds.count, 0)
  assert.deepStrictEqual(r.payers, [])
  assert.strictEqual(r.lastPaidAt, null)
})

// ── Cas 4 : pagination — plusieurs pages agrégées, early-stop respecté ─────
t('Cas 4 — 3 pages agrégées (paid répartis + refunds/chargebacks multi-pages)', () => {
  const p1 = [pay('2026-08-24T10:00:00Z', '14.99', 'EUR', { metadata: { email: 'a@x.com' } }),
              { ...pay('2026-08-23T10:00:00Z', '11.99', 'USD'), amountRefunded: { value: '5.00', currency: 'USD' } }]
  const p2 = [pay('2026-08-10T10:00:00Z', '7.99', 'EUR', { metadata: { email: 'b@x.com' } }),
              { ...pay('2026-08-09T10:00:00Z', '79.00', 'EUR', { metadata: { b2b: '1', plan: 'pro_monthly', email: 'hotel@x.com' } }) }]
  const p3 = [pay('2026-07-01T10:00:00Z', '7.99', 'EUR')] // hors fenêtre → early-stop après cette page
  const r = aggregateMolliePayments([p1, p2, p3], SINCE)
  assert.strictEqual(r.paid.EUR.count, 3) // 14.99 + 7.99 + 79.00 (p3 exclu du compteur 30j)
  assert.strictEqual(r.paid.EUR.total, 101.98)
  assert.strictEqual(r.paid.USD.count, 1)
  assert.strictEqual(r.refunds.count, 1)
  assert.deepStrictEqual(r.refunds.total, { USD: 5 })
  assert.strictEqual(r.b2b, 1)
  assert.strictEqual(r.payers.length, 3) // hash8 distincts, triés
  assert.strictEqual(r.lastPaidAt, '2026-08-24T10:00:00Z')
})

// ── Cas 5 : boundary fenêtre 30j — createdAt === since INCLU, since-1s EXCLU ─
t('Cas 5 — boundary : createdAt < since exclu, createdAt === since inclu (comportement historique <)', () => {
  const r = aggregateMolliePayments([
    [pay(new Date(SINCE - 1000).toISOString(), '1.00', 'EUR')],
    [pay(new Date(SINCE).toISOString(), '2.00', 'EUR')],
  ], SINCE)
  assert.deepStrictEqual(r.paid, { EUR: { count: 1, total: 2 } })
  assert.strictEqual(r.lastPaidAt, new Date(SINCE).toISOString()) // la plus récente gagne (hors-fenêtre aussi candidate)
})

// ── Bonus contrat : multi-devises séparées + arrondi 2 décimales ───────────
t('Bonus — devises agrégées séparément, sommes arrondies à 2 décimales', () => {
  const rows = [pay('2026-08-01T10:00:00Z', '7.99', 'EUR'), pay('2026-08-02T10:00:00Z', '7.99', 'EUR'),
                pay('2026-08-03T10:00:00Z', '11.99', 'USD')]
  const r = aggregateMolliePayments([rows], SINCE)
  assert.deepStrictEqual(r.paid, { EUR: { count: 2, total: 15.98 }, USD: { count: 1, total: 11.99 } })
})

t('Bonus — détection paylink B2B : description « Sargasses Pro » sans email + metadata plan', () => {
  const rows = [pay('2026-08-05T10:00:00Z', '690.00', 'EUR', { description: 'Sargasses Pro Annuel' }),
                pay('2026-08-06T10:00:00Z', '79.00', 'EUR', { metadata: { plan: 'brief_monthly', email: 'b@x.com' } }),
                pay('2026-08-07T10:00:00Z', '14.99', 'EUR', { description: 'Sargasses Pass p30' })]
  const r = aggregateMolliePayments([rows], SINCE)
  assert.strictEqual(r.b2b, 2) // pass p30 B2C ne compte pas
})

console.log(`\nmollie-paid-contract: ${n}/${n} GREEN`)
