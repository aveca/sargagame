<?php
// ── forecast-beach.php — prévision 7 jours GRATUITE pour UNE plage (« Ma plage ») ──
//
// Sprint « free tier = utilité quotidienne » : le JSON public (sargassum.json) ne
// sert que J+0/J+1 en bulk. Pour que le suivi gratuit d'UNE plage affiche ses 7
// prochains jours sans payer, cet endpoint restitue la série complète d'UNE SEULE
// plage, lue dans _private/forecast-full.json (colocalisé par domaine, bloqué en
// HTTP direct par .htaccess Deny).
//
// Pourquoi pas le bulk ? Le fichier complet (toutes les plages × 7 jours) reste
// PAYANT via forecast.php. Ici : une plage par requête, indexée par id, avec
// rate-limit — la valeur bulk (multi-plages, comparaison) garde son périmètre
// premium, conforme au free tier défini : « 1 plage suivie + sa prévision 7 j ».
//
// ADDITIF / lecture seule : ne crée aucun paiement, ne touche aucun flux d'argent.
// Aucune donnée fabriquée : si la plage est absente du fichier privé → 404 propre.

header('Content-Type: application/json; charset=utf-8');
// Court cache (5 min) : la série est quotidienne, pas besoin de no-store strict.
header('Cache-Control: public, max-age=300');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://sargasses-martinique.com','https://sargasses-guadeloupe.com','https://sargassumpuntacana.com','https://sargassummiami.com','https://sargassumcancun.com'];
if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: GET, OPTIONS');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

// Anti-scraping : même garde-fou que forecast.php (fail-open par conception).
require_once __DIR__ . '/../_ratelimit.php';
sg_rate_limit('forecast_beach', 120);

// ── Validation de l'id plage : mq001 / pc001 / grande-anse … ────────────────────
$id = $_GET['beach'] ?? '';
if (!is_string($id) || !preg_match('/^[a-z0-9][a-z0-9-]{1,31}$/', $id)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'reason' => 'bad_beach_id']);
    exit;
}

// ── Lecture de la série complète colocalisée ────────────────────────────────────
$f = __DIR__ . '/_private/forecast-full.json';
$raw = is_file($f) ? @file_get_contents($f) : false;
$data = $raw ? json_decode($raw, true) : null;
if (!is_array($data) || !isset($data['weekly']) || !is_array($data['weekly'])) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'reason' => 'no_data']);
    exit;
}

$fc = $data['weekly'][$id] ?? null;
if (!is_array($fc) || count($fc) < 2) {
    // Plage hors couverture de la série — honnêteté : pas de série fabriquée.
    http_response_code(404);
    echo json_encode(['ok' => false, 'reason' => 'unknown_beach']);
    exit;
}

echo json_encode([
    'ok'        => true,
    'id'        => $id,
    'updatedAt' => $data['updatedAt'] ?? null,
    'forecast'  => array_values($fc),
]);
