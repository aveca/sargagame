#!/usr/bin/env node
/**
 * Test d'intégration : vérifie que les consommateurs réels de
 * scripts/regions/index.cjs peuvent l'importer et l'utiliser sans erreur.
 *
 * Consommateurs couverts :
 *   - scripts/prepare-ftp.cjs  (require('../regions/index.cjs'))
 *   - scripts/manual-ftp-deploy.cjs (require('../regions/index.cjs'))
 *
 * Ce test vérifie que le nouveau registre est bien résolu par Node.js
 * selon la sémantique des require relatifs CommonJS, et que ses données
 * sont cohérentes avec le registre racine regions/<id>.json pour les
 * 6 régions communes (domaine, ftpDir).
 */

const fs = require('fs');
const path = require('path');

const {
  getAllRegions,
  getRegion,
  getBuildRegion,
  validateRegion,
  assertAllRegionsValid,
} = require('../../regions/index.cjs');

// Charger le registre racine pour comparaison
// Depuis scripts/autopilot/tests/, il faut remonter de 3 niveaux pour atteindre la racine
const ROOT_REGIONS_DIR = path.resolve(__dirname, '../../../regions');
const rootConfigs = {};
for (const f of fs.readdirSync(ROOT_REGIONS_DIR)) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT_REGIONS_DIR, f), 'utf8'));
  rootConfigs[cfg.id] = cfg;
}

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

// --- I1: scripts/prepare-ftp.cjs peut résoudre scripts/regions/index.cjs
// Vérifie la résolution du chemin require sans exécuter les effets de bord
// de prepare-ftp.cjs (accès au filesystem dist/, etc.)
// Depuis scripts/autopilot/tests/, '../../regions/index.cjs' = scripts/regions/index.cjs,
// qui est la cible de require('../regions/index.cjs) depuis scripts/prepare-ftp.cjs.
test('I1: prepare-ftp.cjs résout scripts/regions/index.cjs', () => {
  const resolved = path.resolve(__dirname, '../../regions/index.cjs');
  assert(fs.existsSync(resolved), `fichier introuvable: ${resolved}`);
  // Vérifie que le module est chargeable
  const mod = require(resolved);
  assert(typeof mod.getAllRegions === 'function', 'getAllRegions exporté');
  assert(typeof mod.getRegion === 'function', 'getRegion exporté');
  assert(typeof mod.validateRegion === 'function', 'validateRegion exporté');
  console.log('   résolution OK depuis scripts/prepare-ftp.cjs');
});

// --- I2: scripts/manual-ftp-deploy.cjs peut importer le nouveau registre
test('I2: manual-ftp-deploy.cjs peut importer scripts/regions/index.cjs', () => {
  const mod = require('../../manual-ftp-deploy.cjs');
  assert(typeof mod === 'object', 'manual-ftp-deploy.cjs a exporté un module valide');
  console.log('   import OK depuis scripts/manual-ftp-deploy.cjs');
});

// --- I3: Les 6 régions du nouveau registre existent dans le registre racine
test('I3: les 6 régions du nouveau registre sont présentes dans regions/*.json', () => {
  const regions = getAllRegions();
  assert(regions.length === 6, `expected 6 regions, got ${regions.length}`);
  const expectedIds = ['mq', 'gp', 'puntacana', 'florida', 'rivieramaya', 'tulum'];
  const ids = regions.map((r) => r.id).sort();
  assert(
    ids.join(',') === expectedIds.sort().join(','),
    `expected ${expectedIds.join(',')}, got ${ids.join(',')}`,
  );
  for (const id of expectedIds) {
    assert(rootConfigs[id], `région ${id} absente de regions/${id}.json`);
  }
  console.log('   6 régions présentes dans les deux registres');
});

// --- I4: Domaines cohérents entre les deux registres
test('I4: domaines cohérents entre scripts/regions/index.cjs et regions/<id>.json', () => {
  const regions = getAllRegions();
  for (const region of regions) {
    const root = rootConfigs[region.id];
    assert(root, `racine manquante pour ${region.id}`);
    assert(
      root.domain === region.domain,
      `domaine incohérent pour ${region.id}: racine="${root.domain}" nouveau="${region.domain}"`,
    );
  }
  console.log('   domaines cohérents pour les 6 régions');
});

// --- I5: ftpDir cohérents entre les deux registres
test('I5: ftpDir cohérents entre scripts/regions/index.cjs et regions/<id>.json', () => {
  const regions = getAllRegions();
  for (const region of regions) {
    const root = rootConfigs[region.id];
    assert(root, `racine manquante pour ${region.id}`);
    assert(
      root.ftpDir === region.ftpDir,
      `ftpDir incohérent pour ${region.id}: racine="${root.ftpDir}" nouveau="${region.ftpDir}"`,
    );
  }
  console.log('   ftpDir cohérents pour les 6 régions');
});

// --- I6: getRegion retourne la bonne config pour chaque région du nouveau registre
test('I6: getRegion retourne la bonne configuration pour chaque région', () => {
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
    assert(region.domain === domain, `expected domain ${domain} for ${id}`);
    assert(region.ftpDir === rootConfigs[id].ftpDir, `ftpDir mismatch for ${id}`);
    assert(typeof region.onesignalAppId === 'string', `onesignalAppId must be string for ${id}`);
  }
  console.log('   getRegion correct pour les 6 régions');
});

// --- I7: validateRegion fonctionne sur les configs du registre racine
test('I7: validateRegion accepte les configs valides du registre racine', () => {
  for (const id of Object.keys(rootConfigs)) {
    validateRegion(rootConfigs[id]);
  }
  console.log(`   ${Object.keys(rootConfigs).length} configs racine validées`);
});

// --- I8: assertAllRegionsValid passe sur le nouveau registre
test('I8: assertAllRegionsValid passe sur le nouveau registre', () => {
  assertAllRegionsValid();
  console.log('   validation du registre OK');
});

// --- I9: getBuildRegion retourne mq par défaut
test('I9: getBuildRegion retourne mq par défaut (pas d\'env)', () => {
  const region = getBuildRegion();
  assert(region.id === 'mq', `expected mq by default, got ${region.id}`);
  console.log('   build région par défaut: mq');
});

// --- I10: getRegion lève sur ID inconnu
test('I10: getRegion lève sur ID inconnu', () => {
  let threw = false;
  try {
    getRegion('nonexistent');
  } catch (e) {
    threw = true;
    assert(e.message.includes('Région inconnue'), `got: ${e.message}`);
  }
  assert(threw, 'expected throw for unknown ID');
  console.log('   erreur levée pour ID inconnu');
});

console.log(`\n${passed} tests passés, ${failed} échoués`);
process.exit(failed > 0 ? 1 : 0);