#!/usr/bin/env node
'use strict';

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
 * Or le paiement SOS 1 € (src/SOSPlage.jsx) émettait `sg_sos_checkout_start`,
 * ABSENT de cette allowlist. L'événement partait en GA4/beacon mais JAMAIS
 * vers Supabase → le checkout SOS était invisible dans les métriques.
 * Second effet : `critical` (file localStorage anti-perte) teste
 * `event.startsWith("sg_checkout")`, que `sg_sos_checkout_*` ne matche pas.
 *
 * Conséquence : `checkout.reached = 0` → impossible de mesurer le funnel de
 * paiement → aucune optimisation CRO prouvable (cf. business-backlog.json,
 * rank 1 : « SANS cette mesure, aucune décision CRO n'est prouvable »).
 *
 * ⚠️ 2026-11-09 — Le parcours de paiement SOS 1 € a été RETIRÉ du client
 * (mission P0 « retrait SOS »). Le composant `src/SOSPlage.jsx` a donc été
 * supprimé : plus aucun événement `sg_sos_checkout_*` n'est émis, et ces
 * événements ne doivent PLUS figurer dans l'allowlist (sinon le funnel
 * Supabase comptabiliserait un parcours inexistant). Le contrat de mesure
 * reste inchangé pour le checkout on-site, qui est le seul parcours B2C.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const app = fs.readFileSync(path.join(root, 'src', 'Sargasses_PROD.jsx'), 'utf8');

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
assert.ok(/"sg_conversion"/.test(allowlist),
  'sg_conversion doit rester dans l allowlist (conversion payante)');
assert.ok(!/"sg_sos_checkout_start"/.test(allowlist),
  'sg_sos_checkout_start ne doit PLUS etre dans l allowlist (parcours SOS retire)');
assert.ok(!/"sg_sos_checkout_error"/.test(allowlist),
  'sg_sos_checkout_error ne doit PLUS etre dans l allowlist (parcours SOS retire)');

// ── 2. Le composant de paiement SOS a été supprimé ─────────────────────────
assert.ok(!fs.existsSync(path.join(root, 'src', 'SOSPlage.jsx')),
  'src/SOSPlage.jsx doit etre supprime (parcours de paiement SOS retire)');
assert.ok(!/SOSPlage/.test(app),
  'aucune reference a SOSPlage dans Sargasses_PROD.jsx');

// ── 3. Plus aucun evenement « critical » SOS ───────────────────────────────
assert.ok(!/sg_sos_checkout/.test(criticalBlock),
  'les evenements sg_sos_checkout_* ne doivent plus etre `critical` (parcours retire)');
assert.ok(!/startsWith\("sg_sos_checkout"\)/.test(criticalBlock),
  'la clause `startsWith("sg_sos_checkout")` doit avoir disparu');
assert.ok(/startsWith\("sg_checkout"\)/.test(criticalBlock),
  'le checkout on-site doit rester dans la file critique (anti-perte)');

// ── 4. Aucun autre parcours de paiement ne doit rester hors allowlist ───────
// Convention : tout composant qui appelle /api/mollie doit émettre un evenement
// de checkout present dans l allowlist (sinon paiement invisible en metrique).
// ⚠️ 2026-11-27 — CE CONTRAT ÉTAIT TROU : il cherchait le mot « checkout »
// dans le SEUL nom testé. `sg_pay_wallet_start` (PremiumModal : départ
// Apple/Google Pay) passait donc au travers : le nom ne contient pas
// « checkout », alors que c'est bien une intention de paiement. Depuis la
// même date, le contrat porte sur TOUT `sg_pay_*` émis par les composants de
// paiement, pas sur un seul nom : chaque événement doit être dans l allowlist.
const payComponents = ['src/PremiumModal.jsx', 'src/PassOffer.jsx'];
const allowlisted = new Set(
  (allowlist.match(/"sg_[a-z0-9_]+"/g) || []).map((s) => s.slice(1, -1))
);
const missing = [];
for (const f of payComponents) {
  const full = path.join(root, f);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  const callsMollie = /\/api\/mollie/.test(src);
  const emits = /track\(\s*["'][^"']*checkout[^"']*["']/.test(src);
  if (callsMollie && !emits) missing.push(f);

  // 4b. Tout evenement de paiement emis doit etre allowliste (mesure Supabase).
  const payEvents = [];
  const re = /track\(\s*["'](sg_pay_[a-z0-9_]+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) payEvents.push(m[1]);
  for (const evt of payEvents) {
    assert.ok(allowlisted.has(evt),
      `${f} emet \`${evt}\` (intention de paiement REELLE) mais cet evenement ` +
      `est absent de SG_FUNNEL_EVENTS : il part en GA4 et JAMAIS dans ` +
      `Supabase → cette etape du parcours de paiement est invisible en ` +
      `metrique. C'est exactement le defaut mesure du 2026-11-27 ` +
      `(10 pass_cta → checkout_started = 0, etonnements indiagnostiquables).`);
  }
  // Au moins un evenement de paiement doit etre mesure : sinon le contrat
  // passerait a vide sur un composant qui aurait tout perdu.
  if (callsMollie) {
    assert.ok(payEvents.length > 0,
      `${f} appelle un paiement mais n'emet plus AUCUN evenement sg_pay_* : ` +
      `plus aucune trace de l'intention de paiement en metrique`);
  }
}
assert.deepStrictEqual(missing, [],
  'ces composants appellent un paiement sans emettre d evenement de checkout : ' + missing.join(','));

// ── 5. La detection wallet ne doit JAMAIS servir de valeur de rendu ────────
// ⚠️ 2026-11-27 — DEFAUT LIVE MESURÉ : `walletAvail()` renvoie `check()`,
// une fonction `async` → une PROMISE. L'ancien code faisait, dans le rendu :
//     const w = walletAvail()
//     if (!w.apple && !w.google) return null   // w est une Promise
// Une Promise n'a ni `.apple` ni `.google` → tout le bloc express (Apple Pay /
// Google Pay) etait silencieusement SUPPRIME au premier rendu, et rien ne le
// réaffichait (le seul autre appelant etait une prop morte, et la frappe dans
// le champ email ne provoque aucun re-render). Le chemin de paiement le plus
// court n'etait donc PAS GARANTI d'etre offert. Correctif : la detection est
// resolue en state par un effet. Ce contrat interdit la regression.
const modal = fs.readFileSync(path.join(root, 'src', 'PremiumModal.jsx'), 'utf8');
const renderUses = modal.match(/^\s*(?:const|let)\s+w\s*=\s*walletAvail\(\)/gm) || [];
assert.deepStrictEqual(renderUses, [],
  '`const w = walletAvail()` dans PremiumModal : c est une PROMISE, pas un ' +
  'objet {apple,google}. Les boutons wallet sont alors silencieusement ' +
  'supprimes au premier rendu (aucun .apple/.google sur une Promise). ' +
  'La detection doit etre resolue en state via un effet.');
assert.ok(/\buseState\(null\)\s*\/\/|useState\(null\)/.test(modal) || /setWallet\(/.test(modal),
  'la detection wallet doit desormais passer par un state (setWallet) — ' +
  'sinon le vrai defaut du 2026-11-27 peut revenir par une autre voie');
assert.ok(/await\s+Promise\.resolve\(walletAvail\(\)\)/.test(modal),
  'la resolution de la detection wallet doit attendre la promesse ' +
  '(`await Promise.resolve(walletAvail())`) — sans ce await, le state ' +
  'recevrait une Promise et le defaut serait identique');

// ── 7. Les deux moitiés du correctif doivent rester synchronisées ───────────
// ⚠️ 2026-11-27 — Un demi-correctif est PIRE que pas de correctif : si
// l'allowlist front contient `sg_pay_wallet_start` mais que FUNNEL_KEYS
// (scripts/automation/funnel-from-supabase.cjs) ne contient pas
// `pay_wallet_start`, l'événement arrive dans Supabase et n'est JAMAIS compté
// dans funnel-snapshot.json — la seule source de funnel vivante. Le trou de
// mesure serait donc rouvert, silencieusement, dans le sens inverse.
// Ce contrat verrouille les 7 étapes du chemin de paiement dans les DEUX listes.
const aggregator = fs.readFileSync(
  path.join(root, 'scripts', 'automation', 'funnel-from-supabase.cjs'), 'utf8');
// Extraction tolérante : les clés sont sur des lignes partielles (plusieurs clés
// par ligne), jamais sur les lignes de commentaire `//`.
const keysBlock = aggregator.slice(
  aggregator.indexOf('const FUNNEL_KEYS'),
  aggregator.indexOf('async function fetchAll'));
const aggregatorKeys = new Set(
  (keysBlock.match(/'([a-z0-9_]+)'/g) || []).map((s) => s.slice(1, -1))
);
for (const step of ['pay_wallet_start', 'pay_email_captured', 'pay_onsite_open',
  'pay_onsite_back', 'pay_onsite_3ds', 'pay_onsite_error', 'pay_onsite_fail']) {
  assert.ok(allowlisted.has('sg_' + step),
    `\`sg_${step}\` est emis par PremiumModal mais absent de SG_FUNNEL_EVENTS ` +
    `(moitie front du correctif manquante)`);
  assert.ok(aggregatorKeys.has(step),
    `\`${step}\` est allowliste cote front mais absent de FUNNEL_KEYS ` +
    `(scripts/automation/funnel-from-supabase.cjs) : l evenement arrive dans ` +
    `Supabase et n est JAMAIS compte dans funnel-snapshot.json — demi-correctif, ` +
    `trou de mesure rouvert dans l autre sens`);
}

console.log('OK Test 1: evenements de checkout on-site dans l allowlist Supabase, aucun evenement SOS residuel');
console.log('OK Test 2: le composant de paiement SOS a ete supprime');
console.log('OK Test 3: plus aucun evenement SOS dans la file critique');
console.log('OK Test 4: aucun composant de paiement sans evenement de checkout');
console.log('OK Test 5: tout sg_pay_* emis est allowliste (trou de mesure du 2026-11-27 ferme)');
console.log('OK Test 6: walletAvail() interdit comme valeur de rendu (promesse)');
console.log('OK Test 7: allowlist front et FUNNEL_KEYS synchronises (pas de demi-correctif)');
