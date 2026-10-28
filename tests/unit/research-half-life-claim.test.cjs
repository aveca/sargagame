// Regression guard: public research copy must distinguish floating mats from beached stock.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'research', 'index.html'), 'utf8');

assert.equal(html.includes('3.5-day</b> half-life'), false,
  'the obsolete 3.5-day half-life claim must not return');
assert.ok(html.includes('For floating mats, the model uses a <b>5-day</b> persistence half-life'),
  'the five-day half-life must be scoped to floating mats');
assert.ok(html.includes('Material already stranded on a beach is handled separately'),
  'beached stock must be described separately from floating mats');
assert.ok(html.includes('provisional persistence prior that has not yet been calibrated against active-season ground truth'),
  'the beached-stock prior must be described as provisional and uncalibrated');

console.log('OK — research page distinguishes floating-mat persistence from provisional beached-stock persistence');
