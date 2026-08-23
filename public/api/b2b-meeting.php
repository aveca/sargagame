<?php
/**
 * b2b-meeting.php — demande de POINT / DEVIS pour le tier Territoire (mairies, offices
 * de tourisme, groupes hôteliers). Funnel HYBRIDE (décision fondateur) : l'accès essai
 * 30 j reste 100% self-serve instantané (b2b-trial.php) ; CET endpoint ne fait QUE
 * transférer au fondateur une demande de contact humain — le secteur public a besoin
 * d'un devis / bon de commande / interlocuteur, qu'un clic ne remplace pas.
 *
 * POST {email, org?, littoral?, phone?, island?} → (1) email au fondateur via Resend
 * (mol_b2b_meeting_notify) ; (2) lead loggé (Apps Script EXISTANTE email_signup, source
 * b2b_territoire_meeting, zéro clasp). Les deux best-effort : un échec ne bloque pas le ok.
 * N'ÉMET AUCUN token, n'encaisse RIEN, ne déclenche aucun paiement (additif pur).
 */
require_once __DIR__ . '/mollie-lib.php';   // mol_b2b_meeting_notify
require_once __DIR__ . '/_ratelimit.php';   // anti-abus (envoi d'email → relais possible)

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

// 6/h/IP : une demande de point est rare et légitime. Coupe le bombardement d'emails.
sg_rate_limit('b2b_meeting', 6);

$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) $in = $_POST;

$email = trim((string)($in['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_email']);
    exit;
}
$org      = substr(preg_replace('/[<>"]/', '', (string)($in['org'] ?? '')), 0, 80);
$littoral = substr(preg_replace('/[<>"]/', '', (string)($in['littoral'] ?? '')), 0, 120);
$phone    = substr(preg_replace('/[^0-9 +().-]/', '', (string)($in['phone'] ?? '')), 0, 30);
$island   = strtoupper(preg_replace('/[^A-Za-z]/', '', (string)($in['island'] ?? '')));

// Best-effort : notifie le fondateur (Gmail) — le cœur du funnel hybride.
$cfg = @include __DIR__ . '/mollie-config.php';
if (!is_array($cfg)) $cfg = [];
if (function_exists('mol_b2b_meeting_notify')) {
    @mol_b2b_meeting_notify($cfg, ['email' => $email, 'org' => $org, 'littoral' => $littoral, 'phone' => $phone, 'island' => $island]);
}

// Best-effort : log le lead via l'action Apps Script EXISTANTE (zéro clasp). Échec silencieux.
$exec = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
$payload = json_encode(['type' => 'email_signup', 'email' => $email, 'source' => 'b2b_territoire_meeting', 'island' => ($island ?: 'MQ'), 'org' => $org]);
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

echo json_encode(['ok' => true]);
