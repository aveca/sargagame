<?php
// ── forecast.php — restitution AUTHENTIFIÉE de la prévision payante J+2→J+7 ─────
//
// Le JSON public (sargassum.json) ne sert que J+0/J+1. La série complète vit dans
// _private/forecast-full.json (bloqué en HTTP direct par .htaccess Deny). Cet
// endpoint la rend UNIQUEMENT à un accès vérifié serveur :
//   - GET  ?k=<token widget>  → hôtel Pro / essai B2B (HMAC sg_widget_verify) ;
//   - POST {email}            → payeur/pass/abo/comp B2C (mol_access_for_email).
// Aucun bypass public par URL : pas de token/email valide ⇒ 403. Le fichier privé
// est COLOCALISÉ (déployé par domaine) → on lit __DIR__/_private/forecast-full.json,
// pas de déduction de région.
//
// ADDITIF / lecture seule : ne crée aucun paiement, ne touche aucun flux d'argent.
// Le verdict (J+0/J+1, levels, scores) reste 100 % gratuit dans sargassum.json.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://sargasses-martinique.com','https://sargasses-guadeloupe.com','https://sargassumpuntacana.com','https://sargassummiami.com','https://sargassumcancun.com'];
if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }

// Anti-bruteforce / card-testing parity (mêmes garde-fous que mollie.php).
require_once __DIR__ . '/../_ratelimit.php';
sg_rate_limit('forecast_full', 60);

$authorized = false;

// ── Voie 1 : token widget Pro / essai B2B (HMAC, pas besoin de Mollie) ──────────
// require_once n'exécute PAS le bloc HTTP de widget-token.php (garde realpath).
$tok = $_GET['k'] ?? '';
if ($tok !== '') {
    require_once __DIR__ . '/../widget-token.php';
    if (sg_widget_verify($tok) !== false) $authorized = true;
}

// ── Voie 2 : email payeur/pass/abo/comp B2C ────────────────────────────────────
if (!$authorized) {
    $email = '';
    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $email = trim($input['email'] ?? '');
    }
    if ($email !== '') {
        // mollie-config.php = secrets gitignored (présents sur FTP). @include → fail-soft :
        // config absente ⇒ on ne peut pas vérifier l'email ⇒ 403 propre (pas de 500).
        $cfg = @include __DIR__ . '/../mollie-config.php';
        if (is_array($cfg)) {
            require_once __DIR__ . '/../mollie-lib.php';
            if (mol_access_for_email($email)) $authorized = true;
        }
    }
}

if (!$authorized) { http_response_code(403); echo json_encode(['ok' => false]); exit; }

// ── Autorisé : restitue la série complète colocalisée ──────────────────────────
$f = __DIR__ . '/_private/forecast-full.json';
$raw = is_file($f) ? @file_get_contents($f) : false;
$data = $raw ? json_decode($raw, true) : null;
if (!is_array($data) || !isset($data['weekly'])) {
    http_response_code(503); echo json_encode(['ok' => false, 'reason' => 'no_data']); exit;
}
echo json_encode(['ok' => true, 'updatedAt' => $data['updatedAt'] ?? null, 'weekly' => $data['weekly']]);
