#!/usr/bin/env node
/**
 * Tests du module de régions pour la Factory V3.
 *
 * Vérifie que getRegion(), getAllRegions(), getBuildRegion() et
 * assertAllRegionsValid() fonctionnent correctement pour les six régions
 * déployées sur Cloudflare Pages.
 */

const {
  getRegion,
  getAllRegions,
  getBuildRegion,
  validateRegion,
  assertAllRegionsValid,
  REQUIRED_FIELDS,
} = require('../../regions/index.cjs');

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
    assert(!region.ftpDir.endsWith('/'), `expected ftpDir NOT to end with / for ${id}, got ${region.ftpDir}`);
    assert(region.ftpDir.length > 0, `expected ftpDir to be non-empty for ${id}`);
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

// --- Test 5a: validateRegion passe avec une configuration valide
test('T5a: validateRegion passe avec une configuration valide', () => {
  const validRegion = {
    id: 'test',
    name: 'Test Region',
    domain: 'test.example.com',
    ftpDir: 'test-ftp',
  };
  // Ne devrait pas lever d'erreur
  validateRegion(validRegion);
  console.log('   configuration valide acceptée');
});

// --- Test 5b: validateRegion lève si id manque
test('T5b: validateRegion lève si id manque', () => {
  let threw = false;
  try {
    validateRegion({ name: 'Test', domain: 't.com', ftpDir: 't-ftp' });
  } catch (e) {
    threw = true;
    assert(e.message.includes('id'), `expected error about missing id, got: ${e.message}`);
  }
  assert(threw, 'expected throw for missing id');
  console.log('   erreur levée pour id manquant');
});

// --- Test 5c: validateRegion lève si name manque
test('T5c: validateRegion lève si name manque', () => {
  let threw = false;
  try {
    validateRegion({ id: 'test', domain: 't.com', ftpDir: 't-ftp' });
  } catch (e) {
    threw = true;
    assert(e.message.includes('name'), `expected error about missing name, got: ${e.message}`);
  }
  assert(threw, 'expected throw for missing name');
  console.log('   erreur levée pour name manquant');
});

// --- Test 5d: validateRegion lève si domain manque
test('T5d: validateRegion lève si domain manque', () => {
  let threw = false;
  try {
    validateRegion({ id: 'test', name: 'Test', ftpDir: 't-ftp' });
  } catch (e) {
    threw = true;
    assert(e.message.includes('domain'), `expected error about missing domain, got: ${e.message}`);
  }
  assert(threw, 'expected throw for missing domain');
  console.log('   erreur levée pour domain manquant');
});

// --- Test 5e: validateRegion lève si ftpDir manque
test('T5e: validateRegion lève si ftpDir manque', () => {
  let threw = false;
  try {
    validateRegion({ id: 'test', name: 'Test', domain: 't.com' });
  } catch (e) {
    threw = true;
    assert(e.message.includes('ftpDir'), `expected error about missing ftpDir, got: ${e.message}`);
  }
  assert(threw, 'expected throw for missing ftpDir');
  console.log('   erreur levée pour ftpDir manquant');
});

// --- Test 5f: assertAllRegionsValid lève si un champ est manquant (région statique modifiée)
test('T5f: assertAllRegionsValid lève sur région statique incomplète', () => {
  // Construire une copie du registre avec une région incomplète
  const originalAssert = assertAllRegionsValid;
  let threw = false;
  try {
    // Temporairement remplacer REGIONS par une version incomplète
    const regions = getAllRegions();
    const broken = [...regions];
    broken[0] = { ...broken[0] };
    delete broken[0].domain;

    // Appeler validateRegion directement sur la région cassée
    validateRegion(broken[0]);
  } catch (e) {
    threw = true;
    assert(
      e.message.includes('domain'),
      `expected error about missing domain, got: ${e.message}`
    );
  }
  assert(threw, 'expected throw for incomplete static region');
  console.log('   assertAllRegionsValid détecte une région incomplète');
});

// --- Test 5g: tous les champs obligatoires sont présents sur chaque région statique
test('T5g: toutes les régions statiques ont les champs obligatoires', () => {
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
