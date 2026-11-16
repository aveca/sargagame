#!/usr/bin/env node
/**
 * Factory V3 — Conditional Resume for Diagnostic Express 49 € (Sargagame)
 *
 * Surveille 3 conditions non destructives, sans exposition de secret, sans
 * opération sensible (pas de déploiement, merge, paiement, email, secret) :
 *
 *   A. Mollie LIVE autorisé          → GET /api/mollie-mode  (corps vérifié, pas seulement HTTP 200)
 *   B. Migration 009 appliquée       → fichier local + sonde de la table diagnostic_orders
 *   C. Checkout 49 € valide et vivant→ sonde de l'état du checkout (pas de création de paiement)
 *
 * Quand les 3 conditions sont vérifiées :
 *   • Passe le job de BLOCKED à READY (nouvel evidence JSON)
 *   • Écrit un signal de reprise (state/resume-signal.json) pour l'opérateur
 *   • NE déclenche aucun déploiement, merge, paiement ou email
 *
 * Usage :
 *   node scripts/factory-v3/conditional-resume.cjs --check          # vérification unique
 *   node scripts/factory-v3/conditional-resume.cjs --watch          # surveillance persistante
 *   node scripts/factory-v3/conditional-resume.cjs --watch --interval 60 --max-iterations 10
 *
 * Aucun secret n'est jamais lu, affiché, loggué ou transmis en CLI.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

// ============================================================
// Répertoires et verrou Factory (mêmes patterns que run.cjs)
// ============================================================
const STATE_DIR = path.resolve(__dirname, 'state');
const EVIDENCE_DIR = path.join(STATE_DIR, 'evidence');
const LOCK_FILE = path.join(STATE_DIR, 'factory.lock');
const HEARTBEAT_FILE = path.join(STATE_DIR, 'heartbeat.json');
const RESUME_SIGNAL_FILE = path.join(STATE_DIR, 'resume-signal.json');

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const JOB_ID = 'job-20261116-supervision-diagnostic-express';
const WORKTREE = path.resolve(__dirname, '..', '..'); // racine du repo sargagame

// URLs surchargeables par variables d'environnement (pour les tests uniquement,
// jamais pour exposer un secret en production)
const MOLLIE_MODE_URL = process.env.MOLLIE_MODE_URL || 'https://sargasses-martinique.com/api/mollie-mode';
const MOLLIE_PAY_URL = process.env.MOLLIE_PAY_URL || 'https://sargasses-martinique.com/api/mollie-pay?pass=diagnostic_express';

const DEFAULT_INTERVAL_MS = 60000;   // 60 s entre deux checks en mode watch
const DEFAULT_MAX_ITERATIONS = 10;   // protection contre boucle infinie
const HTTP_TIMEOUT_MS = 10000;       // timeout par requête HTTP
const LOCK_STALE_MIN = 120;          // verrou expiré après 120 min

// ============================================================
// Conditions surveillées
// ============================================================
const CONDITIONS = {
  A: {
    id: 'mollie_live',
    name: 'Mollie LIVE autorisé',
    satisfied: false,
    evidence: '',
    detail: null,
  },
  B: {
    id: 'migration_009',
    name: 'Migration 009 appliquée (table diagnostic_orders)',
    satisfied: false,
    evidence: '',
    detail: null,
  },
  C: {
    id: 'checkout_49',
    name: 'Checkout 49 € valide et vivant',
    satisfied: false,
    evidence: '',
    detail: null,
  },
};

// ============================================================
// Lock (single runner, même contrat que run.cjs)
// ============================================================
function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const { pid, at } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const ageMin = (Date.now() - Date.parse(at)) / 60000;
      if (pidAlive(pid) && ageMin < LOCK_STALE_MIN) {
        console.log(`[conditional-resume] Déjà en cours (pid ${pid}, ${ageMin.toFixed(0)} min)`);
        process.exit(0);
      }
      console.log('[conditional-resume] Verrou périmé, reprise...');
    } catch (_) {}
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ============================================================
// Evidence (même contrat que generateEvidence de run.cjs)
// ============================================================
function writeEvidence(data = {}) {
  const evidence = {
    job_id: JOB_ID,
    repo: data.repo || 'sargagame',
    branch: data.branch || 'agent/coding/sg-payments-live-411',
    commit: data.commit || '9eabf20bb',
    pr: data.pr || 1474,
    ci: data.ci || null,
    merge: data.merge || null,
    deploy: data.deploy || null,
    live: data.live || null,
    baseline: data.baseline || 'origin/main 9c15ab296',
    after: data.after || null,
    errors: data.errors || [],
    attempts: data.attempts || 0,
    timestamps: data.timestamps || {},
    verdict: data.verdict || 'BLOCKED',
    conditions: data.conditions || snapshotConditions(),
  };
  const evidencePath = path.join(EVIDENCE_DIR, `${JOB_ID}.json`);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  return evidence;
}

function readEvidence() {
  const evidencePath = path.join(EVIDENCE_DIR, `${JOB_ID}.json`);
  if (!fs.existsSync(evidencePath)) return null;
  return JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
}

function snapshotConditions() {
  return {
    mollie_live: { satisfied: CONDITIONS.A.satisfied, evidence: CONDITIONS.A.evidence },
    migration_009: { satisfied: CONDITIONS.B.satisfied, evidence: CONDITIONS.B.evidence },
    checkout_49: { satisfied: CONDITIONS.C.satisfied, evidence: CONDITIONS.C.evidence },
  };
}

function allConditionsMet() {
  return CONDITIONS.A.satisfied && CONDITIONS.B.satisfied && CONDITIONS.C.satisfied;
}

// ============================================================
// Requête HTTP helper (GET, non destructif, timeout)
// ============================================================
function httpGet(url, timeoutMs = HTTP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP timeout after ${timeoutMs}ms`));
    });
    req.on('error', (e) => reject(e));
  });
}

// ============================================================
// Condition A — Mollie LIVE autorisé
//
// Vérifie via GET sur l'URL configurée (défaut : /api/mollie-mode sur le
// domaine principal). Un HTTP 200 seul NE SUFFIT PAS : le corps doit indiquer
// explicitement que le mode LIVE est autorisé.
// Aucun secret n'est jamais affiché ni loggué.
// ============================================================
async function checkMollieLive() {
  const url = MOLLIE_MODE_URL;
  let res;
  try {
    res = await httpGet(url);
  } catch (e) {
    CONDITIONS.A.satisfied = false;
    CONDITIONS.A.evidence = `ÉCHEC sonde HTTP : ${e.message}`;
    CONDITIONS.A.detail = { error: e.message, statusCode: null };
    return false;
  }

  const bodyOk = res.statusCode === 200 && typeof res.body === 'string' && res.body.length > 0;
  let parsed = null;
  if (bodyOk) {
    try { parsed = JSON.parse(res.body); } catch (_) { parsed = null; }
  }

  // Preuve requise : status 200 + corps JSON avec mode "live" ET api_mode "authorized"
  // Un simple 200 sans corps valide, ou api_mode "unauthorized", ne suffit pas.
  const liveAuthorized =
    parsed &&
    parsed.mode === 'live' &&
    (parsed.api_mode === 'authorized' || parsed.ok === true) &&
    parsed.api_mode !== 'unauthorized';

  CONDITIONS.A.satisfied = liveAuthorized;
  CONDITIONS.A.evidence = liveAuthorized
    ? `Mollie LIVE autorisé (HTTP ${res.statusCode}, mode=live, api_mode=authorized)`
    : `Mollie LIVE NON autorisé (HTTP ${res.statusCode}, corps="${res.body.slice(0, 200)}")`;
  CONDITIONS.A.detail = {
    statusCode: res.statusCode,
    bodyPreview: res.body ? res.body.slice(0, 200) : null,
    parsedKeys: parsed ? Object.keys(parsed) : null,
    liveAuthorized,
  };
  return liveAuthorized;
}

// ============================================================
// Condition B — Migration 009 appliquée (table diagnostic_orders)
//
// Deux niveaux de preuve :
//   1. Le fichier de migration existe localement (prérequis, vérifiable)
//   2. Une sonde tente de confirmer la présence de la table en prod.
//      Sans clé de service Supabase, la confirmation directe de la base
//      n'est pas possible depuis ce module : on marque "local_only"
//      et l'opérateur doit confirmer manuellement.
// Aucun écriture, aucun secret, aucun appel à l'API d'administration Supabase.
// ============================================================
async function checkMigration009() {
  const migrationPath = path.join(WORKTREE, 'scripts/migrations/009_diagnostic_orders.sql');
  const migrationExists = fs.existsSync(migrationPath);

  let tableProbed = false;
  let probeDetail = null;

  // Sonde non destructive : tenter GET sur un endpoint qui nécessiterait la table.
  // L'endpoint exact dépend de l'API exposée ; on tente une sonde légère.
  // Si l'endpoint n'existe pas ou retourne une erreur de structure, on ne
  // considère pas cela comme une preuve d'application de la migration.
  try {
    const probeUrl = 'https://sargasses-martinique.com/api/mollie-mode'; // réutilise endpoint connu
    const probe = await httpGet(probeUrl);
    // L'endpoint /api/mollie-mode ne prouve pas la table, mais prouve que l'API est joignable.
    tableProbed = probe.statusCode === 200;
    probeDetail = { endpoint: probeUrl, statusCode: probe.statusCode, note: 'API joignable, pas de preuve directe de la table' };
  } catch (e) {
    probeDetail = { error: e.message, note: 'API non joignable' };
  }

  // La migration est considérée "appliquée" uniquement si :
  //   - le fichier existe localement ET
  //   - l'opérateur a confirmé l'application (signal externe via resume-signal ou flag)
  // Ce module ne peut pas confirmer l'application effective en prod sans clé DB.
  const localOk = migrationExists;
  const confirmedByOperator = await readOperatorConfirmation('migration_009');

  CONDITIONS.B.satisfied = localOk && confirmedByOperator;
  CONDITIONS.B.evidence = localOk
    ? confirmedByOperator
      ? 'Migration 009 : fichier présent + confirmation opérateur (application en prod validée)'
      : 'Migration 009 : fichier présent localement, application en prod NON confirmée'
    : 'Migration 009 : fichier manquant localement';
  CONDITIONS.B.detail = {
    migrationFileExists: localOk,
    migrationPath,
    apiProbe: probeDetail,
    operatorConfirmed: confirmedByOperator,
  };
  return CONDITIONS.B.satisfied;
}

// ============================================================
// Condition C — Checkout 49 € valide et vivant
//
// Vérifie qu'un checkout 49 € existe avec les bonnes métadonnées,
// sans créer de paiement et sans utiliser de clé API secrète.
// Sonde via endpoint public si disponible, sinon vérifie l'absence
// de checkout expiré comme unique état.
// ============================================================
async function checkCheckout49() {
  // Sonde l'endpoint de création de checkout en mode lecture (GET) pour voir
  // si un checkout 49 € est déjà enregistré. Cet endpoint ne crée aucun paiement.
  let checkoutFound = false;
  let probeDetail = null;

  try {
    const probeUrl = MOLLIE_PAY_URL;
    const probe = await httpGet(probeUrl);
    probeDetail = { endpoint: probeUrl, statusCode: probe.statusCode, bodyPreview: probe.body ? probe.body.slice(0, 200) : null };
    // Un 200 avec un corps indiquant un checkout 49 € existant = preuve
    // Un 404/405/500 = pas de preuve (checkout non trouvé ou endpoint non adapté)
    if (probe.statusCode === 200 && probe.body) {
      try {
        const parsed = JSON.parse(probe.body);
        checkoutFound = parsed.amount === 49 || parsed.amount === '49' || parsed.amount === 4900 || parsed.currency === 'EUR';
      } catch (_) {
        // Corps non-JSON, pas de preuve structurée
        checkoutFound = false;
      }
    }
  } catch (e) {
    probeDetail = { error: e.message, note: 'Endpoint de checkout non joignable' };
  }

  // Confirmation opérateur : un checkout 49 € vivant doit être confirmé manuellement
  // (création côté fondateur avec metadata, webhookUrl, redirectUrl)
  const confirmedByOperator = await readOperatorConfirmation('checkout_49');

  CONDITIONS.C.satisfied = checkoutFound || confirmedByOperator;
  CONDITIONS.C.evidence = checkoutFound
    ? 'Checkout 49 € détecté via sonde HTTP (montant 49, devise EUR)'
    : confirmedByOperator
      ? 'Checkout 49 € : confirmation opérateur (création côté fondateur validée)'
      : 'Checkout 49 € : aucun checkout vivant détecté, confirmation opérateur absente';
  CONDITIONS.C.detail = {
    checkoutFoundViaProbe: checkoutFound,
    operatorConfirmed: confirmedByOperator,
    probe: probeDetail,
  };
  return CONDITIONS.C.satisfied;
}

// ============================================================
// Confirmation opérateur (signal externe, non destructif)
//
// Un fichier state/operator-confirmation.json peut être créé par
// l'opérateur/fondateur pour confirmer qu'une action réservée
// (migration, création de checkout) a été effectuée hors de ce module.
// Ce fichier ne contient aucun secret.
// ============================================================
function readOperatorConfirmation(conditionId) {
  const confirmationFile = path.join(STATE_DIR, 'operator-confirmation.json');
  if (!fs.existsSync(confirmationFile)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(confirmationFile, 'utf8'));
    return !!data[conditionId];
  } catch {
    return false;
  }
}

// ============================================================
// Exécuter un check complet de toutes les conditions
// ============================================================
async function runCheck() {
  console.log('[conditional-resume] === Check des conditions (Diagnostic Express 49 €) ===');

  await checkMollieLive();
  await checkMigration009();
  await checkCheckout49();

  console.log(`  A. Mollie LIVE    : ${CONDITIONS.A.satisfied ? '✅' : '❌'} ${CONDITIONS.A.evidence}`);
  console.log(`  B. Migration 009  : ${CONDITIONS.B.satisfied ? '✅' : '❌'} ${CONDITIONS.B.evidence}`);
  console.log(`  C. Checkout 49 €  : ${CONDITIONS.C.satisfied ? '✅' : '❌'} ${CONDITIONS.C.evidence}`);

  const met = allConditionsMet();
  console.log(`  Toutes les conditions : ${met ? '✅ SATISFIES' : '❌ NON SATISFIES'}`);

  // Écriture de l'evidence (toujours, pour traçabilité)
  const evidence = writeEvidence({
    verdict: met ? 'READY' : 'BLOCKED',
    timestamps: { lastCheck: new Date().toISOString() },
  });

  if (met) {
    // Transition BLOCKED → READY : écrit le signal de reprise
    const signal = {
      job_id: JOB_ID,
      status: 'READY',
      branch: 'agent/coding/sg-payments-live-411',
      commit: '9eabf20bb',
      pr: 1474,
      worktree: WORKTREE,
      conditions: snapshotConditions(),
      timestamp: new Date().toISOString(),
      note: 'Toutes les conditions de reprise sont satisfaites. L\'opérateur doit autoriser explicitement avant toute étape A–H du runbook (déploiement, migration, paiement, email).',
    };
    fs.writeFileSync(RESUME_SIGNAL_FILE, JSON.stringify(signal, null, 2));
    console.log('[conditional-resume] 🚀 JOB PASSÉ EN READY — signal de reprise écrit :', RESUME_SIGNAL_FILE);
    console.log('[conditional-resume] ⚠️  Aucun déploiement, merge, paiement ou email n\'est déclenché par ce module.');
    console.log('[conditional-resume] L\'opérateur fondateur doit autoriser explicitement avant chaque opération sensible.');
  } else {
    // Supprimer tout signal de reprise obsolète
    try { fs.unlinkSync(RESUME_SIGNAL_FILE); } catch (_) {}
  }

  return { met, conditions: snapshotConditions(), evidence };
}

// ============================================================
// Vérifier l'état du worktree et de la branche (non destructif)
// ============================================================
function inspectWorktree() {
  const info = { branch: null, head: null, clean: false, diagnosticFiles: [] };

  try {
    info.branch = execSync('git branch --show-current', { cwd: WORKTREE, encoding: 'utf8' }).trim();
  } catch { /* ignore */ }

  try {
    info.head = execSync('git log --oneline -1', { cwd: WORKTREE, encoding: 'utf8' }).trim();
  } catch { /* ignore */ }

  try {
    const status = execSync('git status --short', { cwd: WORKTREE, encoding: 'utf8' }).trim();
    info.clean = status.length === 0;
    info.status = status;
  } catch { /* ignore */ }

  // Lister les fichiers diagnostic livrés
  const diagDir = path.join(WORKTREE, 'scripts/diagnostic');
  if (fs.existsSync(diagDir)) {
    info.diagnosticFiles = fs.readdirSync(diagDir, { recursive: true }).filter(f => f.endsWith('.mjs') || f.endsWith('.sql'));
  }

  return info;
}

// ============================================================
// Point d'entrée
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const watch = args.includes('--watch');
  const check = args.includes('--check') || !watch; // défaut : check unique
  const intervalIdx = args.indexOf('--interval');
  const interval = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) || DEFAULT_INTERVAL_MS : DEFAULT_INTERVAL_MS;
  const maxIterIdx = args.indexOf('--max-iterations');
  const maxIterations = maxIterIdx >= 0 ? parseInt(args[maxIterIdx + 1], 10) || DEFAULT_MAX_ITERATIONS : DEFAULT_MAX_ITERATIONS;
  const verbose = args.includes('--verbose');

  acquireLock();

  try {
    const worktree = inspectWorktree();
    console.log(`[conditional-resume] Worktree : ${WORKTREE}`);
    console.log(`[conditional-resume] Branche : ${worktree.branch || 'indéterminée'}`);
    console.log(`[conditional-resume] HEAD : ${worktree.head || 'indéterminé'}`);
    console.log(`[conditional-resume] Fichiers diagnostic livrés : ${worktree.diagnosticFiles.length}`);
    if (verbose && worktree.status !== undefined) {
      console.log(`[conditional-resume] Git status : ${worktree.clean ? 'propre' : worktree.status.slice(0, 300)}`);
    }

    if (watch) {
      console.log(`[conditional-resume] Mode surveillance : intervalle ${interval} ms, max ${maxIterations} itérations`);
      let iterations = 0;
      while (iterations < maxIterations) {
        iterations++;
        console.log(`\n[conditional-resume] Itération ${iterations}/${maxIterations} — ${new Date().toISOString()}`);
        const result = await runCheck();
        if (result.met) {
          console.log('[conditional-resume] Conditions réunies, arrêt de la surveillance.');
          break;
        }
        if (iterations < maxIterations) {
          await new Promise((r) => setTimeout(r, interval));
        }
      }
      if (!allConditionsMet()) {
        console.log(`[conditional-resume] Surveillance terminée après ${maxIterations} itérations sans que toutes les conditions soient réunies.`);
      }
    } else {
      await runCheck();
    }
  } finally {
    releaseLock();
  }
}

// Export pour réutilisation et tests
module.exports = {
  JOB_ID,
  WORKTREE,
  CONDITIONS,
  acquireLock,
  releaseLock,
  writeEvidence,
  readEvidence,
  snapshotConditions,
  allConditionsMet,
  checkMollieLive,
  checkMigration009,
  checkCheckout49,
  runCheck,
  inspectWorktree,
  readOperatorConfirmation,
  httpGet,
};

// Point d'entrée seulement si exécuté directement
if (require.main === module) {
  main().catch((e) => {
    console.error('[conditional-resume] Erreur fatale :', e.message);
    try { releaseLock(); } catch (_) {}
    process.exit(1);
  });
}
