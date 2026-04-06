<?php
header('Content-Type: application/json');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://sargasses-martinique.com','https://sargasses-guadeloupe.com'];
if (in_array($origin, $allowed)) header("Access-Control-Allow-Origin: $origin");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$cfg = require __DIR__ . '/stripe-config.php';
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? 'setup';

function stripe($method, $path, $params = []) {
    global $cfg;
    $ch = curl_init("https://api.stripe.com/v1$path");
    curl_setopt_array($ch, [
        CURLOPT_USERPWD        => $cfg['sk'] . ':',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Stripe-Version: 2024-12-18.acacia'],
    ]);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
    }
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode($body, true);
    if ($code >= 400) {
        http_response_code(500);
        echo json_encode(['error' => $data['error']['message'] ?? 'Stripe error']);
        exit;
    }
    return $data;
}

// ── Action: setup — cree un SetupIntent (collecte carte)
if ($action === 'setup') {
    $si = stripe('POST', '/setup_intents', [
        'automatic_payment_methods[enabled]' => 'true',
    ]);
    echo json_encode(['clientSecret' => $si['client_secret']]);
    exit;
}

// ── Action: subscribe — cree Customer + Subscription avec trial
if ($action === 'subscribe') {
    $email = $input['email'] ?? '';
    $plan = $input['plan'] ?? 'monthly';
    $setupIntentId = $input['setupIntentId'] ?? '';

    if (!$email || !$setupIntentId) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing email or setupIntentId']);
        exit;
    }

    // Recuperer le payment method du SetupIntent
    $si = stripe('GET', "/setup_intents/$setupIntentId");
    $pm = $si['payment_method'];

    // Creer le client Stripe
    $customer = stripe('POST', '/customers', [
        'email' => $email,
        'payment_method' => $pm,
        'invoice_settings[default_payment_method]' => $pm,
    ]);

    // Creer l'abonnement avec essai 7j
    $price = $cfg['prices'][$plan] ?? $cfg['prices']['monthly'];
    $sub = stripe('POST', '/subscriptions', [
        'customer'                    => $customer['id'],
        'items[0][price]'             => $price,
        'trial_period_days'           => 7,
        'automatic_tax[enabled]'      => 'true',
        'default_payment_method'      => $pm,
    ]);

    echo json_encode([
        'subscriptionId' => $sub['id'],
        'status'         => $sub['status'],
        'trialEnd'       => $sub['trial_end'],
    ]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
