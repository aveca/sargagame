<?php
/**
 * b2b-forecast-delivery.php — Create and send daily forecasts.
 * POST /api/b2b-forecast-delivery.php  → create draft delivery
 * PATCH /api/b2b-forecast-delivery.php?id=xxx → mark sent
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
            if (empty($input['concierge_id']) || empty($input['prospect_id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'concierge_id and prospect_id are required']);
                exit;
            }
            $delivery = b2b_create_forecast_delivery([
                'concierge_id'       => $input['concierge_id'],
                'prospect_id'        => $input['prospect_id'],
                'beach'              => $input['beach'] ?? null,
                'forecast_date'      => $input['forecast_date'] ?? date('Y-m-d'),
                'day_number'         => (int)($input['day_number'] ?? 1),
                'risk_level'         => $input['risk_level'] ?? null,
                'confidence'         => (int)($input['confidence'] ?? 0),
                'explanation'        => $input['explanation'] ?? null,
                'recommended_action' => $input['recommended_action'] ?? null,
                'channel'            => $input['channel'] ?? 'email',
                'status'             => 'draft',
            ]);
            if (!$delivery) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to create delivery']);
                exit;
            }
            b2b_log_event('FORECAST_PREPARED', $input['prospect_id'], 'system', [
                'day' => $delivery['day_number'],
                'delivery_id' => $delivery['id'],
                'risk_level' => $delivery['risk_level'],
            ]);
            echo json_encode($delivery);
            break;

        case 'PATCH':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id is required']);
                exit;
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $action = $input['action'] ?? 'sent';

            if ($action === 'sent') {
                $delivery = b2b_mark_delivery_sent($id);
                if ($delivery) {
                    b2b_log_event("DAY_{$delivery['day_number']}_SENT", $delivery['prospect_id'], 'system', [
                        'day' => $delivery['day_number'],
                        'delivery_id' => $id,
                    ]);
                }
                echo json_encode($delivery);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Unknown action']);
            }
            break;

        case 'GET':
            $conciergeId = $_GET['concierge_id'] ?? null;
            if (!$conciergeId) {
                http_response_code(400);
                echo json_encode(['error' => 'concierge_id is required']);
                exit;
            }
            $rows = b2b_supabase_request('b2b_forecast_deliveries', 'GET', null,
                "?concierge_id=eq.$conciergeId&select=*&order=day_number.asc");
            echo json_encode($rows ?? []);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
