<?php
// ── PayPal REST proxy — chemin de paiement PARALLELE a create-checkout.php ────
// Active cote front par le flag PAY_PROVIDER='paypal' (Sargasses_PROD.jsx). Le
// flux Stripe reste intact et dormant : on flippe le flag pour rebrancher Stripe.
//
// Flux on-site (Advanced Card Payments / Card Fields, equivalent du Payment
// Element) :
//   PASS one-time : front createOrder -> create_order (serveur) -> Card Fields
//                   submit -> onApprove -> capture_order (serveur, COMPLETED) ->
//                   front pose sg_premium_pass_end.
//   ABO recurrent : front createSubscription -> create_subscription (serveur,
//                   plan_id) -> Card Fields submit -> onApprove -> front pose
//                   sg_premium. Renouvellements/annulations via paypal-webhook.php.
//
// Memes conventions que create-checkout.php : CORS par origine, attribution
// island_plan_source, forward fulfillment Apps Script (meme shape que le webhook
// Stripe -> la Sheet dedoublonne par id), rate-limiting fail-open par IP+action.

header('Content-Type: application/json');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
// SYNC MANUEL avec create-checkout.php / stripe-webhook.php (memes domaines).
$allowed = ['https://sargasses-martinique.com','https://sargasses-guadeloupe.com','https://sargassumpuntacana.com','https://sargassummiami.com','https://sargassumcancun.com'];
if (in_array($origin, $allowed, true)) header("Access-Control-Allow-Origin: $origin");

$ISLAND_BY_ORIGIN = [
    'https://sargasses-martinique.com' => 'mq',
    'https://sargasses-guadeloupe.com' => 'gp',
    'https://sargassumpuntacana.com'   => 'puntacana',
    'https://sargassummiami.com'       => 'florida',
    'https://sargassumcancun.com'      => 'rivieramaya',
];
$island = $ISLAND_BY_ORIGIN[$origin] ?? '';

if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') { http_response_code(405); exit; }

$cfg = require __DIR__ . '/paypal-config.php';
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';

// ── Rate-limiting (meme garde anti card-testing que create-checkout.php) ──────
require_once __DIR__ . '/_ratelimit.php';
$RL_LIMITS = [
    'create_order'        => 20,
    'capture_order'       => 20,
    'create_subscription' => 15,
    'confirm_subscription' => 20,
    'verify_subscription' => 30,
    'cancel_subscription' => 20,
];
sg_rate_limit('pp_' . $action, $RL_LIMITS[$action] ?? 30);

// ── Helpers PayPal REST ───────────────────────────────────────────────────────
function pp_base() {
    global $cfg;
    return (($cfg['env'] ?? 'sandbox') === 'live')
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
}

// OAuth2 client_credentials -> access token (Basic client_id:secret).
function pp_token() {
    global $cfg;
    $ch = curl_init(pp_base() . '/v1/oauth2/token');
    curl_setopt_array($ch, [
        CURLOPT_USERPWD        => ($cfg['client_id'] ?? '') . ':' . ($cfg['secret'] ?? ''),
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => 'grant_type=client_credentials',
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode($body, true);
    if ($code >= 400 || empty($data['access_token'])) {
        http_response_code(500);
        echo json_encode(['error' => 'paypal auth failed']);
        exit;
    }
    return $data['access_token'];
}

// Appel API authentifie. $body=array -> JSON. Retourne [$httpCode, $decoded].
function pp_api($method, $path, $body = null, $token = null) {
    $token = $token ?: pp_token();
    $ch = curl_init(pp_base() . $path);
    $headers = ['Authorization: Bearer ' . $token, 'Content-Type: application/json'];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode($resp, true)];
}

// Devise + montants autorises PAR REGION (anti-tampering, meme allowlist que
// create-checkout.php pay_once). Forge d'un montant hors-liste -> rejet.
function pp_currency_and_allowed($island) {
    $usd = in_array($island, ['florida', 'rivieramaya', 'puntacana'], true);
    return [
        $usd ? 'USD' : 'EUR',
        $usd ? [599] : [799, 999, 1499, 1999, 2499],
    ];
}

// Forward fulfillment vers l'Apps Script — MEME shape que stripe-webhook.php
// (type checkout.session.completed) -> la Sheet 'payments' loggue a l'identique,
// dedup par id. Fire-and-forget (apres reponse au front).
function pp_forward_fulfillment($cfg, $id, $email, $cents, $currency, $island, $plan, $source) {
    $url = $cfg['appsscript_url'] ?? 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
    $payload = json_encode([
        'type'           => 'checkout.session.completed',
        'verified'       => true,
        'webhook_source' => 'paypal',
        'data' => ['object' => [
            'id'                  => $id,
            'payment_status'      => 'paid',
            'amount_total'        => $cents,
            'currency'            => strtolower($currency),
            'customer_email'      => $email,
            'client_reference_id' => substr(($island !== '' ? $island : 'mq') . '_' . $plan . '_' . $source, 0, 200),
            'metadata'            => ['island' => ($island !== '' ? $island : 'mq')],
        ]],
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_TIMEOUT => 8]);
    @curl_exec($ch);
    curl_close($ch);
}

// Email de bienvenue (fire-and-forget). Le deblocage premium NE depend PAS de
// cet email — il confirme juste l'acces. Vide si resend_key absente.
function pp_welcome_email($cfg, $to, $island, $isPass, $lang) {
    $key = $cfg['resend_key'] ?? '';
    if (!$key || !$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;
    $islandSlug = (strpos($to, 'guadeloupe') !== false || $island === 'gp') ? 'guadeloupe' : 'martinique';
    $from = 'Sargasses ' . ucfirst($islandSlug) . " <alerte@sargasses-{$islandSlug}.com>";
    $domain = "sargasses-{$islandSlug}.com";
    $en = ($lang === 'en');
    $title = $isPass
        ? ($en ? "Your pass is active" : "Ton pass est actif")
        : ($en ? "You're in!" : "C'est parti !");
    $body = $en
        ? "Your access is live: 7-day forecast, alerts &amp; morning brief per beach."
        : "Ton acces est active : prevision 7 jours, alertes &amp; brief matinal par plage.";
    $cta = $en ? "Open the map" : "Voir la carte";
    $html = '<div style="font-family:system-ui,-apple-system,Arial;max-width:480px;margin:0 auto;padding:28px 20px;color:#1a1a1a">'
        . '<div style="font:700 12px/1 system-ui;letter-spacing:1.5px;color:#E8A800;text-transform:uppercase;margin-bottom:10px">PREMIUM</div>'
        . '<h1 style="font-size:24px;margin:0 0 8px">' . $title . '</h1>'
        . '<p style="font-size:15px;color:#444;margin:0 0 22px">' . $body . '</p>'
        . '<a href="https://' . $domain . '/" style="display:inline-block;background:linear-gradient(135deg,#E8A800,#F0C040);color:#1a1a1a;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">' . $cta . '</a>'
        . '<p style="font-size:11px;color:#bbb;margin:24px 0 0">Sargasses ' . ucfirst($islandSlug) . ' &middot; ' . $domain . '</p></div>';
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode(['from' => $from, 'to' => [$to], 'subject' => $title, 'html' => $html]),
        CURLOPT_TIMEOUT        => 6,
    ]);
    @curl_exec($ch);
    curl_close($ch);
}

// Mapping email->subscriptionId pour verify_subscription (PayPal n'indexe pas les
// abos par email). Fichier dans api/data/ (non servi par HTTP via data/.htaccess).
function pp_subs_dir() {
    $d = __DIR__ . '/data/paypal-subs';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}
function pp_store_sub($email, $subId) {
    $f = pp_subs_dir() . '/' . sha1(strtolower(trim($email))) . '.json';
    @file_put_contents($f, json_encode(['email' => $email, 'sub' => $subId, 'ts' => time()]));
}
function pp_lookup_sub($email) {
    $f = pp_subs_dir() . '/' . sha1(strtolower(trim($email))) . '.json';
    if (!is_file($f)) return null;
    $d = json_decode(@file_get_contents($f), true);
    return $d['sub'] ?? null;
}

// ── Action: create_order — PASS one-time. Cree un order CAPTURE, renvoie l'id
// (consomme par le callback createOrder des Card Fields cote front).
if ($action === 'create_order') {
    $cents = (int)($input['cents'] ?? 0);
    $pass = preg_replace('/[^a-z0-9]/', '', $input['pass'] ?? '');
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');
    list($currency, $allowedCents) = pp_currency_and_allowed($island);
    if (!in_array($cents, $allowedCents, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'bad pass params']);
        exit;
    }
    $value = number_format($cents / 100, 2, '.', ''); // 799 -> "7.99"
    $ref = substr(($island !== '' ? $island : 'mq') . '_' . $pass . '_' . $source, 0, 127);
    list($code, $order) = pp_api('POST', '/v2/checkout/orders', [
        'intent' => 'CAPTURE',
        'purchase_units' => [[
            'amount'      => ['currency_code' => $currency, 'value' => $value],
            'custom_id'   => $ref,
            'description' => 'Sargasses pass ' . $pass,
        ]],
    ]);
    if ($code >= 400 || empty($order['id'])) {
        http_response_code(500);
        echo json_encode(['error' => 'order create failed']);
        exit;
    }
    echo json_encode(['orderId' => $order['id']]);
    exit;
}

// ── Action: capture_order — capture l'order apres approbation Card Fields.
// COMPLETED -> fulfillment (Apps Script + email). Le front pose sg_premium_pass_end.
if ($action === 'capture_order') {
    $orderId = preg_replace('/[^A-Za-z0-9_-]/', '', $input['orderId'] ?? '');
    $email = trim($input['email'] ?? '');
    $pass = preg_replace('/[^a-z0-9]/', '', $input['pass'] ?? '');
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');
    $lang = preg_replace('/[^a-z]/', '', $input['lang'] ?? 'fr');
    if (!$orderId) {
        http_response_code(400);
        echo json_encode(['error' => 'missing orderId']);
        exit;
    }
    list($code, $cap) = pp_api('POST', '/v2/checkout/orders/' . $orderId . '/capture', new stdClass());
    $status = $cap['status'] ?? '';
    if ($code >= 400 || $status !== 'COMPLETED') {
        // DECLINED / PENDING / erreur -> le front affiche "reessaie" (in-place).
        echo json_encode(['paymentFailed' => true, 'status' => $status]);
        exit;
    }
    // Montant reellement capture (source de verite, pas l'input client).
    $pu = $cap['purchase_units'][0] ?? [];
    $capInfo = $pu['payments']['captures'][0]['amount'] ?? [];
    $currency = $capInfo['currency_code'] ?? 'EUR';
    $cents = isset($capInfo['value']) ? (int)round(((float)$capInfo['value']) * 100) : 0;
    $payerEmail = $email ?: ($cap['payer']['email_address'] ?? '');

    echo json_encode(['ok' => true, 'orderId' => $orderId]);
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
    pp_forward_fulfillment($cfg, $orderId, $payerEmail, $cents, $currency, $island, $pass, $source);
    pp_welcome_email($cfg, $payerEmail, $island, true, $lang);
    exit;
}

// ── Action: create_subscription — ABO recurrent. Cree la subscription contre un
// billing plan (config), renvoie l'id (consomme par createSubscription des Card
// Fields). L'activation se fait a l'approbation carte ; on stocke email->id.
if ($action === 'create_subscription') {
    $planIn = ($input['plan'] ?? 'monthly') === 'annual' ? 'annual' : 'monthly';
    $email = trim($input['email'] ?? '');
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'missing email']);
        exit;
    }
    $byRegion = $cfg['plans_by_region'] ?? [];
    $regionPlans = ($island !== '' && isset($byRegion[$island])) ? $byRegion[$island] : null;
    $planId = $regionPlans[$planIn] ?? ($cfg['plans'][$planIn] ?? '');
    if (!$planId || strpos($planId, 'P-REPLACE') === 0) {
        http_response_code(500);
        echo json_encode(['error' => 'no plan configured']);
        exit;
    }
    $ref = substr(($island !== '' ? $island : 'mq') . '_' . $planIn . '_' . $source, 0, 127);
    list($code, $sub) = pp_api('POST', '/v1/billing/subscriptions', [
        'plan_id'      => $planId,
        'custom_id'    => $ref,
        'subscriber'   => ['email_address' => $email],
        'application_context' => [
            'shipping_preference' => 'NO_SHIPPING',
            'user_action'         => 'SUBSCRIBE_NOW',
        ],
    ]);
    if ($code >= 400 || empty($sub['id'])) {
        http_response_code(500);
        echo json_encode(['error' => 'subscription create failed']);
        exit;
    }
    pp_store_sub($email, $sub['id']);
    echo json_encode(['subscriptionId' => $sub['id'], 'status' => $sub['status'] ?? '']);
    exit;
}

// ── Action: verify_subscription — deblocage cross-device (equivalent Stripe).
// Lookup email->id (stocke a la creation) -> statut PayPal ACTIVE ?
if ($action === 'verify_subscription') {
    $email = trim($input['email'] ?? '');
    if (!$email) {
        http_response_code(400);
        echo json_encode(['error' => 'missing email']);
        exit;
    }
    $subId = pp_lookup_sub($email);
    if (!$subId) { echo json_encode(['active' => false, 'reason' => 'no_subscription']); exit; }
    list($code, $sub) = pp_api('GET', '/v1/billing/subscriptions/' . rawurlencode($subId));
    $status = $sub['status'] ?? '';
    echo json_encode(['active' => in_array($status, ['ACTIVE', 'APPROVED'], true), 'status' => $status]);
    exit;
}

// ── Action: cancel_subscription — gerer/annuler (equivalent portal Stripe).
if ($action === 'cancel_subscription') {
    $email = trim($input['email'] ?? '');
    $subId = $email ? pp_lookup_sub($email) : '';
    if (!$subId) { http_response_code(404); echo json_encode(['error' => 'no subscription']); exit; }
    list($code, $_x) = pp_api('POST', '/v1/billing/subscriptions/' . rawurlencode($subId) . '/cancel', ['reason' => 'user requested']);
    echo json_encode(['cancelled' => $code < 400]);
    exit;
}

// ── Action: confirm_subscription — bouton PayPal onApprove : verifie l'abo ACTIVE,
// stocke email->id (verify cross-device), forward fulfillment (meme shape stripe-webhook).
if ($action === 'confirm_subscription') {
    $subId = preg_replace('/[^A-Za-z0-9_-]/', '', $input['subscriptionId'] ?? '');
    $email = trim($input['email'] ?? '');
    $planIn = ($input['plan'] ?? 'monthly') === 'annual' ? 'annual' : 'monthly';
    if (!$subId) { http_response_code(400); echo json_encode(['error' => 'missing subscriptionId']); exit; }
    list($code, $sub) = pp_api('GET', '/v1/billing/subscriptions/' . rawurlencode($subId));
    $status = $sub['status'] ?? '';
    $active = in_array($status, ['ACTIVE', 'APPROVED'], true);
    echo json_encode(['active' => $active, 'status' => $status]);
    if ($active) {
        if ($email !== '') pp_store_sub($email, $subId);
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
        $cents = $planIn === 'annual' ? 3999 : 499;
        pp_forward_fulfillment($cfg, $subId, $email, $cents, 'eur', $island, $planIn, 'paypal_button');
    }
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
