<?php
/**
 * b2b-contacts.php — Log contacts/conversations.
 * POST /api/b2b-contacts.php → create contact log
 * GET  /api/b2b-contacts.php?prospect_id=xxx → list for prospect
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/b2b-db.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['prospect_id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'prospect_id is required']);
            exit;
        }
        $rows = b2b_supabase_request('b2b_contacts', 'POST', [
            'prospect_id'    => $input['prospect_id'],
            'channel'        => $input['channel'] ?? 'chat',
            'summary'        => $input['summary'] ?? null,
            'raw_transcript' => $input['raw_transcript'] ?? null,
        ]);
        $contact = $rows[0] ?? null;
        if (!$contact) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create contact']);
            exit;
        }
        b2b_log_event('CONTACTED', $input['prospect_id'], $input['actor'] ?? 'system', [
            'channel' => $input['channel'] ?? 'chat',
            'summary' => $input['summary'] ?? null,
        ]);
        echo json_encode($contact);
    } elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $prospectId = $_GET['prospect_id'] ?? null;
        if (!$prospectId) {
            http_response_code(400);
            echo json_encode(['error' => 'prospect_id is required']);
            exit;
        }
        $rows = b2b_supabase_request('b2b_contacts', 'GET', null,
            "?prospect_id=eq.$prospectId&select=*&order=created_at.desc");
        echo json_encode($rows ?? []);
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
