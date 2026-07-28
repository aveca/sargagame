<?php
/**
 * Mollie on-site checkout + subscriptions (B2B mensuel + annuel)
 * Config (secrets) dans mollie-config.php (gitignored) — template : mollie-config.example.php
 */

require_once __DIR__ . '/mollie-config.php';
require_once __DIR__ . '/mollie-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error'=>'POST only']); exit; }

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?? [];

$action = $data['action'] ?? '';

try {
    $mollie = getMollieClient();

    if ($action === 'create_payment') {
        // One-off payment (B2C pass, B2B annual)
        $amount = $data['amount'] ?? null;
        $description = $data['description'] ?? 'Sargasses';
        $redirectUrl = $data['redirectUrl'] ?? (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/success/';
        $webhookUrl = $data['webhookUrl'] ?? (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/public/api/mollie-webhook.php';
        $metadata = $data['metadata'] ?? [];
        $metadata['source'] = $metadata['source'] ?? 'web';

        $paymentMethod = $data['paymentMethod'] ?? null; // optional: 'applepay', 'googlepay'

        if (!$amount || !isset($amount['value']) || !isset($amount['currency'])) {
            throw new Exception('amount {value,currency} requis');
        }

        // Prix dynamique USD haute saison (juin-nov) — exempt trip_usd
        $pass = $data['pass'] ?? null;
        $currency = $amount['currency'];
        if ($currency === 'USD' && $pass && $pass !== 'trip') {
            $month = (int)date('n');
            if ($month >= 6 && $month <= 11) {
                $amount['value'] = (string)round((float)$amount['value'] * 1.15, 2);
            }
        }

        $paymentData = [
            'amount' => $amount,
            'description' => $description,
            'redirectUrl' => $redirectUrl,
            'webhookUrl' => $webhookUrl,
            'metadata' => $metadata,
            'locale' => $data['locale'] ?? 'fr_FR',
        ];

        if ($paymentMethod) {
            $paymentData['paymentMethod'] = $paymentMethod;
        }

        $payment = $mollie->payments->create($paymentData);

        echo json_encode([
            'checkoutUrl' => $payment->getCheckoutUrl(),
            'paymentId' => $payment->id,
        ]);
        exit;
    }

    if ($action === 'create_subscription') {
        // Hosted checkout for B2B monthly subscriptions
        $planKey = $data['plan'] ?? '';          // 'pro_monthly' | 'brief_monthly'
        $hosted = $data['hosted'] ?? true;       // hosted checkout page (default true)
        $redirectUrl = $data['redirectUrl'] ?? (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/pro/espace/';
        $webhookUrl = $data['webhookUrl'] ?? (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/public/api/mollie-webhook.php';
        $paymentMethod = $data['paymentMethod'] ?? null; // optional: 'applepay', 'googlepay', etc.
        $metadata = $data['metadata'] ?? [];
        $metadata['source'] = $metadata['source'] ?? 'b2b_monthly';
        $metadata['plan'] = $planKey;

        $plans = mol_b2b_plans();
        if (!isset($plans[$planKey])) {
            throw new Exception("Plan mensuel inconnu: $planKey. Disponibles: " . implode(', ', array_keys($plans)));
        }
        $plan = $plans[$planKey];

        $customer = null;
        if (!empty($data['customerId'])) {
            $customer = $mollie->customers->get($data['customerId']);
        } elseif (!empty($data['email'])) {
            // Try to get existing customer by email
            $customers = $mollie->customers->page(['email' => $data['email'], 'limit' => 1]);
            foreach ($customers as $c) { $customer = $c; break; }
            if (!$customer) {
                $customer = $mollie->customers->create([
                    'email' => $data['email'],
                    'name' => $data['name'] ?? '',
                    'metadata' => ['source' => 'b2b_monthly_signup'],
                ]);
            }
        } else {
            throw new Exception('customerId ou email requis pour create_subscription');
        }

        $subscriptionData = [
            'customerId' => $customer->id,
            'amount' => ['value' => number_format($plan['amount'], 2, '.', ''), 'currency' => $plan['currency']],
            'description' => $plan['description'],
            'webhookUrl' => $webhookUrl,
            'metadata' => $metadata,
            'mandateId' => $data['mandateId'] ?? null,
        ];

        if ($hosted) {
            $subscriptionData['redirectUrl'] = $redirectUrl;
        }

        if ($paymentMethod) {
            $subscriptionData['paymentMethod'] = $paymentMethod;
        }

        $subscription = $mollie->customer_subscriptions->create($customer->id, $subscriptionData);

        $response = [
            'subscriptionId' => $subscription->id,
            'customerId' => $customer->id,
            'status' => $subscription->status,
        ];

        if ($hosted && isset($subscription->_links->checkout)) {
            $response['checkoutUrl'] = $subscription->_links->checkout->href;
        }

        echo json_encode($response);
        exit;
    }

    if ($action === 'get_customer') {
        // Retrieve customer by email or ID
        $email = $data['email'] ?? null;
        $customerId = $data['customerId'] ?? null;

        if ($customerId) {
            $customer = $mollie->customers->get($customerId);
            echo json_encode(['customer' => $customer]);
            exit;
        }

        if ($email) {
            $customers = $mollie->customers->page(['email' => $email, 'limit' => 1]);
            foreach ($customers as $c) {
                echo json_encode(['customer' => $c]);
                exit;
            }
            echo json_encode(['customer' => null]);
            exit;
        }

        throw new Exception('email ou customerId requis');
    }

    if ($action === 'get_mandate') {
        $customerId = $data['customerId'] ?? null;
        $mandateId = $data['mandateId'] ?? null;

        if (!$customerId || !$mandateId) {
            throw new Exception('customerId et mandateId requis');
        }

        $mandate = $mollie->customer_mandates->get($customerId, $mandateId);
        echo json_encode(['mandate' => $mandate]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => "Action inconnue: $action"]);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('[mollie.php] ' . $e->getMessage());
    echo json_encode(['error' => $e->getMessage()]);
}