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
        return ['granted' => false, 'reason' => 'already_granted', 'token' => $existing, 'mirror_ok' => true];
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

    // Supabase mirror (returns false on failure to trigger retry)
    $mirrorOk = mol_supabase_mirror('payment_grants', [
        'subscription_id' => $subscriptionId,
        'type' => 'b2b_pro',
        'plan' => $planKey,
        'customer_id' => $customerId,
        'expires_at' => date('c', $expiresAt),
        'granted_at' => date('c', time()),
    ]);

    error_log("[mol_b2b_grant_once] granted plan=$planKey customer=$customerId sub=$subscriptionId expires=" . date('c', $expiresAt) . " mirror_ok=" . ($mirrorOk ? 'true' : 'false'));

    return ['granted' => true, 'token' => $token, 'expires_at' => $expiresAt, 'plan' => $planKey, 'mirror_ok' => $mirrorOk];
}

/**
 * Revoke Pro token for a subscription (called on cancellation/expiration)
 * Supprime le grant + mark revoked in Supabase (persistent across deploys).
 */
function mol_b2b_revoke(string $subscriptionId): void {
    $grantKey = 'mollie_grant_' . $subscriptionId;
    $revokeKey = 'mollie_revoked_' . $subscriptionId;
    set_transient($revokeKey, '1', 365 * 86400); // file fallback
    // Supprime le grant transient
    $fileGrant = sys_get_temp_dir() . '/mollie_transient_' . md5($grantKey);
    $fileGrantMd5 = sys_get_temp_dir() . '/mollie_transient_' . md5('mollie_grant_' . $subscriptionId);
    foreach ([$fileGrant, $fileGrantMd5] as $f) {
        if (file_exists($f)) @unlink($f);
    }
    // Supabase: mark grant as revoked (persistent across deploys/servers)
    $cfg = @include __DIR__ . '/mollie-config.php';
    if (is_array($cfg)) {
        $supabaseUrl = $cfg['supabase_url'] ?? '';
        $serviceKey  = $cfg['supabase_service_key'] ?? '';
        if ($supabaseUrl && $serviceKey) {
            $url = rtrim($supabaseUrl, '/') . '/rest/v1/payment_grants?subscription_id=eq.' . rawurlencode($subscriptionId) . '&type=eq.b2b_pro';
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => 'PATCH',
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POSTFIELDS => json_encode(['status' => 'revoked']),
                CURLOPT_HTTPHEADER => [
                    'apikey: ' . $serviceKey,
                    'Authorization: Bearer ' . $serviceKey,
                    'Content-Type: application/json',
                    'Prefer: return=minimal',
                ],
                CURLOPT_TIMEOUT => 8,
            ]);
            @curl_exec($ch);
            @curl_close($ch);
        }
    }
    error_log("[mol_b2b_revoke] revoked sub=$subscriptionId");
}

/**
 * Check if a subscription token has been revoked.
 * Checks Supabase first (persistent), falls back to file transient.
 */
function mol_b2b_is_revoked(string $subscriptionId): bool {
    // File transient fallback (instant, single-server)
    $revokeKey = 'mollie_revoked_' . $subscriptionId;
    if (get_transient($revokeKey) !== null) return true;
    // Supabase check (persistent across deploys)
    $cfg = @include __DIR__ . '/mollie-config.php';
    if (is_array($cfg)) {
        $supabaseUrl = $cfg['supabase_url'] ?? '';
        $serviceKey  = $cfg['supabase_service_key'] ?? '';
        if ($supabaseUrl && $serviceKey) {
            $qs = http_build_query([
                'select' => 'status',
                'subscription_id' => 'eq.' . $subscriptionId,
                'type' => 'eq.b2b_pro',
                'status' => 'eq.revoked',
                'limit' => '1',
            ]);
            $url = rtrim($supabaseUrl, '/') . '/rest/v1/payment_grants?' . $qs;
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => [
                    'apikey: ' . $serviceKey,
                    'Authorization: Bearer ' . $serviceKey,
                    'Accept: application/json',
                ],
                CURLOPT_TIMEOUT => 5,
            ]);
            $resp = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code >= 200 && $code < 300) {
                $rows = json_decode($resp, true) ?? [];
                if (!empty($rows)) return true;
            }
        }
    }
    return false;
}

/**
 * Simple transient store (file-based, survives deploy)
 */
function get_transient(string $key): ?string {
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    if (!file_exists($file)) return null;
    $raw = @file_get_contents($file);
    if ($raw === false) return null;
    $data = json_decode($raw, true);
    if (!$data || ($data['expires'] ?? 0) < time()) {
        @unlink($file);
        return null;
    }
    return $data['value'] ?? null;
}

function set_transient(string $key, string $value, int $ttl): void {
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    $data = ['value' => $value, 'expires' => time() + $ttl];
    @file_put_contents($file, json_encode($data), LOCK_EX);
}

/**
 * Check if an email has an active pass/subscription (cross-device premium access).
 * Queries Supabase payment_grants for non-expired B2C passes or B2B Pro grants.
 * Used by forecast.php for email-based premium forecast access.
 */
function mol_access_for_email(string $email): bool {
    $email = trim(strtolower($email));
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) return false;

    $cfg = @include __DIR__ . '/mollie-config.php';
    if (!is_array($cfg)) $cfg = [];
    $supabaseUrl = $cfg['supabase_url'] ?? getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey = $cfg['supabase_service_key'] ?? getenv('SUPABASE_SERVICE_KEY') ?? '';
    if (!$serviceKey) return false;

    // Query Supabase: any non-expired grant for this email (B2C pass or B2B pro)
    $qs = http_build_query([
        'select'    => 'type,expires_at',
        'email'     => 'eq.' . $email,
        'expires_at' => 'gt.now()',
        'order'     => 'expires_at.desc',
        'limit'     => '1',
    ]);
    $url = rtrim($supabaseUrl, '/') . '/rest/v1/payment_grants?' . $qs;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . $serviceKey,
            'Authorization: Bearer ' . $serviceKey,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT        => 8,
    ]);
    $resp = curl_exec($ch);
    $err  = curl_errno($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err || $code >= 400) {
        error_log("[mol_access_for_email] Supabase lookup failed: err=$err code=$code email=$email");
        return false;
    }

    $rows = json_decode($resp, true) ?? [];
    if (!is_array($rows) || empty($rows)) return false;

    // At least one non-expired grant found
    return true;
}

/**
 * Supabase mirror for payment grants — write-only (service key on server).
 * Best-effort, returns boolean success. Avoids /tmp loss on deploy/restart.
 * Accepts $cfg as parameter (fixes global $cfg always-empty bug).
 */
function mol_supabase_mirror(string $table, array $data, ?array $cfg = null): bool {
    if ($cfg === null) {
        $cfg = @include __DIR__ . '/mollie-config.php';
        if (!is_array($cfg)) $cfg = [];
    }
    $supabaseUrl = $cfg['supabase_url'] ?? getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey = $cfg['supabase_service_key'] ?? getenv('SUPABASE_SERVICE_KEY') ?? '';
    if (!$serviceKey) return true; // skip silently if not configured (return true = skip ok)

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
        curl_close($ch);
        return false;
    }
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($httpCode >= 400) {
        error_log('[mol_supabase_mirror] HTTP error: ' . $httpCode);
        return false;
    }
    return true;
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
        return ['granted' => false, 'reason' => 'already_granted', 'mirror_ok' => true];
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

    // Supabase mirror (returns false on failure to trigger retry)
    $mirrorOk = mol_supabase_mirror('payment_grants', [
        'payment_id' => $paymentId,
        'type' => 'b2c_pass',
        'pass' => $pass,
        'email' => $email,
        'currency' => $currency,
        'expires_at' => date('c', $expiresAt),
        'granted_at' => date('c', time()),
        'metadata' => $metadata,
    ]);

    error_log("[mol_b2c_pass_grant] pass=$pass paymentId=$paymentId days=$days expires=" . date('c', $expiresAt) . " mirror_ok=" . ($mirrorOk ? 'true' : 'false'));

    return ['granted' => true, 'pass' => $pass, 'expires_at' => $expiresAt, 'days' => $days, 'mirror_ok' => $mirrorOk];
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

/**
 * Send B2B trial access email to hotel (Resend).
 * Best-effort: never blocks the token response.
 */
function mol_b2b_trial_email(array $cfg, string $email, string $token, string $name, string $island, string $beach): bool {
    $resendKey = $cfg['resend_key'] ?? '';
    if (!$resendKey || !$email) return false;

    $domainMap = [
        'MQ' => 'sargasses-martinique.com', 'GP' => 'sargasses-guadeloupe.com',
        'florida' => 'sargassummiami.com', 'puntacana' => 'sargassumpuntacana.com',
        'rivieramaya' => 'sargassumcancun.com',
    ];
    $domain = $domainMap[$island] ?? 'sargasses-martinique.com';
    $lang = in_array($island, ['florida', 'puntacana', 'rivieramaya']) ? 'en' : 'fr';
    $accessUrl = "https://{$domain}/?k={$token}" . ($beach ? "&beach={$beach}" : '') . ($name ? "&name=" . urlencode($name) : '');

    $title = $lang === 'en' ? 'Your PRO trial is active' : 'Ton essai PRO est actif';
    $body  = $lang === 'en'
        ? "Hi{$name} Your 30-day PRO trial is ready. Access your dashboard anytime:"
        : "Bonjour{$name} Ton essai PRO de 30 jours est actif. Accède à ton espace à tout moment :";
    $cta   = $lang === 'en' ? 'Open my dashboard' : 'Ouvrir mon espace';
    $note  = $lang === 'en'
        ? 'This link is unique and private. Share it with your team.'
        : 'Ce lien est unique et confidentiel. Partage-le avec ton équipe.';

    $html = '<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px;font-size:15px;color:#1a1a1a">'
        . '<h2 style="margin:0 0 12px;color:#0D1E1C">' . $title . '</h2>'
        . '<p>' . $body . '</p>'
        . '<p><a href="' . htmlspecialchars($accessUrl) . '" style="display:inline-block;background:linear-gradient(135deg,#FFC72C,#E8A800);color:#0D1E1C;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:16px">' . $cta . ' &rarr;</a></p>'
        . '<p style="color:#888;font-size:12px">' . $note . '</p>'
        . '</div>';

    $payload = json_encode([
        'from'    => "Sargasses Pro <alerte@{$domain}>",
        'to'      => [$email],
        'subject' => $title,
        'html'    => $html,
    ]);
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 10,
        'header' => "Authorization: Bearer {$resendKey}\r\nContent-Type: application/json\r\n",
        'content' => $payload, 'ignore_errors' => true,
    ]]);
    @file_get_contents('https://api.resend.com/emails', false, $ctx);
    error_log("[mol_b2b_trial_email] sent to {$email} island={$island}");
    return true;
}

/**
 * Send notification to founder when a B2B meeting/demo is requested.
 * Best-effort: never blocks the ok response.
 */
function mol_b2b_meeting_notify(array $cfg, array $data): bool {
    $resendKey = $cfg['resend_key'] ?? '';
    if (!$resendKey) return false;

    $to = 'contact@sargasses-martinique.com';
    $email  = $data['email'] ?? '';
    $org    = $data['org'] ?? '';
    $lit    = $data['littoral'] ?? '';
    $phone  = $data['phone'] ?? '';
    $island = $data['island'] ?? 'MQ';

    $subject = "Nouvelle demande B2B — {$org}";
    $html = '<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px;font-size:15px;color:#1a1a1a">'
        . '<h2 style="margin:0 0 12px">Nouvelle demande de démo / devis</h2>'
        . '<table style="width:100%;border-collapse:collapse">'
        . '<tr><td style="padding:6px 0;font-weight:700;width:100px">Email</td><td>' . htmlspecialchars($email) . '</td></tr>'
        . '<tr><td style="padding:6px 0;font-weight:700">Organisation</td><td>' . htmlspecialchars($org) . '</td></tr>'
        . '<tr><td style="padding:6px 0;font-weight:700">Littoral</td><td>' . htmlspecialchars($lit) . '</td></tr>'
        . '<tr><td style="padding:6px 0;font-weight:700">Téléphone</td><td>' . htmlspecialchars($phone) . '</td></tr>'
        . '<tr><td style="padding:6px 0;font-weight:700">Île</td><td>' . htmlspecialchars($island) . '</td></tr>'
        . '</table>'
        . '</div>';

    $payload = json_encode([
        'from'    => 'Sargasses B2B <alerte@sargasses-martinique.com>',
        'to'      => [$to],
        'subject' => $subject,
        'html'    => $html,
    ]);
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 10,
        'header' => "Authorization: Bearer {$resendKey}\r\nContent-Type: application/json\r\n",
        'content' => $payload, 'ignore_errors' => true,
    ]]);
    @file_get_contents('https://api.resend.com/emails', false, $ctx);
    error_log("[mol_b2b_meeting_notify] sent for {$email} org={$org}");
    return true;
}

/**
 * Send retry email for failed Mollie payment.
 * Best-effort: returns false if not configured.
 */
function mol_payment_failed_retry_email(array $cfg, string $pid, string $email, string $amount, string $currency, string $island, string $plan, string $reason): bool {
    $resendKey = $cfg['resend_key'] ?? '';
    if (!$resendKey || !$email) return false;

    $domainMap = [
        'MQ' => 'sargasses-martinique.com', 'GP' => 'sargasses-guadeloupe.com',
        'florida' => 'sargassummiami.com', 'puntacana' => 'sargassumpuntacana.com',
        'rivieramaya' => 'sargassumcancun.com',
    ];
    $domain = $domainMap[$island] ?? 'sargasses-martinique.com';
    $lang = in_array($island, ['florida', 'puntacana', 'rivieramaya']) ? 'en' : 'fr';

    $title = $lang === 'en' ? 'Payment issue — retry now' : 'Problème de paiement — réessaie maintenant';
    $body  = $lang === 'en'
        ? "Your payment of {$amount} {$currency} could not be processed ({$reason}). No worries — try again:"
        : "Ton paiement de {$amount} {$currency} n'a pas abouti ({$reason}). Pas de souci — réessaie :";
    $cta   = $lang === 'en' ? 'Retry payment' : 'Réessayer le paiement';
    $retryUrl = "https://{$domain}/?retry_pid=" . urlencode($pid);

    $html = '<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px;font-size:15px;color:#1a1a1a">'
        . '<h2 style="margin:0 0 12px;color:#0D1E1C">' . $title . '</h2>'
        . '<p>' . $body . '</p>'
        . '<p><a href="' . htmlspecialchars($retryUrl) . '" style="display:inline-block;background:linear-gradient(135deg,#FFC72C,#E8A800);color:#0D1E1C;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:16px">' . $cta . ' &rarr;</a></p>'
        . '<p style="color:#888;font-size:12px">Pass: ' . htmlspecialchars($plan) . ' &middot; Ref: ' . htmlspecialchars($pid) . '</p>'
        . '</div>';

    $payload = json_encode([
        'from'    => "Sargasses <alerte@{$domain}>",
        'to'      => [$email],
        'subject' => $title,
        'html'    => $html,
    ]);
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 10,
        'header' => "Authorization: Bearer {$resendKey}\r\nContent-Type: application/json\r\n",
        'content' => $payload, 'ignore_errors' => true,
    ]]);
    @file_get_contents('https://api.resend.com/emails', false, $ctx);
    error_log("[mol_payment_failed_retry_email] sent to {$email} pid={$pid}");
    return true;
}
