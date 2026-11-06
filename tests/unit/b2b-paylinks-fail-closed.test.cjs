'use strict';
const assert = require('node:assert/strict');
const { payUrlFor, loadLinks } = require('../../scripts/automation/lib/b2b-paylinks.cjs');

const links = loadLinks();

assert.equal(payUrlFor('territoire'), null,
  'Territoire must not silently receive the Pro annual link');
assert.equal(payUrlFor('territory'), null,
  'unapproved English Territoire alias must remain unmapped');
assert.equal(payUrlFor('unknown'), null,
  'unknown tier must fail closed');
assert.equal(payUrlFor(''), null,
  'empty tier must fail closed');
assert.equal(payUrlFor(null), null,
  'null tier must fail closed');

if (links.pro_annual && typeof links.pro_annual.url === 'string') {
  assert.equal(payUrlFor('pro'), links.pro_annual.url,
    'approved Pro tier keeps its existing configured link');
  assert.equal(payUrlFor(' PRO '), links.pro_annual.url,
    'known tiers are normalized without changing their mapping');
  assert.equal(payUrlFor('hotel'), links.pro_annual.url,
    'existing hotel mapping remains unchanged');
  assert.equal(payUrlFor('resort'), links.pro_annual.url,
    'existing resort mapping remains unchanged');
}
if (links.brief_annual && typeof links.brief_annual.url === 'string') {
  assert.equal(payUrlFor('brief'), links.brief_annual.url,
    'approved Brief tier keeps its existing configured link');
  assert.equal(payUrlFor('lodge-gite'), links.brief_annual.url,
    'existing lodge-gite mapping remains unchanged');
}

console.log('B2B_PAYLINKS_FAIL_CLOSED_TESTS PASS');
