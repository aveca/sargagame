/**
 * audit-stripe-duplicates.cjs — Audit (lecture seule) des doublons Stripe sargassum.
 * Usage: STRIPE_KEY=sk_... node scripts/audit-stripe-duplicates.cjs
 * N'imprime JAMAIS la clé. Ne modifie rien (audit only).
 */
const fs = require('fs')
const path = require('path')

const KEY = process.env.STRIPE_KEY || (() => {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/STRIPE_SECRET_KEY=([^\r\n]+)/)
  if (!m) throw new Error('.env: STRIPE_SECRET_KEY introuvable')
  return m[1]
})()
const MODE = KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE'

const ISLANDS = new Set(['puntacana', 'florida', 'rivieramaya'])
const OUR_DOMAINS = ['sargasses-martinique.com', 'sargasses-guadeloupe.com', 'sargassumpuntacana.com']

async function stripe(pathname) {
  const res = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    headers: { Authorization: `Basic ${Buffer.from(KEY + ':').toString('base64')}` },
  })
  const json = await res.json()
  if (json.error) throw new Error(`Stripe GET ${pathname}: ${json.error.message}`)
  return json
}

async function listAll(base) {
  // paginate
  let url = base.includes('?') ? `${base}&limit=100` : `${base}?limit=100`
  const out = []
  while (true) {
    const page = await stripe(url)
    out.push(...page.data)
    if (!page.has_more) break
    const last = page.data[page.data.length - 1].id
    url = (base.includes('?') ? `${base}&limit=100` : `${base}?limit=100`) + `&starting_after=${last}`
  }
  return out
}

const isOurs = (o) => ISLANDS.has(o.metadata?.island) || (o.name && /sargassum/i.test(o.name))

async function main() {
  console.log(`=== MODE ${MODE} ===`)

  // 1. Products (active + inactive)
  const [pActive, pInactive] = await Promise.all([listAll('products?active=true'), listAll('products?active=false')])
  const products = [...pActive, ...pInactive].filter(isOurs)
  console.log(`\n-- PRODUCTS (ours, ${products.length}) --`)
  for (const p of products) {
    console.log(`${p.id} | active=${p.active} | island=${p.metadata?.island || '-'} | "${p.name}" | created=${new Date(p.created * 1000).toISOString()}`)
  }

  // 4. Prices per product
  console.log(`\n-- PRICES --`)
  for (const p of products) {
    const prices = await listAll(`prices?product=${p.id}`)
    for (const pr of prices) {
      console.log(`${p.id} -> ${pr.id} | active=${pr.active} | ${pr.unit_amount} ${pr.currency} / ${pr.recurring?.interval || 'one-time'} | nick="${pr.nickname || ''}" | created=${new Date(pr.created * 1000).toISOString()}`)
    }
  }

  // 2. Payment links
  const [plActive, plInactive] = await Promise.all([listAll('payment_links?active=true'), listAll('payment_links?active=false')])
  const allLinks = [...plActive, ...plInactive]
  const ourLinks = allLinks.filter((l) => ISLANDS.has(l.metadata?.island))
  console.log(`\n-- PAYMENT LINKS (total ${allLinks.length}, ours-by-island ${ourLinks.length}) --`)
  for (const l of ourLinks) {
    console.log(`${l.id} | active=${l.active} | island=${l.metadata?.island} | plan=${l.metadata?.plan || '-'} | ${l.url}`)
  }
  // also show links without island metadata for inspection (id + url only)
  const noIsland = allLinks.filter((l) => !ISLANDS.has(l.metadata?.island))
  console.log(`-- payment links WITHOUT our island metadata (${noIsland.length}) — listed for visibility, NOT touched --`)
  for (const l of noIsland) console.log(`  ${l.id} | active=${l.active} | metadata=${JSON.stringify(l.metadata)} | ${l.url}`)

  // 3. Webhook endpoints
  const hooks = await listAll('webhook_endpoints')
  console.log(`\n-- WEBHOOK ENDPOINTS (all ${hooks.length}) --`)
  for (const w of hooks) {
    const ours = OUR_DOMAINS.some((d) => w.url.includes(d))
    console.log(`${w.id} | status=${w.status} | ${w.url} ${ours ? '<== OURS' : ''}`)
  }

  // 6. Subscriptions (TEST check, but harmless to list in both)
  const subs = await listAll('subscriptions?status=all')
  const ourSubs = subs.filter((s) => ISLANDS.has(s.metadata?.island))
  console.log(`\n-- SUBSCRIPTIONS with our island metadata (${ourSubs.length}) --`)
  for (const s of ourSubs) {
    console.log(`${s.id} | status=${s.status} | island=${s.metadata?.island} | created=${new Date(s.created * 1000).toISOString()}`)
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
