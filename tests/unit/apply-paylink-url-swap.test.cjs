const assert = require('assert')
const { applyPaylinkUrlSwap } = require('../../scripts/automation/apply-paylink-url-swap.cjs')

const catalog = {
  links: {
    pro_annual: { id: 'pl_old', url: 'https://payment-links.example/old', value: '690.00', reachable: false },
  },
}

const noop = applyPaylinkUrlSwap(catalog, { links: { pro_annual: { id: '', url: '' } } })
assert.equal(noop.links.pro_annual.url, catalog.links.pro_annual.url)
assert.equal(noop.links.pro_annual.value, '690.00')
assert.notEqual(noop.links.pro_annual.reachable, true)

const swapped = applyPaylinkUrlSwap(catalog, {
  links: { pro_annual: { id: 'pl_new', url: 'https://payment-links.example/new' } },
})
assert.equal(swapped.links.pro_annual.id, 'pl_new')
assert.equal(swapped.links.pro_annual.url, 'https://payment-links.example/new')
assert.equal(swapped.links.pro_annual.value, '690.00')
assert.equal(swapped.links.pro_annual.reachable, true)

assert.throws(() => applyPaylinkUrlSwap(catalog, { links: { pro_annual: { id: 'x', url: 'https://example/new', value: '1.00' } } }), /amount_or_extra_field/)
assert.throws(() => applyPaylinkUrlSwap(catalog, { links: { unknown: { id: 'x', url: 'https://example/new' } } }), /unknown_tier/)
console.log('apply-paylink-url-swap: OK')
