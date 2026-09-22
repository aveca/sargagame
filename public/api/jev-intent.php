<?php
/**
 * jev-intent.php — Routeur d'intention sémantique (TypeSafe Jev).
 *
 * REVENUE/CROISSANCE (session Conversion+Growth, 2026-09-22) : quand la recherche
 * déterministe (nom de plage) échoue sur la landing, un visiteur qualifié écrit
 * en langage naturel (« on va où demain ? », « je reste 7 jours »…). Sans router :
 * 0 résultat → sortie. Jev classe l'intention → le front route vers la bonne valeur
 * (verdict du jour / forecast / plan / B2B). JAMAIS de rôle prix/paiement/money-path
 * (cf. TYPESAFE_JEV_ARCHITECTURE.md).
 *
 * Garde-fous impératifs :
 *  - clé server-side UNIQUEMENT (env TYPESAFE_API_KEY, fallback typesafe-config.php gitignored)
 *  - timeout dur 4 s ; TOUT échec → { ok:false, fallback:true } (le client garde le comportement actuel)
 *  - kill switch : TYPESAFE_JEV=off dans l'env OU valeur 'off' dans la config
 *  - rate limit par IP (infra _ratelimit.php)
 *  - aucun log du texte utilisateur ni de la clé
 */

require_once __DIR__ . '/_ratelimit.php';

header('Content-Type: application/json; charset=utf-8');

// CORS — mêmes 5 domaines que mollie.php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://sargasses-martinique.com','https://sargasses-guadeloupe.com','https://sargassumpuntacana.com','https://sargassummiami.com','https://sargassumcancun.com'];
if (in_array($origin, $allowed, true)) header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') { http_response_code(405); echo '{"error":"POST only"}'; exit; }

function jev_fallback() { echo json_encode(['ok' => false, 'fallback' => true]); exit; }

// ── Config ────────────────────────────────────────────────────────────────
$cfg = ['api_key' => getenv('TYPESAFE_API_KEY') ?: '', 'mode' => getenv('TYPESAFE_JEV') ?: 'on'];
$localPath = __DIR__ . '/typesafe-config.php';
if (file_exists($localPath)) {
    $local = @include $localPath;
    if (is_array($local)) $cfg = array_merge($cfg, $local);
}
if (($cfg['mode'] ?? 'on') === 'off') jev_fallback();          // kill switch
if (empty($cfg['api_key']) || strpos($cfg['api_key'], 'test') === 0 || strlen($cfg['api_key']) < 16) jev_fallback();

sg_rate_limit('jev_intent', 12); // 12 classifications/h/IP — au-delà, fallback silencieux

// ── Input ─────────────────────────────────────────────────────────────────
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$text = trim((string)($in['text'] ?? ''));
$lang = in_array(($in['lang'] ?? ''), ['fr', 'en', 'es'], true) ? $in['lang'] : 'fr';
$region = preg_replace('/[^a-z_]/i', '', (string)($in['region'] ?? ''));
if (mb_strlen($text) < 6 || mb_strlen($text) > 220) jev_fallback(); // trop court/vide/long → pas d'appel payant

// ── Jev : une seule question Choice (facture unique, latence minimale) ─────
$payload = [
    'model' => 'jev-latest',
    'state' => [
        'user_text' => $text,
        'lang' => $lang,
        'context' => 'Beach decision app (sargassum/seaweed forecast per beach). The typed text was NOT recognized as a beach name by the deterministic search.',
    ],
    'questions' => [
        'intent' => [
            'type' => 'choice',
            'instructions' => 'Classify what this app visitor most wants right now. They could not find a beach by name search.',
            'criteria' => [
                'today_verdict'  => 'Wants to know where to swim / which beach is clean TODAY (implicit location ok)',
                'when_later'     => 'Asks about tomorrow, the weekend, "when", or a future moment',
                'trip_planning'  => 'Planning a stay/trip: several days, accommodation, "I am staying…", itinerary',
                'which_beach'    => 'Undecided between beaches / asks "which beach should I choose" without a day',
                'avoid_seaweed'  => 'Fears seaweed (sargasses) ruining a plan — wants reassurance or a safe option',
                'b2b'            => 'Speaks as a business: hotel, villa, tour operator, concierge, agency',
                'off_topic'      => 'Unrelated to beaches / sargassum / travel decision',
            ],
        ],
    ],
];

$ch = curl_init('https://api.typesafe.ai/v1/systemone');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 4,                 // timeout DUR — jamais de pendule côté user
    CURLOPT_CONNECTTIMEOUT => 2,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $cfg['api_key']],
    CURLOPT_POSTFIELDS => json_encode($payload),
]);
$body = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($body === false || ($http !== 200)) jev_fallback();   // 429/529/erreur → silence + fallback

$j = json_decode((string)$body, true);
$ans = $j['answers']['intent'] ?? null;
if (!is_array($ans) || ($ans['type'] ?? '') !== 'choice' || empty($ans['choice'])) jev_fallback();

$intent = (string)$ans['choice'];
$valid = ['today_verdict','when_later','trip_planning','which_beach','avoid_seaweed','b2b','off_topic'];
if (!in_array($intent, $valid, true)) jev_fallback();

echo json_encode([
    'ok' => true,
    'intent' => $intent,
    'confidence' => isset($ans['confidence']) ? round((float)$ans['confidence'], 3) : null,
]);
