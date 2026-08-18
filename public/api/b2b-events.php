<?php
/**
 * b2b-events.php — List events for a prospect.
 * GET /api/b2b-events.php?prospect_id=xxx → list events
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/b2b-db.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'GET only']);
        exit;
    }

    $prospectId = $_GET['prospect_id'] ?? null;
    if (!$prospectId) {
        http_response_code(400);
        echo json_encode(['error' => 'prospect_id is required']);
        exit;
    }

    $rows = b2b_supabase_request('b2b_events', 'GET', null,
        "?prospect_id=eq.$prospectId&select=*&order=created_at.asc");
    echo json_encode($rows ?? []);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
