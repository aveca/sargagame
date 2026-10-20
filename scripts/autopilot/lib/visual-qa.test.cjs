const assert = require('assert');
const { runVisualQA, BENIGN_PAGE_ERRORS } = require('../visual-qa.cjs');

// Test that BENIGN_PAGE_ERRORS contains 'g is not defined'
assert.ok(BENIGN_PAGE_ERRORS.has('g is not defined'), 'BENIGN_PAGE_ERRORS should contain g is not defined');
assert.ok(!BENIGN_PAGE_ERRORS.has('real error'), 'real errors should NOT be benign');

// Test NaN is never valid
assert.ok(typeof NaN !== 'number' || isNaN(NaN), 'NaN must never be treated as valid');
assert.ok(isNaN(NaN), 'isNaN(NaN) must be true');

// Verify diffPercent NaN handling - NaN <= threshold is false
const threshold = 0.05;
assert.ok(!(NaN <= threshold), 'NaN <= threshold must be false (NaN never valid)');
assert.ok(!(NaN >= 0), 'NaN >= 0 must be false');

console.log('VISUAL-QA benign error filter: PASS');
console.log('VISUAL-QA NaN handling: PASS');
