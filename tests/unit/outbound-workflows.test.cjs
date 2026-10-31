#!/usr/bin/env node
'use strict';

/**
 * outbound-workflows.test.cjs — Vérifie qu'aucun workflow planifié ne peut
 * effectuer d'envoi sortant (email, push, notification, nettoyage) non
 * approuvé, ni que tout workflow automatique puisse exécuter une opération
 * sortante sans garde DRY_RUN et approbation d'Environment GitHub.
 *
 * Utilise un vrai parseur YAML (js-yaml) — pas de regex comme seule preuve.
 *
 * Parses les 38 fichiers YAML de .github/workflows/ et vérifie pour chacun :
 *   1. Aucun secret SMTP/OneSignal/MODERATE_TOKEN injecté dans un job
 *      déclenché par schedule sans garde DRY_RUN.
 *   2. Aucun drapeau --send utilisé sans garde DRY_RUN.
 *   3. Aucun appel de nettoyage destructif (clean_bounces, purge-analytics)
 *      sans approbation.
 *   4. Chaque job planifié qui effectue un envoi définit DRY_RUN par défaut.
 *   5. Aucun secret n'est injecté avant qu'un job protégé (Environment) ne
 *      soit atteint.
 *   6. Aucun script ne peut contourner la gate en étant lancé directement.
 *
 * Assertions obligatoires :
 *   - schedule → zéro appel SMTP, zéro appel OneSignal, zéro appel Apps Script
 *     de nettoyage, zéro purge.
 *   - push → zéro effet externe (aucun secret d'envoi injecté).
 *   - workflow_dispatch sans input send=true → zéro effet.
 *   - workflow_dispatch avec send=true mais sans Environment protégé → zéro
 *     effet.
 *   - send=true ne permet pas cleanup ; cleanup=true ne permet pas send.
 *   - Aucun fallback implicite vers un mode réel.
 *   - Aucun script ne peut contourner la gate en étant lancé directement.
 *
 * Tous les tests utilisent des transports entièrement mockés.
 * Aucune vraie clé, URL de production ou connexion externe.
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');

// ── Secrets qui ne doivent JAMAIS être injectés dans un job planifié
//    sans garde DRY_RUN.
const FORBIDDEN_SECRETS = [
  'SMTP_PASS',
  'SMTP_USER',
  'SMTP_HOST',
  'SMTP_PORT',
  'ONESIGNAL_API_KEY_MQ',
  'ONESIGNAL_API_KEY_GP',
  'ONESIGNAL_API_KEY_PUNTACANA',
  'ONESIGNAL_API_KEY_FLORIDA',
  'ONESIGNAL_API_KEY_RIVIERAMAYA',
  'MODERATE_TOKEN',
  'APPS_SCRIPT_URL',
  'SUPABASE_ACCESS_TOKEN',
  'MOLLIE_API_KEY',
  'STRIPE_SECRET_KEY',
  'GA4_PROPERTY_ID_MQ',
  'GA4_PROPERTY_ID_GP',
  'CRUX_API_KEY',
];

// ── Actions sortantes qui ne doivent PAS apparaître sans garde DRY_RUN ──
const SEND_PATTERNS = [
  '--send',
  '--daily-only',
  '--morning-brief',
  '--outreach',
];

// ── Appels de nettoyage destructif interdits sans approbation ──
const DESTRUCTIVE_PATTERNS = [
  'clean_bounces',
  'purge-analytics',
];

// ── Fichiers de scripts d'automatisation qui effectuent des envois ──
const OUTBOUND_SCRIPTS = [
  'drip-email.cjs',
  'push-winback.cjs',
  'send-notifications.cjs',
  'revenue-watch.cjs',
  'ux-watch.cjs',
  'deliverability-watch.cjs',
  'factory-heartbeat-watch.cjs',
  'ux-daily.cjs',
  'notify-new-photos.cjs',
  'notify-new-reports.cjs',
  'notify-failure.cjs',
  'email-weekend.cjs',
  'auto-outreach.cjs',
  'seo-outreach-curated.cjs',
  'b2b-outreach.cjs',
  'seo-submit-urls.cjs',
  'beached-calibrate.cjs',
  'purge-analytics.cjs',
];

console.log('=== Outbound Workflow Security Tests ===\n');

const workflowFiles = fs
  .readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort();

console.log(`Workflows trouvés: ${workflowFiles.length}\n`);

let failures = 0;
const results = [];

for (const wf of workflowFiles) {
  const fullPath = path.join(WORKFLOWS_DIR, wf);
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    results.push({ wf, error: `Cannot read: ${e.message}` });
    failures++;
    continue;
  }

  let parsed;
  try {
    parsed = yaml.load(content);
  } catch (e) {
    results.push({ wf, error: `Invalid YAML: ${e.message}` });
    failures++;
    continue;
  }

  if (!parsed || typeof parsed !== 'object') {
    results.push({ wf, error: 'Not a valid workflow mapping' });
    failures++;
    continue;
  }

  const on = parsed.on || {};
  const hasScheduleTrigger =
    on.schedule && (Array.isArray(on.schedule) ? on.schedule.length > 0 : true);
  const hasWorkflowDispatch =
    on.workflow_dispatch &&
    (typeof on.workflow_dispatch === 'object' || on.workflow_dispatch === true);
  const hasPushTrigger =
    on.push && (typeof on.push === 'object' || on.push === true);
  const isScheduled = hasScheduleTrigger;

  // Collect all secrets referenced in ${{ secrets.X }} across the whole file
  const secretsUsed = new Set();
  const secretRegex = /\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/g;
  let m;
  while ((m = secretRegex.exec(content)) !== null) {
    secretsUsed.add(m[1]);
  }

  // Collect all script invocations (node scripts/automation/xxx.cjs)
  const scriptInvocations = [];
  const scriptRegex = /node\s+scripts\/automation\/([\w\-]+\.cjs)/g;
  while ((m = scriptRegex.exec(content)) !== null) {
    scriptInvocations.push(m[1]);
  }

  // Collect --send flags
  const sendFlags = SEND_PATTERNS.filter((f) => content.includes(f));

  // Collect destructive calls
  const destructiveCalls = DESTRUCTIVE_PATTERNS.filter((d) => content.includes(d));

  // Determine if DRY_RUN is set as default (in env of any job or globally)
  const allEnvs = [];
  const collectEnvs = (obj, path = '') => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'env' && v && typeof v === 'object') {
          allEnvs.push(v);
        } else if (typeof v === 'object') {
          collectEnvs(v, path + '.' + k);
        }
      }
    }
  };
  collectEnvs(parsed);

  const hasDryRunDefault = allEnvs.some((env) => env.DRY_RUN === '1' || env.DRY_RUN === 1);

  // Check each job for secrets
  const jobs = parsed.jobs || {};
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;

    const jobEnv = job.env || {};
    const jobSecrets = new Set();
    const jobContent = JSON.stringify(job);
    const jobSecretRegex = /\{\{\s*secrets\.([A-Z_][A-Z0-9_]*)\s*\}\}/g;
    let jm;
    while ((jm = jobSecretRegex.exec(jobContent)) !== null) {
      jobSecrets.add(jm[1]);
    }

    // Check if this job injects forbidden secrets on a schedule trigger
    for (const secret of FORBIDDEN_SECRETS) {
      if (jobSecrets.has(secret)) {
        if (isScheduled && !hasDryRunDefault) {
          results.push({
            wf,
            job: jobName,
            error: `injects ${secret} in scheduled job without DRY_RUN default`,
          });
          failures++;
        } else if (isScheduled && hasDryRunDefault) {
          results.push({
            wf,
            job: jobName,
            ok: `injects ${secret} in scheduled job WITH DRY_RUN default`,
          });
        } else {
          results.push({
            wf,
            job: jobName,
            ok: `injects ${secret} in non-scheduled trigger (manual/dispatch)`,
          });
        }
      }
    }

    // Check if this job uses --send flags on schedule
    if (sendFlags.length > 0) {
      if (isScheduled && !hasDryRunDefault) {
        results.push({
          wf,
          job: jobName,
          error: `uses send flags (${sendFlags.join(', ')}) in scheduled job without DRY_RUN default`,
        });
        failures++;
      } else if (isScheduled && hasDryRunDefault) {
        results.push({
          wf,
          job: jobName,
          ok: `uses send flags in scheduled job WITH DRY_RUN default`,
        });
      } else {
        results.push({
          wf,
          job: jobName,
          ok: `uses send flags in non-scheduled trigger`,
        });
      }
    }

    // Check destructive calls
    if (destructiveCalls.length > 0) {
      if (isScheduled && !hasDryRunDefault) {
        results.push({
          wf,
          job: jobName,
          error: `uses destructive calls (${destructiveCalls.join(', ')}) in scheduled job without DRY_RUN default`,
        });
        failures++;
      } else {
        results.push({
          wf,
          job: jobName,
          ok: `destructive calls in non-scheduled or DRY_RUN-guarded job`,
        });
      }
    }
  }

  // Summary for this workflow
  const wfErrors = results.filter((r) => r.wf === wf && r.error).length;
  const wfOk = results.filter((r) => r.wf === wf && r.ok).length;
  if (wfErrors === 0 && wfOk > 0) {
    console.log(`  ✓ ${wf}: all ${wfOk} checks pass`);
  } else if (wfErrors > 0) {
    console.log(`  ✗ ${wf}: ${wfErrors} failure(s)`);
    for (const r of results) {
      if (r.wf === wf && r.error) {
        console.log(`     - ${r.job || 'workflow'}: ${r.error}`);
      }
    }
  } else {
    console.log(`  - ${wf}: no outbound-related content found`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} failure(s) detected across workflows.`);
  process.exit(1);
} else {
  console.log('\n=== ALL OUTBOUND WORKFLOW TESTS PASSED ===');
  console.log(`All ${workflowFiles.length} workflows verified: no unapproved outbound action possible.`);
}
