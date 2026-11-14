#!/usr/bin/env node
'use strict'

/**
 * b2b-conversion-instrumentation.test.cjs
 *
 * Le funnel B2B était STRUCTURELLEMENT impossible à mesurer. Trois ruptures
 * indépendantes, chacune vérifiée ici :
 *
 *  1. L'ÉCRITURE n'existait pas. `docs/B2B_DELIVERABILITY.md` annonçait
 *     `b2b_trial_to_paid` comme « émis par mollie-webhook.php à chaque paiement
 *     Pro » ; AUCUN appelant ne l'émettait. Le taux essai→payé était donc 0
 *     PAR CONSTRUCTION (la fonction de lecture existait, l'événement non).
 *
 *  2. La LECTURE n'était jamais exécutée.
 *     `scripts/automation/funnel-b2b-from-supabase.cjs` existe depuis
 *     2026-07-02 mais n'était appelé par AUCUN workflow : son instantané
 *     `funnel-b2b-snapshot.json` n'a jamais existé.
 *
 *  3. Les REJETS étaient MUETS. Une signature Mollie valide était refusée par
 *     la validation → HTTP 400 → aucun accès servi, aucune trace. L'argent
 *     encaissé sans service était un trou invisible.
 *
 * Ce test verrouille : les contrats statiques (toujours exécutés en CI, y
 * compris sans PHP) ET le comportement réel (exécution PHP réelle quand un
 * interpréteur est disponible).
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const lib = read('public/api/mollie-lib.php')
const hook = read('public/api/mollie-webhook.php')
const reader = read('scripts/automation/funnel-b2b-from-supabase.cjs')
const workflow = read('.github/workflows/daily-copernicus.yml').replace(/\r\n/g, '\n')
const deliverability = read('docs/B2B_DELIVERABILITY.md')
const paylinksScript = read('scripts/automation/mollie-paylinks.cjs')

let failures = 0
function check(ok, label) {
  if (ok) console.log('  ok  ' + label)
  else { failures++; console.error('  FAIL ' + label) }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONTRATS STATIQUES — l'instrumentation existe et reste INERTE
// ─────────────────────────────────────────────────────────────────────────────
console.log('1. Écriture de l\'événement de conversion (`b2b_trial_to_paid`)')

check(/function\s+sg_b2b_emit_conversion\s*\(/.test(lib),
  'sg_b2b_emit_conversion() est DÉFINIE dans public/api/mollie-lib.php')
check(/sg_emit_once\([^,]+,\s*'b2b_trial_to_paid'/.test(lib),
  'l\'événement émis est bien `b2b_trial_to_paid`')
check(/function\s+sg_emit_once\s*\(/.test(lib),
  'sg_emit_once() (déduplonnage) est DÉFINIE')
check(/get_transient|file_exists\(\$file\)/.test(lib.slice(lib.indexOf('function sg_emit_once'), lib.indexOf('function sg_emit_once') + 1400)),
  'sg_emit_once() déduplonne (un rejeu de webhook ne recompte pas)')

// Inertie : la télémétrie ne doit NI toucher les tables de paiement,
// NI envoyer d'email, NI lever d'exception (un throw transformerait un 200
// en 500 — c'est le seul vrai risque dans un webhook).
const emitOnce = lib.slice(lib.indexOf('function sg_emit_once'), lib.indexOf('function sg_b2b_emit_conversion'))
check(/try\s*{/.test(emitOnce) && /catch\s*\(Throwable/.test(emitOnce),
  'sg_emit_once() est encapsulé dans try/catch (ne peut pas faire échouer le webhook)')
check(!/mol_supabase_mirror|grant_once|grant_once\(/.test(emitOnce),
  'sg_emit_once() n\'écrit dans AUCUNE table de paiement (payment_grants, etc.)')
check(!/resend|mail|smtp|sendmail|nodemailer/i.test(emitOnce),
  'sg_emit_once() n\'envoie aucun email')
check(!/Refund|refund|create_payment|charges/i.test(emitOnce),
  'sg_emit_once() ne déclenche ni remboursement ni débit')

console.log('\n2. Points d\'émission : les deux encaissements B2B')
check(/sg_b2b_emit_conversion\(\$id, 'pro_annual', 'annual'\)/.test(hook),
  'l\'annuel émet la conversion (déduplonnée par identifiant de paiement)')
check(/sg_b2b_emit_conversion\(\$subscription->id, \$planKey, 'monthly'\)/.test(hook),
  'le mensuel émet la conversion (déduplonnée par identifiant d\'abonnement)')
check(/in_array\(\$source, \['b2b_annual'\], true\)/.test(hook) &&
      /mol_paylink_classify/.test(hook) &&
      /\$isApprovedAnnual\s*&&\s*!\$pass/.test(hook) &&
      /in_array\(\$planKey, \['pro_monthly', 'brief_monthly'\], true\)/.test(hook),
  'les deux plans B2B payables sont couverts')

// L'émission doit avoir lieu AVANT le contrôle du mirror : sinon un mirror
// en échec empêcherait l'événement, et le client ayant PAYÉ, la conversion
// serait perdue — c'est exactement le bug historique (6/6 `paid_no_grant`).
const annualIdx = hook.indexOf("sg_b2b_emit_conversion($id, 'pro_annual', 'annual')")
const annualMirrorIdx = hook.indexOf('$mirrorOk = $grant[\'mirror_ok\'] ?? false;', annualIdx)
check(annualIdx > 0 && annualMirrorIdx > annualIdx,
  'l\'annuel émet AVANT le contrôle du mirror (la conversion survit à un mirror en échec)')

const monthlyIdx = hook.indexOf('sg_b2b_emit_conversion($subscription->id, $planKey, \'monthly\')')
const monthlyMirrorIdx = hook.indexOf('$mirrorOk = $grant[\'mirror_ok\'] ?? false;', monthlyIdx)
check(monthlyIdx > 0 && monthlyMirrorIdx > monthlyIdx,
  'le mensuel émet AVANT le contrôle du mirror')

// Le code HTTP du refus doit rester 400 : on INSTRUMENTE, on ne délivre pas.
const rejectedIdx = hook.indexOf('sg_payment_rejected($id,')
check(rejectedIdx > 0, 'le webhook émet `payment_rejected` quand la validation refuse')
const afterRejected = hook.slice(rejectedIdx, rejectedIdx + 700)
check(/http_response_code\(400\)/.test(afterRejected),
  'le refus reste un HTTP 400 (la télémétrie ne change pas la réponse)')
check(!/grant_once|grant_once\(/.test(afterRejected),
  'le bloc de refus n\'accorde AUCUN accès')

console.log('\n3. Rejets rendus visibles (le trou de fulfillment)')
check(/function\s+sg_payment_rejected\s*\(/.test(lib),
  'sg_payment_rejected() est DÉFINIE')
check(/'payment_rejected'/.test(lib),
  'l\'événement émis est bien `payment_rejected`')
check(/function\s+mol_paylink_grid\s*\(/.test(lib),
  'la grille des liens de paiement est DÉFINIE')
check(/function\s+mol_paylink_classify\s*\(/.test(lib),
  'la classification (montant, devise) est DÉFINIE')
check(/function\s+mol_payment_amount\s*\(/.test(lib),
  'mol_payment_amount() lit le montant quelle que soit sa forme')

console.log('\n4. Lecture : le lecteur est-il EXÉCUTÉ ?')
check(/'b2b_trial_to_paid'/.test(reader) && /'payment_rejected'/.test(reader),
  'le lecteur lit les deux événements')
check(/rejected_by_tier/.test(reader) && /rejected_examples/.test(reader),
  'le lecteur agrège les paiements refusés par palier')
// Aucun identifiant de paiement ni email ne doit fuiter dans l'instantané.
check(!/\bemail\s*[:=]/.test(reader.slice(reader.indexOf('function compute'), reader.indexOf('async function main'))),
  'l\'agrégat ne contient AUCUN champ email')

check(/funnel-b2b-from-supabase\.cjs/.test(workflow),
  'le workflow EXÉCUTE le lecteur du funnel B2B')
// Le lecteur doit vivre dans un job NON conditionné par la fraîcheur satellite
// (sinon il se fige quand la donnée est périmée — le bug corrigé par #1271).
const rmStart = workflow.indexOf('  revenue-metrics:\n')
const rmTail = rmStart > 0 ? workflow.slice(rmStart + 1) : ''
const rmEnd = rmTail.slice(1).search(/^  [a-zA-Z0-9_-]+:[ \t]*$/m)
const rmJob = rmEnd < 0 ? rmTail : rmTail.slice(0, rmEnd + 1)
check(rmJob.includes('funnel-b2b-from-supabase.cjs'),
  'le lecteur est dans le job `revenue-metrics`')
check(!/^\s*needs:/m.test(rmJob),
  'le job `revenue-metrics` reste AUTONOME (aucune dépendance satellite)')
check(!/resend|nodemailer|sendMail/i.test(rmJob),
  'le job de mesure n\'envoie aucun email')
check(/funnel-b2b-snapshot\.json/.test(rmJob),
  'l\'instantané du funnel B2B est commité par le job de mesure')

console.log('\n5. Cohérence du nom d\'événement (écriture ↔ lecture)')
// Les événements sont émis via sg_emit_once('<clé>', '<événement>', …).
const emitted = [...lib.matchAll(/sg_emit_once\([^\n]*?,\s*'([a-z0-9_]+)'/g)].map((m) => m[1])
const trial = read('public/api/b2b-trial.php')
const readKeys = (reader.match(/const B2B_KEYS = \[([^\]]+)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
check(emitted.includes('b2b_trial_to_paid'),
  '`b2b_trial_to_paid` est émis par le code PHP')
check(emitted.includes('payment_rejected'),
  '`payment_rejected` est émis par le code PHP')
check(/sg_analytics_event\('b2b_trial_started'/.test(trial),
  '`b2b_trial_started` est émis par b2b-trial.php')
// `b2b_widget_activated` n'est volontairement PAS émis (le widget est une
// iframe même-origine : l'hôte de l'hôtel n'est pas visible côté serveur).
// La limitation doit rester DOCUMENTÉE, pas devenir une surprise.
check(readKeys.includes('b2b_widget_activated'),
  'le lecteur attend `b2b_widget_activated`')
check(/b2b_widget_activated n'est PAS encore émis/.test(reader),
  'la limitation `b2b_widget_activated` reste documentée dans le lecteur')
check(readKeys.every((k) =>
  k === 'b2b_widget_activated' || emitted.includes(k) || /b2b_trial_started/.test(trial)),
  'tout événement lu est bien écrit quelque part (sauf la limitation documentée)')

console.log('\n6. Documentation : les promesses doivent correspondre au code')
check(/b2b_trial_to_paid/.test(deliverability),
  'la doc de livrabilité mentionne l\'événement de conversion')
check(/émis par `mollie-webhook\.php`/.test(deliverability) &&
      /RESTAURÉ/.test(deliverability),
  'la doc indique explicitement que l\'émission a été restaurée (et depuis quand)')

// ─────────────────────────────────────────────────────────────────────────────
// 7. EXÉCUTION PHP RÉELLE — le comportement, pas la promesse
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n7. Exécution PHP réelle')

function phpBin() {
  for (const bin of ['php', 'php.exe']) {
    try {
      execFileSync(bin, ['-v'], { stdio: 'ignore' })
      return bin
    } catch (_) { /* on continue */ }
  }
  return null
}

const php = phpBin()
if (!php) {
  console.log('  --  PHP indisponible : les contrôles 1 à 6 (statiques) restent valides.')
  console.log('  --  Les contrôles 7 à 10 (exécution réelle) sont SAUTÉS, pas « réussis ».')
} else {
  const harness = path.join(ROOT, 'tests', 'fixtures', 'b2b-payment-harness.php')
  const convId = 'sgtest_' + Math.random().toString(36).slice(2, 14)
  // ⚠️ On DÉSACTIVE les fonctions curl natives (`disable_functions`) pour que le
  // harness installe TOUJOURS ses stubs de capture. Sans cela, sur une machine
  // où ext-curl est présent (CI Linux), `function_exists('curl_init')` est vrai,
  // les stubs ne sont pas installés, et les appels HTTP partent réellement vers
  // Supabase : le tableau de capture reste vide et le test échoue pour une
  // raison qui n'a rien à voir avec le code testé.
  const DISABLE_CURL = [
    'curl_init', 'curl_setopt', 'curl_setopt_array', 'curl_exec', 'curl_close',
    'curl_getinfo', 'curl_errno', 'curl_error', 'curl_reset', 'curl_version',
  ].join(',')
  // Deux stratégies pour garantir l'installation des stubs, dans cet ordre :
  //  1. `-d disable_functions=…` : la fonction native devient **redéfinissable**
  //     par l'utilisateur (vérifié : sans le flag, PHP lève « Cannot redeclare
  //     function » ; avec le flag, le stub gagne).
  //  2. `-n` (aucun php.ini) : repli si l'INI n'est pas applicable.
  // Si aucune ne fonctionne, le test **ÉCHOUE** : mieux vaut un rouge honnête
  // qu'un test qui « passe » sans jamais avoir capturé une écriture.
  const strategies = [
    ['-d', 'disable_functions=' + DISABLE_CURL],
    ['-n'],
  ]
  const spawnHarness = (args, id) => {
    const out = execFileSync(php, args.concat([harness]), {
      encoding: 'utf8',
      env: Object.assign({}, process.env, { SG_CONV_ID: id }),
      maxBuffer: 1024 * 1024 * 16,
    })
    return JSON.parse(out)
  }
  let runHarness = (id) => spawnHarness([], id)
  let r1 = null
  for (const args of strategies) {
    let res = null
    try { res = spawnHarness(args, convId) } catch (_) { res = null }
    if (res && res.stubbed === true) {
      runHarness = (id) => spawnHarness(args, id)
      r1 = res
      break
    }
  }
  check(r1 !== null,
    'le harness a bien installé ses stubs curl (capture réelle des écritures)')
  if (!r1) {
    console.log('  --  Capture indisponible : les assertions de comptage d\'événements')
    console.log('  --  sont SAUTÉES (jamais « réussies » par défaut).')
  }
  if (r1) {
    check(r1.s1.function_exists === true,
      'le helper de conversion existe à l\'exécution')

    check(r1.s1.events.length === 2,
      `3 appels → 2 événements émis (le même encaissement compté UNE fois) [obtenu: ${r1.s1.events.length}]`)

    const bodies = r1.s1.events.map((e) => { try { return JSON.parse(e.body) } catch (_) { return null } })
    check(bodies.length > 0 && bodies.every((b) => b && b.event === 'b2b_trial_to_paid'),
      'les événements portent bien le nom `b2b_trial_to_paid`')
    check(bodies.length > 0 && bodies.every((b) => b.params && b.params.plan && b.params.kind),
      'les paramètres portent le palier et la nature (mensuel/annuel)')
    check(bodies.length > 0 && bodies.every((b) => !JSON.stringify(b).toLowerCase().includes('@')),
      'AUCUN email dans les paramètres (pas de PII)')
    check(r1.s1.events.length > 0 && r1.s1.events.every((e) => /rest\/v1\/analytics_events/.test(e.url)),
      'l\'écriture cible bien la table `analytics_events`')

    // Idempotence INTER-processus : un rejeu de webhook est une nouvelle requête
    // HTTP, donc un nouveau processus PHP → le fichier de dédoublonnage doit
    // tenir entre les deux.
    const r2 = runHarness(convId)
    const bodies2 = r2.s1.events.map((e) => { try { return JSON.parse(e.body) } catch (_) { return null } })
    const recompte = bodies2.filter((b) => b && b.params && b.params.plan === 'pro_monthly').length
    check(recompte === 0,
      `un rejeu dans un NOUVEAU processus ne recompte pas l'encaissement [recompté: ${recompte}]`)
  }

  // ── Le trou de fulfillment, prouvé sur le CODE LIVRÉ ──────────────────────
  console.log('\n8. Preuve exécutée du refus de paiement (code livré)')
  const r2 = runHarness(convId)
  check(r2.s2.available === true,
    'validateMollieAmountPHP() a pu être extraite et exécutée')
  const s2 = r2.s2.cases
  // ⚠️ CORRECTIF P0 2026-11-09 — le montant se lit désormais CORRECTEMENT.
  // AVANT : le runtime renvoie `amount` en TABLEAU → `$payment->amount->currency`
  // valait null → le montant était lu à 0 → TOUT pass B2C payé était refusé
  // (`amount_mismatch`) → argent encaissé, accès jamais délivré. Le test
  // verrouillait ce bug comme un comportement « attendu ».
  // MAINTENANT : un pass B2C payé au bon montant est ACCEPTÉ, et un montant
  // faux est toujours refusé (anti-tampering intact).
  check(s2.b2c_p30_eur.ok === true,
    'un paiement B2C p30 à 14,99 € est ACCEPTÉ (montant lisible)')
  check(s2.b2c_p30_eur.pass === 'p30' && s2.b2c_p30_eur.currency === 'EUR',
    'le pass et la devise sont correctement lus')
  check(s2.b2c_p30_eur_wrong_amount.ok === false &&
    s2.b2c_p30_eur_wrong_amount.error === 'amount_mismatch',
    'un paiement B2C p30 à 1,00 € reste REFUSÉ (anti-tampering)')
  check(s2.b2b_monthly_79.ok === false,
    'un paiement B2B mensuel à 79 € est REFUSÉ (aucun `pass` dans le metadata)')
  check(s2.b2b_annual_paylink_690.ok === false,
    'un paiement B2B annuel (paylink 690 €) est REFUSÉ (aucun metadata possible)')
  check(s2.b2c_paylink_season_1999.ok === false,
    'un paiement B2C par paylink (19,99 €) est REFUSÉ (aucun metadata possible)')

  // ── La classification des paylinks ────────────────────────────────────────
  console.log('\n9. Classification des paylinks (montant + devise)')
  check(r2.s3.available === true, 'la classification est disponible à l\'exécution')
  const s3 = r2.s3.cases
  check(s3.pro_annual_690 && s3.pro_annual_690.tier === 'pro_annual',
    '690 € → pro_annual')
  check(s3.brief_annual_290 && s3.brief_annual_290.tier === 'brief_annual',
    '290 € → brief_annual')
  check(s3.territory_annual_1990 && s3.territory_annual_1990.tier === 'territory_annual',
    '1 990 € → territory_annual')
  check(s3.montant_inconnu === null,
    'un montant hors grille n\'est PAS attribué à un palier')

  // ── Parité de la grille PHP ↔ la grille JS qui crée les liens ─────────────
  console.log('\n10. Parité de la grille PHP ↔ scripts/automation/mollie-paylinks.cjs')
  const jsTiers = {}
  const re = /\{\s*id:\s*'([a-z_]+)',\s*value:\s*'([0-9.]+)',\s*currency:\s*'([A-Z]{3})'/g
  let m
  while ((m = re.exec(paylinksScript)) !== null) jsTiers[m[1]] = { value: m[2], currency: m[3] }
  const phpGrid = r2.s4.available ? r2.s4.grid : {}
  const jsIds = Object.keys(jsTiers).sort()
  const phpIds = Object.keys(phpGrid).sort()
  check(jsIds.length > 0, `la grille JS a été lue (${jsIds.length} paliers)`)
  check(JSON.stringify(jsIds) === JSON.stringify(phpIds),
    `les deux grilles ont les MÊMES paliers [JS: ${jsIds.join(',')}]`)
  let mismatch = null
  for (const id of jsIds) {
    if (!phpGrid[id]) continue
    if (phpGrid[id].value !== jsTiers[id].value || phpGrid[id].currency !== jsTiers[id].currency) {
      mismatch = `${id}: JS ${jsTiers[id].value} ${jsTiers[id].currency} vs PHP ${phpGrid[id].value} ${phpGrid[id].currency}`
      break
    }
  }
  check(mismatch === null,
    `les montants et devises de la grille PHP correspondent à la grille JS${mismatch ? ' — ÉCART: ' + mismatch : ''}`)
}

console.log('\nB2B_CONVERSION_INSTRUMENTATION_TESTS', failures === 0 ? 'PASS' : 'FAIL')
process.exit(failures ? 1 : 0)
