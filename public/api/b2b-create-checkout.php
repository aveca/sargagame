<?php
/**
 * b2b-create-checkout.php — Create Mollie checkout for B2B concierge payment.
 * POST /api/b2b-create-checkout.php → create checkout URL (29€/mois)
 *
 * Expects: { prospect_id, concierge_id, email, name? }
 * Returns: { checkoutUrl, customerId }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error'=>'POST only']); exit; }

require_once __DIR__ . '/mollie-lib.php';
require_once __DIR__ . '/b2b-db.php';
require_once __DIR__ . '/_ratelimit.php';

$input = json_decode(file_get_contents('php://input'), true);

if (empty($input['prospect_id']) || empty($input['concierge_id']) || empty($input['email'])) {
    http_response_code(400);
    echo json_encode(['error' => 'prospect_id, concierge_id, and email are required']);
    exit;
}

sg_rate_limit('b2b_checkout', 10);

try {
    $cfg = @include __DIR__ . '/mollie-config.php';
    if (!is_array($cfg)) $cfg = [];

    $mollie = getMollieClient();
    $plans = mol_b2b_plans();
    $plan = $plans['brief_monthly']; // 29€/mois

    // Find or create Mollie customer
    $customer = null;
    $customers = $mollie->customers->page(['limit' => 50]);
    foreach ($customers as $c) {
        if (($c->email ?? '') === $input['email']) { $customer = $c; break; }
    }
    if (!$customer) {
        $customer = $mollie->customers->create([
            'email' => $input['email'],
            'name'   => $input['name'] ?? '',
            'metadata' => ['source' => 'b2b_concierge_checkout'],
        ]);
    }

    // Create subscription with hosted checkout
    $webhookUrl = ($cfg['webhook_url'] ?? '')
        ?: rtrim($_SERVER['HTTP_ORIGIN'] ?? 'https://sargasses-martinique.com', '/')
           . '/api/mollie-webhook.php';

    $subscriptionData = [
        'amount' => [
            'value' => number_format($plan['amount'], 2, '.', ''),
            'currency' => $plan['currency'],
        ],
        'description' => $plan['description'],
        'webhookUrl'  => $webhookUrl,
        'metadata'    => [
            'source'       => 'b2b_concierge',
            'prospect_id'  => $input['prospect_id'],
            'concierge_id' => $input['concierge_id'],
            'plan'         => 'brief_monthly',
        ],
        'interval' => $plan['interval'],
    ];

    $subscription = $mollie->customer_subscriptions->create($customer->id, $subscriptionData);

    $checkoutUrl = null;
    if (isset($subscription->_links->checkout)) {
        $checkoutUrl = $subscription->_links->checkout->href;
    }

    // Create payment record
    $payment = b2b_create_payment([
        'prospect_id'      => $input['prospect_id'],
        'concierge_id'     => $input['concierge_id'],
        'amount'           => $plan['amount'],
        'status'           => 'pending',
        'mollie_payment_id' => $subscription->id,
    ]);

    b2b_log_event('CHECKOUT_CREATED', $input['prospect_id'], 'system', [
        'subscription_id' => $subscription->id,
        'customer_id'     => $customer->id,
        'checkout_url'    => $checkoutUrl,
    ]);

    echo json_encode([
        'checkoutUrl'  => $checkoutUrl,
        'customerId'   => $customer->id,
        'subscriptionId' => $subscription->id,
        'payment_id'   => $payment['id'] ?? null,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
