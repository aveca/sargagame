#!/usr/bin/env node
// Crée le produit + les plans de facturation PayPal (mensuel/annuel) à partir de
// public/api/paypal-config.php, puis réécrit les identifiants P-xxx dans ce fichier.
// Usage : node scripts/create-paypal-plans.cjs   (lit env/client_id/secret du config)
const fs = require('fs')
const path = require('path')

const CONFIG = path.join(__dirname, '..', 'public', 'api', 'paypal-config.php')
const raw = fs.readFileSync(CONFIG, 'utf8')
const pick = (k) => { const m = raw.match(new RegExp("'" + k + "'\\s*=>\\s*'([^']*)'")); return m ? m[1] : '' }
const env = pick('env') || 'sandbox'
const clientId = pick('client_id')
const secret = pick('secret')
const BASE = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

if (!clientId || clientId.startsWith('COLLE') || !secret || secret.startsWith('COLLE')) {
  console.error('client_id/secret manquants dans paypal-config.php'); process.exit(1)
}

async function token() {
  const r = await fetch(BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('OAuth fail: ' + JSON.stringify(d))
  return d.access_token
}

async function api(tok, p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (r.status >= 400) throw new Error(p + ' -> ' + r.status + ' ' + JSON.stringify(d))
  return d
}

const mkPlan = (productId, name, unit, count, value) => ({
  product_id: productId, name,
  billing_cycles: [{
    frequency: { interval_unit: unit, interval_count: count },
    tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, // 0 = renouvellement infini
    pricing_scheme: { fixed_price: { value, currency_code: 'EUR' } },
  }],
  payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 3 },
})

;(async () => {
  const tok = await token()
  console.log('env:', env)
  const product = await api(tok, '/v1/catalogs/products', { name: 'Sargasses Premium', type: 'SERVICE', category: 'SOFTWARE' })
  console.log('product:', product.id)
  const monthly = await api(tok, '/v1/billing/plans', mkPlan(product.id, 'Sargasses Mensuel', 'MONTH', 1, '4.99'))
  console.log('monthly:', monthly.id, monthly.status)
  const annual = await api(tok, '/v1/billing/plans', mkPlan(product.id, 'Sargasses Annuel', 'YEAR', 1, '39.99'))
  console.log('annual:', annual.id, annual.status)
  let cfg = fs.readFileSync(CONFIG, 'utf8')
  cfg = cfg.replace(/'monthly'\s*=>\s*'[^']*'/, "'monthly' => '" + monthly.id + "'")
  cfg = cfg.replace(/'annual'\s*=>\s*'[^']*'/, "'annual'  => '" + annual.id + "'")
  fs.writeFileSync(CONFIG, cfg)
  console.log('OK — plans ecrits dans paypal-config.php')
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
