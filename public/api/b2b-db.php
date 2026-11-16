<?php
/**
 * b2b-db.php — Supabase REST helper for B2B concierge tables (PHP side).
 * Minimal: insert, select, update. Uses service key for full access.
 * Follows mollie-lib.php pattern (mol_supabase_mirror).
 */

if (!function_exists('b2b_supabase_request')) {
/**
 * Generic Supabase REST request.
 * @param string $table
 * @param string $method GET | POST | PATCH | DELETE
 * @param array|null $body
 * @param string $query e.g. '?id=eq.xxx&select=*'
 * @return array|null decoded JSON or null
 */
function b2b_supabase_request(string $table, string $method, ?array $body = null, string $query = ''): ?array {
    $cfg = @include __DIR__ . '/mollie-config.php';
    if (!is_array($cfg)) $cfg = [];

    $supabaseUrl = $cfg['supabase_url'] ?? getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey  = $cfg['supabase_service_key'] ?? getenv('SUPABASE_SERVICE_KEY') ?? '';
    if (!$serviceKey) {
        error_log('[b2b-db] SUPABASE_SERVICE_KEY not set');
        return null;
    }

    $url = rtrim($supabaseUrl, '/') . '/rest/v1/' . $table . $query;

    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'Content-Type: application/json',
    ];
    if ($method === 'GET') $headers[] = 'Prefer: return=representation';
    if ($method === 'POST') $headers[] = 'Prefer: return=representation';
    if ($method === 'PATCH') $headers[] = 'Prefer: return=representation';

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 10,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $resp = curl_exec($ch);
    if (curl_errno($ch)) {
        error_log('[b2b-db] cURL error: ' . curl_error($ch));
        curl_close($ch);
        return null;
    }
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 400) {
        error_log("[b2b-db] HTTP $httpCode for $method $table: $resp");
        return null;
    }
    if ($httpCode === 204 || empty($resp)) return [];
    return json_decode($resp, true) ?? [];
}
}

if (!function_exists('b2b_log_event')) {
/**
 * Log an immutable B2B event.
 */
function b2b_log_event(string $type, ?string $prospect_id = null, string $actor = 'system', array $metadata = []): bool {
    $result = b2b_supabase_request('b2b_events', 'POST', [
        'prospect_id' => $prospect_id,
        'type'        => $type,
        'actor'       => $actor,
        'metadata'    => $metadata,
    ]);
    return $result !== null;
}
}

if (!function_exists('b2b_create_prospect')) {
function b2b_create_prospect(array $data): ?array {
    $rows = b2b_supabase_request('b2b_prospects', 'POST', $data);
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_update_prospect')) {
function b2b_update_prospect(string $id, array $data): ?array {
    $rows = b2b_supabase_request('b2b_prospects', 'PATCH', $data, "?id=eq.$id&select=*");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_get_prospect')) {
function b2b_get_prospect(string $id): ?array {
    $rows = b2b_supabase_request('b2b_prospects', 'GET', null, "?id=eq.$id&select=*");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_find_prospect_by_name')) {
function b2b_find_prospect_by_name(string $name): ?array {
    $rows = b2b_supabase_request('b2b_prospects', 'GET', null,
        "?name=ilike.*" . rawurlencode($name) . "*&select=*&limit=5");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_get_active_concierge')) {
function b2b_get_active_concierge(string $prospect_id): ?array {
    $rows = b2b_supabase_request('b2b_concierge', 'GET', null,
        "?prospect_id=eq.$prospect_id&status=eq.active&select=*&limit=1");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_start_concierge')) {
function b2b_start_concierge(string $prospect_id, string $start_date, string $end_date): ?array {
    $rows = b2b_supabase_request('b2b_concierge', 'POST', [
        'prospect_id' => $prospect_id,
        'start_date'  => $start_date,
        'end_date'    => $end_date,
        'status'      => 'active',
        'current_day' => 0,
    ]);
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_advance_concierge_day')) {
function b2b_advance_concierge_day(string $concierge_id, int $day): ?array {
    $rows = b2b_supabase_request('b2b_concierge', 'PATCH',
        ['current_day' => $day], "?id=eq.$concierge_id&select=*");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_mark_payment_requested')) {
function b2b_mark_payment_requested(string $concierge_id): ?array {
    $rows = b2b_supabase_request('b2b_concierge', 'PATCH',
        ['payment_requested' => true], "?id=eq.$concierge_id&select=*");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_mark_payment_confirmed')) {
function b2b_mark_payment_confirmed(string $concierge_id): ?array {
    $rows = b2b_supabase_request('b2b_concierge', 'PATCH',
        ['payment_confirmed' => true, 'status' => 'completed'], "?id=eq.$concierge_id&select=*");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_create_payment')) {
function b2b_create_payment(array $data): ?array {
    $rows = b2b_supabase_request('b2b_payments', 'POST', $data);
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_mark_payment_paid')) {
function b2b_mark_payment_paid(string $payment_id): ?array {
    $now = date('c');
    $rows = b2b_supabase_request('b2b_payments', 'PATCH',
        ['status' => 'paid', 'paid_at' => $now], "?id=eq.$payment_id&select=*");
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_create_forecast_delivery')) {
function b2b_create_forecast_delivery(array $data): ?array {
    $rows = b2b_supabase_request('b2b_forecast_deliveries', 'POST', $data);
    return $rows[0] ?? null;
}
}

if (!function_exists('b2b_mark_delivery_sent')) {
function b2b_mark_delivery_sent(string $delivery_id): ?array {
    $now = date('c');
    $rows = b2b_supabase_request('b2b_forecast_deliveries', 'PATCH',
        ['status' => 'sent', 'sent_at' => $now], "?id=eq.$delivery_id&select=*");
    return $rows[0] ?? null;
}
}
