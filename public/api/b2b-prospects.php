<?php
/**
 * b2b-prospects.php — CRUD for B2B prospects.
 * POST /api/b2b-prospects.php  → create prospect
 * GET  /api/b2b-prospects.php?id=xxx  → get one
 * GET  /api/b2b-prospects.php         → list all (optional ?status=xxx)
 * PATCH /api/b2b-prospects.php?id=xxx → update status
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/b2b-db.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (empty($input['name'])) {
                http_response_code(400);
                echo json_encode(['error' => 'name is required']);
                exit;
            }
            $prospect = b2b_create_prospect([
                'name'   => $input['name'],
                'beach'  => $input['beach'] ?? null,
                'island' => $input['island'] ?? null,
                'phone'  => $input['phone'] ?? null,
                'email'  => $input['email'] ?? null,
                'grade'  => $input['grade'] ?? 'A',
            ]);
            if (!$prospect) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to create prospect']);
                exit;
            }
            b2b_log_event('PROSPECT_CREATED', $prospect['id'], 'system', [
                'name' => $prospect['name'],
                'beach' => $prospect['beach'],
                'island' => $prospect['island'],
            ]);
            echo json_encode($prospect);
            break;

        case 'GET':
            $id = $_GET['id'] ?? null;
            if ($id) {
                $prospect = b2b_get_prospect($id);
                if (!$prospect) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found']);
                    exit;
                }
                echo json_encode($prospect);
            } else {
                $status = $_GET['status'] ?? null;
                $query = '?select=*';
                if ($status) $query .= "&status=eq.$status";
                $query .= '&order=created_at.desc';
                $rows = b2b_supabase_request('b2b_prospects', 'GET', null, $query);
                echo json_encode($rows ?? []);
            }
            break;

        case 'PATCH':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id is required']);
                exit;
            }
            $input = json_decode(file_get_contents('php://input'), true);
            $prospect = b2b_update_prospect($id, $input);
            if (!$prospect) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found or update failed']);
                exit;
            }
            echo json_encode($prospect);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
