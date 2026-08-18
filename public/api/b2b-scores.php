<?php
/**
 * b2b-scores.php — Set/get P×F×C×V scores.
 * POST /api/b2b-scores.php → set score
 * GET  /api/b2b-scores.php?prospect_id=xxx → get latest score
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
        $p = (int)($input['problem_score'] ?? 0);
        $f = (int)($input['frequency_score'] ?? 0);
        $c = (int)($input['cost_score'] ?? 0);
        $w = (int)($input['willingness_score'] ?? 0);
        $total = $p + $f + $c + $w;

        $rows = b2b_supabase_request('b2b_scores', 'POST', [
            'prospect_id'      => $input['prospect_id'],
            'problem_score'    => $p,
            'frequency_score'  => $f,
            'cost_score'       => $c,
            'willingness_score'=> $w,
            'total_score'      => $total,
        ]);
        $score = $rows[0] ?? null;
        if (!$score) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save score']);
            exit;
        }
        b2b_log_event('SCORE_SET', $input['prospect_id'], 'founder', [
            'total' => $total,
            'p' => $p, 'f' => $f, 'c' => $c, 'w' => $w,
        ]);
        echo json_encode($score);
    } elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $prospectId = $_GET['prospect_id'] ?? null;
        if (!$prospectId) {
            http_response_code(400);
            echo json_encode(['error' => 'prospect_id is required']);
            exit;
        }
        $rows = b2b_supabase_request('b2b_scores', 'GET', null,
            "?prospect_id=eq.$prospectId&select=*&order=computed_at.desc&limit=1");
        echo json_encode($rows[0] ?? null);
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
