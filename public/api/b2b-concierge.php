<?php
/**
 * b2b-concierge.php — Manage concierge programs (7-day free trials).
 * POST /api/b2b-concierge.php           → start concierge
 * PATCH /api/b2b-concierge.php?id=xxx   → advance day / complete / mark payment
 * GET  /api/b2b-concierge.php?prospect_id=xxx → get active concierge
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/b2b-db.php';

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (empty($input['prospect_id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'prospect_id is required']);
                exit;
            }
            // Check if already has active concierge
            $existing = b2b_get_active_concierge($input['prospect_id']);
            if ($existing) {
                http_response_code(409);
                echo json_encode(['error' => 'Active concierge already exists', 'concierge' => $existing]);
                exit;
            }
            $start = date('Y-m-d');
            $end = date('Y-m-d', strtotime('+7 days'));
            $concierge = b2b_start_concierge($input['prospect_id'], $start, $end);
            if (!$concierge) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to start concierge']);
                exit;
            }
            b2b_log_event('CONCIERGE_ACCEPTED', $input['prospect_id'], 'founder', [
                'start_date' => $start,
                'end_date' => $end,
            ]);
            b2b_update_prospect($input['prospect_id'], ['status' => 'concierge']);
            echo json_encode($concierge);
            break;

        case 'PATCH':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id is required']);
                exit;
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $action = $input['action'] ?? null;

            switch ($action) {
                case 'advance_day':
                    $day = (int)($input['day'] ?? 0);
                    $concierge = b2b_advance_concierge_day($id, $day);
                    if ($concierge) {
                        b2b_log_event("DAY_{$day}_SENT", $concierge['prospect_id'], 'system', [
                            'day' => $day,
                        ]);
                    }
                    echo json_encode($concierge);
                    break;

                case 'payment_requested':
                    $concierge = b2b_mark_payment_requested($id);
                    if ($concierge) {
                        b2b_log_event('PAYMENT_REQUESTED', $concierge['prospect_id'], 'founder');
                    }
                    echo json_encode($concierge);
                    break;

                case 'payment_confirmed':
                    $concierge = b2b_mark_payment_confirmed($id);
                    if ($concierge) {
                        b2b_log_event('PAYMENT_CONFIRMED', $concierge['prospect_id'], 'webhook');
                        b2b_update_prospect($concierge['prospect_id'], ['status' => 'paid']);
                    }
                    echo json_encode($concierge);
                    break;

                default:
                    http_response_code(400);
                    echo json_encode(['error' => 'Unknown action: ' . ($action ?? 'null')]);
            }
            break;

        case 'GET':
            $prospectId = $_GET['prospect_id'] ?? null;
            if (!$prospectId) {
                http_response_code(400);
                echo json_encode(['error' => 'prospect_id is required']);
                exit;
            }
            $concierge = b2b_get_active_concierge($prospectId);
            echo json_encode($concierge);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
