#!/usr/bin/env node
'use strict';

/**
 * /fiabilite/ labels the satellite observation, not the pipeline/build time.
 * updatedAt is pipeline metadata; erddapTimestamp is the observation timestamp.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'scripts', 'lib', 'reliability-page.cjs'), 'utf8');

const sectionMatch = src.match(/function freshnessSection\\(lang, data, slug\\) \\{([\\s\\S]*?)\\n\\}/);
assert.ok(sectionMatch, 'freshnessSection must exist');
const section = sectionMatch[1];

assert.match(section, /data\\.erddapTimestamp/, 'static page must use the satellite observation timestamp');
assert.match(section, /Date\\.parse\\(satelliteISO\\)/, 'invalid/missing satellite timestamp must be rejected');
assert.doesNotMatch(section, /data\\.updatedAt/, 'pipeline update time must not be presented as satellite time');
assert.match(section, /data-iso="\\$\\{esc\\(satelliteISO\\)\\}"/, 'initial DOM timestamp must be the observation time');
assert.match(section, /fmtDateTimeUTC\\(lang, satelliteISO\\)/, 'displayed date must use the observation time');

const refreshMatch = src.match(/\\/\\/ Refresh client :[\\s\\S]*?var VARIANT =/);
assert.ok(refreshMatch, 'client refresh block must exist');
const refresh = refreshMatch[0];

assert.match(refresh, /d&&d\\.erddapTimestamp/, 'live refresh must read erddapTimestamp');
assert.match(refresh, /Date\\.parse\\(d\\.erddapTimestamp\\)/, 'live refresh must reject invalid timestamps');
assert.match(refresh, /show\\(d\\.erddapTimestamp\\)/, 'relative age must use the satellite observation time');
assert.doesNotMatch(refresh, /d\\.updatedAt/, 'client must not replace satellite time with pipeline time');

console.log('RELIABILITY_PAGE_SATELLITE_TIMESTAMP_TESTS PASS (10 assertions)');
