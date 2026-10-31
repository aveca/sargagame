#!/usr/bin/env node
'use strict';

/**
 * outbound-security.test.cjs — Tests du gate d'approbation pour les
 * opérations sortantes (email, push, notification, nettoyage destructive)
 * dans les workflows GitHub Actions programmés de Sargagame.
 *
 * Contrat couvert :
 *   - Détection du type de déclencheur (schedule, workflow_dispatch, push,
 *     workflow_run, unknown)
 *   - Mode DRY-RUN par défaut pour schedule / workflow_dispatch /
 *     workflow_run
 *   - Aucun secret interdit injecté en mode DRY-RUN
 *   - Envoi bloqué en DRY-RUN
 *   - Nettoyage destructif bloqué en DRY-RUN
 *   - Remise à zéro de dédoublement bloquée en DRY-RUN
 *   - Approbation Environment requise pour sortir du DRY-RUN
 *   - DRY_RUN=0 sans approbation → reste en DRY_RUN (fail-closed)
 *   - push n'est jamais considéré comme DRY-RUN (build/test seulement)
 */

const assert = require('node:assert/strict');
const {
  getTriggerType,
  isDryRun,
  hasEnvironmentApproval,
  assertNoForbiddenSecrets,
  outboundContext,
  FORBIDDEN_SECRETS,
  REQUIRED_ENVIRONMENTS,
} = require('../../scripts/lib/outbound-security.cjs');

// Sauvegarde et restauration de l'environnement pour les tests
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
setEnv({ GITHUB_EVENT_NAME: 'workflow_run' });
assert.strictEqual(getTriggerType(), 'workflow_run', 'workflow_run détecté');
setEnv({ GITHUB_EVENT_NAME: 'repository_dispatch' });
assert.strictEqual(getTriggerType(), 'unknown', 'événement inconnu');
restoreEnv();
console.log('  ✓ PASS\n');

// --- Test 2: DRY_RUN par défaut pour schedule ---
console.log('Test 2: DRY_RUN par défaut pour schedule / workflow_dispatch / workflow_run');
setEnv({ GITHUB_EVENT_NAME: 'schedule' });
assert.strictEqual(isDryRun(), true, 'schedule → DRY_RUN par défaut');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '1' });
assert.strictEqual(isDryRun(), true, 'schedule + DRY_RUN=1 → DRY_RUN');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0' });
assert.strictEqual(isDryRun(), true, 'schedule + DRY_RUN=0 sans approbation → DRY_RUN (fail-closed)');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'workflow_dispatch' });
assert.strictEqual(isDryRun(), true, 'workflow_dispatch → DRY_RUN par défaut');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'workflow_run' });
assert.strictEqual(isDryRun(), true, 'workflow_run → DRY_RUN par défaut');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'push' });
assert.strictEqual(isDryRun(), false, 'push → jamais DRY_RUN (build/test uniquement)');
restoreEnv();

// DRY_RUN=0 avec approbation Environment → pas DRY_RUN
setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0', ENVIRONMENT_NAME: 'outbound-send' });
assert.strictEqual(isDryRun(), false, 'schedule + DRY_RUN=0 + ENV outbound-send → pas DRY_RUN');
restoreEnv();

setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0', ENVIRONMENT_NAME: 'outbound-cleanup' });
assert.strictEqual(isDryRun(), false, 'schedule + DRY_RUN=0 + ENV outbound-cleanup → pas DRY_RUN');
restoreEnv();

// DRY_RUN=0 avec environnement non approuvé → reste en DRY_RUN
setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0', ENVIRONMENT_NAME: 'production' });
assert.strictEqual(isDryRun(), true, 'schedule + DRY_RUN=0 + ENV production (non approuvé) → DRY_RUN');
restoreEnv();

console.log('  ✓ PASS\n');

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

setEnv({ GITHUB_EVENT_NAME: 'schedule', MODERATE_TOKEN: 'tok' });
assert.throws(
  () => assertNoForbiddenSecrets(),
  /MODERATE_TOKEN/,
  'MODERATE_TOKEN interdit en DRY-RUN'
);
restoreEnv();

// Aucun secret → pas d'erreur
setEnv({ GITHUB_EVENT_NAME: 'schedule' });
assert.doesNotThrow(() => assertNoForbiddenSecrets(), 'aucun secret interdit → pas d\'erreur');
restoreEnv();

// Hors DRY-RUN → secrets autorisés (pas d'erreur)
setEnv({ GITHUB_EVENT_NAME: 'push', SMTP_PASS: 'secret123' });
assert.doesNotThrow(() => assertNoForbiddenSecrets(), 'push → SMTP_PASS autorisé');
restoreEnv();

console.log('  ✓ PASS\n');

// --- Test 4: outboundContext ---
console.log('Test 4: outboundContext');

// Schedule + pas d'approbation → tout bloqué
setEnv({ GITHUB_EVENT_NAME: 'schedule', SMTP_PASS: 'secret123' });
const ctx1 = outboundContext();
assert.strictEqual(ctx1.trigger, 'schedule');
assert.strictEqual(ctx1.dryRun, true);
assert.strictEqual(ctx1.environmentApproved, false);
assert.strictEqual(ctx1.sendAllowed(), false, 'envoi bloqué en DRY-RUN schedule');
assert.strictEqual(ctx1.destructiveCleanupAllowed(), false, 'nettoyage bloqué en DRY-RUN');
assert.strictEqual(ctx1.dedupResetAllowed(), false, 'reset dédoublement bloqué en DRY-RUN');
assert.throws(() => ctx1.assertSendAllowed(), /DRY-RUN/);
assert.throws(() => ctx1.assertDestructiveCleanupAllowed(), /DRY-RUN/);
assert.throws(() => ctx1.assertNoForbiddenSecrets(), /DRY-RUN/);
restoreEnv();

// Schedule + DRY_RUN=0 + ENV → tout autorisé
setEnv({ GITHUB_EVENT_NAME: 'schedule', DRY_RUN: '0', ENVIRONMENT_NAME: 'outbound-send' });
const ctx2 = outboundContext();
assert.strictEqual(ctx2.dryRun, false);
assert.strictEqual(ctx2.environmentApproved, true);
assert.strictEqual(ctx2.sendAllowed(), true, 'envoi autorisé avec approbation');
assert.strictEqual(ctx2.destructiveCleanupAllowed(), true, 'nettoyage autorisé avec approbation');
assert.strictEqual(ctx2.dedupResetAllowed(), true, 'reset dédoublement autorisé avec approbation');
restoreEnv();

// Push → tout autorisé (pas DRY-RUN)
setEnv({ GITHUB_EVENT_NAME: 'push', SMTP_PASS: 'secret123' });
const ctx3 = outboundContext();
assert.strictEqual(ctx3.dryRun, false);
assert.strictEqual(ctx3.sendAllowed(), true);
restoreEnv();

console.log('  ✓ PASS\n');

// --- Test 5: Liste des secrets interdits et environnements requis ---
console.log('Test 5: Listes de référence');
assert.ok(FORBIDDEN_SECRETS.has('SMTP_PASS'), 'SMTP_PASS dans la liste');
assert.ok(FORBIDDEN_SECRETS.has('ONESIGNAL_API_KEY_MQ'), 'ONESIGNAL_API_KEY_MQ dans la liste');
assert.ok(FORBIDDEN_SECRETS.has('MODERATE_TOKEN'), 'MODERATE_TOKEN dans la liste');
assert.ok(REQUIRED_ENVIRONMENTS.has('outbound-send'), 'outbound-send dans la liste');
assert.ok(REQUIRED_ENVIRONMENTS.has('outbound-cleanup'), 'outbound-cleanup dans la liste');
assert.ok(REQUIRED_ENVIRONMENTS.has('schema-production'), 'schema-production dans la liste');
assert.ok(REQUIRED_ENVIRONMENTS.has('account-admin'), 'account-admin dans la liste');
assert.ok(REQUIRED_ENVIRONMENTS.has('payment-production'), 'payment-production dans la liste');
console.log('  ✓ PASS\n');

console.log('=== ALL OUTBOUND SECURITY TESTS PASSED ===');
