<?php
header('Content-Type: application/json');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
// SYNC MANUEL avec les domaines de regions/*.json (regions/index.cjs est du
// CommonJS, non chargeable depuis PHP). Ajouter ici chaque nouvelle region
// qui sert ce endpoint (scripts/test-stripe-webhook.cjs verifie la coherence).
$allowed = ['https://sargasses-martinique.com','https://sargasses-guadeloupe.com','https://sargassumpuntacana.com','https://sargassummiami.com','https://sargassumcancun.com'];
if (in_array($origin, $allowed)) header("Access-Control-Allow-Origin: $origin");

// Region du domaine appelant → metadata.island sur customer + subscription,
// pour que stripe-webhook.php puisse attribuer les events de lifecycle
// (invoice.*, customer.subscription.*) sur ce compte Stripe partage.
$ISLAND_BY_ORIGIN = [
    'https://sargasses-martinique.com' => 'mq',
    'https://sargasses-guadeloupe.com' => 'gp',
    'https://sargassumpuntacana.com'   => 'puntacana',
    'https://sargassummiami.com'       => 'florida',
    'https://sargassumcancun.com'      => 'rivieramaya',
];
$island = $ISLAND_BY_ORIGIN[$origin] ?? '';

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

function resend($to, $subject, $html) {
    global $cfg;
    $key = $cfg['resend_key'] ?? '';
    if (!$key) return;
    $island = (strpos($to, 'guadeloupe') !== false || strpos($_SERVER['HTTP_ORIGIN'] ?? '', 'guadeloupe') !== false)
        ? 'guadeloupe' : 'martinique';
    $from = "Sargasses " . ucfirst($island) . " <alerte@sargasses-{$island}.com>";
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'from'    => $from,
            'to'      => [$to],
            'subject' => $subject,
            'html'    => $html,
        ]),
        CURLOPT_TIMEOUT => 5,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

function buildWelcomeEmail($island, $trialEnd, $domain, $lang) {
    $islandName = ($island === 'GP') ? 'Guadeloupe' : 'Martinique';
    $dateEnd = date('j/m/Y', $trialEnd);
    $manageUrl = "https://{$domain}/?manage=1";
    $mapUrl = "https://{$domain}/";

    if ($lang === 'en') {
        $title = "You're in!";
        $subtitle = "Your 7-day forecast is now active.";
        $feat1 = "7-day forecast for all beaches";
        $feat2 = "Push alerts when conditions change";
        $feat3 = "Zero ads, clean experience";
        $ctaText = "Open the map";
        $trialNote = "Your free trial ends on {$dateEnd}. You'll only be charged if you stay.";
        $manageText = "Manage my subscription";
    } else {
        $title = "C'est parti !";
        $subtitle = "Tes previsions 7 jours sont actives.";
        $feat1 = "Previsions 7 jours pour toutes les plages";
        $feat2 = "Alertes push quand les conditions changent";
        $feat3 = "Zero pub, experience propre";
        $ctaText = "Voir la carte";
        $trialNote = "Ton essai gratuit se termine le {$dateEnd}. Tu ne seras debite que si tu restes.";
        $manageText = "Gerer mon abonnement";
    }

    return <<<HTML
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

<!-- Header dark -->
<tr><td style="background:#0D1E1C;padding:40px 32px 32px;text-align:center;">
  <div style="display:inline-block;background:rgba(232,168,0,.15);color:#E8A800;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:6px 16px;border-radius:20px;text-transform:uppercase;margin-bottom:16px;">PREMIUM</div>
  <h1 style="color:#fff;font-size:26px;margin:12px 0 8px;font-weight:800;">{$title}</h1>
  <p style="color:rgba(255,255,255,.7);font-size:15px;margin:0;">{$subtitle}</p>
</td></tr>

<!-- Body blanc -->
<tr><td style="background:#fff;padding:32px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:10px 0;font-size:15px;color:#1a1a1a;">
      <span style="color:#009E8E;font-weight:700;margin-right:8px;">&#10003;</span> {$feat1}
    </td></tr>
    <tr><td style="padding:10px 0;font-size:15px;color:#1a1a1a;">
      <span style="color:#009E8E;font-weight:700;margin-right:8px;">&#10003;</span> {$feat2}
    </td></tr>
    <tr><td style="padding:10px 0;font-size:15px;color:#1a1a1a;">
      <span style="color:#009E8E;font-weight:700;margin-right:8px;">&#10003;</span> {$feat3}
    </td></tr>
  </table>

  <!-- CTA -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 16px;">
    <tr><td align="center">
      <a href="{$mapUrl}" style="display:inline-block;background:linear-gradient(135deg,#E8A800,#F0C040);color:#1a1a1a;font-size:16px;font-weight:700;padding:16px 40px;border-radius:14px;text-decoration:none;">{$ctaText}</a>
    </td></tr>
  </table>

  <p style="color:#888;font-size:12px;text-align:center;margin:16px 0 0;line-height:1.5;">{$trialNote}</p>
</td></tr>

<!-- Footer -->
<tr><td style="background:#f9f9f9;padding:20px 32px;text-align:center;border-top:1px solid #eee;">
  <a href="{$manageUrl}" style="color:#888;font-size:12px;text-decoration:underline;">{$manageText}</a>
  <p style="color:#bbb;font-size:11px;margin:8px 0 0;">Sargasses {$islandName} &middot; {$domain}</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>
HTML;
}

// ── Action: embedded — Checkout Session ui_mode=embedded : le formulaire
// Stripe complet (CB + Apple Pay + Google Pay + Link) monte DANS l'app, plus
// de redirect plein-page vers buy.stripe.com. Memes conditions que les
// Payment Links : essai 7 jours, prix par region (prices_by_region dans
// stripe-config.php — fallback 'prices' plat EUR pour MQ/GP). Le retour
// /?session_id={CHECKOUT_SESSION_ID} reutilise le handler historique du front
// (deblocage premium + sg_conversion) et le webhook signe reste la verite.
if ($action === 'embedded') {
    $plan = (($input['plan'] ?? 'monthly') === 'annual') ? 'annual' : 'monthly';
    $byRegion = $cfg['prices_by_region'] ?? [];
    $regionPrices = ($island !== '' && isset($byRegion[$island])) ? $byRegion[$island] : null;
    $price = $regionPrices[$plan] ?? ($cfg['prices'][$plan] ?? ($cfg['prices']['monthly'] ?? ''));
    if (!$price) {
        http_response_code(500);
        echo json_encode(['error' => 'no price configured']);
        exit;
    }

    $email = trim($input['email'] ?? '');
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');
    // Meme format que stripeUrlWith cote front : attribution region_plan_source
    $ref = substr(($island !== '' ? $island : 'mq') . '_' . $plan . '_' . $source, 0, 200);
    $returnBase = in_array($origin, $allowed, true) ? $origin : 'https://sargasses-martinique.com';

    $params = [
        'ui_mode'                              => 'embedded',
        'mode'                                 => 'subscription',
        'line_items[0][price]'                 => $price,
        'line_items[0][quantity]'              => 1,
        'subscription_data[trial_period_days]' => 7,
        'return_url'                           => $returnBase . '/?session_id={CHECKOUT_SESSION_ID}',
        'client_reference_id'                  => $ref,
    ];
    if ($island !== '') {
        $params['metadata[island]'] = $island;
        $params['subscription_data[metadata][island]'] = $island;
    }
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $params['customer_email'] = $email;
    }
    $session = stripe('POST', '/checkout/sessions', $params);
    echo json_encode(['clientSecret' => $session['client_secret'] ?? null]);
    exit;
}

// ── Action: setup — cree un SetupIntent (collecte carte)
// card + link uniquement : Apple/Google Pay passent par 'card', et aucun
// moyen de paiement a redirect → confirmSetup reste 100% in-app (3DS=iframe).
if ($action === 'setup') {
    $si = stripe('POST', '/setup_intents', [
        'payment_method_types[0]' => 'card',
        'payment_method_types[1]' => 'link',
    ]);
    echo json_encode(['clientSecret' => $si['client_secret']]);
    exit;
}

// ── Action: subscribe — cree Customer + Subscription avec trial.
// Flow checkout ON-SITE (Payment Element dans le modal, 2026-06-10) :
// setup → confirmSetup côté client → subscribe. AUCUN redirect.
if ($action === 'subscribe') {
    $email = $input['email'] ?? '';
    $plan = (($input['plan'] ?? 'monthly') === 'annual') ? 'annual' : 'monthly';
    $setupIntentId = $input['setupIntentId'] ?? '';
    $lang = $input['lang'] ?? 'fr';
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');

    if (!$email || !$setupIntentId) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing email or setupIntentId']);
        exit;
    }

    // Recuperer le payment method du SetupIntent
    $si = stripe('GET', "/setup_intents/$setupIntentId");
    $pm = $si['payment_method'];

    // Creer le client Stripe
    $customerParams = [
        'email' => $email,
        'payment_method' => $pm,
        'invoice_settings[default_payment_method]' => $pm,
    ];
    if ($island !== '') $customerParams['metadata[island]'] = $island;
    $customer = stripe('POST', '/customers', $customerParams);

    // Creer l'abonnement avec essai 7j — prix PAR REGION (memes prices que les
    // Payment Links), metadata plan/source = attribution. automatic_tax retire
    // (les Payment Links ne l'activent pas ; l'activer 400 si Stripe Tax off).
    $byRegion = $cfg['prices_by_region'] ?? [];
    $regionPrices = ($island !== '' && isset($byRegion[$island])) ? $byRegion[$island] : null;
    $price = $regionPrices[$plan] ?? ($cfg['prices'][$plan] ?? $cfg['prices']['monthly']);
    $subParams = [
        'customer'                    => $customer['id'],
        'items[0][price]'             => $price,
        'trial_period_days'           => 7,
        'default_payment_method'      => $pm,
        'metadata[plan]'              => $plan,
        'metadata[source]'            => $source,
    ];
    if ($island !== '') $subParams['metadata[island]'] = $island;
    $sub = stripe('POST', '/subscriptions', $subParams);

    $response = [
        'subscriptionId' => $sub['id'],
        'status'         => $sub['status'],
        'trialEnd'       => $sub['trial_end'],
    ];
    echo json_encode($response);
    // Repondre TOUT DE SUITE (le paywall attend) — logs + email partent en
    // arriere-plan, meme pattern que stripe-webhook.php.
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }

    // Log paiement vers la sheet 'payments' (Apps Script) : ce flow ne passe
    // PAS par Checkout → checkout.session.completed ne tire jamais. Sans ce
    // forward, payments_real (funnel) serait aveugle aux abonnements on-site.
    // Dedup cote Apps Script par id (= sub id).
    try {
        $payLog = json_encode([
            'type' => 'checkout.session.completed',
            'verified' => true,
            'webhook_source' => 'subscribe_onsite',
            'data' => ['object' => [
                'id' => $sub['id'],
                'payment_status' => $sub['status'],
                'customer_email' => $email,
                'client_reference_id' => substr(($island !== '' ? $island : 'mq') . '_' . $plan . '_' . $source, 0, 200),
                'metadata' => ['island' => ($island !== '' ? $island : 'mq')],
            ]],
        ]);
        $chP = curl_init($cfg['appsscript_url'] ?? 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec');
        curl_setopt_array($chP, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payLog, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_TIMEOUT => 8]);
        curl_exec($chP);
        curl_close($chP);
    } catch (Exception $e) {}

    // Email de bienvenue (fire-and-forget)
    try {
        $island = (strpos($origin, 'guadeloupe') !== false) ? 'GP' : 'MQ';
        $domain = parse_url($origin, PHP_URL_HOST) ?: 'sargasses-martinique.com';
        $subject = ($lang === 'en')
            ? "You're in - your 7-day forecast is live"
            : "C'est parti - tes previsions 7 jours sont actives";
        $html = buildWelcomeEmail($island, $sub['trial_end'], $domain, $lang);
        resend($email, $subject, $html);
        // Log to Google Sheet (fire-and-forget)
        $trackData = json_encode([
            'type' => 'email_tracking',
            'to' => $email,
            'subject' => $subject,
            'email_type' => 'post_checkout',
            'island' => $island,
            'status' => 'sent',
            'plan' => $plan,
            'source' => $input['source'] ?? '',
            'date' => date('c'),
        ]);
        $ch2 = curl_init('https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec');
        curl_setopt_array($ch2, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $trackData, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
        curl_exec($ch2); curl_close($ch2);
    } catch (Exception $e) {}
    exit;
}

// ── Action: verify_subscription — check if email has active/trialing sub
// Used by welcome email "Voir la carte" link to unlock premium on fresh devices
if ($action === 'verify_subscription') {
    $email = $input['email'] ?? '';
    if (!$email) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing email']);
        exit;
    }
    $customers = stripe('GET', '/customers?email=' . urlencode($email) . '&limit=1');
    if (empty($customers['data'])) {
        echo json_encode(['active' => false, 'reason' => 'no_customer']);
        exit;
    }
    $customerId = $customers['data'][0]['id'];
    $subs = stripe('GET', '/subscriptions?customer=' . $customerId . '&status=all&limit=5');
    $active = false;
    $trialEnd = null;
    $status = null;
    foreach ($subs['data'] as $sub) {
        if (in_array($sub['status'], ['active', 'trialing', 'past_due'])) {
            $active = true;
            $trialEnd = $sub['trial_end'] ?? null;
            $status = $sub['status'];
            break;
        }
    }
    echo json_encode(['active' => $active, 'trialEnd' => $trialEnd, 'status' => $status]);
    exit;
}

// ── Action: portal — Customer Portal (gerer / annuler abonnement)
if ($action === 'portal') {
    $email = $input['email'] ?? '';
    if (!$email) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing email']);
        exit;
    }

    $customers = stripe('GET', '/customers?email=' . urlencode($email) . '&limit=1');
    if (empty($customers['data'])) {
        http_response_code(404);
        echo json_encode(['error' => 'Customer not found']);
        exit;
    }

    $returnUrl = $origin ?: 'https://sargasses-martinique.com';
    $session = stripe('POST', '/billing_portal/sessions', [
        'customer'   => $customers['data'][0]['id'],
        'return_url' => $returnUrl,
    ]);

    echo json_encode(['url' => $session['url']]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
