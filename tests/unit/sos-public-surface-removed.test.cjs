#!/usr/bin/env node
'use strict';

/**
 * sos-public-surface-removed.test.cjs
 * ============================================================================
 * Mission P0 2026-11-09 — RETRAIT du parcours de paiement « SOS Plage 24H »
 * (1 €) + fiabilité du paiement Mollie LIVE.
 *
 * Ce test verrouille TROIS invariants distincts. Il ne faut surtout pas les
 * confondre :
 *
 *   1. SURFACE PUBLIQUE — plus aucune surface SOS n'est exposée au client :
 *      deep-link `?sos=1`, CTA doré `.sg-soscta`, fiche plage, modal dédiée,
 *      catalogue `/premium/`, template de configuration, script de test qui
 *      créait un paiement LIVE, et aucun chemin simulant un succès de paiement.
 *
 *   2. CRÉATION — le serveur REFUSE la création d'un paiement `sos`
 *      (et de tout pass inconnu) : fail-closed, aucun montant libre.
 *
 *   3. LIVRAISON — la LIVRAISON des paiements `sos` DÉJÀ ENCAISSÉS reste
 *      possible (webhook + confirmation serveur + backfill contrôlé).
 *      Encaisser sans livrer serait un trou de confiance : l'argent déjà pris
 *      doit pouvoir être livré.
 *
 * Aucun paiement réel n'est créé par ce test : tous les appels Mollie sont
 * simulés (fetch intercepté).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let failures = 0;
function check(ok, label) {
  if (ok) console.log('  ok  ' + label);
  else { failures++; console.error('  FAIL ' + label); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SURFACE PUBLIQUE — le client ne doit plus exposer le parcours SOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('1. Surface publique (client)');
check(!exists('src/SOSPlage.jsx'), 'le composant src/SOSPlage.jsx est supprimé');
check(!exists('src/lib/sos-observation-state.mjs'), 'le module src/lib/sos-observation-state.mjs est supprimé');
check(!exists('tests/e2e/sos-plage-checkout.spec.ts'), 'le test e2e du checkout SOS est supprimé');
check(!exists('test-mollie-api.mjs'), 'le script racine qui créait un paiement LIVE SOS est supprimé');

const app = read('src/Sargasses_PROD.jsx');
const beach = read('src/BeachSheet.jsx');
const css = read('src/app-runtime.css');
const pricing = read('src/lib/pricing.js');

check(!/showSOS|setShowSOS|LazySOSPlage/.test(app), 'aucun état/overlay SOS dans Sargasses_PROD.jsx');
check(!/sg-soscta/.test(app), 'aucun bouton .sg-soscta dans Sargasses_PROD.jsx');
check(!/track\(\s*["']sg_sos_/.test(app), 'aucun événement de funnel sg_sos_* n\'est émis');
check(!/["']sg_sos_checkout_(start|error)["']/.test(app), 'aucun événement de checkout SOS dans l\'allowlist de mesure');
check(!/get\(["']sos["']\)/.test(app), 'le deep-link ?sos=1 n\'est plus traité');
check(!/SOS PLAGE|SOS BEACH|SOS PLAYA/.test(app), 'aucun libellé SOS dans Sargasses_PROD.jsx');

check(!/showSOS|setShowSOS/.test(beach), 'aucun état SOS dans BeachSheet.jsx');
check(!/SOSPlage/.test(beach), 'BeachSheet.jsx ne charge plus le composant SOS');
check(!/SOS PLAGE|SOS BEACH|SOS PLAYA/.test(beach), 'aucun bloc SOS dans la fiche plage');

check(!/\.sg-soscta/.test(css), 'la classe .sg-soscta a disparu du CSS applicatif');
check(!/sos/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'aucune règle CSS SOS (hors commentaires)');

check(/PASS_KEYS\s*=\s*Object\.freeze\(\[[^\]]*\]\)/.test(pricing), 'PASS_KEYS est toujours déclaré');
const passKeysBlock = /PASS_KEYS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(pricing);
check(!!passKeysBlock && !/sos/.test(passKeysBlock[1]), 'PASS_KEYS ne contient plus « sos »');
const baseBlock = /PASS_BASE_CENTS\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\)/.exec(pricing);
check(!!baseBlock && !/sos/.test(baseBlock[1]), 'PASS_BASE_CENTS ne contient plus « sos »');
const copyBlock = /PASS_COPY\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\)/.exec(pricing);
check(!!copyBlock && !/sos/.test(copyBlock[1]), 'PASS_COPY ne contient plus « sos »');
const daysBlock = /PASS_DAYS\s*=\s*Object\.freeze\(\{([^}]*)\}\)/.exec(pricing);
check(!!daysBlock && !/sos/.test(daysBlock[1]), 'PASS_DAYS ne contient plus « sos »');

// ─────────────────────────────────────────────────────────────────────────────
// 2. CATALOGUES PUBLICS ET TEMPLATE DE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. Catalogues publics et template de configuration');
const premiumLib = require(path.join(ROOT, 'scripts', 'lib', 'premium-page.cjs'));
check(!premiumLib.OFFERS.some((o) => o.pass === 'sos'), 'le catalogue /premium/ (OFFERS) ne propose plus « sos »');
check(!premiumLib.USD_OFFERS.some((o) => o.pass === 'sos'), 'le catalogue /premium/ (USD_OFFERS) ne propose plus « sos »');
const premiumHtml = read('public/premium/index.html');
check(!/"pass"\s*:\s*"sos"/.test(premiumHtml), 'le catalogue embarqué de /premium/ ne propose plus « sos »');
const cfgExample = read('public/api/mollie-config.example.php');
check(!/'\s*sos'\s*=>/.test(cfgExample), 'le template de configuration ne documente plus le pass « sos »');

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUCUN CHEMIN SIMULANT UN PAIEMENT RÉUSSI
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. Aucun chemin simulant un succès de paiement');
for (const f of ['src/Sargasses_PROD.jsx', 'src/BeachSheet.jsx', 'src/PremiumModal.jsx', 'src/PassOffer.jsx']) {
  const s = read(f);
  check(!/sos_success/.test(s), f + ' : aucun marqueur « sos_success » (succès simulé)');
}
const postDeploy = read('scripts/autopilot/post-deploy-verify.cjs');
check(!/sos_deeplink/.test(postDeploy), 'le contrôle post-déploiement ne vérifie plus la présence du parcours SOS');
check(/sos_public_surface/.test(postDeploy), 'le contrôle post-déploiement vérifie l\'ABSENCE de surface SOS');
check(!/action:\s*["']__payment_smoke__["']/.test(postDeploy.replace(/--data/g, '--data')),
  'le smoke test de paiement reste un POST invalide (aucun paiement créé)');

(async () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 4. CRÉATION — le serveur refuse `sos` et tout pass inconnu
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4. Création refusée (fail-closed) — exécution réelle sur les Workers');
  const { default: regional } = await import('../../workers/sargagame/index.js');
  const { default: prodWorker } = await import('../../workers/sg-payments/index.js');

  const env = {
    MOLLIE_API_KEY: 'test_only_key',
    MOLLIE_WEBHOOK_SECRET: 'test_only_webhook_secret',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_KEY: 'test_only_service_key',
  };

  const state = { mollieCreates: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init && init.method) || 'GET';
    if (url.startsWith('https://api.mollie.com/v2/payments') && method === 'POST') {
      state.mollieCreates.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'tr_shouldnotexist', _links: { checkout: { href: 'https://mollie.test/x' } } }), {
        status: 201, headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      return new Response(JSON.stringify({ id: 'tr_test', status: 'paid', amount: { currency: 'EUR', value: '1.00' }, metadata: {} }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url === env.SUPABASE_URL + '/rest/v1/rpc/sg_upsert_payment_grant') {
      return new Response(null, { status: 204 });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const create = async (worker, pass, cents) => {
    state.mollieCreates = [];
    const response = await worker.fetch(new Request('https://worker.test/api/mollie', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create_payment', pass, cents, cur: 'EUR', email: 'x@example.com' }),
    }), env);
    return { status: response.status, body: await response.json().catch(() => ({})), creates: state.mollieCreates.length };
  };

  try {
    for (const [label, worker] of [['workers/sargagame', regional], ['workers/sg-payments', prodWorker]]) {
      const sos = await create(worker, 'sos', 100);
      check(sos.status === 400 && /Prix invalide/.test(sos.body.error || ''),
        label + ' : create_payment(pass=sos) → 400 « Prix invalide »');
      check(sos.creates === 0, label + ' : AUCUN paiement Mollie créé pour « sos »');

      const unknown = await create(worker, 'pass-inconnu', 1);
      check(unknown.status === 400 && /Prix invalide/.test(unknown.body.error || ''),
        label + ' : create_payment(pass inconnu) → 400 « Prix invalide » (fail-closed)');
      check(unknown.creates === 0, label + ' : aucun montant libre accepté pour un pass inconnu');

      const legit = await create(worker, 'trip7', 499);
      check(legit.status === 200 && legit.creates === 1,
        label + ' : create_payment(pass=trip7, 4,99 €) reste autorisé');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. LIVRAISON — les paiements « sos » DÉJÀ encaissés restent livrables
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n5. Livraison des paiements « sos » déjà encaissés (préservée)');
  const regionalSrc = read('workers/sargagame/index.js');
  const prodSrc = read('workers/sg-payments/index.js');
  const libPhp = read('public/api/mollie-lib.php');
  check(/FULFILL_PRICES[\s\S]*?sos:\{EUR:1\.00/.test(regionalSrc), 'workers/sargagame : FULFILL_PRICES conserve « sos »');
  check(/DAYS_TABLE\s*=\s*Object\.freeze\(\{[^}]*sos:1/.test(regionalSrc), 'workers/sargagame : DAYS_TABLE conserve la durée 1 j de « sos »');
  check(/FULFILL_PRICES[\s\S]*?sos:\s*\{\s*EUR:\s*1\.0/.test(prodSrc), 'workers/sg-payments : FULFILL_PRICES conserve « sos »');
  check(/PASS_DURATIONS\s*=\s*\{[^}]*sos:\s*1/.test(prodSrc), 'workers/sg-payments : PASS_DURATIONS conserve « sos »');
  check(/'sos'\s*=>\s*\[\s*'EUR'\s*=>\s*1\.00/.test(libPhp), 'public/api/mollie-lib.php : grille de livraison conserve « sos »');
  check(/in_array\(\$pass,\s*\['p30',\s*'trip7',\s*'p7',\s*'season',\s*'sos'\],\s*true\)/.test(read('public/api/mollie-webhook.php')),
    'public/api/mollie-webhook.php : le webhook livre encore un paiement « sos » encaissé');

  // ───────────────────────────────────────────────────────────────────────────
  // 6. CONFIRMATION SERVEUR — pas d'attribution d'accès depuis le navigateur
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n6. Confirmation serveur (aucun accès attribué sans l\'API Mollie)');
  const hookPhp = read('public/api/mollie-webhook.php');
  check(/hash_hmac\('sha256',\s*\$raw/.test(hookPhp), 'le webhook PHP vérifie la signature Mollie (fail-closed)');
  check(/invalid_signature/.test(hookPhp), 'le webhook PHP refuse une signature invalide (403)');
  check(/webhook_unavailable/.test(hookPhp), 'le webhook PHP est indisponible (503) sans secret');
  check(/entityId/.test(hookPhp), 'le webhook PHP accepte le format Next-gen (entityId)');
  check(/application\/x-www-form-urlencoded/.test(hookPhp), 'le webhook PHP accepte le format classique (form-urlencoded)');
  check(/in_array\(\$status,\s*\['paid',\s*'settled'\],\s*true\)/.test(hookPhp),
    'le webhook PHP ne délivre que sur un état relu « paid »/« settled »');
  check(/mol_b2c_pass_revoke\(\$id\)/.test(hookPhp), 'le webhook PHP révoque l\'accès sur annulation/échec/remboursement');
  const molliePhp = read('public/api/mollie.php');
  check(/payment_owner_mismatch/.test(molliePhp), 'payment_status (PHP) refuse un paiement appartenant à un autre email');
  check(/sg_upsert_payment_grant/.test(libPhp), 'la délivrance PHP passe par la RPC idempotente sg_upsert_payment_grant');
  check(/payment_owner_mismatch/.test(prodSrc), 'workers/sg-payments payment_status refuse un paiement appartenant à un autre email');
  check(/hasOwnProperty\.call\(PASS_PRICES,\s*pass\)/.test(prodSrc),
    'workers/sg-payments refuse un pass inconnu à la création (fail-closed)');

  console.log('\nSOS_PUBLIC_SURFACE_REMOVED_TESTS', failures === 0 ? 'PASS' : 'FAIL');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
