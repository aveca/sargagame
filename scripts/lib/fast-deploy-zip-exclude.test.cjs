#!/usr/bin/env node
/**
 * fast-deploy-zip-exclude.test.cjs — garde-fou anti-régression (BUG-2026-007).
 *
 * Rappel du bug : le 2026-08-03, on a découvert que ZIP_EXCLUDE dans
 * scripts/lib/fast-deploy.cjs contenait "mollie-config.php". Conséquence :
 * write-mollie-config.cjs écrivait bien le config avec MOLLIE_WEBHOOK_SECRET en
 * staging, mais fast-deploy.cjs excluait le fichier du zip → le serveur conservait
 * l'ancien mollie-config.php (sans webhook_secret) → webhook Mollie HTTP 503 en prod.
 *
 * Invariants testés :
 *   1. stripe-config.php est exclu (secret legacy gitignoré, provisionné à part).
 *   2. _deploy-secret.php est exclu (deploy token).
 *   3. _deploy.zip est exclu (le zip d'upload lui-même).
 *   4. mollie-config.php N'EST PAS exclu (sinon le webhook_secret n'arrive jamais
 *      en prod → BUG-2026-007 deadlock).
 *
 * Sécurité du retrait de l'exclusion : write-mollie-config.cjs fail-fast (exit 1)
 * si MOLLIE_WEBHOOK_SECRET ou MOLLIE_API_KEY manque en env CI → le fichier embarqué
 * dans le zip est garanti valide. Pas de risque de régression vers un secret vide.
 */
const assert = require('assert');
const fastDeploy = require('./fast-deploy.cjs');

let n = 0;
function test(name, fn) {
  n++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

const { ZIP_EXCLUDE } = fastDeploy;

test('stripe-config.php reste exclu (secret legacy)', () => {
  assert.strictEqual(ZIP_EXCLUDE.has('stripe-config.php'), true,
    'stripe-config.php doit rester exclu — provisionné séparément');
});

test('_deploy-secret.php reste exclu (deploy token)', () => {
  assert.strictEqual(ZIP_EXCLUDE.has('_deploy-secret.php'), true,
    '_deploy-secret.php doit rester exclu — token deploy');
});

test('_deploy.zip reste exclu (auto-référence)', () => {
  assert.strictEqual(ZIP_EXCLUDE.has('_deploy.zip'), true,
    '_deploy.zip doit rester exclu — sinon boucle d\'extraction');
});

test('mollie-config.php N\'EST PAS exclu (BUG-2026-007 deadlock)', () => {
  assert.strictEqual(ZIP_EXCLUDE.has('mollie-config.php'), false,
    'mollie-config.php DOIT être embarqué dans le zip — sinon MOLLIE_WEBHOOK_SECRET\n' +
    'n\'arrive jamais en prod (write-mollie-config.cjs est sans effet).');
});

test('ZIP_EXCLUDE est bien un Set (pas un Array)', () => {
  assert.ok(ZIP_EXCLUDE instanceof Set,
    'ZIP_EXCLUDE doit être un Set pour O(1) lookup');
});

console.log(`\nfast-deploy-zip-exclude: ${n} test(s) exécuté(s)`);
if (process.exitCode === 1) {
  console.error('\n⛔ Régression détectée sur ZIP_EXCLUDE — ne pas merger.');
  process.exit(1);
}
