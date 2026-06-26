<?php
// ── Mollie shared helpers ─────────────────────────────────────────────────────
// Requis par mollie.php (proxy) ET mollie-webhook.php (confirmation serveur) pour
// qu'ils NE DIVERGENT PAS sur le flux d'argent (creation subscription, fulfillment).
// Aucun effet de bord : ces fonctions ne lisent pas la config ni n'emettent de
// sortie ; le caller definit $cfg (global) et appelle.

// Appel API Mollie. Bearer api_key (le prefixe test_/live_ = le mode, pas d'env).
function mol_api($method, $path, $body = null) {
    global $cfg;
    $ch = curl_init('https://api.mollie.com/v2' . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . ($cfg['api_key'] ?? ''), 'Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode($resp, true)];
}

// EUR seulement pour l'instant (compte Mollie EUR). USD = auto-converti ~2.5-3% FX
// + ~1% payout multi-devises -> on laisse les regions USD a Stripe a son retour.
function mol_is_eur_region($island) {
    return in_array($island, ['mq', 'gp', ''], true);
}

// Forward fulfillment -> Apps Script, MEME shape que stripe-webhook.php (la Sheet
// 'payments' dedoublonne par id). $type permet annulation/echec (cycle de vie).
function mol_forward_fulfillment($cfg, $id, $email, $cents, $currency, $island, $plan, $source, $type = 'checkout.session.completed') {
    $url = $cfg['appsscript_url'] ?? 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
    $payload = json_encode([
        'type'           => $type,
        'verified'       => true,
        'webhook_source' => 'mollie',
        'data' => ['object' => array_filter([
            'id'                  => $id,
            'payment_status'      => 'paid',
            'amount_total'        => $cents,
            'currency'            => strtolower($currency),
            'customer_email'      => $email,
            'client_reference_id' => substr(($island !== '' ? $island : 'mq') . '_' . $plan . '_' . $source, 0, 200),
            'metadata'            => ['island' => ($island !== '' ? $island : 'mq')],
        ], function ($v) { return $v !== null && $v !== ''; })],
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_TIMEOUT => 8]);
    @curl_exec($ch);
    curl_close($ch);
}

// Mapping email->{customer,sub} pour verify/cancel + idempotence subscription.
function mol_store_dir() {
    $d = __DIR__ . '/data/mollie-subs';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}
function mol_store_path($email) { return mol_store_dir() . '/' . sha1(strtolower(trim($email))) . '.json'; }
function mol_store_read($email) {
    $f = mol_store_path($email);
    return is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
}
function mol_store_write($email, $data) { @file_put_contents(mol_store_path($email), json_encode($data)); }

// ── Parrainage : LEDGER DE CRÉDIT par code parrain (REF-XXXXXX) ────────────────
// Mollie ne peut NI couponner NI créditer au checkout (cf. mollie.php). La récompense
// parrain est donc un CRÉDIT de jours de pass, stocké côté serveur par code, que l'app
// du parrain RÉCLAME au chargement (claim_referral_credit) et applique en étendant son
// sg_premium_pass_end local. Fichier par code (sha1), non servi par HTTP (sous /data).
// Schéma : { code, days, total_earned, payments:[pid…], ts }.
//   days         = jours NON ENCORE réclamés (remis à 0 au claim) ;
//   payments     = idempotence : un pid déjà crédité n'est jamais recompté ;
//   total_earned = plafond à vie (anti-abus).
define('SG_REF_BONUS_DAYS', 7);   // jours offerts au parrain par filleul-payant
define('SG_REF_CAP_DAYS', 90);    // plafond de crédit à vie par code

function mol_refcredit_dir() {
    $d = __DIR__ . '/data/mollie-refcredits';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}
function mol_refcredit_valid($code) { return is_string($code) && preg_match('/^REF-[A-Z0-9]{6}$/', $code); }
function mol_refcredit_path($code) { return mol_refcredit_dir() . '/' . sha1($code) . '.json'; }
function mol_refcredit_read($code) {
    if (!mol_refcredit_valid($code)) return null;
    $f = mol_refcredit_path($code);
    return is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
}

// Crédite un code parrain pour un paiement-filleul donné. IDEMPOTENT par pid (un
// re-traitement payment_status/webhook ne double-crédite jamais). Plafonné à vie.
// Retourne les jours effectivement ajoutés (0 si déjà crédité, plafond atteint, ou
// code invalide). Verrou fichier pour éviter une race payment_status vs webhook.
function mol_refcredit_grant($code, $pid, $bonus = SG_REF_BONUS_DAYS, $cap = SG_REF_CAP_DAYS) {
    if (!mol_refcredit_valid($code) || !is_string($pid) || $pid === '') return 0;
    $f = mol_refcredit_path($code);
    $lock = fopen($f . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $rec = is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
    if (!$rec) $rec = ['code' => $code, 'days' => 0, 'total_earned' => 0, 'payments' => [], 'ts' => time()];
    $added = 0;
    if (!in_array($pid, $rec['payments'], true)) {
        $room = max(0, $cap - (int)$rec['total_earned']);
        $added = min($bonus, $room);
        $rec['payments'][] = $pid;          // marque le pid traité même si plafond (anti-recompte)
        if ($added > 0) { $rec['days'] = (int)$rec['days'] + $added; $rec['total_earned'] = (int)$rec['total_earned'] + $added; }
        $rec['ts'] = time();
        @file_put_contents($f, json_encode($rec));
    }
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return $added;
}

// Réclame (et remet à 0) les jours non réclamés d'un code. Retourne les jours rendus.
function mol_refcredit_claim($code) {
    if (!mol_refcredit_valid($code)) return 0;
    $f = mol_refcredit_path($code);
    $lock = fopen($f . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $rec = is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
    $days = $rec ? (int)$rec['days'] : 0;
    if ($rec && $days > 0) { $rec['days'] = 0; $rec['ts'] = time(); @file_put_contents($f, json_encode($rec)); }
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return $days;
}

// Cree la Subscription UNE seule fois (idempotent). startDate = +1 intervalle :
// le 1er paiement 'first' a deja facture la periode 1, la subscription prend la suite.
function mol_create_subscription_once($cfg, $customerId, $email, $planIn, $island, $source) {
    $existing = mol_store_read($email);
    if ($existing && !empty($existing['sub'])) return $existing['sub']; // deja cree
    $sc = $cfg['subscription'][$planIn] ?? null;
    if (!$sc) return null;
    $interval = $sc['interval'];                       // '1 month' | '12 months'
    $startDate = date('Y-m-d', strtotime('+' . $interval));
    list($code, $sub) = mol_api('POST', '/customers/' . rawurlencode($customerId) . '/subscriptions', [
        'amount'      => ['currency' => $sc['currency'], 'value' => $sc['amount']],
        'interval'    => $interval,
        'startDate'   => $startDate,
        'description' => 'Sargasses ' . $planIn,
        'webhookUrl'  => 'https://sargasses-martinique.com/api/mollie-webhook.php',
        'metadata'    => ['island' => ($island !== '' ? $island : 'mq'), 'plan' => $planIn, 'source' => $source],
    ]);
    if ($code >= 400 || empty($sub['id'])) return null;
    mol_store_write($email, ['email' => $email, 'customer' => $customerId, 'sub' => $sub['id'], 'plan' => $planIn, 'ts' => time()]);
    return $sub['id'];
}
