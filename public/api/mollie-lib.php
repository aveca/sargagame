<?php
/**
 * Shared Mollie helpers — B2B plans (mensuel + annuel) + grant token Pro
 * Config secrets dans mollie-config.php (gitignored)
 */

class SgPaymentResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function getCheckoutUrl(): ?string { return $this->resp['_links']['checkout']['href'] ?? null; }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgPaymentDetailResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function isPaid(): bool { return ($this->resp['status'] ?? '') === 'paid' || ($this->resp['paid'] ?? false); }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgCustomerResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgSubscriptionResponse {
    private array $resp;
    public function __construct(array $resp) { $this->resp = $resp; }
    public function __get(string $name) { return $this->resp[$name] ?? null; }
}

class SgMollieClient {
    private string $apiKey;
    public object|false $payments;
    public object|false $customers;
    public object|false $customer_subscriptions;
    public object $applePay;

    public function __construct(string $apiKey) {
        $this->apiKey = $apiKey;
        $self = $this;
        $this->applePay = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function sessions(): object {
                return new class($this->c) {
                    private $c;
                    public function __construct($c){ $this->c = $c; }
                    public function create(array $data): array {
                        $resp = $this->c->_post('v2/wallets/applepay/sessions', $data);
                        return $resp;
                    }
                };
            }
        };
        $this->payments = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function create(array $data): SgPaymentResponse {
                $resp = $this->c->_post('v2/payments', $data);
                return new SgPaymentResponse($resp);
            }
            public function get(string $id): SgPaymentDetailResponse {
                $resp = $this->c->_get("v2/payments/$id");
                return new SgPaymentDetailResponse($resp);
            }
        };
        $this->customers = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function get(string $id): SgCustomerResponse {
                $resp = $this->c->_get("v2/customers/$id");
                return new SgCustomerResponse($resp);
            }
            public function page(array $params = []): array {
                $query = http_build_query($params);
                $resp = $this->c->_get('v2/customers?' . $query);
                $items = $resp['_embedded']['customers'] ?? [];
                return array_map(fn($c) => new SgCustomerResponse($c), $items);
            }
            public function create(array $data): SgCustomerResponse {
                $resp = $this->c->_post('v2/customers', $data);
                return new SgCustomerResponse($resp);
            }
        };
        $this->customer_subscriptions = new class($self) {
            private $c;
            public function __construct($c){ $this->c = $c; }
            public function create(string $customerId, array $data): SgSubscriptionResponse {
                $resp = $this->c->_post("v2/customers/$customerId/subscriptions", $data);
                return new SgSubscriptionResponse($resp);
            }
            public function get(string $id): SgSubscriptionResponse {
                $resp = $this->c->_get("v2/subscriptions/$id");
                return new SgSubscriptionResponse($resp);
            }
        };
    }

    public function _get(string $path): array { return $this->_request('GET', $path); }
    public function _post(string $path, array $data): array { return $this->_request('POST', $path, $data); }

    private function _request(string $method, string $path, ?array $data = null): array {
        $ch = curl_init();
        $url = 'https://api.mollie.com/' . $path;
        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Accept: application/json',
            'Content-Type: application/json',
        ];
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if (curl_errno($ch)) { $err = curl_error($ch); curl_close($ch); throw new Exception('cURL error: ' . $err); }
        curl_close($ch);
        $decoded = json_decode($response, true) ?: [];
        if ($httpCode >= 400) {
            $msg = $decoded['detail'] ?? $decoded['title'] ?? ('HTTP ' . $httpCode);
            throw new Exception('Mollie API error: ' . $msg);
        }
        return $decoded;
    }
}

function getMollieClient(): SgMollieClient {
    // Use require (not require_once) because mollie.php already did require_once
    // and require_once would return true (boolean) on subsequent calls
    $cfg = require __DIR__ . '/mollie-config.php';
    $apiKey = is_array($cfg) ? ($cfg['api_key'] ?? '') : (defined('MOLLIE_API_KEY') ? MOLLIE_API_KEY : '');
    return new SgMollieClient($apiKey);
}

/**
 * B2B plans — montants EN REPO (pas en config gitignored)
 * Mensuel récurrent : Pro 79€/mois, Brief 29€/mois
 * Annuel : Pro 690€/an, Brief 290€/an (paylinks hosted via mollie-paylinks.cjs)
 */
function mol_b2b_plans(): array {
    return [
        'pro_monthly' => [
            'amount' => 79.00,
            'currency' => 'EUR',
            'description' => 'Sargasses Pro — mensuel (79 €/mois, sans engagement)',
            'interval' => '1 month',
        ],
        'brief_monthly' => [
            'amount' => 29.00,
            'currency' => 'EUR',
            'description' => 'Sargasses Brief — mensuel (29 €/mois, sans engagement)',
            'interval' => '1 month',
        ],
        'pro_annual' => [
            'amount' => 690.00,
            'currency' => 'EUR',
            'description' => 'Sargasses Pro — annuel (690 €/an, ~2 mois offerts)',
            'interval' => '1 year',
        ],
        'brief_annual' => [
            'amount' => 290.00,
            'currency' => 'EUR',
            'description' => 'Sargasses Brief — annuel (290 €/an, ~2 mois offerts)',
            'interval' => '1 year',
        ],
    ];
}

/**
 * Decode le payload d'un jeton Pro (base64url JSON + HMAC).
 * Sert a relire l'expiration d'un grant existant sans le re-emettre.
 * Retourne null si le jeton est illisible.
 */
function mol_b2b_token_payload(?string $token): ?array {
    if (!is_string($token) || $token === '') return null;
    $parts = explode('.', $token);
    if (count($parts) !== 2 || $parts[0] === '') return null;
    $json = function_exists('sg_widget_b64url_dec')
        ? sg_widget_b64url_dec($parts[0])
        : base64_decode(strtr($parts[0], '-_', '+/'));
    $d = json_decode((string)$json, true);
    return is_array($d) ? $d : null;
}

/**
 * Durée d'accès (jours) d'un plan B2B, déduite de l'intervalle serveur.
 * Source unique : mol_b2b_plans(). Ne jamais coder en dur ailleurs.
 */
function mol_b2b_plan_duration_days(string $planKey): int {
    $plans = mol_b2b_plans();
    if (!isset($plans[$planKey])) return 30;
    $interval = (string)($plans[$planKey]['interval'] ?? '1 month');
    return ($interval === '1 year') ? 365 : 30;
}

/**
 * Valide un paiement B2B contre l'allowlist serveur des plans (montant + devise).
 *
 * RÈGLE DE SÉCURITÉ : la metadata n'est jamais suffisante — c'est le MONTANT
 * réellement payé qui fait foi. Sans ce contrôle, un pass B2C `sos` (1,00 EUR)
 * combiné à `source=b2b_annual` déclencherait un grant Pro 365 jours.
 *
 * @return array{ok:bool,error?:string,plan?:string,duration_days?:int}
 */
function mol_b2b_validate_plan_amount(?string $planKey, string $currency, float $value): array {
    $plans = mol_b2b_plans();
    if ($planKey === null || !isset($plans[$planKey])) {
        return ['ok' => false, 'error' => 'unknown_b2b_plan'];
    }
    $expected = $plans[$planKey];
    if (strtoupper(trim($currency)) !== strtoupper((string)$expected['currency'])) {
        return ['ok' => false, 'error' => 'currency_mismatch'];
    }
    if (abs($value - (float)$expected['amount']) >= 0.02) {
        return ['ok' => false, 'error' => 'amount_mismatch'];
    }
    return ['ok' => true, 'plan' => $planKey, 'duration_days' => mol_b2b_plan_duration_days($planKey)];
}

/**
 * Extrait le montant (devise + valeur) d'un abonnement Mollie.
 * Robuste aux variantes du SDK : objet Amount, tableau, ou amount scalaire
 * + currency au niveau de l'abonnement.
 *
 * @return array{currency:string,value:float}
 */
function mol_b2b_subscription_amount($subscription): array {
    $currency = '';
    $value = 0.0;
    $amount = $subscription->amount ?? null;
    if (is_object($amount) && isset($amount->currency)) {
        $currency = strtoupper((string)$amount->currency);
        $value = (float)($amount->value ?? 0);
    } elseif (is_array($amount)) {
        $currency = strtoupper((string)($amount['currency'] ?? ''));
        $value = (float)($amount['value'] ?? 0);
    } else {
        $currency = strtoupper((string)($subscription->currency ?? ''));
        $value = (float)$amount;
    }
    return ['currency' => $currency, 'value' => $value];
}

/**
 * Retrouve le plan B2B correspondant au montant payé.
 * Utilisé quand la payment n'a pas de metadata (lien annuel statique) :
 * le montant payé est alors la seule preuve exploitable.
 *
 * @return array{ok:bool,error?:string,plan?:string,duration_days?:int}
 */
function mol_b2b_plan_by_amount(string $currency, float $value): array {
    foreach (mol_b2b_plans() as $key => $plan) {
        if (strtoupper((string)$plan['currency']) !== strtoupper(trim($currency))) continue;
        if (abs((float)$plan['amount'] - $value) >= 0.02) continue;
        return ['ok' => true, 'plan' => $key, 'duration_days' => mol_b2b_plan_duration_days($key)];
    }
    return ['ok' => false, 'error' => 'amount_not_in_plan_allowlist'];
}

/**
 * Journal durable des événements webhook non réconciliés (mirror Supabase échoué).
 * Une ligne JSON par événement, dans data/webhook-events/ (gitignoré : contient de la PII).
 * Best-effort : un échec d'écriture ne doit jamais faire échouer le webhook.
 */
function webhook_journal_write(string $eventKey, array $payload): bool {
    try {
        $dir = __DIR__ . '/../../data/webhook-events';
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) return false;
        $line = json_encode([
            'event_key'  => $eventKey,
            'written_at' => gmdate('c'),
            'payload'    => $payload,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($line === false) return false;
        $file = $dir . '/' . gmdate('Ymd') . '.jsonl';
        return @file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX) !== false;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * Mise à jour d'une ligne Supabase (PATCH) — utilisé pour la révocation durable.
 * Best-effort : ne lève jamais d'exception.
 */
function mol_supabase_patch(string $table, array $data, string $filterColumn, string $filterValue): bool {
    // Garde de test (voir mol_supabase_mirror) : aucune écriture réseau en test.
    if (defined('SG_TEST_NO_SUPABASE') && SG_TEST_NO_SUPABASE) {
        error_log('[mol_supabase_patch] SG_TEST_NO_SUPABASE actif — écriture Supabase désactivée (test)');
        return false;
    }
    $cfg = @include __DIR__ . '/mollie-config.php';
    if (!is_array($cfg)) $cfg = [];
    $supabaseUrl = ($cfg['supabase_url'] ?? '') ?: getenv('SUPABASE_URL') ?: '';
    $serviceKey = ($cfg['supabase_service_key'] ?? '') ?: getenv('SUPABASE_SERVICE_KEY') ?: '';
    if (!$supabaseUrl || !$serviceKey || $filterValue === '') return false;

    // Filtre PostgREST : la valeur est encodée (pas d'injection de filtre).
    $url = $supabaseUrl . '/rest/v1/' . $table . '?' . rawurlencode($filterColumn) . '=eq.' . rawurlencode($filterValue);
    $payload = json_encode($data);
    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'Content-Type: application/json',
        'Prefer: return=minimal',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_CUSTOMREQUEST => 'PATCH',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 10,
        ]);
        curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($httpCode >= 400) {
            error_log('[mol_supabase_patch] HTTP error ' . $httpCode);
            return false;
        }
        return true;
    }

    $headerLines = '';
    foreach ($headers as $h) { $headerLines .= $h . "\r\n"; }
    $ctx = stream_context_create([
        'http' => [
            'method'        => 'PATCH',
            'header'        => $headerLines,
            'content'       => (string)$payload,
            'timeout'       => 10,
            'ignore_errors' => true,
        ],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $resp = @file_get_contents($url, false, $ctx);
    $httpCode = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) { $httpCode = (int)$m[1]; }
        }
    }
    if ($resp === false) {
        error_log('[mol_supabase_patch] stream failure');
        return false;
    }
    if ($httpCode >= 400) {
        error_log('[mol_supabase_patch] HTTP error ' . $httpCode);
        return false;
    }
    return true;
}

/**
 * Grant Pro token once per subscription (idempotent via subscriptionId)
 * Gère mensuel (renouvelable 30j) vs annuel (one-shot 365j)
 * $email optionnel : stocké dans le mirror Supabase pour permettre
 * verify_subscription par email (b2b_pro cross-device).
 * $renewable : true UNIQUEMENT pour un renouvellement confirmé serveur (subscription.paid).
 *   - false (défaut) : idempotence stricte — aucun accès ré-accordé si le grant existe.
 *   - true : renouvellement — la fenêtre d'accès est prolongée de `durationDays`
 *     à partir de maintenant, MAIS UNIQUEMENT si la fenêtre existante ne couvre
 *     déjà pas une période complète (anti-empilement : le premier encaissement
 *     déclenche subscription.created ET subscription.paid → une seule fenêtre).
 */
function mol_b2b_grant_once(string $customerId, string $planKey, string $subscriptionId, ?int $durationDaysOverride = null, ?string $email = null, bool $renewable = false): array {
    require_once __DIR__ . '/widget-token.php';

    $grantKey = 'mollie_grant_' . $subscriptionId;
    $existing = get_transient($grantKey);
    $isMonthly = in_array($planKey, ['pro_monthly', 'brief_monthly'], true);
    $durationDays = $durationDaysOverride ?? ($isMonthly ? 30 : 365);

    // --- Grant déjà présent ------------------------------------------------
    if ($existing) {
        $payload = mol_b2b_token_payload($existing);
        $existingExp = isset($payload['exp']) ? (int)$payload['exp'] : 0;

        if ($renewable) {
            // Renouvellement confirmé par le serveur Mollie (subscription.paid).
            //
            // ANTI-EMPILEMENT : Mollie envoie `subscription.paid` pour le PREMIER
            // encaissement en même temps que `subscription.created`. Si chaque
            // `subscription.paid` empilait +30j, un seul paiement de 79 € donnerait
            // 60 jours d'accès. On ne prolonge donc QUE si la fenêtre existante
            // ne couvre déjà pas une période complète à partir de maintenant
            // (rejeu du même événement => fenêtre inchangée).
            //
            //   - rejoué le même jour : fenêtre fraîche (now+30j) => pas d'extension
            //   - renouvellement réel  : fenêtre épuisée (exp <= now+tolérance) => +30j
            $now = time();
            $period = $durationDays * 86400;
            $tolerance = 2 * 86400; // 2 jours : absorbe une facturation légèrement anticipée
            $alreadyCovered = ($existingExp > ($now + $tolerance));

            if ($alreadyCovered) {
                // Rejeu / double événement : on NE ré-accorde rien.
                $expiresAt = $existingExp;
                $grantedAt = isset($payload['granted_at']) ? (string)$payload['granted_at'] : date('c', $expiresAt);
                $renewed = false;
                $token = $existing;
            } else {
                $expiresAt = $now + $period;
                $grantedAt = date('c', $now);
                $renewed = true;
                $token = sg_widget_sign([
                    'plan' => $planKey,
                    'customer_id' => $customerId,
                    'subscription_id' => $subscriptionId,
                    'exp' => $expiresAt,
                    'granted_at' => $grantedAt,
                    'type' => 'b2b_pro',
                ]);
                set_transient($grantKey, $token, max(60, $expiresAt - $now) + 86400);
            }

            $mirrorData = [
                'subscription_id' => $subscriptionId,
                'type' => 'b2b_pro',
                'plan' => $planKey,
                'customer_id' => $customerId,
                'expires_at' => date('c', $expiresAt),
                'granted_at' => $grantedAt,
            ];
            if ($email !== null) $mirrorData['email'] = $email;
            $mirrorOk = mol_supabase_mirror('payment_grants', $mirrorData);

            error_log("[mol_b2b_grant_once] " . ($renewed ? 'renewed' : 'renewal-skipped') . " plan=$planKey customer=$customerId sub=$subscriptionId expires=" . date('c', $expiresAt) . " mirror_ok=" . ($mirrorOk ? '1' : '0'));
            return [
                'granted' => $renewed,
                'renewed' => $renewed,
                'reason' => $renewed ? 'renewed' : 'already_granted',
                'token' => $token,
                'expires_at' => $expiresAt,
                'plan' => $planKey,
                'mirror_ok' => $mirrorOk,
            ];
        }

        // Idempotence stricte (one-shot annuel, ou événement non facturé) :
        // AUCUN accès ré-accordé. Le mirror est re-tenté pour qu'un grant
        // non persisté (échec Supabase transitoire) finisse par l'être.
        $expiresAt = $existingExp > 0 ? $existingExp : time();
        $grantedAt = isset($payload['granted_at']) ? (string)$payload['granted_at'] : date('c', $expiresAt);
        $mirrorData = [
            'subscription_id' => $subscriptionId,
            'type' => 'b2b_pro',
            'plan' => $planKey,
            'customer_id' => $customerId,
            'expires_at' => date('c', $expiresAt),
            'granted_at' => $grantedAt,
        ];
        if ($email !== null) $mirrorData['email'] = $email;
        $mirrorOk = mol_supabase_mirror('payment_grants', $mirrorData);

        return ['granted' => false, 'reason' => 'already_granted', 'token' => $existing, 'expires_at' => $expiresAt, 'plan' => $planKey, 'mirror_ok' => $mirrorOk];
    }

    // --- Premier grant ------------------------------------------------------
    $expiresAt = time() + ($durationDays * 86400);
    $grantedAt = date('c', time());

    $token = sg_widget_sign([
        'plan' => $planKey,
        'customer_id' => $customerId,
        'subscription_id' => $subscriptionId,
        'exp' => $expiresAt,
        'granted_at' => $grantedAt,
        'type' => 'b2b_pro',
    ]);

    set_transient($grantKey, $token, $durationDays * 86400 + 86400); // TTL = durée + 1 jour

    // Supabase mirror (best-effort). L'email est inclus quand disponible pour
    // permettre verify_subscription par email (type=b2b_pro).
    $mirrorData = [
        'subscription_id' => $subscriptionId,
        'type' => 'b2b_pro',
        'plan' => $planKey,
        'customer_id' => $customerId,
        'expires_at' => date('c', $expiresAt),
        'granted_at' => $grantedAt,
    ];
    if ($email !== null) {
        $mirrorData['email'] = $email;
    }
    $mirrorOk = mol_supabase_mirror('payment_grants', $mirrorData);

    error_log("[mol_b2b_grant_once] granted plan=$planKey customer=$customerId sub=$subscriptionId expires=" . date('c', $expiresAt));

    return ['granted' => true, 'renewed' => false, 'reason' => 'granted', 'token' => $token, 'expires_at' => $expiresAt, 'plan' => $planKey, 'mirror_ok' => $mirrorOk];
}

/**
 * Revoke Pro token for a subscription (called on cancellation/expiration)
 * Supprime le grant (le token ne peut plus être validé via sg_widget_verify).
 */
function mol_b2b_revoke(string $subscriptionId): void {
    $grantKey = 'mollie_grant_' . $subscriptionId;
    $revokeKey = 'mollie_revoked_' . $subscriptionId;
    set_transient($revokeKey, '1', 365 * 86400); // mark revoked for 1 year
    // Supprime le grant transient en double : clé normale + variante md5
    $fileGrant = sys_get_temp_dir() . '/mollie_transient_' . md5($grantKey);
    $fileGrantMd5 = sys_get_temp_dir() . '/mollie_transient_' . md5('mollie_grant_' . $subscriptionId);
    foreach ([$fileGrant, $fileGrantMd5] as $f) {
        if (file_exists($f)) @unlink($f);
    }

    // Révocation DURABLE : la ligne payment_grants doit-refléter l'annulation,
    // sinon verify_subscription continue de renvoyer active=true après un
    // subscription.canceled / expired (le transient local, lui, disparait au
    // redémarrage du serveur). On place expires_at dans le passé : le filtre
    // serveur verify_subscription (expires_at > now()) exclut alors la ligne.
    // Aucune migration nécessaire (colonne exists déjà).
    mol_supabase_patch('payment_grants', ['expires_at' => gmdate('c', time() - 60)], 'subscription_id', $subscriptionId);

    error_log("[mol_b2b_revoke] revoked sub=$subscriptionId");
}

/**
 * Check if a subscription token has been revoked
 */
function mol_b2b_is_revoked(string $subscriptionId): bool {
    $revokeKey = 'mollie_revoked_' . $subscriptionId;
    return get_transient($revokeKey) !== null;
}

/**
 * Simple transient store (file-based, survives deploy)
 */
function get_transient(string $key): ?string {
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    if (!file_exists($file)) return null;
    $data = json_decode(file_get_contents($file), true);
    if (!$data || ($data['expires'] ?? 0) < time()) {
        @unlink($file);
        return null;
    }
    return $data['value'] ?? null;
}

function set_transient(string $key, string $value, int $ttl): void {
    $file = sys_get_temp_dir() . '/mollie_transient_' . md5($key);
    $data = ['value' => $value, 'expires' => time() + $ttl];
    file_put_contents($file, json_encode($data), LOCK_EX);
}

/**
 * Supabase mirror for payment grants — write-only (service key on server).
 * Best-effort, never throws (logs only). Avoids /tmp loss on deploy/restart.
 * Retourne true si la requête HTTP a réussi (2xx), false sinon.
 */
function mol_supabase_mirror(string $table, array $data): bool {
    // Garde de test : empêche toute écriture réseau (et donc toute pollution
    // de la table de production) quand la constante est définie. Elle n'est
    // JAMAIS définie en production — seul un runner de test la définit.
    if (defined('SG_TEST_NO_SUPABASE') && SG_TEST_NO_SUPABASE) {
        error_log('[mol_supabase_mirror] SG_TEST_NO_SUPABASE actif — écriture Supabase désactivée (test)');
        return false;
    }
    // Charger la config soi-même (@include, pas require_once) afin de fonctionner
    // depuis n'importe quel contexte appelant (webhook, b2b-trial, mollie.php…)
    // sans dépendre d'une variable $cfg globale qui pourrait ne pas être portée.
    // Re-exécuter mollie-config.php est sans effet (il se contente de return [...]).
    // Si le fichier est absent (local sans config), on tombe en grâce sur getenv
    // puis sur chaîne vide → mirror skip silencieusement (best-effort, jamais bloquant).
    $cfg = @include __DIR__ . '/mollie-config.php';
    if (!is_array($cfg)) $cfg = [];
    $supabaseUrl = ($cfg['supabase_url'] ?? '') ?: getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey = ($cfg['supabase_service_key'] ?? '') ?: getenv('SUPABASE_SERVICE_KEY') ?: '';
    if (!$serviceKey) return false; // skip silently if not configured

    $payload = json_encode($data);
    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'Content-Type: application/json',
    ];

    // Upsert : le rejeu d'un webhook (ou un renouvellement mensuel) ne doit pas
    // echouer en 409 sur la contrainte unique, et l'expiration doit etre rafraichie.
    // on_conflict cible la contrainte reellement utilisee par la ligne
    // (subscription_id pour le B2B, payment_id pour le B2C).
    $url = $supabaseUrl . '/rest/v1/' . $table;
    $conflict = '';
    if (!empty($data['subscription_id'])) {
        $conflict = 'subscription_id';
    } elseif (!empty($data['payment_id'])) {
        $conflict = 'payment_id';
    }
    if ($conflict !== '') {
        $url .= '?on_conflict=' . rawurlencode($conflict);
        $headers[] = 'Prefer: resolution=merge-duplicates,return=minimal';
    } else {
        $headers[] = 'Prefer: return=minimal';
    }

    // cURL si disponible (serveur de production)
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 10,
        ]);
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if (curl_errno($ch)) {
            error_log('[mol_supabase_mirror] cURL error: ' . curl_error($ch));
            curl_close($ch);
            return false;
        }
        if ($httpCode >= 400) {
            error_log('[mol_supabase_mirror] HTTP error ' . $httpCode);
            curl_close($ch);
            return false;
        }
        curl_close($ch);
        return true;
    }

    // Repli flux natif (PHP sans extension curl : CLI local, ou serveur mal configure).
    // Sans ce repli, curl_init() inexistant provoquait une erreur fatale dans le webhook.
    $headerLines = '';
    foreach ($headers as $h) { $headerLines .= $h . "\r\n"; }
    $ctx = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => $headerLines,
            'content'       => (string)$payload,
            'timeout'       => 10,
            'ignore_errors' => true,
        ],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $resp = @file_get_contents($url, false, $ctx);
    $httpCode = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) { $httpCode = (int)$m[1]; }
        }
    }
    if ($resp === false) {
        error_log('[mol_supabase_mirror] stream failure (HTTPS indisponible : extension openssl absente ?)');
        return false;
    }
    if ($httpCode >= 400) {
        error_log('[mol_supabase_mirror] HTTP error ' . $httpCode);
        return false;
    }
    return true;
}

/**
 * Grant B2C pass — backup server-side du localStorage frontend.
 * Idempotent : même paymentId = pas de double grant.
 * Durées : p30=30j, trip7=7j, season=210j
 */
function mol_b2c_pass_grant(string $paymentId, string $pass, string $email, array $metadata = []): array {
    $grantKey = 'mol_b2c_pass_' . $paymentId;
    $existing = get_transient($grantKey);
    if ($existing) {
        return ['granted' => false, 'reason' => 'already_granted'];
    }

    $durations = ['p30' => 30, 'trip7' => 7, 'season' => 210, 'sos' => 1];
    $days = $durations[$pass] ?? 30;
    $expiresAt = time() + ($days * 86400);
    $currency = $metadata['currency'] ?? 'EUR';

    $grantData = json_encode([
        'pass' => $pass,
        'email' => $email,
        'currency' => $currency,
        'expires_at' => $expiresAt,
        'payment_id' => $paymentId,
        'granted_at' => time(),
    ]);

    set_transient($grantKey, $grantData, $days * 86400 + 86400);

    // Supabase mirror (best-effort, no-op if not configured)
    $mirrorOk = mol_supabase_mirror('payment_grants', [
        'payment_id' => $paymentId,
        'type' => 'b2c_pass',
        'pass' => $pass,
        'email' => $email,
        'currency' => $currency,
        'expires_at' => date('c', $expiresAt),
        'granted_at' => date('c', time()),
        'metadata' => $metadata,
    ]);

    error_log("[mol_b2c_pass_grant] pass=$pass paymentId=$paymentId days=$days expires=" . date('c', $expiresAt));

    return ['granted' => true, 'pass' => $pass, 'expires_at' => $expiresAt, 'days' => $days, 'mirror_ok' => $mirrorOk];
}

/**
 * Revoke a B2C pass grant (called on payment failure)
 */
function mol_b2c_pass_revoke(string $paymentId): void {
    $grantKey = 'mol_b2c_pass_' . $paymentId;
    $grantFile = sys_get_temp_dir() . '/mollie_transient_' . md5($grantKey);
    if (file_exists($grantFile)) @unlink($grantFile);
    error_log("[mol_b2c_pass_revoke] paymentId=$paymentId");
}

/**
 * Check if a B2C pass payment has been granted (for verification cross-device)
 */
function mol_b2c_pass_check(string $paymentId): ?array {
    $grantKey = 'mol_b2c_pass_' . $paymentId;
    $data = get_transient($grantKey);
    if (!$data) return null;
    $decoded = json_decode($data, true);
    if (!$decoded) return null;
    if (($decoded['expires_at'] ?? 0) < time()) return null;
    return $decoded;
}

// Ajout de la fonction pour créer un paiement Mollie
function mol_create_payment($amount, $currency, $description, $redirectUrl, $webhookUrl) {
    try {
        $mollie = getMollieClient();
        
        $payment = $mollie->payments->create([
            "amount" => [
                "value" => number_format($amount / 100, 2, '.', ''),
                "currency" => $currency,
            ],
            "description" => $description,
            "redirectUrl" => $redirectUrl,
            "webhookUrl" => $webhookUrl,
            "metadata" => [
                "order_id" => uniqid("sg_order_"),
            ],
        ]);
        
        return [
            'success' => true,
            'payment_id' => $payment->id,
            'checkout_url' => $payment->getCheckoutUrl(),
        ];
    } catch (Exception $e) {
        error_log("[Mollie Payment Error] " . $e->getMessage());
        return [
            'success' => false,
            'error' => $e->getMessage(),
        ];
    }
}
