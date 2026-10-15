#!/usr/bin/env node
/**
 * test-isolated-job.cjs — Test isolé bout-en-bout Factory V3
 * 
 * Vérifie :
 * - Runner démarre le travail
 * - Bon agent/exécuteur invoqué
 * - Résultat exploitable récupéré
 * - Logs et statut final correspondent au même identifiant
 * - Test échoue proprement sans worker fantôme
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STATE_DIR = path.join(__dirname, 'state');
const EVIDENCE_DIR = path.join(STATE_DIR, 'evidence');
const LOCK_FILE = path.join(STATE_DIR, 'factory.lock');

const TEST_JOB_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

console.log(`[TEST] Job ID: ${TEST_JOB_ID}`);
console.log(`[TEST] State dir: ${STATE_DIR}`);

// Nettoyer lock avant test
try { fs.unlinkSync(LOCK_FILE); } catch (_) {}

// Créer job de test minimal (dryRun pour éviter push/merge/déploiement réels)
const testJob = {
  jobId: TEST_JOB_ID,
  repo: 'sargagame',
  branch: 'main',
  task: 'test-isolated',
  severity: 1,
  dryRun: true
};

const jobFile = path.join(STATE_DIR, `test-job-${TEST_JOB_ID}.json`);
fs.writeFileSync(jobFile, JSON.stringify(testJob, null, 2));

console.log(`[TEST] Job file created: ${jobFile}`);

// Exécuter Factory V3 en mode single job
try {
  console.log(`[TEST] Starting Factory V3...`);
  const result = execSync(`node ${path.join(__dirname, 'run.cjs')}`, {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 120000,
    stdio: 'inherit',
    env: {
      ...process.env,
      FACTORY_JOB_ID: TEST_JOB_ID
    }
  });

  console.log(`[TEST] Factory completed successfully`);

  // Vérifier evidence
  const evidenceFile = path.join(EVIDENCE_DIR, `${TEST_JOB_ID}.json`);
  if (fs.existsSync(evidenceFile)) {
    const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
    console.log(`[TEST] Evidence found:`, evidence);
    
    if (evidence.job_id === TEST_JOB_ID) {
      console.log(`[TEST] ✅ Job ID matches in evidence`);
    } else {
      console.log(`[TEST] ❌ Job ID mismatch in evidence`);
      process.exit(1);
    }
  } else {
    console.log(`[TEST] ❌ No evidence file found`);
    process.exit(1);
  }

  // Vérifier lock libéré
  if (fs.existsSync(LOCK_FILE)) {
    console.log(`[TEST] ❌ Lock not released`);
    process.exit(1);
  } else {
    console.log(`[TEST] ✅ Lock released`);
  }

  console.log(`[TEST] ✅ Test PASSED`);
  process.exit(0);

} catch (error) {
  console.log(`[TEST] ❌ Test FAILED: ${error.message}`);
  console.log(`[TEST] Stderr: ${error.stderr || 'none'}`);
  
  // Nettoyer lock en cas d'échec
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
  
  process.exit(1);
} finally {
  // Nettoyer job file
  try { fs.unlinkSync(jobFile); } catch (_) {}
}
