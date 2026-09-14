<?php
/**
 * b2b-lead.php — Capture B2B demo leads from pro/espace demo button.
 * 
 * POST {email, hotel, beach, source?, demo?} → stores lead in Supabase b2b_prospects
 * Returns {ok: true} or {error: '...'}
 * 
 * Uses existing b2b-db.php for Supabase operations.
 * No new secrets required.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

require_once __DIR__ . '/b2b-db.php';

$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) $in = $_POST;

$email = trim((string)($in['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_email']);
    exit;
}

$hotel = substr(preg_replace('/[<>"]/', '', (string)($in['hotel'] ?? '')), 0, 100);
$beach = strtolower(substr(preg_replace('/[^A-Za-z0-9-]/', '', (string)($in['beach'] ?? '')), 0, 60));
$source = (string)($in['source'] ?? 'demo_button');
$demo = !empty($in['demo']);

if (!$hotel || !$beach) {
    http_response_code(400);
    echo json_encode(['error' => 'missing_fields']);
    exit;
}

// Rate limit: 10 leads/hour/IP to prevent abuse
require_once __DIR__ . '/_ratelimit.php';
sg_rate_limit('b2b_lead', 10);

try {
    $prospect = b2b_create_prospect([
        'name'   => $in['hotel'],
        'beach'  => $beach,
        'island' => null, // will be inferred from beach if needed
        'email'  => $in['email'],
        'grade'  => 'B', // demo lead grade
        'source' => $source,
        'demo'   => $demo,
    ]);

    if (!$prospect) {
        http_response_code(500);
        echo json_encode(['error' => 'failed_to_create_prospect']);
        exit;
    }

    // Log event
    b2b_log_event('DEMO_LEAD_CAPTURED', $prospect['id'], 'demo_form', [
        'email' => $in['email'],
        'hotel' => $in['hotel'],
        'beach' => $beach,
        'source' => $source,
    ]);

    // Best-effort: send to Apps Script for email tracking (non-blocking)
    $exec = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
    $payload = json_encode([
        'type' => 'email_signup',
        'email' => $in['email'],
        'source' => 'b2b_demo_lead',
        'island' => 'MQ', // default, could be improved
        'org' => $in['hotel'],
        'meta' => json_encode(['beach' => $beach, 'demo' => true]),
    ]);
    $ch = curl_init($exec);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    @curl_exec($ch);
    @curl_close($ch);

    // Track event in Supabase analytics (best-effort)
    if (function_exists('sg_analytics_event')) {
        @sg_analytics_event('b2b_demo_lead', [
            'org' => $in['hotel'],
            'beach' => $beach,
            'source' => $source,
        ], null);
    }

    echo json_encode(['ok' => true, 'id' => $prospect['id']]);
    exit;

} catch (Exception $e) {
    error_log('[b2b-lead] Exception: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'server_error']);
    exit;
}