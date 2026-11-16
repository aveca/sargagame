<?php
/**
 * tests/unit/b2b-grant-renewal.test.php
 *
 * Test FONCTIONNEL (pas une assertion de chaînes) du cycle de vie du grant Pro B2B.
 *
 * Scénario temps réel simulé (jour 0 → jour 31 → rejeu) :
 *   1. premier grant mensuel (subscription.created) -> 30j, granted=true
 *   2. rejeu strict (subscription.updated)          -> aucune fenêtre déplacée
 *   3. 1er encaissement (subscription.paid) le MÊME JOUR -> PAS de double fenêtre
 *      (anti-empilement : created + paid = 1 seul paiement = 1 seule fenêtre 30j)
 *   4. renouvellement réel au jour 31 (fenêtre épuisée) -> fenêtre prolongée de 30j
 *   5. rejeu du renouvellement le même jour          -> AUCUNE double fenêtre
 *   6. one-shot annuel : le rejeu n'étend PAS l'accès
 *   7. invariants financiers : allowlist serveur des plans, pas de grant sur 'pending'
 *
 * SÉCURITÉ DU TEST :
 *   - SG_TEST_NO_SUPABASE désactive toute écriture réseau vers Supabase
 *     (aucune ligne de test n'est écrite dans la table de production).
 *   - les transients sont ceux de mollie-lib.php (store fichier) ; ce test ne
 *     les redéfinit pas (redeclaration fatale sinon) et nettoie ses fichiers.
 *
 * Lancement : php tests/unit/b2b-grant-renewal.test.php
 */

declare(strict_types=1);

// Interrupteur de test : AUCUNE écriture Supabase (production intacte).
define('SG_TEST_NO_SUPABASE', true);

$failures = 0;
$checks = 0;

function check(string $name, bool $cond, string $detail = ''): void {
    global $failures, $checks;
    $checks++;
    if ($cond) {
        echo "  OK   $name\n";
    } else {
        $failures++;
        echo "  FAIL $name" . ($detail !== '' ? " -- $detail" : '') . "\n";
    }
}

require __DIR__ . '/../../public/api/mollie-lib.php';

echo "=== B2B grant — cycle de vie, renouvellement et invariants financiers ===\n";

$subId = 'sub_test_' . bin2hex(random_bytes(4));
$email = 'hotel-test@example.invalid';
$customer = 'cst_test_' . bin2hex(random_bytes(4));
$annualId = 'pay_test_' . bin2hex(random_bytes(4));
$now = time();

$cleanup = function (string $key): void {
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    if (file_exists($file)) @unlink($file);
};

/**
 * Simule le jour du renouvellement (jour 30) : la fenêtre d'accès est épuisée
 * (token réémis avec un `exp` dans le passé) MAIS le transient est encore
 * vivant (TTL = durée + 1 jour) → c'est le chemin "prolongation".
 */
$simulateExpiredWindow = function (string $subscriptionId, string $planKey, string $customerId, int $daysAgo = 1): void {
    $oldExp = time() - ($daysAgo * 86400);
    $token = sg_widget_sign([
        'plan' => $planKey,
        'customer_id' => $customerId,
        'subscription_id' => $subscriptionId,
        'exp' => $oldExp,
        'granted_at' => date('c', $oldExp - (30 * 86400)),
        'type' => 'b2b_pro',
    ]);
    $key = 'mollie_grant_' . $subscriptionId;
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    // transient encore valide (comme au jour 30), mais fenêtre d'accès épuisée
    file_put_contents($file, json_encode(['value' => $token, 'expires' => time() + 3600]), LOCK_EX);
};

// --- 1. Premier grant mensuel (subscription.created) ------------------------
$g1 = mol_b2b_grant_once($customer, 'pro_monthly', $subId, null, $email);
check('1.1 premier grant : granted=true', ($g1['granted'] ?? false) === true);
check('1.2 premier grant : duree 30j', isset($g1['expires_at']) && (int)$g1['expires_at'] >= $now + 29 * 86400, 'expires_at=' . ($g1['expires_at'] ?? 'n/a'));
check('1.3 premier grant : token present', !empty($g1['token']));
$exp1 = (int)($g1['expires_at'] ?? 0);

// --- 2. Rejeu strict (subscription.updated) ---------------------------------
$g2 = mol_b2b_grant_once($customer, 'pro_monthly', $subId, null, $email);
check('2.1 rejeu : granted=false', ($g2['granted'] ?? true) === false);
check('2.2 rejeu : reason=already_granted', ($g2['reason'] ?? '') === 'already_granted');
check('2.3 rejeu : expiration INCHANGEE (pas de prolongation)', (int)($g2['expires_at'] ?? 0) === $exp1, 'exp=' . ($g2['expires_at'] ?? 'n/a') . ' attendu=' . $exp1);
check('2.4 rejeu : mirror_ok expose (diagnostic)', array_key_exists('mirror_ok', $g2));

// --- 3. 1er encaissement le MÊME JOUR (subscription.paid + created) ---------
$g3same = mol_b2b_grant_once($customer, 'pro_monthly', $subId, null, $email, true);
check('3.1 1er encaissement meme jour : PAS de double fenetre', (int)($g3same['expires_at'] ?? 0) === $exp1, 'exp=' . ($g3same['expires_at'] ?? 'n/a') . ' attendu=' . $exp1);
check('3.2 1er encaissement meme jour : renewed=false', ($g3same['renewed'] ?? true) === false);
check('3.3 1er encaissement meme jour : pas de 60j pour un seul paiement', (int)($g3same['expires_at'] ?? 0) <= $now + 31 * 86400, 'exp=' . ($g3same['expires_at'] ?? 'n/a'));

// --- 4. Renouvellement réel (jour 31, fenêtre épuisée) ---------------------
$simulateExpiredWindow($subId, 'pro_monthly', $customer, 1);
$g4 = mol_b2b_grant_once($customer, 'pro_monthly', $subId, null, $email, true);
check('4.1 renouvellement reel : granted=true', ($g4['granted'] ?? false) === true);
check('4.2 renouvellement reel : renewed=true', ($g4['renewed'] ?? false) === true);
check('4.3 renouvellement reel : NOUVELLE fenetre de 30j', (int)($g4['expires_at'] ?? 0) >= $now + 29 * 86400, 'exp=' . ($g4['expires_at'] ?? 'n/a'));
check('4.4 renouvellement reel : pas d\'empilement (max 31j)', (int)($g4['expires_at'] ?? 0) <= $now + 31 * 86400, 'exp=' . ($g4['expires_at'] ?? 'n/a'));
$exp4 = (int)($g4['expires_at'] ?? 0);

// --- 4b. Renouvellement tardif : transient disparu (jour 31+) --------------
// Le serveur a redémarré / /tmp purgé : le grant repart de zéro, mais le
// client a payé => il doit obtenir une fenêtre complète de 30j.
$cleanup('mollie_grant_' . $subId);
$g4b = mol_b2b_grant_once($customer, 'pro_monthly', $subId, null, $email, true);
check('4b.1 renouvellement tardif : granted=true', ($g4b['granted'] ?? false) === true);
check('4b.2 renouvellement tardif : fenetre complete 30j', (int)($g4b['expires_at'] ?? 0) >= $now + 29 * 86400, 'exp=' . ($g4b['expires_at'] ?? 'n/a'));
check('4b.3 renouvellement tardif : pas d\'empilement (max 31j)', (int)($g4b['expires_at'] ?? 0) <= $now + 31 * 86400, 'exp=' . ($g4b['expires_at'] ?? 'n/a'));

// --- 5. Rejeu du renouvellement le même jour -------------------------------
$g5 = mol_b2b_grant_once($customer, 'pro_monthly', $subId, null, $email, true);
check('5.1 rejeu renouvellement : expiration INCHANGEE (pas de double fenetre)', (int)($g5['expires_at'] ?? 0) === $exp4, 'exp=' . ($g5['expires_at'] ?? 'n/a') . ' attendu=' . $exp4);
check('5.2 rejeu renouvellement : renewed=false', ($g5['renewed'] ?? true) === false);

// --- 6. One-shot annuel : le rejeu n'etend PAS l'acces ----------------------
$a1 = mol_b2b_grant_once($email, 'pro_annual', $annualId, 365, $email);
check('6.1 annuel : granted=true', ($a1['granted'] ?? false) === true);
$expA = (int)($a1['expires_at'] ?? 0);
check('6.2 annuel : duree 365j', $expA >= $now + 364 * 86400);
$a2 = mol_b2b_grant_once($email, 'pro_annual', $annualId, 365, $email);
check('6.3 annuel : rejeu n\'etend PAS l\'acces', (int)($a2['expires_at'] ?? 0) === $expA, 'exp=' . ($a2['expires_at'] ?? 'n/a') . ' attendu=' . $expA);

// --- 7. Invariant financier : allowlist serveur des montants ---------------
$ok79 = mol_b2b_validate_plan_amount('pro_monthly', 'EUR', 79.00);
check('7.1 montant attendu accepte : pro_monthly 79 EUR', ($ok79['ok'] ?? false) === true);
$ok690 = mol_b2b_validate_plan_amount('pro_annual', 'EUR', 690.00);
check('7.2 montant attendu accepte : pro_annual 690 EUR', ($ok690['ok'] ?? false) === true);
$bad1 = mol_b2b_validate_plan_amount('pro_monthly', 'EUR', 1.00);
check('7.3 montant 1,00 EUR REFUSE pour un plan Pro (confusion pass sos)', ($bad1['ok'] ?? true) === false, 'erreur=' . ($bad1['error'] ?? 'n/a'));
$badCur = mol_b2b_validate_plan_amount('pro_monthly', 'USD', 79.00);
check('7.4 devise USD REFUSE pour un plan EUR', ($badCur['ok'] ?? true) === false, 'erreur=' . ($badCur['error'] ?? 'n/a'));
$badPlan = mol_b2b_validate_plan_amount('plan_inconnu', 'EUR', 79.00);
check('7.5 plan inconnu REFUSE', ($badPlan['ok'] ?? true) === false, 'erreur=' . ($badPlan['error'] ?? 'n/a'));
$byAmt = mol_b2b_plan_by_amount('EUR', 690.00);
check('7.6 plan retrouve par montant (lien annuel sans metadata) = pro_annual', ($byAmt['plan'] ?? '') === 'pro_annual', 'plan=' . ($byAmt['plan'] ?? 'n/a'));
$byAmtBad = mol_b2b_plan_by_amount('EUR', 1.00);
check('7.7 montant 1,00 EUR absent de l\'allowlist des plans B2B', ($byAmtBad['ok'] ?? true) === false);

// --- 8. Durées dérivées du plan (source unique) ----------------------------
check('8.1 durée pro_monthly = 30j', mol_b2b_plan_duration_days('pro_monthly') === 30);
check('8.2 durée pro_annual = 365j', mol_b2b_plan_duration_days('pro_annual') === 365);

// --- 9. Mirror : upsert (pas de 409 au rejeu) + repli sans curl --------------
$src = (string)@file_get_contents(__DIR__ . '/../../public/api/mollie-lib.php');
check('9.1 mirror : on_conflict subscription_id', strpos($src, "'subscription_id'") !== false && strpos($src, 'on_conflict=') !== false);
check('9.2 mirror : resolution=merge-duplicates', strpos($src, 'resolution=merge-duplicates') !== false);
check('9.3 mirror : garde function_exists(curl_init)', strpos($src, "function_exists('curl_init')") !== false);
check('9.4 mirror : repli flux natif present', strpos($src, 'stream_context_create') !== false);

// --- 10. Webhook : invariants de confirmation -------------------------------
$w = (string)@file_get_contents(__DIR__ . '/../../public/api/mollie-webhook.php');
$posCreated = strpos($w, "if (in_array(\$event, ['subscription.created'");
$posPaid = strpos($w, "if (\$event === 'subscription.paid')");
$posChargeFailed = strpos($w, "if (\$event === 'subscription.charge_failed')");
check('10.1 webhook : bloc subscription.paid present', $posPaid !== false);
check('10.2 webhook : bloc created present', $posCreated !== false);
if ($posCreated !== false && $posPaid !== false && $posPaid > $posCreated) {
    $createdBlock = substr($w, $posCreated, $posPaid - $posCreated);
    check('10.3 webhook : created/updated reste idempotent (pas de true)', strpos($createdBlock, '$customerEmail, true)') === false);
    $paidBlock = substr($w, $posPaid, ($posChargeFailed !== false ? $posChargeFailed : strlen($w)) - $posPaid);
    check('10.4 webhook : subscription.paid utilise renewable=true', strpos($paidBlock, '$customerEmail, true)') !== false);
}
check('10.5 webhook : plus aucun grant sur statut pending', strpos($w, "'active', 'pending'") === false && strpos($w, "'pending', 'active'") === false);
check('10.6 webhook : validation montant sur abonnement', strpos($w, 'mol_b2b_validate_plan_amount') !== false);
check('10.7 webhook : allowlist des 4 plans B2B', strpos($w, "['pro_monthly', 'brief_monthly', 'pro_annual', 'brief_annual']") !== false);
check('10.8 webhook : journal durable definie (webhook_journal_write)', strpos($src, 'function webhook_journal_write') !== false);
check('10.9 webhook : revocation durable (mol_supabase_patch)', strpos($src, 'function mol_supabase_patch') !== false);

// --- Nettoyage des transients du test --------------------------------------
$cleanup('mollie_grant_' . $subId);
$cleanup('mollie_grant_' . $annualId);

echo "\n";
if ($failures === 0) {
    echo "RESULTAT : $checks/$checks assertions PASS — cycle de vie du grant Pro conforme.\n";
    exit(0);
}
echo "RESULTAT : $failures echec(s) sur $checks assertions.\n";
exit(1);
