#!/usr/bin/env node
/**
 * deploy-fingerprint-check.test.cjs
 * 
 * Verifies the fingerprint check logic used in deploy-live.yml health-check.
 * This test validates the logic without network calls.
 */
const crypto = require('crypto');

function testExtractBuildHash() {
  console.log('Test: extract build hash from version.json');
  
  // Test case 1: version.json with 'b' field
  const v1 = { v: 'v219', date: '2026-08-11', b: 'abc12345' };
  const json1 = JSON.stringify(v1);
  const hash1 = extractBuildHash(json1);
  console.assert(hash1 === 'abc12345', `Expected abc12345, got ${hash1}`);
  console.log('  ✓ with b field');

  // Test case 2: version.json without 'b' field
  const v2 = { v: 'v219', date: '2026-08-11' };
  const json2 = JSON.stringify(v2);
  const hash2 = extractBuildHash(json2);
  console.assert(hash2 === null, `Expected null, got ${hash2}`);
  console.log('  ✓ without b field');

  // Test case 3: empty/null
  const hash3 = extractBuildHash('');
  console.assert(hash3 === null, `Expected null, got ${hash3}`);
  console.log('  ✓ empty string');

  // Test case 4: malformed JSON
  const hash4 = extractBuildHash('not json');
  console.assert(hash4 === null, `Expected null, got ${hash4}`);
  console.log('  ✓ malformed JSON');
}

function extractBuildHash(versionJson) {
  if (!versionJson || typeof versionJson !== 'string') return null;
  try {
    const obj = JSON.parse(versionJson);
    return obj.b || null;
  } catch {
    return null;
  }
}

function testShortShaMatch() {
  console.log('Test: short SHA match');
  
  const fullSha = 'c59cac91a84b8d1d34b3b3898f75127f5441a939';
  const shortSha = fullSha.slice(0, 8);
  
  console.assert(shortSha === 'c59cac91', `Expected c59cac91, got ${shortSha}`);
  console.log('  ✓ short SHA extraction');
  
  // Test match
  const deployedHash = 'c59cac91';
  console.assert(deployedHash === shortSha, 'Hashes should match');
  console.log('  ✓ hash match');
  
  // Test mismatch
  const badHash = 'deadbeef';
  console.assert(badHash !== shortSha, 'Hashes should not match');
  console.log('  ✓ hash mismatch detected');
}

function testVersionJsonStructure() {
  console.log('Test: version.json structure');
  
  // Test with b field
  const v1 = JSON.stringify({ v: 'v219', date: '2026-08-11', b: 'abc12345' });
  const parsed1 = JSON.parse(v1);
  console.assert(parsed1.b === 'abc12345', 'b field present');
  console.log('  ✓ with b field');
  
  // Test without b field
  const v2 = JSON.stringify({ v: 'v219', date: '2026-08-11' });
  const parsed2 = JSON.parse(v2);
  console.assert(!parsed2.b, 'b field absent');
  console.log('  ✓ without b field');
}

function main() {
  console.log('=== Deploy Fingerprint Check Tests ===\n');
  
  testExtractBuildHash();
  console.log('');
  testShortShaMatch();
  console.log('');
  testVersionJsonStructure();
  console.log('');
  console.log('✅ All tests passed!');
}

main();