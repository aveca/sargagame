#!/usr/bin/env node
'use strict';

// Contract: the first-party analytics collector must accept Origin/Referer
// from every region that the production route manifest marks live.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LIVE } = require('../scripts/autopilot/routes.cjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public', 'collect.php'), 'utf8');
const match = source.match(/\$ALLOWED_HOSTS\s*=\s*array\(([\s\S]*?)\);/);
assert.ok(match, 'public/collect.php must declare the explicit host allowlist');

const allowed = Array.from(match[1].matchAll(/'([^']+)'/g), m => m[1]);
const liveDomains = Object.values(LIVE).map(region => region.domain);
const missing = liveDomains.filter(domain => !allowed.includes(domain));

assert.deepEqual(
  missing,
  [],
  'first-party analytics allowlist is missing live domain(s): ' + missing.join(', ')
);
assert.ok(
  liveDomains.includes('sargazotulum.com'),
  'Tulum must remain represented in the live route manifest'
);

console.log('OK — collect.php allowlist covers all ' + liveDomains.length + ' live regional domains');
