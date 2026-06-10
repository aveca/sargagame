/**
 * create-region-payment-links.cjs — Crée produit + prix + 2 Payment Links Stripe
 * pour une région du moteur regions/ et écrit paymentLinks{} dans son JSON.
 *
 * Usage :
 *   node scripts/create-region-payment-links.cjs puntacana            # clé .env STRIPE_SECRET_KEY (LIVE)
 *   STRIPE_KEY=sk_test_xxx node scripts/create-region-payment-links.cjs puntacana   # mode TEST d'abord
 *
 * Idempotent : réutilise le produit existant (metadata.island=<region>) et les
 * payment links actifs correspondants s'ils existent déjà.
 *
 * ⚠ Compte Stripe PARTAGÉ (botwow + autres) : metadata.island est posé sur le
 *   payment link ET sur subscription_data → propagé à la Checkout Session et à
 *   la Subscription. Le webhook (public/api/stripe-webhook.php) filtre dessus.
 * ⚠ automatic_tax volontairement OFF : pas de cadre Stripe Tax configuré sur le
 *   compte. À activer le jour où le volume US le justifie (seuils nexus).
 */
const fs = require('fs')
const path = require('path')
const { getRegion } = require('../regions/index.cjs')

const REGION_ID = process.argv[2]
if (!REGION_ID) { console.error('Usage: node scripts/create-region-payment-links.cjs <regionId>'); process.exit(1) }
const region = getRegion(REGION_ID)

const KEY = process.env.STRIPE_KEY || (() => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/STRIPE_SECRET_KEY=([^\r\n]+)/)
  if (!m) throw new Error('.env: STRIPE_SECRET_KEY introuvable')
  return m[1]
})()
const MODE = KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE'

// Tarifs USD (affichage = region.pricing, montants en cents ici)
const PLANS = {
  monthly: { amount: 999, interval: 'month', label: `Sargassum ${region.name} — Premium Monthly` },
  yearly: { amount: 7900, interval: 'year', label: `Sargassum ${region.name} — Premium Yearly` },
}
const TRIAL_DAYS = 7

async function stripe(pathname, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined
  const res = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(KEY + ':').toString('base64')}`,
      ...(params && { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    body,
  })
  const json = await res.json()
  if (json.error) throw new Error(`Stripe ${pathname}: ${json.error.message}`)
  return json
}

async function main() {
  console.log(`Mode ${MODE} — région ${region.id} (${region.name}, ${region.currency})`)

  // 1. Produit (réutilise si metadata.island match)
  const products = await stripe(`products?limit=100&active=true`)
  let product = products.data.find((p) => p.metadata?.island === region.id)
  if (product) console.log(`Produit existant réutilisé: ${product.id}`)
  else {
    product = await stripe('products', {
      name: `Sargassum ${region.name} — Premium`,
      description: `Daily beach pick, sargassum alerts and 7-day forecast for ${region.name} beaches`,
      'metadata[island]': region.id,
    })
    console.log(`Produit créé: ${product.id}`)
  }

  // 2. Prix + Payment Links
  const links = {}
  const priceIds = {}
  const existingLinks = await stripe('payment_links?limit=100')
  for (const [plan, cfg] of Object.entries(PLANS)) {
    const prices = await stripe(`prices?product=${product.id}&active=true&limit=100`)
    let price = prices.data.find((p) => p.unit_amount === cfg.amount && p.currency === 'usd' && p.recurring?.interval === cfg.interval)
    if (!price) {
      price = await stripe('prices', {
        product: product.id,
        unit_amount: String(cfg.amount),
        currency: 'usd',
        'recurring[interval]': cfg.interval,
        nickname: cfg.label,
      })
      console.log(`Prix ${plan} créé: ${price.id}`)
    } else console.log(`Prix ${plan} existant: ${price.id}`)
    priceIds[plan] = price.id

    let link = existingLinks.data.find((l) => l.active && l.metadata?.island === region.id && l.metadata?.plan === plan)
    if (!link) {
      link = await stripe('payment_links', {
        'line_items[0][price]': price.id,
        'line_items[0][quantity]': '1',
        'subscription_data[trial_period_days]': String(TRIAL_DAYS),
        'subscription_data[metadata][island]': region.id,
        'metadata[island]': region.id,
        'metadata[plan]': plan,
        'after_completion[type]': 'redirect',
        'after_completion[redirect][url]': `https://${region.domain}/?session_id={CHECKOUT_SESSION_ID}&premium=1&plan=${plan === 'yearly' ? 'annual' : 'monthly'}`,
      })
      console.log(`Payment Link ${plan} créé: ${link.url}`)
    } else console.log(`Payment Link ${plan} existant: ${link.url}`)
    links[plan] = link.url
  }

  // 3. Écrit dans regions/<id>.json (LIVE uniquement — un lien TEST ne doit jamais
  //    partir en prod ; en mode TEST on imprime sans écrire)
  if (MODE === 'LIVE') {
    const p = path.join(__dirname, '..', 'regions', `${region.id}.json`)
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    j.paymentLinks = { monthly: links.monthly, yearly: links.yearly }
    j.stripeProducts = { monthly: priceIds.monthly, yearly: priceIds.yearly }
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
    console.log(`regions/${region.id}.json mis à jour (paymentLinks + stripeProducts)`)
  } else {
    console.log('Mode TEST : liens non écrits dans le JSON région. Vérifie le checkout avec la carte 4242 puis relance en LIVE.')
  }
  console.log(JSON.stringify({ mode: MODE, product: product.id, prices: priceIds, links }, null, 2))
}

main().catch((e) => { console.error(e.message); process.exit(1) })
