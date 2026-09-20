<?php
// ── pp-supabase-mirror.php — Mirror des grants PayPal vers Supabase (G3) ────
// Avant G3, les grants PayPal ne vivaient que dans des fichiers :
//   - pass one-time : AUCUN enregistrement serveur (front localStorage + forward
//     Apps Script uniquement) → pas de vérif cross-device serveur.
//   - abos : mapping email->subId dans api/data/paypal-subs/*.json → perdu si le
//     dossier est regénéré/nettoyé au deploy.
//
// Ce helper écrit chaque grant dans public.payment_grants (même table que le
// mirror Mollie mol_supabase_mirror) : source de vérité durable + vérif
// cross-device via mol_access_for_email() (email + expires_at futur, tout type).
//
// Conventions :
//   - Config Supabase = mollie-config.php (supabase_url/supabase_service_key,
//     déjà provisionné pour le mirror Mollie) + fallback env. AUCUNE clé dans
//     paypal-config.php, aucun nouveau secret à déployer.
//   - Best-effort : sans clé → skip silencieux (true). Échec réseau → false +
//     error_log, JAMAIS de 500 vers le front (le grant fichier/historique reste).
//   - Colonnes STRICTEMENT du schéma supabase/schema.sql (payment_grants) :
//     payment_id, subscription_id, type, pass, plan, email, currency,
//     expires_at, granted_at, metadata. PAS de 'island' ni 'status' en top-level
//     (colonnes inexistantes → 400 PostgREST) : l'île vit dans metadata.
//   - payment_id préfixé 'pp_' (jamais de collision avec les ids Mollie tr_*,
//     contrainte unique respectée).

if (!function_exists('pp_supabase_cfg')) {
function pp_supabase_cfg(): array {
    $cfg = @include __DIR__ . '/mollie-config.php';
    if (!is_array($cfg)) $cfg = [];
    $url = $cfg['supabase_url'] ?? getenv('SUPABASE_URL');
    if (!$url) $url = 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $key = $cfg['supabase_service_key'] ?? getenv('SUPABASE_SERVICE_KEY');
    return ['url' => rtrim($url, '/'), 'key' => $key ?: ''];
}
}

// Durées pass one-time (même map que mol_b2c_pass_grant : p30=30j, trip7=7j,
// season=210j, défaut 30j).
if (!function_exists('pp_pass_days')) {
function pp_pass_days(string $pass): int {
    $durations = ['p30' => 30, 'trip7' => 7, 'season' => 210];
    return $durations[$pass] ?? 30;
}
}

// Ligne payment_grants pour un pass one-time PayPal (capture_order + webhook
// PAYMENT.CAPTURE.* — voir paypal.php : seul le chemin synchrone mirror, le
// webhook ne re-mirror pas la capture pour éviter les doublons d'id).
if (!function_exists('pp_b2c_pass_row')) {
function pp_b2c_pass_row(string $orderId, string $pass, string $email, string $currency, string $island, string $source, int $cents, ?int $now = null): array {
    $now = $now ?? time();
    $days = pp_pass_days($pass);
    return [
        'payment_id' => 'pp_' . $orderId,
        'type' => 'b2c_pass',
        'pass' => $pass,
        'email' => $email,
        'currency' => strtoupper($currency ?: 'EUR'),
        'expires_at' => date('c', $now + $days * 86400),
        'granted_at' => date('c', $now),
        'metadata' => ['provider' => 'paypal', 'island' => $island, 'source' => $source, 'cents' => $cents],
    ];
}
}

// Ligne payment_grants pour un abo PayPal actif (confirm_subscription +
// webhook BILLING.SUBSCRIPTION.ACTIVATED). monthly=30j, annual=365j.
if (!function_exists('pp_sub_row')) {
function pp_sub_row(string $subId, string $planIn, string $email, string $island, ?int $now = null): array {
    $now = $now ?? time();
    $planIn = $planIn === 'annual' ? 'annual' : 'monthly';
    $days = $planIn === 'annual' ? 365 : 30;
    return [
        'subscription_id' => $subId,
        'type' => 'b2c_pass',
        'plan' => 'pp_' . $planIn,
        'email' => $email,
        'currency' => 'EUR',
        'expires_at' => date('c', $now + $days * 86400),
        'granted_at' => date('c', $now),
        'metadata' => ['provider' => 'paypal', 'island' => $island],
    ];
}
}

// POST best-effort d'une ligne. Retourne false si Supabase rejette (le caller
// loggue, ne casse jamais le flux de paiement).
if (!function_exists('pp_mirror_grant')) {
function pp_mirror_grant(array $row): bool {
    $cfg = pp_supabase_cfg();
    if (!$cfg['key']) return true; // non configuré en local/dev → skip silencieux
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $cfg['url'] . '/rest/v1/payment_grants',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($row),
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $cfg['key'],
            'Authorization: Bearer ' . $cfg['key'],
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
        CURLOPT_TIMEOUT => 10,
    ]);
    $resp = curl_exec($ch);
    if (curl_errno($ch)) {
        error_log('[pp_mirror_grant] cURL error: ' . curl_error($ch));
        curl_close($ch);
        return false;
    }
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($httpCode >= 400) {
        error_log('[pp_mirror_grant] HTTP error: ' . $httpCode . ' ' . substr((string)$resp, 0, 200));
        return false;
    }
    return true;
}
}

// Retrouve un subscription_id PayPal par email dans le mirror (fallback quand
// le fichier api/data/paypal-subs/<sha1>.json a disparu au deploy). Retourne
// le mapping le plus récent, SANS filtre d'expiration : c'est le check PayPal
// live (verify_subscription) qui reste seul juge de ACTIVE — pas le mirror.
if (!function_exists('pp_find_sub_by_email')) {
function pp_find_sub_by_email(string $email): ?string {
    $email = trim($email);
    if (!$email) return null;
    $cfg = pp_supabase_cfg();
    if (!$cfg['key']) return null;
    $qs = http_build_query([
        'select' => 'subscription_id,granted_at',
        'email' => 'eq.' . $email,
        'order' => 'granted_at.desc',
        'limit' => '25',
    ]);
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $cfg['url'] . '/rest/v1/payment_grants?' . $qs,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $cfg['key'],
            'Authorization: Bearer ' . $cfg['key'],
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT => 8,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 400 || !$resp) return null;
    $rows = json_decode($resp, true);
    if (!is_array($rows)) return null;
    foreach ($rows as $r) {
        if (!empty($r['subscription_id'])) return (string)$r['subscription_id'];
    }
    return null;
}
}

// Prolonge la ligne mirror d'un abo (webhook PAYMENT.SALE.COMPLETED : facture
// récurrente payée → +$days d'accès). Sans ça, la ligne ACTIVATED expirerait
// au bout du 1er mois alors que l'abo reste ACTIVE côté PayPal.
if (!function_exists('pp_extend_sub_mirror')) {
function pp_extend_sub_mirror(string $subId, int $days = 30): bool {
    $cfg = pp_supabase_cfg();
    if (!$cfg['key']) return true;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $cfg['url'] . '/rest/v1/payment_grants?subscription_id=eq.' . rawurlencode($subId),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_POSTFIELDS => json_encode(['expires_at' => date('c', time() + $days * 86400)]),
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $cfg['key'],
            'Authorization: Bearer ' . $cfg['key'],
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
        CURLOPT_TIMEOUT => 10,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 400) {
        error_log('[pp_extend_sub_mirror] HTTP error: ' . $code . ' ' . substr((string)$resp, 0, 200));
        return false;
    }
    return true;
}
}
// Expire la ligne mirror d'un abo (webhook CANCELLED/EXPIRED). Pas de colonne
// 'status' dans le schéma → on ramène expires_at à maintenant (effet revoke
// pour toutes les lectures Supabase : mol_access_for_email filtre le futur).
if (!function_exists('pp_expire_sub_mirror')) {
function pp_expire_sub_mirror(string $subId): bool {
    $cfg = pp_supabase_cfg();
    if (!$cfg['key']) return true;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $cfg['url'] . '/rest/v1/payment_grants?subscription_id=eq.' . rawurlencode($subId),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_POSTFIELDS => json_encode(['expires_at' => date('c')]),
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $cfg['key'],
            'Authorization: Bearer ' . $cfg['key'],
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
        CURLOPT_TIMEOUT => 10,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code >= 400) {
        error_log('[pp_expire_sub_mirror] HTTP error: ' . $code . ' ' . substr((string)$resp, 0, 200));
        return false;
    }
    return true;
}
}
