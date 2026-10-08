
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const filePath = path.join(root, 'src', 'imageResize.js');
const content = fs.readFileSync(filePath, 'utf8');

// Verify the TEST_EXPORT constant exists
assert.strictEqual(
  content.includes('export const TEST_EXPORT = "factory-e2e-verification"'),
  true,
  'imageResize.js must export TEST_EXPORT constant'
);

// Verify it's a string literal
const exportMatch = content.match(/export const TEST_EXPORT = "([^"]+)"/);
assert.strictEqual(typeof exportMatch, 'object' && exportMatch !== null, 'TEST_EXPORT must be a string literal');
assert.strictEqual(exportMatch[1], 'factory-e2e-verification', 'TEST_EXPORT must equal "factory-e2e-verification"');

// Verify the file still has the original exports (no regression)
assert.strictEqual(
  content.includes('export function'),
  true,
  'imageResize.js must still have its original export function'
);

console.log('All assertions passed for imageResize.js TEST_EXPORT constant');
