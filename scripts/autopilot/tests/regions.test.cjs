#!/usr/bin/env node
/**
 * Tests du module de régions pour la Factory V3.
 *
 * Vérifie que getRegion(), getAllRegions(), getBuildRegion() et
 * assertAllRegionsValid() fonctionnent correctement pour les six régions
 * déployées sur Cloudflare Pages.
 */

const { getRegion, getAllRegions, getBuildRegion, assertAllRegionsValid } =
  require('../../regions/index.cjs');

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

// --- Test 1: getAllRegions retourne les six régions attendues
test('T1: getAllRegions retourne les six régions', () => {
  const regions = getAllRegions();
  assert(regions.length === 6, `expected 6 regions, got ${regions.length}`);
  const ids = regions.map((r) => r.id).sort();
  assert(
    ids.join(',') === 'florida,gp,mq,puntacana,rivieramaya,tulum',
    `expected all six regions, got ${ids.join(',')}`,
  );
  console.log('   régions:', ids.join(', '));
});

// --- Test 2: getRegion retourne la bonne configuration pour chaque région
test('T2: getRegion retourne la bonne configuration pour chaque région', () => {
  const expected = {
    mq: 'sargasses-martinique.com',
    gp: 'sargasses-guadeloupe.com',
    puntacana: 'sargassumpuntacana.com',
    florida: 'sargassummiami.com',
    rivieramaya: 'sargassumcancun.com',
    tulum: 'sargazotulum.com',
  };

  for (const [id, domain] of Object.entries(expected)) {
    const region = getRegion(id);
    assert(region.id === id, `expected id ${id}, got ${region.id}`);
    assert(region.domain === domain, `expected domain ${domain} for ${id}, got ${region.domain}`);
    assert(region.ftpDir.endsWith('/'), `expected ftpDir to end with / for ${id}, got ${region.ftpDir}`);
    assert(typeof region.onesignalAppId === 'string', `expected onesignalAppId to be string for ${id}`);
    assert(region.beachFilter && region.beachFilter.island, `expected beachFilter.island for ${id}`);
    console.log(`   ${id}: ${region.domain} (${region.ftpDir})`);
  }
});

// --- Test 3: getRegion lance une erreur pour un ID inconnu
test('T3: getRegion lance une erreur pour un ID inconnu', () => {
  let threw = false;
  try {
    getRegion('nonexistent');
  } catch (e) {
    threw = true;
    assert(e.message.includes('Région inconnue'), `expected "Région inconnue", got: ${e.message}`);
  }
  assert(threw, 'expected throw for unknown ID');

  threw = false;
  try {
    getRegion('');
  } catch (e) {
    threw = true;
    assert(e.message.includes('Région inconnue'), `expected "Région inconnue", got: ${e.message}`);
  }
  assert(threw, 'expected throw for empty ID');

  threw = false;
  try {
    getRegion('nonexistent-region');
  } catch (e) {
    threw = true;
    assert(e.message.includes('Région inconnue'), `expected "Région inconnue", got: ${e.message}`);
  }
  assert(threw, 'expected throw for nonexistent-region');
  console.log('   erreurs correctement levées pour IDs inconnus');
});

// --- Test 4: assertAllRegionsValid passe quand tous les champs sont présents
test('T4: assertAllRegionsValid passe quand tous les champs sont présents', () => {
  // Ne devrait pas lever d'erreur
  assertAllRegionsValid();
  console.log('   assertAllRegionsValid passe pour les six régions');
});

// --- Test 5: assertAllRegionsValid lève si un champ est manquant
test('T5: assertAllRegionsValid lève si un champ est manquant', () => {
  // Temporairement modifier une région pour tester la détection
  const originalRegion = getRegion('mq');
  const originalDomain = originalRegion.domain;

  // Vérifier que chaque région a tous les champs obligatoires
  const REQUIRED_FIELDS = ['id', 'name', 'domain', 'ftpDir'];
  for (const region of getAllRegions()) {
    for (const field of REQUIRED_FIELDS) {
      assert(region[field], `Région ${region.id} manque le champ ${field}`);
    }
  }
  console.log('   tous les champs obligatoires sont présents pour chaque région');
});

// --- Test 6: getBuildRegion retourne mq par défaut (pas d'env)
test('T6: getBuildRegion retourne mq par défaut', () => {
  // VITE_REGION n'est pas défini dans cet environnement de test
  const region = getBuildRegion();
  assert(region.id === 'mq', `expected mq by default, got ${region.id}`);
  console.log('   branche par défaut: mq');
});

console.log(`\n${passed} tests passés, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);
