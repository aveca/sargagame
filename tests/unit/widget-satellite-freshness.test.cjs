'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  extractFunction('satelliteAgeMs') + '\n' +
  extractFunction('isSatelliteFresh') + '\n' +
  '({ satelliteAgeMs, isSatelliteFresh })'
);

const now = Date.parse('2026-10-25T19:26:23.000Z');
const livePayload = {
  updatedAt: '2026-10-25T16:33:08.017Z',
  erddapTimestamp: '2026-10-24T12:00:00Z',
  dataAgeMinutes: 1713,
  stale: false
};

assert.ok(
  helpers.satelliteAgeMs(livePayload.erddapTimestamp, now) > 12 * 3.6e6,
  'observed production satellite timestamp is older than 12h'
);
assert.equal(
  helpers.isSatelliteFresh(livePayload.erddapTimestamp, now),
  false,
  'recent pipeline updatedAt must not make an old satellite observation fresh'
);
assert.equal(
  helpers.isSatelliteFresh('2026-10-25T09:30:00.000Z', now),
  true,
  'satellite observation younger than 12h is fresh'
);
assert.equal(
  helpers.isSatelliteFresh('2026-10-25T07:26:23.000Z', now),
  false,
  'exactly 12h is not fresh'
);
assert.equal(helpers.isSatelliteFresh('', now), false, 'missing timestamp fails closed');
assert.equal(helpers.isSatelliteFresh('not-a-date', now), false, 'invalid timestamp fails closed');
assert.equal(
  helpers.isSatelliteFresh('2026-10-25T20:00:00.000Z', now),
  false,
  'future timestamp fails closed'
);

assert.match(html, /isSatelliteFresh\(d\.erddapTimestamp\)/, 'render uses satellite timestamp');
assert.match(html, /relAge\(d\.erddapTimestamp\)/, 'displayed age uses satellite timestamp');
assert.match(html, /\$\("pill"\)\.style\.display = "none"/, 'stale verdict pill is hidden');
assert.match(html, /if \(fresh && showFc && wk\.length\)/, 'forecast is gated by satellite freshness');
assert.match(html, /\$\("fc"\)\.style\.display = "none"/, 'stale forecast is hidden');
assert.match(html, /label\+" : "\+T\.stale/, 'accessible label reports verification instead of stale verdict');

console.log('WIDGET_SATELLITE_FRESHNESS_TESTS PASS (13 assertions)');
