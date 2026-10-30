#!/usr/bin/env node
'use strict';

/**
 * outbound-security.test.cjs — Tests du gate d'approbation pour les opérations
 * sortantes (email, push, notification, nettoyage destructive).
 *
 * Couvre:
 * - Détection du type de déclencheur (schedule, workflow_dispatch, push)
 * - Mode DRY-RUN par défaut pour schedule
 * - Aucun secret interdit injecté en mode DRY-RUN
 * - Envoi bloqué en DRY-RUN
 * - Nettoyage destructif bloqué en DRY-RUN
 * - Remise à zéro de dédup bloquée en DRY-RUN
 * - Approbation Environment requise pour sortir du DRY-RUN
 */

const assert = require('node:assert/strict');
const {
  getTriggerType,
  isDryRun,
  hasEnvironmentApproval,
  assertNoForbiddenSecrets,
  outboundContext,
  FORBIDDEN_SECRETS_IN_DRY_RUN,
} = require('../../scripts/lib/outbound-security.cjs');

// Sauvegarder et restaurer l'environnement pour les tests
const origEnv = { ...process.env };

function setEnv(updates) {
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
}

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in origEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(origEnv)) {
    process.env[k] = v;
  }
}

console.log('=== Outbound Security Gate Tests ===\n');

// --- Test 1: Détection du type de déclencheur ---
console.log('Test 1: Détection du type de déclencheur');
setEnv({ GITHUB_EVENT_NAME: 'schedule' });
assert.strictEqual(getTriggerType(), 'schedule', 'schedule détecté');
setEnv({ GITHUB_EVENT_NAME: 'workflow_dispatch' });
assert.strictEqual(getTriggerType(), 'workflow_dispatch', 'workflow_dispatch détecté');
setEnv({ GITHUB_EVENT_NAME: 'push' });
assert.strictEqual(getTriggerType(), 'push', 'push détecté');
setEnv({ GITHUB_EVENT_NAME: 'unknown_event' });
assert.strictEqual(getTriggerType(), 'unknown', 'événement inconnu');
restoreEnv();
console.log('  ✓ PASS');

// --- Test 2: DRY-RUN par défaut pour schedule ---
console.log('Test 2: DRY-RUN par défaut pour schedule');
setEnv({ GITHUB_EVENT_NAME: 'schedule' });
assert.strictEqual(isDryRun(), true, 'schedule → DRY-RUN par défaut');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '1' });
assert.strictEqual(isDryRun(), true, 'schedule + DRY_RUN=1 → DRY-RUN');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0' });
assert.strictEqual(isDryRun(), true, 'schedule + DRY_RUN=0 sans approbation → DRY-RUN (fail-closed)');
restoreEnv();

// DRY_RUN=0 avec approbation Environment → pas DRY-RUN
setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0', ENVIRONMENT_NAME: 'production' });
assert.strictEqual(isDryRun(), false, 'schedule + DRY_RUN=0 + ENV → pas DRY-RUN');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'workflow_dispatch' });
assert.strictEqual(isDryRun(), true, 'workflow_dispatch → DRY-RUN par défaut');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'push' });
assert.strictEqual(isDryRun(), false, 'push → jamais DRY-RUN');
restoreEnv();
console.log('  ✓ PASS');

// --- Test 3: Aucun secret interdit en mode DRY-RUN ---
console.log('Test 3: Secrets interdits en DRY-RUN');
setEnv({ GITHUB_EVENT_NAME: 'schedule', SMTP_PASS: 'secret123' });
assert.throws(
  () => assertNoForbiddenSecrets(),
  /SMTP_PASS/,
  'SMTP_PASS interdit en DRY-RUN'
);
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'schedule', ONESIGNAL_API_KEY_MQ: 'key123' });
assert.throws(
  () => assertNoForbiddenSecrets(),
  /ONESIGNAL_API_KEY_MQ/,
  'ONESIGNAL_API_KEY_MQ interdit en DRY-RUN'
);
restoreEnv();

// Aucun secret → pas d'erreur
setEnv({ GITHUB_EVENT_NAME: 'schedule' });
assert.doesNotThrow(() => assertNoForbiddenSecrets(), 'aucun secret interdit → pas d\'erreur');
restoreEnv();

// Hors DRY-RUN → secrets autorisés
setEnv({ GITHUB_EVENT_NAME: 'push', SMTP_PASS: 'secret123' });
assert.doesNotThrow(() => assertNoForbiddenSecrets(), 'push → SMTP_PASS autorisé');
restoreEnv();
console.log('  ✓ PASS');

// --- Test 4: outboundContext ---
console.log('Test 4: outboundContext');

// Schedule + pas d'approbation → tout bloqué
setEnv({ GITHUB_EVENT_NAME: 'schedule' });
const ctx1 = outboundContext();
assert.strictEqual(ctx1.trigger, 'schedule');
assert.strictEqual(ctx1.dryRun, true);
assert.strictEqual(ctx1.environmentApproved, false);
assert.strictEqual(ctx1.sendAllowed(), false, 'envoi bloqué en DRY-RUN schedule');
assert.strictEqual(ctx1.destructiveCleanupAllowed(), false, 'nettoyage bloqué en DRY-RUN');
assert.strictEqual(ctx1.dedupResetAllowed(), false, 'reset dédup bloqué en DRY-RUN');
assert.throws(() => ctx1.assertSendAllowed(), /DRY-RUN/);
assert.throws(() => ctx1.assertDestructiveCleanupAllowed(), /DRY-RUN/);
restoreEnv();

// Schedule + DRY_RUN=0 + ENV → tout autorisé
setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0', ENVIRONMENT_NAME: 'production' });
const ctx2 = outboundContext();
assert.strictEqual(ctx2.dryRun, false);
assert.strictEqual(ctx2.environmentApproved, true);
assert.strictEqual(ctx2.sendAllowed(), true, 'envoi autorisé avec approbation');
assert.strictEqual(ctx2.destructiveCleanupAllowed(), true, 'nettoyage autorisé avec approbation');
assert.strictEqual(ctx2.dedupResetAllowed(), true, 'reset dédup autorisé avec approbation');
restoreEnv();

// Push → tout autorisé (pas DRY-RUN)
setEnv({ GITHUB_EVENT_NAME: 'push' });
const ctx3 = outboundContext();
assert.strictEqual(ctx3.dryRun, false);
assert.strictEqual(ctx3.sendAllowed(), true);
restoreEnv();
console.log('  ✓ PASS');

// --- Test 5: FORBIDDEN_SECRETS_IN_DRY_RUN contient les secrets attendus ---
console.log('Test 5: Liste des secrets interdits');
assert.ok(FORBIDDEN_SECRETS_IN_DRY_RUN.includes('SMTP_PASS'), 'SMTP_PASS dans la liste');
assert.ok(FORBIDDEN_SECRETS_IN_DRY_RUN.includes('ONESIGNAL_API_KEY_MQ'), 'ONESIGNAL_API_KEY_MQ dans la liste');
assert.ok(FORBIDDEN_SECRETS_IN_DRY_RUN.includes('ONESIGNAL_API_KEY_GP'), 'ONESIGNAL_API_KEY_GP dans la liste');
assert.ok(FORBIDDEN_SECRETS_IN_DRY_RUN.includes('MODERATE_TOKEN'), 'MODERATE_TOKEN dans la liste');
console.log('  ✓ PASS');

console.log('\n=== ALL OUTBOUND SECURITY TESTS PASSED ===');
