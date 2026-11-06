const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { urlFromCatalog, payUrlFor } = require('../../scripts/automation/lib/b2b-paylinks.cjs')

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'api', 'b2b-paylinks.json'), 'utf8'))

async function main() {
  const { selectB2bPaylink } = await import('../../src/lib/b2b-paylink-offer.mjs')
  const dead = { pro_annual: { url: 'https://payment-links.example/pro', value: '690.00' } }
  assert.equal(urlFromCatalog(dead, 'pro'), null)
  assert.equal(urlFromCatalog(dead, 'territoire'), null)
  assert.equal(urlFromCatalog(dead, 'territory'), null)
  assert.equal(urlFromCatalog(dead, ''), null)
  assert.equal(urlFromCatalog(dead, null), null)
  assert.equal(urlFromCatalog(dead, 'unknown'), null)
  assert.equal(selectB2bPaylink(dead, 'pro', false), null)

  const live = {
    pro_annual: { url: 'https://payment-links.example/pro', value: '690.00', reachable: true },
    pro_annual_usd: { url: 'https://payment-links.example/pro-usd', value: '790.00', reachable: true },
    brief_annual: { url: 'https://payment-links.example/brief', value: '290.00', reachable: false },
  }
  assert.equal(urlFromCatalog(live, 'pro'), live.pro_annual.url)
  assert.equal(urlFromCatalog(live, ' PRO '), live.pro_annual.url)
  assert.equal(urlFromCatalog(live, 'hotel'), live.pro_annual.url)
  assert.equal(urlFromCatalog(live, 'brief'), null)
  assert.equal(urlFromCatalog(live, 'territoire'), null)
  assert.equal(urlFromCatalog({ pro_annual: { url: 'http://payment-links.example/pro', reachable: true } }, 'pro'), null)
  assert.deepEqual(selectB2bPaylink(live, 'pro', false), { url: live.pro_annual.url, amt: '690 €' })
  assert.deepEqual(selectB2bPaylink(live, 'pro', true), { url: live.pro_annual_usd.url, amt: '$790' })
  assert.equal(selectB2bPaylink(live, 'brief', false), null)
  assert.equal(selectB2bPaylink(live, 'territoire', false), null)
  assert.equal(selectB2bPaylink(null, 'pro', false), null)

  const flagged = Object.entries(catalog.links || {}).filter(([, link]) => link && link.reachable === true)
  assert.equal(flagged.length, 0)
  assert.equal(payUrlFor('pro'), null)
  assert.equal(payUrlFor('territoire'), null)
  console.log('b2b-paylink-offer: OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
