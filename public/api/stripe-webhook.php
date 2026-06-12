<?php
// ── Webhook Stripe signe ─────────────────────────────────────────────────────
// Remplace a terme le POST navigateur non signe (Sargasses_PROD.jsx, redirect
// ?session_id= → fetch Apps Script). Transition non destructive : les deux
// chemins coexistent, l'Apps Script deduplique deja par session_id cote Sheet.
//
// Flux : Stripe → verification signature v1 (HMAC) → idempotence event.id
//        → filtre metadata.island → 200 a Stripe → forward serveur-a-serveur
//        vers l'Apps Script (redirige toujours en 302, suivi par curl).
// Compte Stripe PARTAGE avec un autre business (BOT-WOW) : tout event dont
// metadata.island n'est pas une region connue est ignore avec un 200
// (jamais 400 : Stripe retenterait l'event pendant 3 jours).

$payload = file_get_contents('php://input'); // bytes bruts — AUCUN parsing avant verification de signature

ini_set('display_errors', '0'); // jamais de stack trace ni d'echo du payload vers le client
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method']);
    exit;
}

// Secret de signature : cle 'webhook_secret' de stripe-config.php (gitignore,
// bloque HTTP par public/api/.htaccess). Voir stripe-config.example.php.
$cfg = require __DIR__ . '/stripe-config.php';
$whsec = $cfg['webhook_secret'] ?? '';
if (!$whsec) {
    // Config incomplete : 500 → Stripe retentera une fois le secret deploye
    http_response_code(500);
    echo json_encode(['error' => 'webhook not configured']);
    exit;
}

// ── 1. Verification de signature (header Stripe-Signature: t=...,v1=...) ─────
$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
$ts = null;
$v1s = [];
foreach (explode(',', $sigHeader) as $part) {
    $kv = explode('=', trim($part), 2);
    if (count($kv) !== 2) continue;
    if ($kv[0] === 't') $ts = $kv[1];
    elseif ($kv[0] === 'v1') $v1s[] = $kv[1]; // plusieurs v1 possibles (rotation de secret)
}

$sigOk = false;
if ($ts !== null && ctype_digit($ts) && count($v1s) > 0) {
    // Replay protection : timestamp signe a moins de 5 minutes
    if (abs(time() - (int)$ts) <= 300) {
        $expected = hash_hmac('sha256', $ts . '.' . $payload, $whsec);
        foreach ($v1s as $v1) {
            // hash_equals : comparaison en temps constant — JAMAIS == ni ===
            if (hash_equals($expected, $v1)) { $sigOk = true; break; }
        }
    }
}
if (!$sigOk) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid signature']);
    exit;
}

// ── 2. Parsing (uniquement apres signature OK) ───────────────────────────────
$event = json_decode($payload, true);
if (!is_array($event) || empty($event['id']) || empty($event['type'])) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid payload']);
    exit;
}
$type = (string)$event['type'];
$eventId = (string)$event['id'];

// ── 3. Idempotence sur event.id (PAS session_id) ─────────────────────────────
// Marqueurs fichiers dans api/data/ — non servi par HTTP (data/.htaccess:
// Require all denied). Un marqueur vide par event deja traite.
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) { @mkdir($dataDir, 0755, true); }

$marker = $dataDir . '/' . preg_replace('/[^A-Za-z0-9_.-]/', '_', $eventId);
if (file_exists($marker)) {
    http_response_code(200);
    echo json_encode(['received' => true, 'duplicate' => true]);
    exit;
}

// Purge opportuniste des marqueurs de plus de 30 jours (jamais .htaccess ni *.log)
$now = time();
foreach ((scandir($dataDir) ?: []) as $f) {
    if ($f === '.' || $f === '..' || $f === '.htaccess' || substr($f, -4) === '.log') continue;
    $p = $dataDir . '/' . $f;
    if (is_file($p) && ($now - (int)@filemtime($p)) > 30 * 86400) @unlink($p);
}

// ── 4. Filtre event type + metadata.island ───────────────────────────────────
$HANDLED_TYPES = [
    'checkout.session.completed',
    'invoice.payment_succeeded',
    'customer.subscription.deleted',
    'invoice.payment_failed',
];
if (!in_array($type, $HANDLED_TYPES, true)) {
    http_response_code(200);
    echo json_encode(['received' => true, 'ignored' => 'event_type']);
    exit;
}

// SYNC MANUEL avec les ids de regions/*.json (regions/index.cjs est du CommonJS,
// non chargeable depuis PHP — scripts/test-stripe-webhook.cjs verifie la parite).
// Legacy : le front historique envoie 'MQ'/'GP' en majuscules → compare en lowercase.
$KNOWN_REGIONS = ['mq', 'gp', 'puntacana', 'florida', 'rivieramaya'];

$obj = (isset($event['data']['object']) && is_array($event['data']['object'])) ? $event['data']['object'] : [];
$island = extract_island($type, $obj);
if ($island === '' || !in_array(strtolower($island), $KNOWN_REGIONS, true)) {
    // Event d'un autre business (BOT-WOW) ou sans island → 200 + ignore, pas de retry.
    // Une island NON-VIDE inconnue = très probablement une nouvelle région oubliée
    // dans $KNOWN_REGIONS → trace observable (cPanel error log) au lieu d'un drop muet.
    if ($island !== '') error_log('[stripe-webhook] island inconnue ignoree: ' . substr($island, 0, 32));
    http_response_code(200);
    echo json_encode(['received' => true, 'ignored' => 'island']);
    exit;
}

// ── 5. Marque l'event AVANT le forward (idempotence garantie) ────────────────
@file_put_contents($marker, '');

// ── 6. Construction du payload pour l'Apps Script ────────────────────────────
// Meme deployment URL canonique que create-checkout.php (email tracking) et
// Sargasses_PROD.jsx — SYNC MANUEL si l'Apps Script est redeploye.
// 'appsscript_url' dans stripe-config.php = override optionnel (tests/staging).
$APPSSCRIPT_URL = $cfg['appsscript_url']
    ?? 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';

if ($type === 'checkout.session.completed') {
    // Shape EXACT attendu par scripts/appscript/Code.js (handler existant) :
    // session.id, customer_email | customer_details.email, amount_total,
    // currency, payment_status, metadata.island — compat ascendante avec le
    // POST navigateur, enrichi de verified + webhook_source.
    $forward = [
        'type'           => $type,
        'verified'       => true,
        'webhook_source' => 'php',
        'data' => ['object' => [
            'id'             => $obj['id'] ?? '',
            'payment_status' => $obj['payment_status'] ?? 'paid',
            'amount_total'   => $obj['amount_total'] ?? null,
            'currency'       => $obj['currency'] ?? null,
            'customer_email' => $obj['customer_email'] ?? ($obj['customer_details']['email'] ?? ''),
            // Attribution : client_reference_id = "<region>_<plan>_<source>"
            // posé par le front (stripeUrlWith). Débloque le split paiement par
            // source/plan, jusque-là aveugle (project_funnel_tracking_gap).
            'client_reference_id' => $obj['client_reference_id'] ?? null,
            'metadata'       => ['island' => $island],
        ]],
    ];
} else {
    // invoice.payment_succeeded / customer.subscription.deleted / invoice.payment_failed
    $forward = [
        'type'           => $type,
        'verified'       => true,
        'webhook_source' => 'php',
        'data' => ['object' => array_filter([
            'id'             => $obj['id'] ?? '',
            'customer'       => $obj['customer'] ?? null,
            'customer_email' => $obj['customer_email'] ?? null,
            'subscription'   => $obj['subscription'] ?? null,
            'status'         => $obj['status'] ?? null,
            'metadata'       => ['island' => $island],
            'amount'         => $obj['amount_paid'] ?? ($obj['amount_due'] ?? ($obj['amount_total'] ?? null)),
            'currency'       => $obj['currency'] ?? null,
        ], function ($v) { return $v !== null; })],
    ];
}

// ── 7. 200 a Stripe AVANT le forward ─────────────────────────────────────────
// Un echec aval (Apps Script down, quota) ne doit PAS provoquer de retry
// Stripe : signature + idempotence sont OK, l'event est acquitte.
http_response_code(200);
echo json_encode(['received' => true]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }

forward_to_appsscript($APPSSCRIPT_URL, $forward, $dataDir, $eventId);
exit;

// ── Helpers ──────────────────────────────────────────────────────────────────

// metadata.island vit a des endroits differents selon l'event type :
//   checkout.session.completed / customer.subscription.* → object.metadata
//   invoice.* → lines.data[].metadata, subscription_details.metadata,
//               ou parent.subscription_details.metadata (API versions 2025+)
function extract_island($type, $obj) {
    if (!empty($obj['metadata']['island'])) return (string)$obj['metadata']['island'];
    if (strpos($type, 'invoice.') === 0) {
        if (isset($obj['lines']['data']) && is_array($obj['lines']['data'])) {
            foreach ($obj['lines']['data'] as $line) {
                if (!empty($line['metadata']['island'])) return (string)$line['metadata']['island'];
            }
        }
        if (!empty($obj['subscription_details']['metadata']['island'])) {
            return (string)$obj['subscription_details']['metadata']['island'];
        }
        if (!empty($obj['parent']['subscription_details']['metadata']['island'])) {
            return (string)$obj['parent']['subscription_details']['metadata']['island'];
        }
    }
    return '';
}

function forward_to_appsscript($url, $forward, $dataDir, $eventId) {
    $err = '';
    $code = 0;
    if (!function_exists('curl_init')) {
        $err = 'curl extension missing';
    } else {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($forward),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true, // Apps Script repond TOUJOURS 302 → script.googleusercontent.com
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 10,
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($body === false) $err = curl_error($ch);
        curl_close($ch);
        if ($err === '' && $code >= 400) $err = 'http ' . $code;
    }
    if ($err !== '') {
        // Log dans api/data/ (non servi par HTTP) — jamais le payload, juste l'id
        @file_put_contents(
            $dataDir . '/webhook-errors.log',
            date('c') . " forward_failed event={$eventId} type={$forward['type']} err={$err}\n",
            FILE_APPEND | LOCK_EX
        );
    }
}
