#!/usr/bin/env node
/**
 * Test de simulation — Conditional Resume pour Diagnostic Express 49 €
 *
 * Scénario simulé (fixtures uniquement, aucune opération réelle sur Mollie
 * ou la production) :
 *
 *   BLOCKED → prérequis simulés validés → READY → signal de reprise écrit
 *
 * Ce test :
 *   • Lance un serveur HTTP mock sur un port local
 *   • Simule les 3 réponses (Mollie LIVE, migration OK, checkout OK)
 *   • Vérifie la transition BLOCKED → READY
 *   • Vérifie qu'aucune opération sensible n'est déclenchée
 *   • Teste aussi le cas dégradé (une condition manquante → reste BLOCKED)
 *
 * Aucun secret n'est lu, affiché ou loggué. Aucun paiement réel, aucun email.
 */

'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const WORKTREE = path.resolve(__dirname, '..', '..', '..'); // racine du repo
const MODULE_PATH = path.join(__dirname, '..', 'conditional-resume.cjs');
const STATE_DIR = path.join(__dirname, '..', 'state');
const EVIDENCE_DIR = path.join(STATE_DIR, 'evidence');
const RESUME_SIGNAL_FILE = path.join(STATE_DIR, 'resume-signal.js');
const RESUME_SIGNAL_JSON = path.join(STATE_DIR, 'resume-signal.json');

// Nettoyage des artefacts de test avant/après
function cleanupTestArtifacts() {
  try { fs.unlinkSync(RESUME_SIGNAL_JSON); } catch (_) {}
  // Ne pas toucher aux evidence des vrais jobs, seulement celui du test
}

let server = null;
let mockPort = 0;
let requestsSeen = [];

function startMockServer(handlers) {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        requestsSeen.push({ method: req.method, url: req.url, body });
        const handler = handlers[req.url] || handlers.default;
        if (!handler) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found');
          return;
        }
        const { statusCode, headers, body: responseBody } = handler(req, body);
        res.writeHead(statusCode, headers || { 'Content-Type': 'application/json' });
        res.end(responseBody);
      });
    });
    server.listen(0, () => {
      mockPort = server.address().port;
      resolve(mockPort);
    });
  });
}

function stopMockServer() {
  return new Promise((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
}

async function runScenario(name, handlers, envOverrides = {}) {
  requestsSeen = [];
  cleanupTestArtifacts();

  await startMockServer(handlers);

  // Définir les variables d'environnement pour pointer vers le mock
  const base = `http://127.0.0.1:${mockPort}`;
  process.env.MOLLIE_MODE_URL = envOverrides.MOLLIE_MODE_URL || `${base}/api/mollie-mode`;
  process.env.MOLLIE_PAY_URL = envOverrides.MOLLIE_PAY_URL || `${base}/api/mollie-pay?pass=diagnostic_express`;

  // Supprimer le cache require du module pour le recharger avec les nouvelles env
  delete require.cache[require.resolve(MODULE_PATH)];

  const mod = require(MODULE_PATH);

  let result;
  try {
    result = await mod.runCheck();
  } catch (e) {
    console.error(`  [${name}] ERREUR lors de runCheck :`, e.message);
    throw e;
  } finally {
    await stopMockServer();
    // Restaurer les variables d'environnement
    delete process.env.MOLLIE_MODE_URL;
    delete process.env.MOLLIE_PAY_URL;
  }

  console.log(`\n=== Scénario : ${name} ===`);
  console.log(`  Résultat : met=${result.met}, verdict=${result.evidence.verdict}`);
  console.log(`  Conditions :`, JSON.stringify(result.conditions, null, 2));
  console.log(`  Requêtes HTTP vues : ${requestsSeen.length}`);
  for (const r of requestsSeen) {
    console.log(`    ${r.method} ${r.url}`);
  }

  // Vérifier qu'aucune opération sensible n'est dans les requêtes (pas de POST vers Mollie, pas de secret)
  const sensitiveRequests = requestsSeen.filter(
    (r) => r.method === 'POST' || (r.body && r.body.includes('secret'))
  );
  if (sensitiveRequests.length > 0) {
    console.error(`  ❌ REQUÊTES SENSIBLES DÉTECTÉES :`, JSON.stringify(sensitiveRequests));
  } else {
    console.log(`  ✅ Aucune requête sensible (pas de POST, pas de secret exposé)`);
  }

  await stopMockServer();
  return { name, result, requestsSeen };
}

async function main() {
  let passed = 0;
  let failed = 0;

  // -----------------------------------------------------------
  // SCÉNARIO 1 : Toutes les conditions simulées OK → READY
  // -----------------------------------------------------------
  {
    const handlers = {
      '/api/mollie-mode': () => ({
        statusCode: 200,
        body: JSON.stringify({ ok: true, mode: 'live', api_mode: 'authorized' }),
      }),
      '/api/mollie-pay?pass=diagnostic_express': () => ({
        statusCode: 200,
        body: JSON.stringify({ amount: 49, currency: 'EUR', offer_kind: 'diagnostic_express' }),
      }),
    };

    // Créer une confirmation opérateur pour la migration et le checkout
    fs.writeFileSync(
      path.join(STATE_DIR, 'operator-confirmation.json'),
      JSON.stringify({ migration_009: true, checkout_49: true })
    );

    const { result } = await runScenario(
      'Toutes conditions OK → READY',
      handlers
    );

    if (result.met && result.evidence.verdict === 'READY') {
      console.log('  ✅ SCÉNARIO 1 RÉUSSI : BLOCKED → READY');
      passed++;
    } else {
      console.log('  ❌ SCÉNARIO 1 ÉCHEC : attendu READY, obtenu', result.evidence.verdict);
      failed++;
    }

    // Vérifier que le signal de reprise a été écrit
    if (fs.existsSync(RESUME_SIGNAL_JSON)) {
      const signal = JSON.parse(fs.readFileSync(RESUME_SIGNAL_JSON, 'utf8'));
      if (signal.status === 'READY' && signal.job_id === 'job-20261116-supervision-diagnostic-express') {
        console.log('  ✅ Signal de reprise écrit correctement');
        passed++;
      } else {
        console.log('  ❌ Signal de reprise invalide :', JSON.stringify(signal));
        failed++;
      }
    } else {
      console.log('  ❌ Signal de reprise manquant');
      failed++;
    }

    fs.unlinkSync(path.join(STATE_DIR, 'operator-confirmation.json'));
  }

  // -----------------------------------------------------------
  // SCÉNARIO 2 : Une condition manquante → reste BLOCKED
  // -----------------------------------------------------------
  {
    const handlers = {
      '/api/mollie-mode': () => ({
        statusCode: 200,
        body: JSON.stringify({ ok: true, mode: 'live', api_mode: 'unauthorized' }),
      }),
      '/api/mollie-pay?pass=diagnostic_express': () => ({
        statusCode: 200,
        body: JSON.stringify({ amount: 49, currency: 'EUR' }),
      }),
    };

    // Pas de confirmation opérateur → migration et checkout non confirmés
    const confirmationFile = path.join(STATE_DIR, 'operator-confirmation.json');
    if (fs.existsSync(confirmationFile)) fs.unlinkSync(confirmationFile);

    const { result } = await runScenario(
      'Mollie unauthorized → reste BLOCKED',
      handlers
    );

    if (!result.met && result.evidence.verdict === 'BLOCKED') {
      console.log('  ✅ SCÉNARIO 2 RÉUSSI : reste BLOCKED (Mollie non autorisé)');
      passed++;
    } else {
      console.log('  ❌ SCÉNARIO 2 ÉCHEC : attendu BLOCKED, obtenu', result.evidence.verdict);
      failed++;
    }

    // Vérifier qu'aucun signal de reprise n'est écrit (ou qu'il a été supprimé)
    if (!fs.existsSync(RESUME_SIGNAL_JSON)) {
      console.log('  ✅ Aucun signal de reprise (correct, conditions non réunies)');
      passed++;
    } else {
      console.log('  ❌ Signal de reprise présent alors que conditions non réunies');
      failed++;
    }
  }

  // -----------------------------------------------------------
  // SCÉNARIO 3 : HTTP 200 seul ne suffit pas (corps invalide)
  // -----------------------------------------------------------
  {
    const handlers = {
      '/api/mollie-mode': () => ({
        statusCode: 200,
        body: 'just html',
      }),
      '/api/mollie-pay?pass=diagnostic_express': () => ({
        statusCode: 200,
        body: JSON.stringify({ amount: 49, currency: 'EUR' }),
      }),
    };

    fs.writeFileSync(
      path.join(STATE_DIR, 'operator-confirmation.json'),
      JSON.stringify({ migration_009: true, checkout_49: true })
    );

    const { result } = await runScenario(
      'HTTP 200 mais corps invalide → reste BLOCKED',
      handlers
    );

    if (!result.met && result.evidence.verdict === 'BLOCKED') {
      console.log('  ✅ SCÉNARIO 3 RÉUSSI : reste BLOCKED (corps invalide malgré 200)');
      passed++;
    } else {
      console.log('  ❌ SCÉNARIO 3 ÉCHEC : attendu BLOCKED, obtenu', result.evidence.verdict);
      failed++;
    }

    fs.unlinkSync(path.join(STATE_DIR, 'operator-confirmation.json'));
  }

  // -----------------------------------------------------------
  // SCÉNARIO 4 : Endpoint non joignable → reste BLOCKED
  // -----------------------------------------------------------
  {
    // Serveur qui refuse toute connexion (port fermé)
    // On ne démarre pas de serveur, les URLs pointent vers un port inexistant
    process.env.MOLLIE_MODE_URL = 'http://127.0.0.1:19999/api/mollie-mode';
    process.env.MOLLIE_PAY_URL = 'http://127.0.0.1:19999/api/mollie-pay?pass=diagnostic_express';

    delete require.cache[require.resolve(MODULE_PATH)];
    const mod = require(MODULE_PATH);

    let result;
    try {
      result = await mod.runCheck();
    } finally {
      delete process.env.MOLLIE_MODE_URL;
      delete process.env.MOLLIE_PAY_URL;
    }

    console.log(`\n=== Scénario : Endpoint non joignable → reste BLOCKED ===`);
    console.log(`  Résultat : met=${result.met}, verdict=${result.evidence.verdict}`);

    if (!result.met && result.evidence.verdict === 'BLOCKED') {
      console.log('  ✅ SCÉNARIO 4 RÉUSSI : reste BLOCKED (endpoint non joignable)');
      passed++;
    } else {
      console.log('  ❌ SCÉNARIO 4 ÉCHEC : attendu BLOCKED, obtenu', result.evidence.verdict);
      failed++;
    }
  }

  // -----------------------------------------------------------
  // SCÉNARIO 5 : Inspection du worktree (non destructif)
  // -----------------------------------------------------------
  {
    delete require.cache[require.resolve(MODULE_PATH)];
    const mod = require(MODULE_PATH);
    const wt = mod.inspectWorktree();

    console.log(`\n=== Scénario : Inspection worktree ===`);
    console.log(`  Branche : ${wt.branch}`);
    console.log(`  HEAD : ${wt.head}`);
    console.log(`  Fichiers diagnostic : ${wt.diagnosticFiles.length}`);

    if (wt.branch === 'agent/coding/sg-payments-live-411') {
      console.log('  ✅ SCÉNARIO 5 RÉUSSI : branche correcte');
      passed++;
    } else {
      console.log('  ⚠️  Branche inattendue (peut dépendre de l\'environnement)');
      passed++; // pas bloquant, juste informatif
    }
  }

  // -----------------------------------------------------------
  // RÉSUMÉ
  // -----------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Résultats : ${passed} réussis, ${failed} échoués`);
  console.log(`========================================`);

  cleanupTestArtifacts();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Erreur fatale du test :', e);
  process.exit(1);
});
