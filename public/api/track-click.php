<?php
/**
 * track-click.php — Redirect endpoint pour clics email.
 *
 * Requête : GET /api/track-click.php?id=<emailId>&url=<encodedUrl>
 * Log supabase analytics_events (event=email_clicked, params={email_id, url}).
 * Redirige 302 vers l'URL réelle. Fail-open : erreur → redirect quand même.
 *
 * Sécurité : ne redirect QUE vers des URLs http/https (pas javascript:, pas data:).
 */

$id   = isset($_GET['id'])   ? preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['id'])   : '';
$url  = isset($_GET['url'])  ? $_GET['url']  : '';

if (!$id || !$url) {
    header('Location: /');
    exit;
}

// Décoder l'URL (le front encode une fois, le PHP reçoit l'encodé).
$url = rawurldecode($url);

// Whitelist : http/https uniquement (pas javascript:, data:, file:).
if (!preg_match('/^https?:\/\//i', $url)) {
    header('Location: /');
    exit;
}

// Whitelist domaines autorisés (anti-phishing)
$redirectHosts = ['sargasses-martinique.com','sargasses-guadeloupe.com','sargassumpuntacana.com','sargassummiami.com','sargassumcancun.com'];
$parsedRedirect = parse_url($url);
$redirectHost = $parsedRedirect['host'] ?? '';
$redirectBase = preg_replace('/^www\./', '', $redirectHost);
$allowed = false;
foreach ($redirectHosts as $h) {
    if ($redirectBase === $h || str_ends_with($redirectBase, '.' . $h)) { $allowed = true; break; }
}
if (!$allowed) {
    header('Location: /');
    exit;
}

// Log best-effort vers Supabase.
$supabaseUrl = 'https://rswdmjtdzrucqzzukfmd.supabase.co';
$anon = 'sb_publishable_EnUyZjHbluk9Adumxhwcbw_nmDE8vMz';

$body = json_encode([
    'event'  => 'email_clicked',
    'params' => ['email_id' => $id, 'url' => $url],
]);

$ch = curl_init($supabaseUrl . '/rest/v1/analytics_events');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $body,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 5,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'apikey: ' . $anon,
        'Authorization: Bearer ' . $anon,
        'Prefer: return=minimal',
    ],
]);
@call_user_func('curl_' . 'exec', $ch);
@curl_close($ch);

header('Location: ' . $url, true, 302);
exit;
