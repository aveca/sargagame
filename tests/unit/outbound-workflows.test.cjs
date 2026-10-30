#!/usr/bin/env node
'use strict';

/**
 * outbound-workflows.test.cjs — Vérifie qu'aucun workflow planifié ne peut
 * effectuer d'envoi sortant non approuvé.
 *
 * Parse tous les fichiers YAML de .github/workflows/ et vérifie:
 * 1. Aucun secret SMTP/OneSignal n'est injecté dans un job déclenché par
 *    schedule sans garde DRY-RUN.
 * 2. Aucun drapeau --send n'est utilisé sans garde DRY-RUN.
 * 3. Aucun nettoyage destructif (clean_bounces, purge-analytics) n'est appelé
 *    sans approbation.
 * 4. Chaque job planifié qui effectue un envoi définit DRY_RUN par défaut.
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');

// Secrets qui ne doivent JAMAIS être injectés dans un job schedule sans garde
const FORBIDDEN_SECRETS = [
  'SMTP_PASS',
  'SMTP_USER',
  'ONESIGNAL_API_KEY_MQ',
  'ONESIGNAL_API_KEY_GP',
  'ONESIGNAL_API_KEY_PUNTACANA',
  'ONESIGNAL_API_KEY_FLORIDA',
  'ONESIGNAL_API_KEY_RIVIERAMAYA',
];

// Drapeaux d'envoi réel qui ne doivent PAS apparaître sans DRY_RUN guard
const SEND_FLAGS = ['--send', '--daily-only', '--morning-brief'];

// Appels de nettoyage destructif interdits sans approbation
const DESTRUCTIVE_CALLS = ['clean_bounces', 'purge-analytics'];

/**
 * Lit un fichier YAML de workflow de manière simplifiée (pas de parser YAML
 * complet pour éviter les dépendances). Recherche des patterns texte.
 */
function readWorkflow(fileName) {
  const fullPath = path.join(WORKFLOWS_DIR, fileName);
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Vérifie si un workflow a un déclencheur schedule.
 */
function hasScheduleTrigger(content) {
  return content.match(/on:\s*\n\s*schedule:/) !== null ||
         content.match(/schedule:\s*\n/) !== null;
}

/**
 * Vérifie si le workflow définit DRY_RUN par défaut (dans les env du job ou
 * globalement).
 */
function hasDryRunDefault(content) {
  return content.match(/DRY_RUN\s*[:=]\s*['"]?1['"]?/) !== null ||
         content.match(/DRY_RUN:\s*1/) !== null;
}

/**
 * Vérifie si un secret spécifique est injecté dans le workflow.
 */
function injectsSecret(content, secretName) {
  // Pattern: SECRET_NAME: ${{ secrets.SECRET_NAME }}
  const pattern = new RegExp(secretName + '\\s*:\\s*\\$\\{\\{\\s*secrets\\.' + secretName + '\\s*\\}\\}');
  return pattern.test(content);
}

/**
 * Vérifie si un drapeau d'envoi est utilisé.
 */
function usesSendFlag(content) {
  for (const flag of SEND_FLAGS) {
    if (content.includes(flag)) return true;
  }
  return false;
}

/**
 * Vérifie si un appel de nettoyage destructif est présent.
 */
function usesDestructiveCall(content) {
  for (const call of DESTRUCTIVE_CALLS) {
    if (content.includes(call)) return true;
  }
  return false;
}

console.log('=== Outbound Workflow Security Tests ===\n');

const workflowFiles = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
console.log(`Workflows trouvés: ${workflowFiles.length}\n`);

let failures = 0;

for (const wf of workflowFiles) {
  const content = readWorkflow(wf);
  const hasSchedule = hasScheduleTrigger(content);

  // Vérifier les secrets interdits dans les workflows planifiés
  for (const secret of FORBIDDEN_SECRETS) {
    if (injectsSecret(content, secret)) {
      if (hasSchedule && !hasDryRunDefault(content)) {
        console.log(`  ✗ ${wf}: injecte ${secret} avec trigger schedule mais sans DRY_RUN par défaut`);
        failures++;
      } else if (hasSchedule && hasDryRunDefault(content)) {
        console.log(`  ✓ ${wf}: injecte ${secret} avec schedule + DRY_RUN par défaut (OK)`);
      } else {
        console.log(`  ✓ ${wf}: injecte ${secret} sans schedule (workflow_dispatch/push uniquement)`);
      }
    }
  }

  // Vérifier les drapeaux d'envoi
  if (usesSendFlag(content)) {
    if (hasSchedule && !hasDryRunDefault(content)) {
      console.log(`  ✗ ${wf}: utilise un drapeau d'envoi (--send/--daily-only/--morning-brief) avec schedule mais sans DRY_RUN`);
      failures++;
    } else if (hasSchedule && hasDryRunDefault(content)) {
      console.log(`  ✓ ${wf}: utilise drapeau d'envoi avec schedule + DRY_RUN par défaut (OK)`);
    } else {
      console.log(`  ✓ ${wf}: utilise drapeau d'envoi sans schedule (OK)`);
    }
  }

  // Vérifier les appels de nettoyage destructif
  if (usesDestructiveCall(content)) {
    if (hasSchedule && !hasDryRunDefault(content)) {
      console.log(`  ✗ ${wf}: appelle un nettoyage destructif avec schedule mais sans DRY_RUN`);
      failures++;
    } else {
      console.log(`  ✓ ${wf}: nettoyage destructif avec DRY_RUN ou sans schedule (OK)`);
    }
  }
}

if (failures > 0) {
  console.log(`\n${failures} échec(s) détecté(s).`);
  process.exit(1);
} else {
  console.log('\n=== ALL OUTBOUND WORKFLOW TESTS PASSED ===');
}
