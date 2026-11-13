'use strict'

/**
 * Liens Stripe LIVE publics (buy.stripe.com) du compte acct_1UZv9LDrGo8CQxeJ.
 * Aucun secret. Les montants sont ceux du catalogue déjà affiché.
 * La metadata price_key est aussi portée par payment_intent_data / subscription_data ;
 * le webhook la recoupe avec amount_total + currency, et refuse si les deux divergent.
 */
const STRIPE_LIVE_LINKS = Object.freeze({
  trip7_eur: Object.freeze({ url: 'https://buy.stripe.com/8x2dR95oa5S1awpbfiebu00', amount: 799, currency: 'eur', kind: 'b2c', pass: 'trip7', days: 7 }),
  trip7_usd: Object.freeze({ url: 'https://buy.stripe.com/28EcN5bMyfsB5c53MQebu01', amount: 899, currency: 'usd', kind: 'b2c', pass: 'trip7', days: 7 }),
  p30_eur: Object.freeze({ url: 'https://buy.stripe.com/8x200jg2O6W56g997aebu02', amount: 1499, currency: 'eur', kind: 'b2c', pass: 'p30', days: 30 }),
  p30_usd: Object.freeze({ url: 'https://buy.stripe.com/9B69ATbMycgpeMFabeebu03', amount: 1699, currency: 'usd', kind: 'b2c', pass: 'p30', days: 30 }),
  season_eur: Object.freeze({ url: 'https://buy.stripe.com/4gMcN55oagwF4816Z2ebu04', amount: 2499, currency: 'eur', kind: 'b2c', pass: 'season', days: 210 }),
  season_usd: Object.freeze({ url: 'https://buy.stripe.com/4gM28r8AmfsB481eruebu05', amount: 2799, currency: 'usd', kind: 'b2c', pass: 'season', days: 210 }),
  pro_monthly_eur: Object.freeze({ url: 'https://buy.stripe.com/4gM28rcQCeox7kd6Z2ebu06', amount: 7900, currency: 'eur', kind: 'b2b', plan: 'pro_monthly', days: 30 }),
  pro_monthly_usd: Object.freeze({ url: 'https://buy.stripe.com/cNi4gzdUGbcl1ZTcjmebu07', amount: 8900, currency: 'usd', kind: 'b2b', plan: 'pro_monthly_usd', days: 30 }),
  pro_annual_eur: Object.freeze({ url: 'https://buy.stripe.com/cNifZhcQC1BL1ZTbfiebu08', amount: 69000, currency: 'eur', kind: 'b2b', plan: 'pro_annual', days: 365 }),
  pro_annual_usd: Object.freeze({ url: 'https://buy.stripe.com/cNi8wP4k6gwF33X4QUebu09', amount: 79000, currency: 'usd', kind: 'b2b', plan: 'pro_annual_usd', days: 365 }),
})

function priceKeyFor(passOrPlan, currency) {
  const cur = String(currency || '').toLowerCase() === 'usd' ? 'usd' : 'eur'
  const key = `${passOrPlan}_${cur}`
  return Object.prototype.hasOwnProperty.call(STRIPE_LIVE_LINKS, key) ? key : null
}

function linkByAmount(amount, currency) {
  const cur = String(currency || '').toLowerCase()
  const cents = Number(amount)
  for (const [key, row] of Object.entries(STRIPE_LIVE_LINKS)) {
    if (row.amount === cents && row.currency === cur) return key
  }
  return null
}

function resolvePriceKey(metadata, amount, currency) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const fromMeta = typeof meta.price_key === 'string' ? meta.price_key : ''
  const fromAmount = linkByAmount(amount, currency)
  if (fromMeta && !STRIPE_LIVE_LINKS[fromMeta]) return { error: 'unknown_price_key' }
  if (fromMeta && fromAmount && fromMeta !== fromAmount) return { error: 'price_key_mismatch' }
  const priceKey = fromMeta || fromAmount
  if (!priceKey) return { error: 'unknown_amount' }
  return { priceKey, spec: STRIPE_LIVE_LINKS[priceKey] }
}

function decideCheckoutSession(session) {
  if (!session || typeof session !== 'object') return { action: 'ignore', reason: 'missing_session' }
  const status = String(session.payment_status || '')
  if (status !== 'paid') return { action: 'ignore', reason: 'not_paid' }
  const resolved = resolvePriceKey(session.metadata, session.amount_total, session.currency)
  if (resolved.error) return { action: 'ignore', reason: resolved.error }
  const email = String(session.customer_details && session.customer_details.email || session.customer_email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { action: 'ignore', reason: 'missing_email' }
  return {
    action: 'grant',
    priceKey: resolved.priceKey,
    spec: resolved.spec,
    email,
    sessionId: String(session.id || ''),
    clientReferenceId: String(session.client_reference_id || ''),
    paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : '',
  }
}

function checkoutUrl(priceKey, clientReferenceId, email) {
  const row = STRIPE_LIVE_LINKS[priceKey]
  if (!row) return null
  const url = new URL(row.url)
  if (clientReferenceId) url.searchParams.set('client_reference_id', String(clientReferenceId).slice(0, 200))
  if (email && String(email).includes('@')) url.searchParams.set('prefilled_email', String(email).trim().slice(0, 200))
  return url.toString()
}

module.exports = {
  STRIPE_LIVE_LINKS,
  priceKeyFor,
  linkByAmount,
  resolvePriceKey,
  decideCheckoutSession,
  checkoutUrl,
}
