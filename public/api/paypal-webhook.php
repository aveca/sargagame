<?php
// ── Webhook PayPal signe ──────────────────────────────────────────────────────
// Pendant que paypal.php (capture/create_subscription) gere le deblocage immediat,
// ce webhook couvre le CYCLE DE VIE recurrent : renouvellements, echecs, annulations.
//
// Flux : PayPal -> verify-webhook-signature (API PayPal, via webhook_id) ->
//        idempotence event.id -> filtre type -> 200 -> forward serveur-a-serveur
//        vers l'Apps Script (MEME shape que stripe-webhook.php : la Sheet dedup par id).
//
// Mirror de stripe-webhook.php. Config = paypal-config.php (gitignore, HTTP-deny).

$payload = file_get_contents('php://input');
ini_set('display_errors', '0');
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method']);
    exit;
}

$cfg = require __DIR__ . '/paypal-config.php';
$webhookId = $cfg['webhook_id'] ?? '';
if (!$webhookId || strpos($webhookId, 'PAYPAL_WEBHOOK') === 0) {
    http_response_code(500); // PayPal retentera une fois le webhook_id deploye
    echo json_encode(['error' => 'webhook not configured']);
    exit;
}

$pp_base = (($cfg['env'] ?? 'sandbox') === 'live') ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

// ── 1. Access token (client_credentials) ─────────────────────────────────────
$ch = curl_init($pp_base . '/v1/oauth2/token');
curl_setopt_array($ch, [
    CURLOPT_USERPWD => ($cfg['client_id'] ?? '') . ':' . ($cfg['secret'] ?? ''),
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => 'grant_type=client_credentials',
    CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
$tokBody = curl_exec($ch);
curl_close($ch);
$token = json_decode($tokBody, true)['access_token'] ?? '';
if (!$token) { http_response_code(500); echo json_encode(['error' => 'auth']); exit; }

// ── 2. Verification de signature (API PayPal officielle) ─────────────────────
$readHeader = function ($name) {
    $k = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return $_SERVER[$k] ?? '';
};
$event = json_decode($payload, true);
if (!is_array($event) || empty($event['id'])) {
    http_response_code(400); echo json_encode(['error' => 'invalid payload']); exit;
}
$verifyBody = [
    'auth_algo'         => $readHeader('PAYPAL-AUTH-ALGO'),
    'cert_url'          => $readHeader('PAYPAL-CERT-URL'),
    'transmission_id'   => $readHeader('PAYPAL-TRANSMISSION-ID'),
    'transmission_sig'  => $readHeader('PAYPAL-TRANSMISSION-SIG'),
    'transmission_time' => $readHeader('PAYPAL-TRANSMISSION-TIME'),
    'webhook_id'        => $webhookId,
    'webhook_event'     => $event,
];
$ch = curl_init($pp_base . '/v1/notifications/verify-webhook-signature');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($verifyBody),
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
$vBody = curl_exec($ch);
$vCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$verified = ($vCode < 400) && ((json_decode($vBody, true)['verification_status'] ?? '') === 'SUCCESS');
if (!$verified) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid signature']);
    exit;
}

// ── 3. Idempotence sur event.id (marqueurs api/data/, non servi par HTTP) ─────
$eventId = (string)$event['id'];
$type = (string)($event['event_type'] ?? '');
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) { @mkdir($dataDir, 0755, true); }
$marker = $dataDir . '/pp_' . preg_replace('/[^A-Za-z0-9_.-]/', '_', $eventId);
if (file_exists($marker)) {
    http_response_code(200);
    echo json_encode(['received' => true, 'duplicate' => true]);
    exit;
}

// ── 4. Filtre type d'event ───────────────────────────────────────────────────
$HANDLED = [
    'PAYMENT.CAPTURE.COMPLETED',       // pass one-time capture
    'PAYMENT.SALE.COMPLETED',          // facture d'abo recurrente
    'BILLING.SUBSCRIPTION.ACTIVATED',
    'BILLING.SUBSCRIPTION.CANCELLED',
    'BILLING.SUBSCRIPTION.EXPIRED',
    'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
];
if (!in_array($type, $HANDLED, true)) {
    http_response_code(200);
    echo json_encode(['received' => true, 'ignored' => 'event_type']);
    exit;
}

@file_put_contents($marker, '');

// ── 5. Extraction island/email/montant + map vers le shape Stripe attendu ─────
$res = $event['resource'] ?? [];
// custom_id = "island_plan_source" pose par paypal.php (sur order & subscription).
$custom = $res['custom_id'] ?? ($res['custom'] ?? '');
$island = '';
if ($custom && preg_match('/^([a-z]+)_/', $custom, $m)) $island = $m[1];
$KNOWN = ['mq', 'gp', 'puntacana', 'florida', 'rivieramaya'];
if (!in_array($island, $KNOWN, true)) $island = 'mq';

$email = $res['subscriber']['email_address']
    ?? ($res['payer']['email_address'] ?? ($res['payee']['email_address'] ?? ''));

$amt = $res['amount'] ?? [];
$value = $amt['value'] ?? ($amt['total'] ?? null);
$currency = $amt['currency_code'] ?? ($amt['currency'] ?? 'EUR');
$cents = $value !== null ? (int)round(((float)$value) * 100) : null;

// Type Stripe-equivalent pour que le handler Apps Script existant traite sans changement.
$stripeType = (strpos($type, 'BILLING.SUBSCRIPTION.CANCELLED') === 0 || strpos($type, 'EXPIRED') !== false)
    ? 'customer.subscription.deleted'
    : ((strpos($type, 'PAYMENT.FAILED') !== false) ? 'invoice.payment_failed' : 'checkout.session.completed');

$forward = [
    'type'           => $stripeType,
    'verified'       => true,
    'webhook_source' => 'paypal',
    'data' => ['object' => array_filter([
        'id'             => $res['id'] ?? $eventId,
        'payment_status' => 'paid',
        'amount_total'   => $cents,
        'currency'       => strtolower($currency),
        'customer_email' => $email,
        'metadata'       => ['island' => $island],
    ], function ($v) { return $v !== null && $v !== ''; })],
];

// ── 6. 200 a PayPal AVANT le forward (echec aval != retry) ───────────────────
http_response_code(200);
echo json_encode(['received' => true]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }

$url = $cfg['appsscript_url'] ?? 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($forward),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 5,
    CURLOPT_TIMEOUT => 10,
]);
@curl_exec($ch);
curl_close($ch);
exit;
