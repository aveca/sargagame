<?php
// ── Mollie REST proxy — chemin de paiement PARALLELE a create-checkout.php ────
// Active cote front par le flag PAY_PROVIDER='mollie' (Sargasses_PROD.jsx). Le
// flux Stripe reste intact et dormant ; PayPal (paypal.php) reste un fallback.
//
// On-site via Mollie Components (mollie.js cree un cardToken dans le DOM du front,
// equivalent du Payment Element). Pas d'approbation speciale sur la couche
// Components (carte activee sur le profil suffit). 3DS eventuel = Mollie renvoie
// _links.checkout -> le front rebondit puis revient (entry inline, AUTH redirect).
//
// PASS one-time : front cardToken -> create_payment (oneoff) -> payment_status
//                 confirme 'paid' -> front pose sg_premium_pass_end.
// ABO recurrent : front cardToken -> create_subscription (Customer + 1er paiement
//                 sequenceType 'first' = MANDAT + periode 1) -> a 'paid' on cree la
//                 Subscription startDate=+1 intervalle (anti double-charge),
//                 idempotent (sync si pas de 3DS, sinon payment_status / webhook).
//
// Confirmation serveur = source de verite (jamais le retour client). Fulfillment
// (forward Apps Script, meme shape que stripe-webhook.php) declenche a 'paid' par
// payment_status ET mollie-webhook.php (idempotent : la Sheet dedup par id).

header('Content-Type: application/json');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
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
$returnBase = in_array($origin, $allowed, true) ? $origin : 'https://sargasses-martinique.com';

// Devise par région. Le pass on-site Mollie est MULTI-DEVISE : Mollie encaisse en
// USD (cartes + Apple/Google Pay) et règle sur le compte EUR (conversion Mollie).
// MQ/GP = EUR ; régions touristes = USD. Région inconnue → pas de pass (gate plus bas).
$CUR_BY_ISLAND = ['mq' => 'EUR', 'gp' => 'EUR', 'florida' => 'USD', 'puntacana' => 'USD', 'rivieramaya' => 'USD'];

if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') { http_response_code(405); exit; }

$cfg = require __DIR__ . '/mollie-config.php';
require_once __DIR__ . '/mollie-lib.php';
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? '';

// ── Rate-limiting (meme garde anti card-testing que create-checkout.php) ──────
require_once __DIR__ . '/_ratelimit.php';
$RL_LIMITS = [
    'create_payment'      => 20,
    'create_subscription' => 15,
    'payment_status'      => 40,
    'verify_subscription' => 30,
    'cancel_subscription' => 20,
    'applepay_session'    => 30,
];
sg_rate_limit('mol_' . $action, $RL_LIMITS[$action] ?? 30);

// ── Action: create_payment — PASS one-time. cardToken (Components) -> paiement
// oneoff. cents valide contre l'allowlist des passes (config). 3DS -> checkoutUrl.
if ($action === 'create_payment') {
    if (!isset($CUR_BY_ISLAND[$island])) { http_response_code(400); echo json_encode(['error' => 'region_not_supported']); exit; }
    $currency = $CUR_BY_ISLAND[$island];
    $cardToken = $input['cardToken'] ?? '';
    // Wallet (Apple Pay / Google Pay) : PAS de cardToken on-site. On force `method`
    // -> Mollie renvoie le checkout heberge ou la feuille native du wallet s'affiche
    // (sur LEUR domaine -> AUCUN fichier de verification de domaine cote nous). Le
    // retour ?mollie_return=1 confirme via payment_status, comme la 3DS carte.
    $method = preg_replace('/[^a-z]/', '', $input['method'] ?? '');
    $method = in_array($method, ['applepay', 'googlepay'], true) ? $method : '';
    // Apple Pay / Google Pay ON-SITE (direct) : le token chiffré du wallet est créé
    // dans la feuille NATIVE sur notre page (pas de redirect). On le transmet tel quel
    // a Mollie avec method=creditcard -> paiement traite inline (statut paid direct).
    $applePayToken = is_string($input['applePayPaymentToken'] ?? null) ? $input['applePayPaymentToken'] : '';
    $googlePayToken = is_string($input['googlePayPaymentToken'] ?? null) ? $input['googlePayPaymentToken'] : '';
    $walletToken = $applePayToken ?: $googlePayToken;
    $passKey = preg_replace('/[^a-z0-9]/', '', $input['pass'] ?? '');
    $cents = (int)($input['cents'] ?? 0);
    $email = trim($input['email'] ?? '');
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');
    // Allowlist PAR DEVISE (anti-tampering, miroir du front PassOffer). cents seul ne
    // porte pas la devise → on valide la paire (devise, cents). EUR (MQ/GP) : 499
    // tripPass, 799/999 pass 7j, 1499/1999 pass 30j, 2499 saison. USD (régions
    // touristes) : 599 pass 7j ($5.99), 1199 pass 30j ($11.99), 1999 saison ($19.99).
    $allowedByCur = [
        'EUR' => [499, 799, 999, 1499, 1999, 2499],
        'USD' => [599, 1199, 1999],
    ];
    $allowedCents = $allowedByCur[$currency] ?? [];
    if ((!$cardToken && !$method && !$walletToken) || !in_array($cents, $allowedCents, true)) {
        http_response_code(400); echo json_encode(['error' => 'bad pass params']); exit;
    }
    $value = number_format($cents / 100, 2, '.', '');
    $payParams = [
        'amount'      => ['currency' => $currency, 'value' => $value],
        'description' => 'Sargasses pass ' . $passKey,
        'redirectUrl' => $returnBase . '/?mollie_return=1',
        'webhookUrl'  => $returnBase . '/api/mollie-webhook.php',
        'metadata'    => ['island' => ($island !== '' ? $island : 'mq'), 'pass' => $passKey, 'plan' => $passKey, 'source' => $source, 'email' => $email],
    ];
    if ($walletToken) {
        // Wallet ON-SITE direct : method=creditcard + token chiffre du wallet -> Mollie
        // traite inline (pas de checkoutUrl). Le front confirme via payment_status.
        $payParams['method'] = 'creditcard';
        if ($applePayToken)  $payParams['applePayPaymentToken']  = $applePayToken;
        if ($googlePayToken) $payParams['googlePayPaymentToken'] = $googlePayToken;
    } elseif ($cardToken) {
        $payParams['cardToken'] = $cardToken; // carte on-site (Components)
    } elseif ($method) {
        $payParams['method'] = $method;       // wallet -> checkout heberge (fallback redirect)
    }
    list($code, $pay) = mol_api('POST', '/payments', $payParams);
    if ($code >= 400 || empty($pay['id'])) { http_response_code(500); echo json_encode(['error' => 'payment create failed']); exit; }
    echo json_encode([
        'paymentId'   => $pay['id'],
        'status'      => $pay['status'] ?? '',
        'checkoutUrl' => $pay['_links']['checkout']['href'] ?? null, // present si 3DS requis
    ]);
    exit;
}

// ── Action: applepay_session — validation marchand pour Apple Pay ON-SITE (direct).
// Le front (ApplePaySession.onvalidatemerchant) nous envoie la validationUrl d'Apple ;
// on appelle l'API Mollie qui renvoie l'objet session opaque a passer tel quel a
// completeMerchantValidation(). Domaine = host autorise (fichier .well-known servi).
// Session non reutilisable, expire en 5 min. cf. docs.mollie.com wallets-api.
if ($action === 'applepay_session') {
    $validationUrl = $input['validationUrl'] ?? '';
    // Garde-fou : n'accepter qu'une URL de validation Apple (apple-pay-gateway*.apple.com).
    if (!preg_match('#^https://[a-z0-9.-]*apple\.com/#i', $validationUrl)) {
        http_response_code(400); echo json_encode(['error' => 'bad validationUrl']); exit;
    }
    $host = parse_url($returnBase, PHP_URL_HOST) ?: 'sargasses-martinique.com';
    list($code, $sess) = mol_api('POST', '/wallets/applepay/sessions', [
        'validationUrl' => $validationUrl,
        'domain'        => $host,
    ]);
    if ($code >= 400 || !is_array($sess)) { http_response_code(502); echo json_encode(['error' => 'applepay session failed']); exit; }
    echo json_encode($sess); // objet Apple opaque -> completeMerchantValidation
    exit;
}

// ── Action: create_subscription — ABO. cardToken -> Customer + 1er paiement
// sequenceType 'first' (mandat + periode 1). La Subscription est creee a 'paid'.
if ($action === 'create_subscription') {
    if (!mol_is_eur_region($island)) { http_response_code(400); echo json_encode(['error' => 'region_not_supported']); exit; }
    $cardToken = $input['cardToken'] ?? '';
    // Wallet (Apple Pay / Google Pay) : 1er paiement recurrent via checkout heberge
    // Mollie (le mandat est cree cote Mollie, exactement comme avec la carte). cf.
    // create_payment ci-dessus pour le detail du flux wallet.
    $method = preg_replace('/[^a-z]/', '', $input['method'] ?? '');
    $method = in_array($method, ['applepay', 'googlepay'], true) ? $method : '';
    $planIn = ($input['plan'] ?? 'monthly') === 'annual' ? 'annual' : 'monthly';
    $email = trim($input['email'] ?? '');
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');
    $sc = $cfg['subscription'][$planIn] ?? null;
    if ((!$cardToken && !$method) || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$sc) {
        http_response_code(400); echo json_encode(['error' => 'bad subscription params']); exit;
    }
    // ── Parrainage (attribution capturée — récompense au go-live Mollie) ──────────
    // Mollie n'a NI coupon NI customer balance (contrairement à Stripe). On ne peut
    // donc pas créditer ici. On ENREGISTRE l'attribution (mon code en metadata
    // customer = retrouvable plus tard ; le code parrain en mol_store) ; la récompense
    // (1er mois filleul + crédit parrain) sera appliquée à la validation Mollie via
    // un script de réconciliation. cf. MOLLIE_MIGRATION.md §parrainage.
    $referredBy = preg_replace('/[^A-Z0-9-]/', '', strtoupper($input['referredBy'] ?? ''));
    if (!preg_match('/^REF-[A-Z0-9]{6}$/', $referredBy)) $referredBy = '';
    $myRef = preg_replace('/[^A-Z0-9-]/', '', strtoupper($input['myReferralCode'] ?? ''));
    if (!preg_match('/^REF-[A-Z0-9]{6}$/', $myRef)) $myRef = '';
    if ($referredBy && $myRef && $referredBy === $myRef) $referredBy = ''; // anti-auto-parrainage
    // Customer (necessaire pour le mandat recurrent). On y grave mon code parrain.
    $custParams = ['email' => $email];
    if ($myRef) $custParams['metadata'] = ['referral_code' => $myRef];
    list($cc, $cust) = mol_api('POST', '/customers', $custParams);
    if ($cc >= 400 || empty($cust['id'])) { http_response_code(500); echo json_encode(['error' => 'customer create failed']); exit; }
    $customerId = $cust['id'];
    // 1er paiement = etablit le mandat ET facture la periode 1.
    $payParams = [
        'amount'       => ['currency' => $sc['currency'], 'value' => $sc['amount']],
        'description'  => 'Sargasses ' . $planIn,
        'customerId'   => $customerId,
        'sequenceType' => 'first',
        'redirectUrl'  => $returnBase . '/?mollie_return=1',
        'webhookUrl'   => $returnBase . '/api/mollie-webhook.php',
        'metadata'     => ['island' => ($island !== '' ? $island : 'mq'), 'plan' => $planIn, 'source' => $source, 'email' => $email, 'kind' => 'sub_first'],
    ];
    if ($cardToken) $payParams['cardToken'] = $cardToken;
    if ($method)    $payParams['method']    = $method; // wallet -> checkout heberge (mandat cote Mollie)
    list($code, $pay) = mol_api('POST', '/payments', $payParams);
    if ($code >= 400 || empty($pay['id'])) { http_response_code(500); echo json_encode(['error' => 'first payment failed']); exit; }
    // Pre-stocke le customer (la subscription suivra a 'paid', ici ou via webhook).
    // referred_by/referral_code = attribution parrainage pour la réconciliation go-live.
    mol_store_write($email, array_filter(['email' => $email, 'customer' => $customerId, 'plan' => $planIn, 'ts' => time(), 'referred_by' => $referredBy, 'referral_code' => $myRef]));
    $status = $pay['status'] ?? '';
    // Pas de 3DS (carte test directe) : on cree la subscription tout de suite.
    if ($status === 'paid') {
        mol_create_subscription_once($cfg, $customerId, $email, $planIn, $island, $source);
    }
    echo json_encode([
        'paymentId'   => $pay['id'],
        'status'      => $status,
        'customerId'  => $customerId,
        'checkoutUrl' => $pay['_links']['checkout']['href'] ?? null, // 3DS -> rebond ; la subscription se cree a 'paid'
    ]);
    exit;
}

// ── Action: payment_status — le front confirme l'etat (apres retour/3DS ou inline)
// avant de poser le localStorage premium. Source de verite = Mollie. A 'paid' :
// forward fulfillment + (abo) creation subscription idempotente. Dedup par id cote Sheet.
if ($action === 'payment_status') {
    $pid = preg_replace('/[^a-zA-Z0-9_]/', '', $input['paymentId'] ?? '');
    if (!$pid) { http_response_code(400); echo json_encode(['error' => 'missing paymentId']); exit; }
    list($code, $pay) = mol_api('GET', '/payments/' . rawurlencode($pid));
    $status = $pay['status'] ?? '';
    $paid = ($status === 'paid');
    if ($paid) {
        $meta = $pay['metadata'] ?? [];
        $amount = $pay['amount'] ?? [];
        $cents = isset($amount['value']) ? (int)round(((float)$amount['value']) * 100) : 0;
        $currency = $amount['currency'] ?? 'EUR';
        $isl = $meta['island'] ?? 'mq';
        $plan = $meta['plan'] ?? ($meta['pass'] ?? 'unknown');
        $src = $meta['source'] ?? 'unknown';
        $em = $meta['email'] ?? '';
        mol_forward_fulfillment($cfg, $pid, $em, $cents, $currency, $isl, $plan, $src);
        if (($meta['kind'] ?? '') === 'sub_first') {
            $cust = $pay['customerId'] ?? '';
            if ($em && $cust) mol_create_subscription_once($cfg, $cust, $em, ($meta['plan'] ?? 'monthly'), $isl, $src);
        }
    }
    echo json_encode(['paid' => $paid, 'status' => $status]);
    exit;
}

// ── Action: verify_subscription — deblocage cross-device (equivalent Stripe).
if ($action === 'verify_subscription') {
    $email = trim($input['email'] ?? '');
    if (!$email) { http_response_code(400); echo json_encode(['error' => 'missing email']); exit; }
    $rec = mol_store_read($email);
    if (!$rec || empty($rec['customer'])) { echo json_encode(['active' => false, 'reason' => 'no_subscription']); exit; }
    list($code, $list) = mol_api('GET', '/customers/' . rawurlencode($rec['customer']) . '/subscriptions');
    $active = false;
    foreach (($list['_embedded']['subscriptions'] ?? []) as $s) {
        if (in_array(($s['status'] ?? ''), ['active', 'pending'], true)) { $active = true; break; }
    }
    echo json_encode(['active' => $active]);
    exit;
}

// ── Action: cancel_subscription — gerer/annuler (equivalent portal Stripe).
// NB: annuler la subscription ne revoque PAS le mandat sous-jacent (Mandates API
// separee) — suffisant pour stopper la facturation recurrente.
if ($action === 'cancel_subscription') {
    $email = trim($input['email'] ?? '');
    $rec = $email ? mol_store_read($email) : null;
    if (!$rec || empty($rec['customer']) || empty($rec['sub'])) { http_response_code(404); echo json_encode(['error' => 'no subscription']); exit; }
    list($code, $_x) = mol_api('DELETE', '/customers/' . rawurlencode($rec['customer']) . '/subscriptions/' . rawurlencode($rec['sub']));
    echo json_encode(['cancelled' => $code < 400]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
