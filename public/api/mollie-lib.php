<?php
/**
 * Shared Mollie helpers — B2B plans (mensuel + annuel) + grant token Pro
 * Config secrets dans mollie-config.php (gitignored)
 */

class SgPaymentResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function getCheckoutUrl(): ?string { return $this->resp['_links']['checkout']['href'] ?? null; }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgPaymentDetailResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function isPaid(): bool { return ($this->resp['status'] ?? '') === 'paid' || ($this->resp['paid'] ?? false); }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgCustomerResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgSubscriptionResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgMollieClient {
    private string $apiKey;
    public object|false $payments;
    public object|false $customers;
    public object|false $customer_subscriptions;
    public object $applePay;

    public function __construct(string $apiKey) {
        $this->apiKey = $apiKey;
        $self = $this;
        $this->applePay = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function sessions(): object {
                return new class($this->c) {
                    private $c;
                    public function __construct($c){ $this->c = $c; }
                    public function create(array $data): array {
                        $resp = $this->c->_post('v2/wallets/applepay/sessions', $data);
                        return $resp;
                    }
                };
            }
        };
        $this->payments = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function create(array $data): SgPaymentResponse {
                $resp = $this->c->_post('v2/payments', $data);
                return new SgPaymentResponse($resp);
            }
            public function get(string $id): SgPaymentDetailResponse {
                $resp = $this->c->_get("v2/payments/$id");
                return new SgPaymentDetailResponse($resp);
            }
        };
        $this->customers = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function get(string $id): SgCustomerResponse {
                $resp = $this->c->_get("v2/customers/$id");
                return new SgCustomerResponse($resp);
            }
            public function page(array $params = []): array {
                $query = http_build_query($params);
                $resp = $this->c->_get('v2/customers?' . $query);
                $items = $resp['_embedded']['customers'] ?? [];
                return array_map(fn($c) => new SgCustomerResponse($c), $items);
            }
            public function create(array $data): SgCustomerResponse {
                $resp = $this->c->_post('v2/customers', $data);
                return new SgCustomerResponse($resp);
            }
        };
        $this->customer_subscriptions = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function create(string $customerId, array $data): SgSubscriptionResponse {
                $resp = $this->c->_post("v2/customers/$customerId/subscriptions", $data);
                return new SgSubscriptionResponse($resp);
            }
            public function get(string $id): SgSubscriptionResponse {
                $resp = $this->c->_get("v2/subscriptions/$id");
                return new SgSubscriptionResponse($resp);
            }
        };
    }

    public function _get(string $path): array { return $this->_request('GET', $path); }
    public function _post(string $path, array $data): array { return $this->_request('POST', $path, $data); }

    private function _request(string $method, string $path, ?array $data = null): array {
        $ch = curl_init();
        $url = 'https://api.mollie.com/' . $path;
        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Accept: application/json',
            'Content-Type: application/json',
        ];
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if (curl_errno($ch)) { $err = curl_error($ch); curl_close($ch); throw new Exception('cURL error: ' . $err); }
        curl_close($ch);
        $decoded = json_decode($response, true) ?: [];
        if ($httpCode >= 400) {
            $msg = $decoded['detail'] ?? $decoded['title'] ?? ('HTTP ' . $httpCode);
            throw new Exception('Mollie API error: ' . $msg);
        }
        return $decoded;
    }
}

function getMollieClient(): SgMollieClient {
    // Use require (not require_once) because mollie.php already did require_once
    // and require_once would return true (boolean) on subsequent calls
    $cfg = require __DIR__ . '/mollie-config.php';
    $apiKey = is_array($cfg) ? ($cfg['api_key'] ?? '') : (defined('MOLLIE_API_KEY') ? MOLLIE_API_KEY : '');
    return new SgMollieClient($apiKey);
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
function mol_b2b_grant_once(string $customerId, string $planKey, string $subscriptionId, ?int $durationDaysOverride = null): array {
    require_once __DIR__ . '/widget-token.php';

    $grantKey = 'mollie_grant_' . $subscriptionId;
    $existing = get_transient($grantKey);
    if ($existing) {
        return ['granted' => false, 'reason' => 'already_granted', 'token' => $existing];
    }

    $isMonthly = in_array($planKey, ['pro_monthly', 'brief_monthly'], true);
    $durationDays = $durationDaysOverride ?? ($isMonthly ? 30 : 365);
    $expiresAt = time() + ($durationDays * 86400);

    $token = sg_widget_sign([
        'plan' => $planKey,
        'customer_id' => $customerId,
        'subscription_id' => $subscriptionId,
        'exp' => $expiresAt,
        'type' => 'b2b_pro',
    ]);

    set_transient($grantKey, $token, $durationDays * 86400 + 86400); // TTL = durée + 1 jour

    // Supabase mirror (best-effort)
    mol_supabase_mirror('payment_grants', [
        'subscription_id' => $subscriptionId,
        'type' => 'b2b_pro',
        'plan' => $planKey,
        'customer_id' => $customerId,
        'expires_at' => date('c', $expiresAt),
        'granted_at' => date('c', time()),
    ]);

    error_log("[mol_b2b_grant_once] granted plan=$planKey customer=$customerId sub=$subscriptionId expires=" . date('c', $expiresAt));

    return ['granted' => true, 'token' => $token, 'expires_at' => $expiresAt, 'plan' => $planKey];
}

/**
 * Revoke Pro token for a subscription (called on cancellation/expiration)
 * Supprime le grant (le token ne peut plus être validé via sg_widget_verify).
 */
function mol_b2b_revoke(string $subscriptionId): void {
    $grantKey = 'mollie_grant_' . $subscriptionId;
    $revokeKey = 'mollie_revoked_' . $subscriptionId;
    set_transient($revokeKey, '1', 365 * 86400); // mark revoked for 1 year
    // Supprime le grant transient en double : clé normale + variante md5
    $fileGrant = sys_get_temp_dir() . '/mollie_transient_' . md5($grantKey);
    $fileGrantMd5 = sys_get_temp_dir() . '/mollie_transient_' . md5('mollie_grant_' . $subscriptionId);
    foreach ([$fileGrant, $fileGrantMd5] as $f) {
        if (file_exists($f)) @unlink($f);
    }
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

/**
 * Supabase mirror for payment grants — write-only (service key on server).
 * Best-effort, never throws (logs only). Avoids /tmp loss on deploy/restart.
 */
function mol_supabase_mirror(string $table, array $data): void {
    global $cfg;  // BUG-2026-011 : $cfg chargé par require_once mollie-config.php (caller side)
    $supabaseUrl = $cfg['supabase_url'] ?? getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey = $cfg['supabase_service_key'] ?? getenv('SUPABASE_SERVICE_KEY') ?? '';
    if (!$serviceKey) return; // skip silently if not configured

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $supabaseUrl . '/rest/v1/' . $table,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $serviceKey,
            'Authorization: Bearer ' . $serviceKey,
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
        CURLOPT_TIMEOUT => 10,
    ]);
    $resp = curl_exec($ch);
    if (curl_errno($ch)) {
        error_log('[mol_supabase_mirror] cURL error: ' . curl_error($ch));
    }
    curl_close($ch);
}

/**
 * Grant B2C pass — backup server-side du localStorage frontend.
 * Idempotent : même paymentId = pas de double grant.
 * Durées : p30=30j, trip7=7j, season=210j
 */
function mol_b2c_pass_grant(string $paymentId, string $pass, string $email, array $metadata = []): array {
    $grantKey = 'mol_b2c_pass_' . $paymentId;
    $existing = get_transient($grantKey);
    if ($existing) {
        return ['granted' => false, 'reason' => 'already_granted'];
    }

    $durations = ['p30' => 30, 'trip7' => 7, 'season' => 210];
    $days = $durations[$pass] ?? 30;
    $expiresAt = time() + ($days * 86400);
    $currency = $metadata['currency'] ?? 'EUR';

    $grantData = json_encode([
        'pass' => $pass,
        'email' => $email,
        'currency' => $currency,
        'expires_at' => $expiresAt,
        'payment_id' => $paymentId,
        'granted_at' => time(),
    ]);

    set_transient($grantKey, $grantData, $days * 86400 + 86400);

    // Supabase mirror (best-effort, no-op if not configured)
    mol_supabase_mirror('payment_grants', [
        'payment_id' => $paymentId,
        'type' => 'b2c_pass',
        'pass' => $pass,
        'email' => $email,
        'currency' => $currency,
        'expires_at' => date('c', $expiresAt),
        'granted_at' => date('c', time()),
        'metadata' => $metadata,
    ]);

    error_log("[mol_b2c_pass_grant] pass=$pass paymentId=$paymentId days=$days expires=" . date('c', $expiresAt));

    return ['granted' => true, 'pass' => $pass, 'expires_at' => $expiresAt, 'days' => $days];
}

/**
 * Revoke a B2C pass grant (called on payment failure)
 */
function mol_b2c_pass_revoke(string $paymentId): void {
    $grantKey = 'mol_b2c_pass_' . $paymentId;
    $grantFile = sys_get_temp_dir() . '/mollie_transient_' . md5($grantKey);
    if (file_exists($grantFile)) @unlink($grantFile);
    error_log("[mol_b2c_pass_revoke] paymentId=$paymentId");
}

/**
 * Check if a B2C pass payment has been granted (for verification cross-device)
 */
function mol_b2c_pass_check(string $paymentId): ?array {
    $grantKey = 'mol_b2c_pass_' . $paymentId;
    $data = get_transient($grantKey);
    if (!$data) return null;
    $decoded = json_decode($data, true);
    if (!$decoded) return null;
    if (($decoded['expires_at'] ?? 0) < time()) return null;
    return $decoded;
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
