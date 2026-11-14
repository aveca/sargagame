'use strict';

/**
 * tests/daily-copernicus-revenue-metrics.test.cjs
 *
 * Le tracker MRR mesure l'ARGENT, pas la DONNÉE satellite. Il ne doit donc
 * JAMAIS être conditionné à la fraîcheur satellite.
 *
 * Régression corrigée : le step « Mollie MRR tracker » était dans le job
 * `email-automation`, conditionné (depuis #1265) à `fetch-data` + publication
 * fraîche. Quand la donnée satellite était périmée — donc quand le produit
 * était dégradé — le tracker ne tournait plus et le rapport
 * `scripts/automation/data/mollie-mrr.json` se figeait : la mesure du revenu
 * s'éteignait au moment exact où elle compte le plus.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'daily-copernicus.yml');
// Normalisation CRLF : le checkout Windows (\r\n) faisait échouer
// indexOf('...\n') alors que le contenu est identique.
const workflow = fs.readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');

/** Extrait le bloc YAML d'un job (de `  <name>:` jusqu'au job suivant). */
function jobBlock(name) {
  const start = workflow.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `job ${name} existe`);
  const tail = workflow.slice(start + 1);
  const next = tail.slice(1).search(/^  [a-zA-Z0-9_-]+:[ \t]*$/m);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

// ── 1. Le job de mesure existe et est AUTONOME ─────────────────────────────
const metrics = jobBlock('revenue-metrics');
assert.match(metrics, /if:\s*github\.event_name == 'schedule'/, 'revenue-metrics ne tourne que sur schedule');
assert.doesNotMatch(metrics, /^\s*needs:/m, 'revenue-metrics ne doit dependre d aucun job (autonomie)');
assert.match(metrics, /mollie-mrr\.cjs --send/, 'revenue-metrics execute le tracker MRR');
assert.match(metrics, /MOLLIE_API_KEY: \$\{\{ secrets\.MOLLIE_API_KEY \}\}/, 'le tracker lit la cle Mollie du secret');
assert.match(metrics, /continue-on-error: true/, 'une panne du tracker ne doit pas faire echouer le workflow');

// ── 2. Le tracker MRR n'est PLUS dans le job gate par la fraicheur ─────────
const emailJob = jobBlock('email-automation');
assert.match(
  emailJob,
  /needs:\s*\[fetch-data\]/,
  'email-automation reste conditionne a fetch-data (garde de fraicheur)'
);
assert.doesNotMatch(
  emailJob,
  /mollie-mrr\.cjs/,
  'le tracker MRR ne doit pas dependre de la publication satellite'
);

// ── 3. Le rapport MRR n'est plus commit par le job email ───────────────────
// (ownership exclusive : seul revenue-metrics ecrit mollie-mrr.json)
const emailCommitList = emailJob.match(/for f in [^\n]*mollie-mrr\.json[^\n]*/);
assert.equal(
  emailCommitList,
  null,
  'mollie-mrr.json ne doit plus etre commite par email-automation (ownership exclusive)'
);
assert.match(
  metrics,
  /git add "\$M"/,
  'revenue-metrics commite son propre rapport MRR'
);

// ── 4. Aucun email client n'est touche par ce decouplage ──────────────────
assert.doesNotMatch(metrics, /resend|nodemailer|sendMail|send-email/i, 'revenue-metrics n envoie aucun email');
assert.doesNotMatch(metrics, /mollie\.php|create-checkout|refund/i, 'revenue-metrics ne touche aucun paiement');

console.log('OK — mesure du revenu (MRR) independante de la garde de fraicheur satellite');
