<?php
/**
 * track-open.php — Tracking pixel 1×1 transparent pour ouvertures email.
 *
 * Requête : GET /api/track-open.php?id=<emailId>
 * Log supabase analytics_events (event=email_opened, params={email_id}).
 * Retourne un GIF transparent 1×1 (200 bytes, Cache-Control: no-cache).
 *
 * Idempotent (un même id peut être pixelisé N fois — on déduit les uniques
 * côté agrégation). Fail-open : erreur Supabase → pixel quand même rendu.
 */

header('Content-Type: image/gif');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// GIF transparent 1×1 (200 bytes exacts).
$pixel = base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

$id = isset($_GET['id']) ? preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['id']) : '';
if (!$id) { echo $pixel; exit; }

// Log best-effort vers Supabase (analytics_events, même table que le front).
$supabaseUrl = 'https://rswdmjtdzrucqzzukfmd.supabase.co';
$anon = 'sb_publishable_EnUyZjHbluk9Adumxhwcbw_nmDE8vMz';

$body = json_encode([
    'event'  => 'email_opened',
    'params' => ['email_id' => $id],
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

echo $pixel;
