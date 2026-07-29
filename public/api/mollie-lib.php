<?php
/**
 * Shared Mollie helpers — B2B plans (mensuel + annuel) + grant token Pro
 * Config secrets dans mollie-config.php (gitignored)
 */

function getMollieClient(): \Mollie\Api\MollieApiClient {
    require_once __DIR__ . '/mollie-config.php';
    $mollie = new \Mollie\Api\MollieApiClient();
    $mollie->setApiKey(MOLLIE_API_KEY);
    return $mollie;
}

/**
 * B2B plans — montants EN REPO (pas en config gitignored)
 * Mensuel récurrent : Pro 79€/mois, Brief 29€/mois
 * Annuel : géré via mollie-paylinks.cjs (paylinks hosted)
 */
function mol_b2b_plans(): array {
    return [
        'pro_monthly' => [
            'amount' => 79.00,
            'currency' => 'EUR',
            'description' => 'Sargasses Pro — mensuel (79 €/mois, sans engagement)',
            'interval' => '1 month',
        ],
        'brief_monthly' => [
            'amount' => 29.00,
            'currency' => 'EUR',
            'description' => 'Sargasses Brief — mensuel (29 €/mois, sans engagement)',
            'interval' => '1 month',
        ],
    ];
}

/**
 * Grant Pro token once per subscription (idempotent via subscriptionId)
 * Gère mensuel (renouvelable 30j) vs annuel (365j)
 */
function mol_b2b_grant_once(string $customerId, string $planKey, string $subscriptionId): array {
    require_once __DIR__ . '/widget-token.php';

    $grantKey = 'mollie_grant_' . $subscriptionId;
    $existing = get_transient($grantKey);
    if ($existing) {
        return ['granted' => false, 'reason' => 'already_granted', 'token' => $existing];
    }

    $plans = mol_b2b_plans();
    if (!isset($plans[$planKey])) {
        return ['granted' => false, 'reason' => 'unknown_plan'];
    }

    $plan = $plans[$planKey];
    $isMonthly = in_array($planKey, ['pro_monthly', 'brief_monthly'], true);
    $durationDays = $isMonthly ? 30 : 365;
    $expiresAt = time() + ($durationDays * 86400);

    $token = sg_widget_sign([
        'plan' => $planKey,
        'customer_id' => $customerId,
        'subscription_id' => $subscriptionId,
        'exp' => $expiresAt,
        'type' => 'b2b_pro',
    ]);

    set_transient($grantKey, $token, $durationDays * 86400 + 86400); // TTL = durée + 1 jour

    error_log("[mol_b2b_grant_once] granted plan=$planKey customer=$customerId sub=$subscriptionId expires=" . date('c', $expiresAt));

    return ['granted' => true, 'token' => $token, 'expires_at' => $expiresAt, 'plan' => $planKey];
}

/**
 * Revoke Pro token for a subscription (called on cancellation/expiration)
 */
function mol_b2b_revoke(string $subscriptionId): void {
    $grantKey = 'mollie_grant_' . $subscriptionId;
    $revokeKey = 'mollie_revoked_' . $subscriptionId;
    set_transient($revokeKey, '1', 365 * 86400); // mark revoked for 1 year
    // Remove the grant transient (token no longer valid)
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($grantKey);
    if (file_exists($file)) @unlink($file);
    error_log("[mol_b2b_revoke] revoked sub=$subscriptionId");
}

/**
 * Check if a subscription token has been revoked
 */
function mol_b2b_is_revoked(string $subscriptionId): bool {
    $revokeKey = 'mollie_revoked_' . $subscriptionId;
    return get_transient($revokeKey) !== null;
}

/**
 * Simple transient store (file-based, survives deploy)
 */
function get_transient(string $key): ?string {
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    if (!file_exists($file)) return null;
    $data = json_decode(file_get_contents($file), true);
    if (!$data || ($data['expires'] ?? 0) < time()) {
        @unlink($file);
        return null;
    }
    return $data['value'] ?? null;
}

function set_transient(string $key, string $value, int $ttl): void {
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    $data = ['value' => $value, 'expires' => time() + $ttl];
    file_put_contents($file, json_encode($data), LOCK_EX);
}

// Ajout de la fonction pour créer un paiement Mollie
function mol_create_payment($amount, $currency, $description, $redirectUrl, $webhookUrl) {
    try {
        $mollie = getMollieClient();
        
        $payment = $mollie->payments->create([
            "amount" => [
                "value" => number_format($amount / 100, 2, '.', ''),
                "currency" => $currency,
            ],
            "description" => $description,
            "redirectUrl" => $redirectUrl,
            "webhookUrl" => $webhookUrl,
            "metadata" => [
                "order_id" => uniqid("sg_order_"),
            ],
        ]);
        
        return [
            'success' => true,
            'payment_id' => $payment->id,
            'checkout_url' => $payment->getCheckoutUrl(),
        ];
    } catch (Exception $e) {
        error_log("[Mollie Payment Error] " . $e->getMessage());
        return [
            'success' => false,
            'error' => $e->getMessage(),
        ];
    }
}
