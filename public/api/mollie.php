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
    'claim_referral_credit' => 30,
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
    // ── Parrainage (PASS) : on grave l'attribution dans la metadata du paiement →
    // à 'paid', le parrain (referred_by) est crédité de jours de pass (ledger serveur,
    // réclamé par son app). referral_code = code du FILLEUL (anti-auto-parrainage).
    $referredBy = preg_replace('/[^A-Z0-9-]/', '', strtoupper($input['referredBy'] ?? ''));
    if (!preg_match('/^REF-[A-Z0-9]{6}$/', $referredBy)) $referredBy = '';
    $myRef = preg_replace('/[^A-Z0-9-]/', '', strtoupper($input['myReferralCode'] ?? ''));
    if (!preg_match('/^REF-[A-Z0-9]{6}$/', $myRef)) $myRef = '';
    if ($referredBy && $myRef && $referredBy === $myRef) $referredBy = ''; // anti-auto-parrainage
    // Consentement « contenu numérique fourni immédiatement » (preuve opposable : le client a
    // demandé l'accès immédiat et reconnu la caducité du droit de rétractation 14 j). Tracé en
    // metadata Mollie + horodatage front. Cf. /remboursement.html + disclosure au checkout.
    $consentMeta = [];
    $consentIn = $input['consent'] ?? null;
    $consentGiven = is_array($consentIn) ? !empty($consentIn['accepted']) : !empty($consentIn);
    if ($consentGiven) {
        $consentMeta['consent_immediate_access'] = '1';
        $cv = preg_replace('/[^0-9-]/', '', is_array($consentIn) ? (string)($consentIn['v'] ?? '') : '');
        if ($cv !== '') $consentMeta['consent_version'] = substr($cv, 0, 20);
        $consentMeta['consent_ts'] = gmdate('c'); // horodatage SERVEUR (preuve plus fiable que le client)
    }
    $value = number_format($cents / 100, 2, '.', '');
    $payParams = [
        'amount'      => ['currency' => $currency, 'value' => $value],
        'description' => 'Sargasses pass ' . $passKey,
        'redirectUrl' => $returnBase . '/?mollie_return=1',
        'webhookUrl'  => $returnBase . '/api/mollie-webhook.php',
        'metadata'    => array_merge(
            ['island' => ($island !== '' ? $island : 'mq'), 'pass' => $passKey, 'plan' => $passKey, 'source' => $source, 'email' => $email],
            $consentMeta,
            $referredBy ? ['referred_by' => $referredBy] : [],
            $myRef ? ['referral_code' => $myRef] : []
        ),
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
    // ── Customer Mollie pour les PASS (ADDITIF, FAIL-OPEN) ────────────────────────
    // Crée un Customer pour que le payeur du pass apparaisse dans l'onglet Clients de
    // Mollie (visibilité dashboard + rattachement du paiement). Réutilise le pattern
    // EXACT du flux abonnement (L207-211). IMPORTANT : on n'écrit PAS ce customerId dans
    // le mol_store du Pass — le champ `customer` y déclencherait le chemin abonnement de
    // verify_subscription et casserait la restauration des Pass (chemin Pass = pass_end).
    // FAIL-OPEN : échec de création → on continue SANS customerId, jamais de blocage du
    // paiement. Duplication de customers si même email re-paie = acceptée (volume faible).
    if ($email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $passCustParams = ['email' => $email];
        if ($myRef) $passCustParams['metadata'] = ['referral_code' => $myRef];
        list($cc, $cust) = mol_api('POST', '/customers', $passCustParams);
        if ($cc < 400 && !empty($cust['id'])) {
            $payParams['customerId'] = $cust['id'];
        }
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
    // Garde-fou : n'accepter qu'une URL Apple (apple.com ou *.apple.com). Frontière de
    // sous-domaine STRICTE — l'ancien [a-z0-9.-]*apple.com matchait evilapple.com (SSRF).
    if (!preg_match('#^https://([a-z0-9-]+\.)*apple\.com/#i', $validationUrl)) {
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
    // Garde devise↔région appliqué APRÈS résolution du plan (voir plus bas) : ouvre le
    // B2B USD (florida/puntacana/rivieramaya) sans jamais permettre un plan EUR sur région
    // USD ni l'inverse. Le montant vient TOUJOURS de $sc (serveur), jamais du client.
    $cardToken = $input['cardToken'] ?? '';
    // Wallet (Apple Pay / Google Pay) : 1er paiement recurrent via checkout heberge
    // Mollie (le mandat est cree cote Mollie, exactement comme avec la carte). cf.
    // create_payment ci-dessus pour le detail du flux wallet.
    $method = preg_replace('/[^a-z]/', '', $input['method'] ?? '');
    $method = in_array($method, ['applepay', 'googlepay'], true) ? $method : '';
    // Checkout HÉBERGÉ Mollie (opt-in `hosted:1`) : 1er paiement récurrent SANS cardToken
    // ni wallet → Mollie affiche sa propre page (carte + mandat), on renvoie checkoutUrl.
    // Permet aux pages STATIQUES (/pro/espace/, /pro/pricing/) d'ouvrir un abonnement
    // self-serve (ex. B2B 79 €/mois) sans embarquer Components. Le B2C (app React) envoie
    // toujours un cardToken → son chemin est INCHANGÉ (hosted absent = comportement d'avant).
    $hosted = !empty($input['hosted']);
    // Plan demandé, validé contre l'allowlist (config B2C + mol_b2b_plans B2B). Un
    // plan inconnu → fallback B2C 'monthly' (le montant vient TOUJOURS de $sc, jamais
    // du client). B2C inchangé : 'monthly'/'annual' empruntent le même chemin qu'avant.
    $b2bPlans = mol_b2b_plans();
    $planReq = preg_replace('/[^a-z_]/', '', strtolower((string)($input['plan'] ?? 'monthly')));
    $planIn = (isset($cfg['subscription'][$planReq]) || isset($b2bPlans[$planReq])) ? $planReq : 'monthly';
    $email = trim($input['email'] ?? '');
    $source = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['source'] ?? 'unknown');
    $sc = $cfg['subscription'][$planIn] ?? ($b2bPlans[$planIn] ?? null);
    if ((!$cardToken && !$method && !$hosted) || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$sc) {
        http_response_code(400); echo json_encode(['error' => 'bad subscription params']); exit;
    }
    // Cohérence devise↔région : région USD ⇒ plan USD, région EUR ⇒ plan EUR ; région
    // inconnue ⇒ rejet. Bloque tout mismatch (ex. plan EUR sur florida) avant de charger.
    $regCur = mol_region_currency($island);
    if (!$regCur || $sc['currency'] !== $regCur) { http_response_code(400); echo json_encode(['error' => 'region_not_supported']); exit; }
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
    // Retour : B2C → racine app (mollie_return) ; checkout HÉBERGÉ B2B → /pro/espace/
    // (l'hôtel revient sur SON espace, pas l'app conso). Le lien d'accès Pro (?k=token)
    // est de toute façon livré par email au paiement (mol_b2b_grant_once). Chemin FIXE
    // côté serveur (jamais d'URL fournie par le client → pas d'open-redirect).
    $subRedirect = $hosted ? ($returnBase . '/pro/espace/?sub=ok') : ($returnBase . '/?mollie_return=1');
    $payParams = [
        'amount'       => ['currency' => $sc['currency'], 'value' => $sc['amount']],
        'description'  => 'Sargasses ' . $planIn,
        'customerId'   => $customerId,
        'sequenceType' => 'first',
        'redirectUrl'  => $subRedirect,
        'webhookUrl'   => $returnBase . '/api/mollie-webhook.php',
        'metadata'     => array_filter(['island' => ($island !== '' ? $island : 'mq'), 'plan' => $planIn, 'source' => $source, 'email' => $email, 'kind' => 'sub_first', 'b2b' => ((($sc['kind'] ?? '') === 'b2b') ? '1' : null)], function ($v) { return $v !== null; }),
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
        // PASS one-time : persiste un record Pass côté serveur (cross-device restore via
        // verify_subscription). ADDITIF, idempotent (mol_pass_grant_store ne touche pas un
        // abo et cumule max() sur re-jeu). N'altère PAS l'encaissement (best-effort).
        if (!empty($meta['pass']) && $em) {
            mol_pass_grant_store($em, $meta['pass']);
        }
        if (($meta['kind'] ?? '') === 'sub_first') {
            $cust = $pay['customerId'] ?? '';
            if ($em && $cust) mol_create_subscription_once($cfg, $cust, $em, ($meta['plan'] ?? 'monthly'), $isl, $src);
        }
        // B2B : paiement Pro/Brief confirmé → émet+livre le token Pro (idempotent par pid).
        if (($meta['b2b'] ?? '') === '1' || in_array(($meta['plan'] ?? ''), ['pro_monthly', 'brief_monthly'], true)) {
            mol_b2b_grant_once($cfg, $pid, $em, ($meta['plan'] ?? ''));
        }
        // Parrainage : un filleul (referred_by) a payé → crédite le parrain (idempotent
        // par pid ; le webhook fait le même grant, le 1er qui passe gagne, anti-double).
        if (!empty($meta['referred_by'])) mol_refcredit_grant($meta['referred_by'], $pid);
    }
    echo json_encode(['paid' => $paid, 'status' => $status]);
    exit;
}

// ── Action: claim_referral_credit — l'app du PARRAIN réclame ses jours de pass gagnés
// (un filleul a payé). Retourne days≥0 ; l'app étend son sg_premium_pass_end d'autant.
// Remet le compteur à 0 (idempotent côté serveur). Pas de PII : clé = code REF- seul.
if ($action === 'claim_referral_credit') {
    $code = preg_replace('/[^A-Z0-9-]/', '', strtoupper($input['code'] ?? ''));
    if (!preg_match('/^REF-[A-Z0-9]{6}$/', $code)) { echo json_encode(['days' => 0]); exit; }
    echo json_encode(['days' => mol_refcredit_claim($code)]);
    exit;
}

// ── Action: verify_subscription — deblocage cross-device (equivalent Stripe).
if ($action === 'verify_subscription') {
    $email = trim($input['email'] ?? '');
    if (!$email) { http_response_code(400); echo json_encode(['error' => 'missing email']); exit; }
    // ── Comp / cadeau (ADDITIF) : accès OFFERT manuel, cross-device. Liste de hash
    // sha1(email) committée (PII-safe) -> public/api/comps.php. Si l'email est comped
    // et non expiré, on (re)cache un record Pass et on débloque partout par email.
    // Priorité (c'est un cadeau) ; n'encaisse rien ; ne touche aucun flux de paiement.
    $compEnd = mol_comp_lookup($email);
    if ($compEnd > time()) {
        $stored  = mol_pass_grant_store($email, 'comp', $compEnd); // override = pass_end exact
        $passEnd = ($stored > 0 ? $stored : $compEnd);
        echo json_encode(['active' => true, 'passEnd' => (int)$passEnd * 1000, 'kind' => 'pass', 'comp' => true]);
        exit;
    }
    $rec = mol_store_read($email);
    // ── Abonnement (comportement EXISTANT inchangé) : record avec 'customer'. ──────
    if ($rec && !empty($rec['customer'])) {
        list($code, $list) = mol_api('GET', '/customers/' . rawurlencode($rec['customer']) . '/subscriptions');
        $active = false;
        foreach (($list['_embedded']['subscriptions'] ?? []) as $s) {
            if (in_array(($s['status'] ?? ''), ['active', 'pending'], true)) { $active = true; break; }
        }
        echo json_encode(['active' => $active]);
        exit;
    }
    // ── PASS one-time (ADDITIF) : restauration cross-device d'un pass payé. ────────
    // (a) fast-path : record Pass déjà en cache, encore valide → on rend passEnd (ms).
    if ($rec && ($rec['kind'] ?? '') === 'pass' && (int)($rec['pass_end'] ?? 0) > time()) {
        echo json_encode(['active' => true, 'passEnd' => (int)$rec['pass_end'] * 1000, 'kind' => 'pass']);
        exit;
    }
    // (b) self-heal pour les payeurs EXISTANTS (record absent, ex. achat d'avant cette
    // feature) : on balaie les paiements Mollie 'paid' avec metadata.pass + metadata.email
    // == $email, on prend le plus récent encore valide, on (re)cache et on rend passEnd.
    // Borné à ~5 pages (250/page) ; toute erreur API → {active:false} proprement.
    $best = 0; // pass_end (timestamp s) le plus lointain trouvé
    $path = '/payments?limit=250';
    $pages = 0;
    while ($path && $pages < 5) {
        $pages++;
        list($pc, $pl) = mol_api('GET', $path);
        if ($pc >= 400 || !is_array($pl)) break; // erreur API → on s'arrête (pas d'exception)
        foreach (($pl['_embedded']['payments'] ?? []) as $p) {
            if (($p['status'] ?? '') !== 'paid') continue;
            $pm = $p['metadata'] ?? [];
            $pPass = $pm['pass'] ?? '';
            $pEmail = strtolower(trim((string)($pm['email'] ?? '')));
            if ($pPass === '' || $pEmail === '' || $pEmail !== strtolower(trim($email))) continue;
            $paidAt = $p['paidAt'] ?? ($p['createdAt'] ?? '');
            $base = $paidAt ? strtotime($paidAt) : 0;
            if (!$base) continue;
            $end = $base + mol_pass_days($pPass) * 86400;
            if ($end > $best) $best = $end;
        }
        // Pagination Mollie : _links.next.href est une URL ABSOLUE → on extrait le path v2.
        $next = $pl['_links']['next']['href'] ?? null;
        if ($next) {
            $pp = parse_url($next, PHP_URL_PATH);
            $pq = parse_url($next, PHP_URL_QUERY);
            $path = $pp ? (preg_replace('#^/v2#', '', $pp) . ($pq ? ('?' . $pq) : '')) : null;
        } else {
            $path = null;
        }
    }
    if ($best > time()) {
        // Cache le record pour les prochaines vérifs (mol_pass_grant_store cumule max()).
        $stored = mol_pass_grant_store($email, 'p7', $best); // passKey indicatif ; pass_end = $best (override)
        $passEnd = ($stored > 0 ? $stored : $best);
        echo json_encode(['active' => true, 'passEnd' => (int)$passEnd * 1000, 'kind' => 'pass']);
        exit;
    }
    echo json_encode(['active' => false, 'reason' => 'no_subscription']);
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
