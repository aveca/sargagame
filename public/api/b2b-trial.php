<?php
/**
 * b2b-trial.php — démarre un essai Pro 21 jours, INSTANTANÉ et 100% self-serve.
 *
 * POST {email, name?, beach?, island?} → émet un TOKEN PRO temporaire (21 j) signé
 * (réutilise sg_widget_sign() de widget-token.php : la marque blanche du widget
 * passe active, vérifiée côté serveur à l'affichage). Le token est RENVOYÉ au front
 * → l'hôtel l'a tout de suite, aucune dépendance email/humain. À J+21 le token
 * expire (sg_widget_verify rejette `exp` dépassé) → l'essai se termine proprement.
 *
 * Best-effort : enregistre le lead (onglet 'emails' du Sheet, source b2b_trial) via
 * l'action Apps Script EXISTANTE `email_signup` — AUCUN clasp push requis.
 *
 * ZÉRO secret nouveau (le secret de signature dérive de stripe-config, déjà sur le
 * serveur, comme widget-token.php). Additif : n'altère AUCUN flux de paiement.
 */
require_once __DIR__ . '/widget-token.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) $in = $_POST;

$email = trim((string)($in['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_email']);
    exit;
}
$name   = substr(preg_replace('/[<>"]/', '', (string)($in['name'] ?? '')), 0, 60);
$island = strtoupper(preg_replace('/[^A-Za-z]/', '', (string)($in['island'] ?? 'MQ')));
$island = in_array($island, ['MQ', 'GP'], true) ? $island : 'MQ';

// Token Pro 21 jours. host = email (traçabilité) ; le widget ne vérifie que la
// validité/expiration du jeton, pas une correspondance de domaine.
$token = sg_widget_sign($email, 21);

// Best-effort : enregistre le lead via l'action Apps Script EXISTANTE (zéro clasp).
// Échec silencieux : ne JAMAIS bloquer l'activation de l'essai sur ce log.
$exec = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
$payload = json_encode(['type' => 'email_signup', 'email' => $email, 'source' => 'b2b_trial', 'island' => $island, 'org' => $name]);
$ch = curl_init($exec);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 6,
    CURLOPT_FOLLOWLOCATION => true,
]);
@curl_exec($ch);
@curl_close($ch);

echo json_encode([
    'ok'    => true,
    'token' => $token,
    'days'  => 21,
]);
