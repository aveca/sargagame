#!/usr/bin/env node
'use strict'

/**
 * funnel-checkout-events.test.cjs — garde-fou P0 MESURE : tout parcours de
 * paiement doit alimenter `daily-metrics.json` (Supabase) ET la file critique.
 *
 * DÉFAUT DE MESURE RÉEL (mesuré, 2026-10-26) :
 * `scripts/automation/data/daily-metrics.json` rapportait
 *   checkout: { windowDays: 30, reached: 0, paid: 0 }
 * alors que le funnel de la même fenêtre rapportait
 *   paymentsReal: 5, revenueReal: 41.95 (5 paiements RÉELS).
 *
 * CAUSE RACINE : `track()` (src/Sargasses_PROD.jsx) n'envoie vers Supabase —
 * donc vers `daily-metrics.json` — que les événements présents dans
 * `SG_FUNNEL_EVENTS` :
 *
 *     if (SG_FUNNEL_EVENTS.has(event)) { ... logAnalyticsEvent(...) }
 *
 * Or le paiement SOS 1 € (src/SOSPlage.jsx) émet `sg_sos_checkout_start`,
 * ABSENT de cette allowlist. L'événement partait en GA4/beacon mais JAMAIS
 * vers Supabase → le checkout SOS était invisible dans les métriques.
 * Second effet : `critical` (file localStorage anti-perte) teste
 * `event.startsWith("sg_checkout")`, que `sg_sos_checkout_*` ne matche pas.
 *
 * Conséquence : `checkout.reached = 0` → impossible de mesurer le funnel de
 * paiement → aucune optimisation CRO prouvable (cf. business-backlog.json,
 * rank 1 : « SANS cette mesure, aucune décision CRO n'est prouvable »).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const app = fs.readFileSync(path.join(root, 'src', 'Sargasses_PROD.jsx'), 'utf8');
const sos = fs.readFileSync(path.join(root, 'src', 'SOSPlage.jsx'), 'utf8');

const allowlist = app.slice(
  app.indexOf('const SG_FUNNEL_EVENTS'),
  app.indexOf('export function track')
);
const criticalBlock = app.slice(
  app.indexOf('const critical='),
  app.indexOf('if(critical){')
);

// ── 1. Les événements de checkout doivent être dans l'allowlist Supabase ────
assert.ok(/"sg_checkout_started"/.test(allowlist),
  'sg_checkout_started (checkout on-site, PremiumModal) doit rester dans l allowlist');
assert.ok(/"sg_sos_checkout_start"/.test(allowlist),
  'sg_sos_checkout_start est EMIS par SOSPlage.jsx : il doit etre dans l allowlist, sinon invisible dans daily-metrics.json');
assert.ok(/"sg_sos_checkout_error"/.test(allowlist),
  'sg_sos_checkout_error est EMIS par SOSPlage.jsx : il doit etre dans l allowlist');

// ── 2. Le contrat d'émission doit exister côté composant de paiement ───────
assert.ok(/track\("sg_sos_checkout_start"/.test(sos),
  'SOSPlage.jsx doit emettre sg_sos_checkout_start au clic de paiement');
assert.ok(/track\("sg_sos_checkout_error"/.test(sos),
  'SOSPlage.jsx doit emettre sg_sos_checkout_error en cas d echec');

// ── 3. Les événements SOS doivent être « critical » (file anti-perte) ───────
assert.ok(/sg_sos_checkout/.test(criticalBlock),
  'les evenements sg_sos_checkout_* doivent etre `critical` : ils declenchent un paiement reel');
// `startsWith("sg_checkout")` ne matche PAS "sg_sos_checkout_*" — il faut la clause explicite.
assert.ok(/startsWith\("sg_sos_checkout"\)/.test(criticalBlock),
  'la clause `startsWith("sg_sos_checkout")` est requise (prefixe different de sg_checkout)');

// ── 4. Aucun autre parcours de paiement ne doit rester hors allowlist ───────
// Convention : tout composant qui appelle /api/mollie doit émettre un evenement
// de checkout present dans l allowlist (sinon paiement invisible en metrique).
const payComponents = ['src/SOSPlage.jsx', 'src/PremiumModal.jsx', 'src/PassOffer.jsx'];
const missing = [];
for (const f of payComponents) {
  const full = path.join(root, f);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  const callsMollie = /\/api\/mollie/.test(src);
  const emits = /track\(\s*["'][^"']*checkout[^"']*["']/.test(src);
  if (callsMollie && !emits) missing.push(f);
}
assert.deepStrictEqual(missing, [],
  'ces composants appellent un paiement sans emettre d evenement de checkout : ' + missing.join(', '));

console.log('OK Test 1: evenements de checkout SOS dans l allowlist Supabase');
console.log('OK Test 2: SOSPlage emet checkout start + error');
console.log('OK Test 3: evenements SOS marques critical (file anti-perte)');
console.log('OK Test 4: aucun composant de paiement sans evenement de checkout');
