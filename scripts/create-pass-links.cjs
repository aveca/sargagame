/**
 * create-pass-links.cjs — Crée les PASS one-time EUR (MQ/GP) : produit + prix
 * one-time (mode=payment, ZÉRO abonnement, ZÉRO essai) + Payment Links, pour le
 * modèle « paie à l'usage » (accès time-boxé, cf handler ?pass=pNN dans l'app).
 *
 * Honnête : le pass donne accès à ce qu'on a VRAIMENT (prévision 7j réelle +
 * alertes + brief), pour la durée achetée. Pas de fausse prévision long-terme.
 *
 * A/B prix : plusieurs prix par durée → plusieurs liens. Le storefront in-app
 * choisira la variante (abVariant) plus tard. Idempotent (réutilise par metadata).
 *
 * Usage :
 *   node scripts/create-pass-links.cjs                 # LIVE (.env STRIPE_SECRET_KEY)
 *   STRIPE_KEY=sk_test_xxx node scripts/create-pass-links.cjs   # TEST d'abord
 *
 * Sortie : scripts/automation/data/pass-links.json (consommé par le storefront).
 */
const fs = require('fs')
const path = require('path')

const KEY = process.env.STRIPE_KEY || (() => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/STRIPE_SECRET_KEY=([^\r\n]+)/)
  if (!m) throw new Error('.env: STRIPE_SECRET_KEY introuvable')
  return m[1].trim()
})()
const MODE = KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE'

// Matrice PASS × prix (cents EUR). Chaque (pass,cents) = 1 prix + 1 lien (A/B).
const PASSES = [
  { key: 'p7',  days: 7,  label: 'Pass 7 jours',  cents: [799, 999] },
  { key: 'p30', days: 30, label: 'Pass 30 jours', cents: [1499, 1999, 2499] },
]
// Domaine de redirection par île (Payment Link = URL de retour fixe).
const DOMAINS = { mq: 'sargasses-martinique.com', gp: 'sargasses-guadeloupe.com' }
const ISLANDS = (process.argv[2] ? process.argv[2].split(',') : ['mq', 'gp']) // défaut MQ+GP ; `node ... mq` pour une seule

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

async function ensureProduct() {
  const products = await stripe('products?limit=100&active=true')
  let product = products.data.find((p) => p.metadata && p.metadata.kind === 'sg_pass')
  if (product) { console.log(`Produit pass existant: ${product.id}`); return product }
  product = await stripe('products', {
    name: 'Sargasses — Pass d’accès',
    description: 'Accès complet (prévision 7 jours, alertes, brief) pour la durée du pass — paiement unique, sans abonnement.',
    'metadata[kind]': 'sg_pass',
  })
  console.log(`Produit pass créé: ${product.id}`)
  return product
}

async function main() {
  console.log(`Mode ${MODE} — îles: ${ISLANDS.join(',')}`)
  const product = await ensureProduct()
  const existingPrices = (await stripe(`prices?product=${product.id}&active=true&limit=100`)).data
  const existingLinks = (await stripe('payment_links?limit=100')).data
  const out = {}

  for (const island of ISLANDS) {
    const domain = DOMAINS[island]
    if (!domain) { console.error(`île inconnue: ${island}`); continue }
    out[island] = {}
    for (const pass of PASSES) {
      out[island][pass.key] = { days: pass.days, label: pass.label, variants: [] }
      for (const cents of pass.cents) {
        // prix one-time (PAS de recurring) idempotent
        let price = existingPrices.find((p) => p.unit_amount === cents && p.currency === 'eur' && !p.recurring &&
          p.metadata && p.metadata.pass === pass.key)
        if (!price) {
          price = await stripe('prices', {
            product: product.id,
            unit_amount: String(cents),
            currency: 'eur',
            nickname: `${pass.label} — ${(cents / 100).toFixed(2)} € (${island})`,
            'metadata[pass]': pass.key,
            'metadata[kind]': 'sg_pass',
          })
          existingPrices.push(price)
          console.log(`Prix ${pass.key} ${cents}c créé: ${price.id}`)
        } else console.log(`Prix ${pass.key} ${cents}c existant: ${price.id}`)

        // Payment Link one-time idempotent (metadata island+pass+cents)
        let link = existingLinks.find((l) => l.active && l.metadata && l.metadata.kind === 'sg_pass' &&
          l.metadata.island === island && l.metadata.pass === pass.key && String(l.metadata.cents) === String(cents))
        if (!link) {
          link = await stripe('payment_links', {
            'line_items[0][price]': price.id,
            'line_items[0][quantity]': '1',
            'metadata[kind]': 'sg_pass',
            'metadata[island]': island,
            'metadata[pass]': pass.key,
            'metadata[cents]': String(cents),
            'after_completion[type]': 'redirect',
            'after_completion[redirect][url]': `https://${domain}/?pass=${pass.key}&session_id={CHECKOUT_SESSION_ID}`,
          })
          existingLinks.push(link)
          console.log(`Lien ${island}/${pass.key}/${cents}c créé: ${link.url}`)
        } else console.log(`Lien ${island}/${pass.key}/${cents}c existant: ${link.url}`)
        out[island][pass.key].variants.push({ cents, priceId: price.id, url: link.url })
      }
    }
  }

  if (MODE === 'LIVE') {
    const p = path.join(__dirname, 'automation', 'data', 'pass-links.json')
    fs.writeFileSync(p, JSON.stringify({ generatedAt: new Date().toISOString(), product: product.id, islands: out }, null, 2) + '\n')
    console.log(`\n✓ écrit ${path.relative(path.join(__dirname, '..'), p)}`)
  } else {
    console.log('\nMode TEST : liens non écrits (vérifie avec la carte 4242 puis relance en LIVE).')
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
