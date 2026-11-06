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

function expectedUrl(key) {
  const link = links[key]
  if (link && link.reachable === true && typeof link.url === 'string' && link.url.startsWith('https://')) return link.url
  return null
}

assert.equal(payUrlFor('pro'), expectedUrl('pro_annual'),
  'approved Pro tier keeps its link only when reachable is true');
assert.equal(payUrlFor(' PRO '), expectedUrl('pro_annual'),
  'known tiers are normalized without changing their mapping');
assert.equal(payUrlFor('hotel'), expectedUrl('pro_annual'),
  'existing hotel mapping remains unchanged');
assert.equal(payUrlFor('resort'), expectedUrl('pro_annual'),
  'existing resort mapping remains unchanged');
assert.equal(payUrlFor('brief'), expectedUrl('brief_annual'),
  'approved Brief tier keeps its link only when reachable is true');
assert.equal(payUrlFor('lodge-gite'), expectedUrl('brief_annual'),
  'existing lodge-gite mapping remains unchanged');

console.log('B2B_PAYLINKS_FAIL_CLOSED_TESTS PASS');
