#!/usr/bin/env node
/**
 * Unit tests for SCOPE GUARD (evaluateScopeGuard)
 * Tests the factory guard that prevents agents from modifying files outside scope.
 */

const { evaluateScopeGuard } = require('../orchestrator.cjs');

function runTests() {
  let passed = 0;
  let failed = 0;
  const results = [];

  function test(name, fn) {
    try {
      fn();
      passed++;
      results.push({ name, status: 'PASS' });
      console.log(`✅ ${name}`);
    } catch (e) {
      failed++;
      results.push({ name, status: 'FAIL', error: e.message });
      console.log(`❌ ${name}: ${e.message}`);
    }
  }

  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }

  // --- CAS 1: scope ["src/Sargasses_PROD.jsx"], diff ["src/Sargasses_PROD.jsx"] → PASS ---
  test('CAS 1: scope match exact file → PASS', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx'], ['src/Sargasses_PROD.jsx']);
    assert(r.ok === true, `expected ok=true, got ${r.ok}`);
    assert(r.reason === 'SCOPE_GUARD = PASS', `expected PASS reason, got ${r.reason}`);
  });

  // --- CAS 2: scope ["src/Sargasses_PROD.jsx"], diff ["public/api/b2b-partners.json"] → FAIL_SCOPE ---
  test('CAS 2: scope mismatch (wrong file) → FAIL_SCOPE', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx'], ['public/api/b2b-partners.json']);
    assert(r.ok === false, `expected ok=false, got ${r.ok}`);
    assert(r.reason.includes('FAIL_SCOPE'), `expected FAIL_SCOPE, got ${r.reason}`);
    assert(r.details.outOfScope.includes('public/api/b2b-partners.json'), 'outOfScope should contain the wrong file');
  });

  // --- CAS 3: scope ["src/Sargasses_PROD.jsx"], diff ["src/Sargasses_PROD.jsx","public/api/b2b-partners.json"] → FAIL_SCOPE ---
  test('CAS 3: mixed scope (one in, one out) → FAIL_SCOPE', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx'], ['src/Sargasses_PROD.jsx', 'public/api/b2b-partners.json']);
    assert(r.ok === false, `expected ok=false, got ${r.ok}`);
    assert(r.reason.includes('FAIL_SCOPE'), `expected FAIL_SCOPE, got ${r.reason}`);
    assert(r.details.outOfScope.includes('public/api/b2b-partners.json'), 'outOfScope should contain the wrong file');
  });

  // --- CAS 4: scope ["src/Sargasses_PROD.jsx"], diff [] → FAIL_TARGET_UNCHANGED ---
  test('CAS 4: empty diff → FAIL_TARGET_UNCHANGED', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx'], []);
    assert(r.ok === false, `expected ok=false, got ${r.ok}`);
    assert(r.reason.includes('FAIL_TARGET_UNCHANGED'), `expected FAIL_TARGET_UNCHANGED, got ${r.reason}`);
  });

  // --- CAS 5: scope ["src/Sargasses_PROD.jsx"], diff ["other/file.jsx"] → FAIL_SCOPE ---
  test('CAS 5: scope with different file entirely → FAIL_SCOPE', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx'], ['src/SomeOtherFile.jsx']);
    assert(r.ok === false, `expected ok=false, got ${r.ok}`);
    assert(r.reason.includes('FAIL_SCOPE'), `expected FAIL_SCOPE, got ${r.reason}`);
  });

  // --- CAS 6: scope multiple files, diff subset → PASS ---
  test('CAS 6: scope multiple files, diff subset → PASS', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx', 'src/OtherFile.jsx'], ['src/Sargasses_PROD.jsx']);
    assert(r.ok === true, `expected ok=true, got ${r.ok}`);
    assert(r.reason === 'SCOPE_GUARD = PASS', `expected PASS reason, got ${r.reason}`);
  });

  // --- CAS 7: scope multiple files, diff includes all → PASS ---
  test('CAS 7: scope multiple files, diff includes all → PASS', () => {
    const r = evaluateScopeGuard(['src/A.jsx', 'src/B.jsx'], ['src/A.jsx', 'src/B.jsx']);
    assert(r.ok === true, `expected ok=true, got ${r.ok}`);
  });

  // --- CAS 8: scope empty, diff empty → FAIL_TARGET_UNCHANGED ---
  test('CAS 8: empty scope, empty diff → FAIL_TARGET_UNCHANGED', () => {
    const r = evaluateScopeGuard([], []);
    assert(r.ok === false, `expected ok=false, got ${r.ok}`);
    assert(r.reason.includes('FAIL_TARGET_UNCHANGED'), `expected FAIL_TARGET_UNCHANGED, got ${r.reason}`);
  });

  // --- CAS 9: scope empty, diff has files → FAIL_SCOPE (nothing allowed) ---
  test('CAS 9: empty scope, diff has files → FAIL_SCOPE', () => {
    const r = evaluateScopeGuard([], ['src/SomeFile.jsx']);
    assert(r.ok === false, `expected ok=false, got ${r.ok}`);
    assert(r.reason.includes('FAIL_SCOPE'), `expected FAIL_SCOPE, got ${r.reason}`);
  });

  // --- CAS 10: path normalization (leading slashes, backslashes) ---
  test('CAS 10: path normalization handles backslashes', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx'], ['src\\Sargasses_PROD.jsx']);
    assert(r.ok === true, `expected ok=true with backslash normalization, got ${r.ok}`);
  });

  // --- CAS 11: target file not modified but other allowed files are ---
  test('CAS 11: target file (first in scope) not modified → FAIL_TARGET_UNCHANGED', () => {
    const r = evaluateScopeGuard(['src/Sargasses_PROD.jsx', 'src/Other.jsx'], ['src/Other.jsx']);
    assert(r.ok === false, `expected ok=false, got ${r.ok}`);
    assert(r.reason.includes('FAIL_TARGET_UNCHANGED'), `expected FAIL_TARGET_UNCHANGED, got ${r.reason}`);
  });

  // --- CAS 12: scope with path prefix variations ---
  test('CAS 12: scope path with ./ prefix handled', () => {
    const r = evaluateScopeGuard(['./src/Sargasses_PROD.jsx'], ['src/Sargasses_PROD.jsx']);
    assert(r.ok === true, `expected ok=true with ./ prefix, got ${r.ok}`);
  });

  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\nFAILED TESTS:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
}

runTests();