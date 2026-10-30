#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');

const html = fs.readFileSync(
  path.resolve(__dirname, '../../public/widget/embed/index.html'),
  'utf8'
);

function extractFunction(name) {
  const re = new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\}');
  const match = html.match(re);
  assert.ok(match, name + ' helper exists in widget source');
  return match[0];
}

const helpers = vm.runInNewContext(
  'var ST = { clean: true, moderate: true, avoid: true };\n' +
  extractFunction('satelliteAgeMs') + '\n' +
  extractFunction('isSatelliteFresh') + '\n' +
  '({ satelliteAgeMs, isSatelliteFresh })'
);

const now = Date.parse('2026-10-29T21:30:00.000Z');
const stalePayload = {
  source: 'erddap-live',
  updatedAt: '2026-10-29T21:00:00.000Z',
  erddapTimestamp: '2026-10-27T12:00:00Z',
  dataAgeMinutes: 1772,
  stale: false
};
const freshPayload = {
  source: 'erddap-live',
  erddapTimestamp: '2026-10-29T15:30:00.000Z',
  stale: false
};

assert.ok(
  helpers.satelliteAgeMs(stalePayload.erddapTimestamp, now) > 12 * 3.6e6,
  'the observation is stale even when updatedAt is recent'
);
assert.equal(
  helpers.isSatelliteFresh(stalePayload, 'clean', now),
  false,
  'a recent publication timestamp cannot make an old observation fresh'
);
assert.equal(
  helpers.isSatelliteFresh(freshPayload, 'clean', now),
  true,
  'observation younger than 12h is fresh'
);
assert.equal(
  helpers.isSatelliteFresh({ ...freshPayload, erddapTimestamp: '2026-10-29T09:30:00.000Z' }, 'clean', now),
  false,
  'exactly 12h is not fresh'
);
assert.equal(helpers.isSatelliteFresh({ ...freshPayload, erddapTimestamp: '' }, 'clean', now), false, 'missing timestamp fails closed');
assert.equal(helpers.isSatelliteFresh({ ...freshPayload, erddapTimestamp: 'not-a-date' }, 'clean', now), false, 'invalid timestamp fails closed');
assert.equal(
  helpers.isSatelliteFresh({ ...freshPayload, erddapTimestamp: '2026-10-29T22:00:00.000Z' }, 'clean', now),
  false,
  'future timestamp fails closed'
);
assert.equal(
  helpers.isSatelliteFresh({ ...freshPayload, stale: true }, 'clean', now),
  false,
  'an explicit stale flag overrides a recent timestamp'
);
assert.equal(
  helpers.isSatelliteFresh({ ...freshPayload, source: 'cached-fallback' }, 'clean', now),
  false,
  'a non-live source cannot produce a live verdict'
);
assert.equal(
  helpers.isSatelliteFresh({ erddapTimestamp: freshPayload.erddapTimestamp, stale: false }, 'clean', now),
  false,
  'a missing source identifier fails closed'
);
assert.equal(
  helpers.isSatelliteFresh({ source: 'erddap-live', erddapTimestamp: freshPayload.erddapTimestamp }, 'clean', now),
  false,
  'a missing explicit stale=false flag fails closed'
);
assert.equal(
  helpers.isSatelliteFresh(freshPayload, 'unknown', now),
  false,
  'an unknown beach status cannot produce a verdict'
);

assert.match(html, /<title>Sargasses — observation des plages<\/title>/, 'document title makes no unconditional live claim');
assert.match(html, /isSatelliteFresh\(d,\s*status\)/, 'render validates the complete payload and beach status');
assert.doesNotMatch(html, /isSatelliteFresh\(d\.erddapTimestamp/, 'render does not bypass source/stale validation');
assert.match(html, /relAge\(d\.erddapTimestamp\)/, 'displayed age uses satellite timestamp');
const partnerLanding = fs.readFileSync(path.join(ROOT, 'public', 'pro', 'widget-sargasses-hotel', 'index.html'), 'utf8')
assert.match(partnerLanding, /setFreshStatus\(relTime\(d && d\.erddapTimestamp\)\)/,
  'partner landing freshness pill must use the observation timestamp')
assert.doesNotMatch(partnerLanding, /relTime\(d && d\.updatedAt\)/,
  'publication time must not drive partner landing satellite freshness')
assert.match(html, /\$\("pill"\)\.style\.display = "none"/, 'stale verdict pill is hidden');
assert.match(html, /if \(fresh && showFc && wk\.length\)/, 'forecast is gated by satellite freshness');
assert.match(html, /\$\("fc"\)\.style\.display = "none"/, 'stale forecast is hidden');
assert.match(html, /label\+" : "\+T\.stale/, 'accessible label reports verification instead of stale verdict');

console.log('WIDGET_SATELLITE_FRESHNESS_TESTS PASS (24 assertions)');
