<?php
/**
 * Mollie on-site checkout + subscriptions (B2B mensuel + annuel)
 * Config (secrets) dans mollie-config.php (gitignored) — template : mollie-config.example.php
 */

require_once __DIR__ . '/mollie-lib.php';
require_once __DIR__ . '/_ratelimit.php';
// BUG-2026-011 : $cfg must be assigned (require_once alone drops the return value).
// Use require (not require_once) so the anonymous return array is captured.
// Subsequent calls to require_once mollie-config.php elsewhere (e.g. mollie-lib.php:136
// uses plain require) will re-execute harmlessly and return the same array.
// Check for secret file at Render's secret mount path first
$secretPath = '/etc/secrets/mollie-config.php';
$localPath = __DIR__ . '/mollie-config.php';
$cfg = require file_exists($secretPath) ? $secretPath : $localPath;
if (!is_array($cfg)) $cfg = [];  // garde-fou si mollie-config.php absent/corrompu

header('Content-Type: application/json; charset=utf-8');
// CORS whitelist — SYNC avec create-checkout.php / paypal.php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://sargasses-martinique.com','https://sargasses-guadeloupe.com','https://sargassumpuntacana.com','https://sargassummiami.com','https://sargassumcancun.com'];

// Validate user-provided URL is on an allowed Sargasses domain (anti-SSRF/exfiltration)
function mollie_validate_url($url, $allowedHosts) {
    if (!$url) return false;
    $p = parse_url($url);
    if (!isset($p['scheme']) || !in_array($p['scheme'], ['https','http'], true)) return false;
    if (!isset($p['host'])) return false;
    return in_array(strtolower($p['host']), $allowedHosts, true);
}
if (in_array($origin, $allowed, true)) header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') { http_response_code(405); echo json_encode(['error'=>'POST only']); exit; }

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?? [];

$action = $data['action'] ?? '';

// Rate limiting anti-abus (fail-open, même infra que create-checkout.php)
sg_rate_limit('mol_' . $action, 20);

try {
    $mollie = getMollieClient();

    if ($action === 'create_payment') {
        // One-off payment (B2C pass, B2B annual)
        $pass = $data['pass'] ?? null;
        $email = $data['email'] ?? '';
        $source = $data['source'] ?? 'unknown';
        $description = $data['description'] ?? ($pass ? "Sargasses Pass $pass" : 'Sargasses');
        $paymentMethod = $data['method'] ?? ($data['paymentMethod'] ?? null);
        $cardToken = $data['cardToken'] ?? null;

        // ── Construction du montant : le front envoie cents (int), pas amount ──
        $cents = $data['cents'] ?? null;
        $amountObj = $data['amount'] ?? null;
        if ($cents !== null) {
            // Frontend normal : {pass:"p30", cents:1499, ...}
            $cents = (int)$cents;
            if ($cents <= 0) throw new Exception('cents invalide');
            $currency = strtoupper($data['cur'] ?? 'EUR');
            if (!in_array($currency, ['EUR', 'USD'], true)) $currency = 'EUR';
            $amountVal = $cents / 100;
            $amount = ['value' => number_format($amountVal, 2, '.', ''), 'currency' => $currency];
        } elseif ($amountObj && isset($amountObj['value']) && isset($amountObj['currency'])) {
            // Legacy / Mollie API direct : {amount:{value:"14.99", currency:"EUR"}}
            $amount = $amountObj;
            $currency = $amount['currency'];
            $amountVal = (float)$amount['value'];
        } else {
            throw new Exception('cents ou amount {value,currency} requis');
        }

        // ── Validation prix côté serveur (anti-tampering) ─────────────────────
        // Allowlist complète : pass -> {EUR: montant, USD: montant|null}
        // USD null = montant variable par région (trip7) → fallback plausibilité
        $passPrices = [
            'p30'    => ['EUR' => 14.99, 'USD' => 11.99],
            'trip7'  => ['EUR' => 4.99,  'USD' => null],
            'season' => ['EUR' => 19.99, 'USD' => null],
        ];
        $priceValid = false;
        if ($pass && isset($passPrices[$pass])) {
            $expected = $passPrices[$pass][$currency] ?? null;
            if ($expected !== null) {
                $priceValid = (abs($amountVal - $expected) < 0.02);
            } else {
                // Prix USD variable (trip7/season) : plausibilité
                $priceValid = ($amountVal > 0.50 && $amountVal < 50);
            }
        } elseif (!$pass) {
            // Subscription (B2B monthly) — montants defined in mol_b2b_plans()
            $priceValid = ($amountVal > 0 && $amountVal < 300);
        }
        if (!$priceValid) {
            error_log("[mollie.php] price tamper: pass=$pass amount=$amountVal currency=$currency");
            throw new Exception('Prix invalide');
        }

        // ── Surcharge USD peak season (juin-novembre, hors trip7) ─────────────
        if ($currency === 'USD' && $pass && $pass !== 'trip7') {
            $month = (int)date('n');
            if ($month >= 6 && $month <= 11) {
                $amount['value'] = (string)round((float)$amount['value'] * 1.15, 2);
            }
        }

        // ── Metadata : pass + email pour webhook + audit ──────────────────────
        $metadata = $data['metadata'] ?? [];
        $metadata['source'] = $source;
        $metadata['pass'] = $pass ?? '';
        $metadata['email'] = $email;
        $metadata['lang'] = $data['lang'] ?? 'fr';
        if (!empty($data['referredBy'])) $metadata['referredBy'] = $data['referredBy'];
        if (!empty($data['myReferralCode'])) $metadata['myReferralCode'] = $data['myReferralCode'];

        // ── Redirect : page statique /payment/good.html avec params ──────────
        // Le paymentId n'existe pas encore à ce stade. Le webhook confirme.
        $kind = $pass ? 'pass' : 'pro'; // p30/trip7/season → pass, B2B annual → pro
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        // Validate HTTP_HOST against known domains to prevent Host header injection
        $allowedHosts = ['sargasses-martinique.com','sargasses-guadeloupe.com','sargassumpuntacana.com','sargassummiami.com','sargassumcancun.com'];
        $rawHost = $_SERVER['HTTP_HOST'] ?? '';
        $host = in_array($rawHost, $allowedHosts, true) ? $rawHost : 'sargasses-martinique.com';
        $userRedirect = isset($data['redirectUrl']) && function_exists('mollie_validate_url') && mollie_validate_url($data['redirectUrl'], $allowed) ? $data['redirectUrl'] : null;
        $redirectUrl = $userRedirect ?? "$scheme://$host/payment/good.html?kind=$kind&email=" . urlencode($email) . "&plan=" . urlencode($pass ?: 'annual');
        $webhookUrl = "$scheme://$host/public/api/mollie-webhook.php"; // Always server-controlled

        // ── Protection double checkout (idempotence 60s par email+pass) ───────
        if ($pass && $email) {
            $idemKey = 'mol_checkout_' . md5($email . '|' . $pass);
            $existing = get_transient($idemKey);
            if ($existing) {
                error_log("[mollie.php] double checkout blocked: email=$email pass=$pass");
                throw new Exception('Paiement déjà en cours. Attends 60 secondes.');
            }
            set_transient($idemKey, '1', 60);
        }

        $paymentData = [
            'amount' => $amount,
            'description' => $description,
            'redirectUrl' => $redirectUrl,
            'webhookUrl' => $webhookUrl,
            'metadata' => $metadata,
            'locale' => $data['locale'] ?? 'fr_FR',
        ];
        if (!empty($data['applePayPaymentToken'])) {
            $paymentData['applePayPaymentToken'] = $data['applePayPaymentToken'];
        }
        if (!empty($cardToken)) {
            $paymentData['cardToken'] = $cardToken;
        }
        if ($paymentMethod) {
            $paymentData['method'] = $paymentMethod;
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
        $subScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $subHost = in_array(($_SERVER['HTTP_HOST'] ?? ''), $allowedHosts, true) ? $_SERVER['HTTP_HOST'] : 'sargasses-martinique.com';
        $userRedirect = isset($data['redirectUrl']) && function_exists('mollie_validate_url') && mollie_validate_url($data['redirectUrl'], $allowed) ? $data['redirectUrl'] : null;
        $redirectUrl = $userRedirect ?? "{$subScheme}://{$subHost}/pro/espace/";
        $webhookUrl = "{$subScheme}://{$subHost}/public/api/mollie-webhook.php"; // Always server-controlled
        $paymentMethod = $data['method'] ?? ($data['paymentMethod'] ?? null); // optional: 'applepay', 'googlepay', etc.
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
            // Try to get existing customer by email (filter client-side since Mollie API doesn't support email filter)
            $customers = $mollie->customers->page(['limit' => 50]);
            foreach ($customers as $c) {
                if (($c->email ?? '') === $data['email']) { $customer = $c; break; }
            }
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
            'amount' => ['value' => number_format($plan['amount'], 2, '.', ''), 'currency' => $plan['currency']],
            'description' => $plan['description'],
            'webhookUrl' => $webhookUrl,
            'metadata' => $metadata,
            'mandateId' => $data['mandateId'] ?? null,
            'interval' => $plan['interval'] ?? '1 month',
        ];
        // Note: redirectUrl not supported for customer subscriptions endpoint

        if ($paymentMethod) {
            $subscriptionData['method'] = $paymentMethod;
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

        // customer_mandates not yet exposed by SgMollieClient — return 501 until implemented
        http_response_code(501);
        echo json_encode(['error' => 'mandate_lookup_not_implemented']);
        // $mandate = $mollie->customer_mandates->get($customerId, $mandateId);
        echo json_encode(['mandate' => $mandate]);
        exit;
    }

    if ($action === 'payment_status') {
        $paymentId = $data['paymentId'] ?? '';
        if (!$paymentId) throw new Exception('paymentId requis');
        $payment = $mollie->payments->get($paymentId);
        $status = $payment->status ?? 'unknown';
        // Terminal statuses (canceled, expired, failed) indicate final failure
        $terminal = in_array($status, ['canceled', 'expired', 'failed'], true);
        // Seul "paid" = payé. "pending" = en attente (virement, 3DS non terminé).
        // "settled" = payé + viré (plus tardif, couvert par paid).
        $paid = in_array($status, ['paid', 'settled'], true);
        echo json_encode(['paid' => $paid, 'status' => $status, 'paymentId' => $paymentId, 'terminal' => $terminal]);
        exit;
    }

    if ($action === 'verify_subscription') {
        // BUG-2026-010 : déblocage cross-device des passes Mollie one-time.
        // Source de vérité = Supabase payment_grants (mirror posé par le webhook).
        // Le front (sgVerifySub) appelle mollie.php + create-checkout.php en parallèle ;
        // sans ce handler, un pass Mollie one-time payé sur un appareil ne pouvait pas
        // être restauré sur un nouvel appareil via ?premium_email=… (path canoniaque).
        // Shape de retour aligné sur Stripe/PayPal : {active, kind, passEnd, status}
        // ou {active:false, reason}. Ne lève jamais (préserve fallback Stripe côté front).
        $email = trim($data['email'] ?? '');
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing email']);
            exit;
        }
        // Same fallback as mollie-lib.php webhook mirror.
// Supabase URL is public; service key remains secret.
        $supabaseUrl = ($cfg['supabase_url'] ?? '') ?: getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
        $serviceKey  = ($cfg['supabase_service_key'] ?? '') ?: getenv('SUPABASE_SERVICE_KEY') ?: '';
        if (!$supabaseUrl || !$serviceKey) {
            // Supabase non configuré — échec propre, fallback Stripe côté front.
            error_log('[mollie.php] verify_subscription: SUPABASE_URL/SERVICE_KEY absents');
            echo json_encode(['active' => false, 'reason' => 'lookup_failed']);
            exit;
        }
        // Select le grant le plus récent pour cet email, type=b2c_pass, non expiré.
        // select=pass,expires_at,payment_id — ne remonte pas PII inutile (customer_id).
        $qs = http_build_query([
            'select' => 'pass,expires_at,payment_id',
            'type'   => 'eq.b2c_pass',
            'email'  => 'eq.' . $email,
            'expires_at' => 'gt.now()',
            'order'  => 'expires_at.desc',
            'limit'  => '1',
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
            CURLOPT_TIMEOUT        => 10,
        ]);
        $resp  = curl_exec($ch);
        $err   = curl_errno($ch);
        $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($err || $code >= 400) {
            error_log("[mollie.php] verify_subscription: Supabase err=$err code=$code");
            echo json_encode(['active' => false, 'reason' => 'lookup_failed']);
            exit;
        }
        $rows = json_decode($resp, true) ?? [];
        if (!is_array($rows) || empty($rows)) {
            echo json_encode(['active' => false, 'reason' => 'no_pass_grant']);
            exit;
        }
        $row = $rows[0];
        $expiresAtIso = $row['expires_at'] ?? null;
        if (!$expiresAtIso) {
            echo json_encode(['active' => false, 'reason' => 'no_pass_grant']);
            exit;
        }
        $passEnd = strtotime($expiresAtIso);
        if ($passEnd === false || $passEnd <= time()) {
            // Double-garde : Supabase a déjà filtré expires_at>now() mais on revérifie
            // au cas où l'horloge PHP soit skewée.
            echo json_encode(['active' => false, 'reason' => 'no_pass_grant']);
            exit;
        }
        // passEnd en ms (epoch) — aligné sur le format lu par le front
        // (sg_premium_pass_end = Date.now()+days*86400000).
        echo json_encode([
            'active'  => true,
            'kind'    => 'pass',
            'pass'    => $row['pass'] ?? null,
            'passEnd' => $passEnd * 1000,
            'status'  => 'paid',
        ]);
        exit;
    }

    if ($action === 'claim_referral_credit') {
        // 🔒 Verrouillé 2026-07-31 : aucun ledger referrals en place (TASK-P0-002).
        // Crédite 0 jour tant que le ledger réel n'est pas implémenté.
        // Format réponse préservé pour compatibilité front (days=0 → toast ignoré).
        $code = $data['code'] ?? '';
        if (!preg_match('/^REF-[A-Z0-9]{6}$/', $code)) {
            throw new Exception('Code de parrainage invalide');
        }

        $days = 0;

        echo json_encode(['days' => $days, 'code' => $code, 'enabled' => false]);
        exit;
    }

    if ($action === 'applepay_session') {
        $validationUrl = $data['validationUrl'] ?? '';
        if (!$validationUrl) throw new Exception('validationUrl requis');
        // Mollie exige que validationURL provienne d'Apple (apple.com domain).
        // Whitelist stricte pour éviter qu'un client forge une URL et fasse valider
        // un domaine arbitraire par Mollie via notre backend (anti-abus).
        if (!preg_match('#^https://(apple|cdn-apple|guzzoni).*\.apple\.com/#i', $validationUrl)) {
            error_log("[mollie.php] applepay_session rejected validationUrl=$validationUrl");
            throw new Exception('validationUrl doit provenir d\'apple.com');
        }
        $domain = $data['domain'] ?? ($_SERVER['HTTP_HOST'] ?? '');
        $session = $mollie->applePay->sessions->create([
            'validationUrl' => $validationUrl,
            'domain' => $domain,
        ]);
        echo json_encode($session);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'action_inconnue']);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('[mollie.php] ' . $e->getMessage());
    echo json_encode(['error' => 'payment_processing_error']);
}
