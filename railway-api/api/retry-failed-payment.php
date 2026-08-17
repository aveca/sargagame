<?php
// ── Script one-shot : envoie l'email de relance pour un paiement échoué ──────
// Usage : https://sargassumpuntacana.com/api/retry-failed-payment.php?pid=tr_xxx
// OU     node scripts/send-retry-email.cjs (appelle ce script via fetch)
// Le script fetch le paiement par ID depuis l'API Mollie, extrait l'email et le
// plan des metadata, puis envoie l'email de relance via mol_payment_failed_retry_email.
// Idempotent (marqueur passfail_<pid>) — appel multiple = 1 seul email.

ini_set('display_errors', '0');
header('Content-Type: application/json');

// Secret optionnel (anti-abus) — sans clé, le script fonctionne mais avec throttle strict
// Anti-abus: rate limit 10/h/IP (le secret key n'est plus utilisé — voir BUG-2026)
@include_once __DIR__ . '/_ratelimit.php';
if (function_exists('sg_rate_limit')) sg_rate_limit('retry_failed_payment', 10);
$pid = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['pid'] ?? '');
if (!$pid || strpos($pid, 'tr_') !== 0) {
    http_response_code(400);
    echo json_encode(['error' => 'missing or invalid pid (tr_xxx expected)']);
    exit;
}

$cfg = require __DIR__ . '/mollie-config.php';
require_once __DIR__ . '/mollie-lib.php';

// Fetch le paiement depuis l'API Mollie
try {
    $mollie = getMollieClient();
    $payment = $mollie->payments->get($pid);
    $pay = [
        'status'   => $payment->status ?? 'unknown',
        'metadata' => (array)($payment->metadata ?? []),
        'amount'   => (array)($payment->amount ?? []),
        'details'  => (array)($payment->details ?? []),
    ];
} catch (Exception $e) {
    http_response_code(404);
    echo json_encode(['error' => 'payment not found', 'detail' => 'Invalid payment ID or Mollie API error']);
    exit;
}
$meta   = $pay['metadata'] ?? [];
$amount = $pay['amount'] ?? [];
$email  = $meta['email'] ?? '';
$plan   = $meta['pass'] ?? ($meta['plan'] ?? 'unknown');
$island = $meta['island'] ?? 'puntacana';
$currency = $amount['currency'] ?? 'USD';
$status = $pay['status'] ?? 'unknown';

// Email fallback : cardHolder si pas dans metadata
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $email = $pay['details']['cardHolder'] ?? '';
    // cardHolder est souvent un NOM, pas un email → on ne peut pas l'utiliser
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode([
            'error' => 'no valid email found in payment metadata',
            'status' => $status,
            'plan' => $plan,
            'hint' => 'Check Mollie dashboard for this payment and send manual retry email'
        ]);
        exit;
    }
}

// Raison de l'échec
$reason = '';
$details = $pay['details'] ?? [];
if (isset($details['failureCode'])) {
    $reasonMap = [
        '3d_secure'            => '3D Secure not completed',
        '3d_secure_canceled'   => '3D Secure cancelled',
        '3d_secure_failed'     => '3D Secure failed',
        'card_declined'        => 'Card declined',
        'insufficient_funds'   => 'Insufficient funds',
        'expired_card'         => 'Card expired',
        'invalid_card_number'  => 'Invalid card number',
        'invalid_cvc'          => 'Invalid CVC',
    ];
    $reason = $reasonMap[$details['failureCode']] ?? ($details['failureCode'] ?? '');
}

// Envoie l'email de relance
$sent = function_exists('mol_payment_failed_retry_email')
    ? mol_payment_failed_retry_email($cfg, $pid, $email, $amount['value'] ?? '?', $currency, $island, $plan, $reason)
    : false;

echo json_encode([
    'ok'       => $sent,
    'pid'      => $pid,
    'email'    => $email,
    'plan'     => $plan,
    'amount'   => ($amount['value'] ?? '?') . ' ' . $currency,
    'island'   => $island,
    'status'   => $status,
    'reason'   => $reason,
    'message'  => $sent ? 'Retry email sent to ' . $email : 'Email already sent (idempotent) or failed',
]);
