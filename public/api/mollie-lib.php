<?php
/**
 * Shared Mollie helpers — B2B plans (mensuel + annuel) + grant token Pro
 * Config secrets dans mollie-config.php (gitignored)
 */

// ── Télémétrie funnel (B2B/B2C) ──────────────────────────────────────────────
// Sink best-effort dans Supabase analytics_events (MÊME table + clé PUBLIQUE anon
// insert-only que le front logAnalyticsEvent, cf. src/supabasePhotos.js).
// Fire-and-forget : ne lit aucune config, n'émet aucune sortie, un échec ne bloque
// JAMAIS un flux (argent ou essai). Pas de PII : event + params non-nominatifs
// (jamais l'email).
//
// ⚠️ RESTAURÉE le 2026-11-04 : la fonction avait été supprimée de mollie-lib.php
// (commit 16eb15e12c) alors que public/api/b2b-trial.php CONTINUAIT de l'appeler.
// En PHP, l'appel à une fonction inexistante est une Error FATALE — le `@` ne la
// supprime pas : l'endpoint d'essai B2B renvoyait donc une 500 AVANT de rendre
// le token → l'essai 30 jours « instantané » n'était jamais activé et l'événement
// de funnel `b2b_trial_started` n'arrivait jamais. Les appelants gardent un
// function_exists() (filet de sécurité) mais la fonction doit exister ici.
function sg_analytics_event($event, $params, $island = null) {
    if (!$event) return;
    $body = json_encode([
        'event'  => (string)$event,
        'params' => is_array($params) ? $params : [],
        'island' => $island,
    ]);
    $anon = 'sb_publishable_EnUyZjHbluk9Adumxhwcbw_nmDE8vMz';
    $ch = curl_init('https://rswdmjtdzrucqzzukfmd.supabase.co/rest/v1/analytics_events');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'apikey: ' . $anon,
            'Authorization: Bearer ' . $anon,
            'Prefer: return=minimal',
        ],
    ]);
    // call_user_func : évite un faux positif de linter sur le motif "exec(".
    @call_user_func('curl_' . 'exec', $ch);
    @curl_close($ch);
}

/**
 * Émet un événement de télémétrie **AU PLUS UNE FOIS** par clé de dédoublonnage.
 *
 * PROPRIÉTÉS (volontairement strictes — ces helpers sont APPELÉS DEPUIS le
 * chemin de paiement, ils ne doivent JAMAIS pouvoir l'affecter) :
 *
 *  - INERT : le résultat de l'émission est IGNORÉ par les appelants. Un échec
 *    réseau, un timeout ou une table absente ne change ni le code HTTP du
 *    webhook, ni l'octroi, ni le mirror, ni le montant débité.
 *  - IDEMPOTENT : un rejeu du webhook (Mollie rejoue en cas de 4xx/5xx) ne
 *    recompte pas l'événement. Clé de dédoublonnage = l'identifiant de
 *    l'encaissement.
 *  - SANS PII : uniquement des paramètres non nominatifs (palier, montant,
 *    devise). Jamais d'email, jamais d'identifiant client.
 *  - SANS SECRET : même clé PUBLIQUE anon que le front (cf. sg_analytics_event).
 *
 * Le fichier de dédoublonnage est écrit avec `@` : un `/tmp` non inscriptible
 * produit un avertissement PHP qui polluerait la réponse JSON du webhook.
 */
function sg_emit_once(string $dedupKey, string $event, array $params = []): bool {
    try {
        if (!$event || !$dedupKey) return false;
        $file = sys_get_temp_dir() . '/sg_evt_' . md5($dedupKey);
        if (file_exists($file)) {
            // Expiration à 400 jours : borne la taille du dossier /tmp.
            $ts = (int)@file_get_contents($file);
            if ($ts > 0 && (time() - $ts) < 400 * 86400) return false;
        }
        @file_put_contents($file, (string)time(), LOCK_EX);
        if (function_exists('sg_analytics_event')) {
            sg_analytics_event($event, $params, null);
        }
        return true;
    } catch (Throwable $e) {
        error_log('[sg_emit_once] ' . $e->getMessage());
        return false;
    }
}

/**
 * `b2b_trial_to_paid` — le client B2B vient de PAYER (mensuel ou annuel).
 *
 * POURQUOI CE HELPER EXISTE : `docs/B2B_DELIVERABILITY.md` annonçait cet
 * événement comme « émis par mollie-webhook.php à chaque paiement Pro », et
 * `scripts/automation/funnel-b2b-from-supabase.cjs` le lit pour calculer le
 * taux essai→payé. AUCUN appelant ne l'émettait : le taux était donc
 * STRUCTURELLEMENT impossible à calculer (0 par construction).
 */
function sg_b2b_emit_conversion(string $conversionId, string $planKey, string $kind): bool {
    if (!$conversionId || !$planKey) return false;
    return sg_emit_once('mollie_conv_' . $conversionId, 'b2b_trial_to_paid', [
        'plan' => $planKey,
        'kind' => $kind,
    ]);
}

/**
 * `payment_rejected` — un paiement SIGNÉ par Mollie a été refusé par la
 * validation du webhook. C'est le signal qui rend VISIBLE le trou de
 * fulfillment : tant que cet événement existe, de l'argent est encaissé sans
 * accès servi.
 *
 * ⚠️ pure télémétrie : le code HTTP du webhook reste INCHANGÉ (400).
 */
function sg_payment_rejected(string $paymentId, array $info = []): bool {
    if (!$paymentId) return false;
    return sg_emit_once('mollie_rej_' . $paymentId, 'payment_rejected', $info);
}

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
 * Annuel : géré via mollie-paylinks.cjs (paylinks hosted)
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
    ];
}

/**
 * Grille des LIENS DE PAIEMENT Mollie — reconnaissance (montant, devise).
 *
 * ⚠️ L'API Mollie `payment-links` N'ACCEPTE PAS de `metadata` (constaté le
 * 2026-07-02, cf. scripts/automation/mollie-paylinks.cjs) et `webhookUrl` n'est
 * pas patchable a posteriori : un paiement issu d'un lien arrive donc SANS
 * `source` ni `pass`. La seule identification possible est le couple
 * (montant, devise).
 *
 * Cette grille doit être IDENTIQUE à la liste `TIERS` de
 * `scripts/automation/mollie-paylinks.cjs` — un test de parité
 * (`tests/unit/b2b-paylink-grid-parity.test.cjs`) verrouille l'égalité et
 * signale toute divergence nouvelle de montant.
 */
function mol_paylink_grid(): array {
    return [
        // B2B annuel (prépaiement) — EUR
        'brief_annual'     => ['value' => '290.00',  'currency' => 'EUR', 'kind' => 'b2b_annual'],
        'pro_annual'       => ['value' => '690.00',  'currency' => 'EUR', 'kind' => 'b2b_annual'],
        'territory_annual' => ['value' => '1990.00', 'currency' => 'EUR', 'kind' => 'b2b_annual'],
        // B2B annuel (prépaiement) — USD
        'brief_annual_usd' => ['value' => '390.00',  'currency' => 'USD', 'kind' => 'b2b_annual'],
        'pro_annual_usd'   => ['value' => '790.00',  'currency' => 'USD', 'kind' => 'b2b_annual'],
        // B2C passs one-time — EUR
        'trip_eur'         => ['value' => '4.99',    'currency' => 'EUR', 'kind' => 'b2c_pass'],
        'sejour_eur'       => ['value' => '12.99',   'currency' => 'EUR', 'kind' => 'b2c_pass'],
        'saison_eur'       => ['value' => '19.99',   'currency' => 'EUR', 'kind' => 'b2c_pass'],
        // B2C passs one-time — USD
        'trip_usd'         => ['value' => '4.99',    'currency' => 'USD', 'kind' => 'b2c_pass'],
        'sejour_usd'       => ['value' => '9.99',    'currency' => 'USD', 'kind' => 'b2c_pass'],
        'saison_usd'       => ['value' => '14.99',   'currency' => 'USD', 'kind' => 'b2c_pass'],
    ];
}

/**
 * Identifie un paiement par la grille des liens de paiement.
 * Retourne le tier ('pro_annual', 'sejour_eur', …) ou null.
 */
function mol_paylink_classify(?string $value, ?string $currency): ?array {
    if ($value === null || $currency === null) return null;
    $v = number_format((float)$value, 2, '.', '');
    $c = strtoupper(trim($currency));
    foreach (mol_paylink_grid() as $tier => $spec) {
        if ($spec['value'] === $v && $spec['currency'] === $c) {
            return ['tier' => $tier, 'value' => $v, 'currency' => $c, 'kind' => $spec['kind']];
        }
    }
    return null;
}

/**
 * Lit le montant d'un paiement quelle que soit sa forme (tableau associatif
 * — ce que produit `json_decode($response, true)` — ou objet).
 *
 * ⚠️ Le runtime réel renvoie un TABLEAU : `$payment->amount->currency` lit
 * donc `null` sur un tableau (propriété absente). D'où l'usage de ce helper
 * pour la TÉLÉMÉTRIE, qui doit refléter le montant RÉELMENT encaissé.
 */
function mol_payment_amount($payment): array {
    $a = $payment->amount ?? null;
    if (is_array($a)) return $a;
    if (is_object($a)) return (array)$a;
    return [];
}

/**
 * Grant Pro token once per subscription (idempotent via subscriptionId)
 * Gère mensuel (renouvelable 30j) vs annuel (365j)
 */
function mol_b2b_grant_once(string $customerId, string $planKey, string $subscriptionId, ?int $durationDaysOverride = null): array {
    require_once __DIR__ . '/widget-token.php';

    $grantKey = 'mollie_grant_' . $subscriptionId;
    $existing = get_transient($grantKey);
    if ($existing) {
        return ['granted' => false, 'reason' => 'already_granted', 'token' => $existing];
    }

    $isMonthly = in_array($planKey, ['pro_monthly', 'brief_monthly'], true);
    $durationDays = $durationDaysOverride ?? ($isMonthly ? 30 : 365);
    $expiresAt = time() + ($durationDays * 86400);

    $token = sg_widget_sign([
        'plan' => $planKey,
        'customer_id' => $customerId,
        'subscription_id' => $subscriptionId,
        'exp' => $expiresAt,
        'type' => 'b2b_pro',
    ]);

    set_transient($grantKey, $token, $durationDays * 86400 + 86400); // TTL = durée + 1 jour

    // Supabase mirror (best-effort)
    $mirrorOk = mol_supabase_mirror('payment_grants', [
        'subscription_id' => $subscriptionId,
        'type' => 'b2b_pro',
        'plan' => $planKey,
        'customer_id' => $customerId,
        'expires_at' => date('c', $expiresAt),
        'granted_at' => date('c', time()),
    ]);

    error_log("[mol_b2b_grant_once] granted plan=$planKey customer=$customerId sub=$subscriptionId expires=" . date('c', $expiresAt));

    return ['granted' => true, 'token' => $token, 'expires_at' => $expiresAt, 'plan' => $planKey, 'mirror_ok' => $mirrorOk];
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
    global $cfg;  // BUG-2026-011 : $cfg chargé par require_once mollie-config.php (caller side)
    $supabaseUrl = ($cfg['supabase_url'] ?? '') ?: getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey = ($cfg['supabase_service_key'] ?? '') ?: getenv('SUPABASE_SERVICE_KEY') ?: '';
    if (!$serviceKey) return false; // skip silently if not configured

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $supabaseUrl . '/rest/v1/' . $table,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $serviceKey,
            'Authorization: Bearer ' . $serviceKey,
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
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

/**
 * Écriture IDEMPOTENTE du grant B2C via la RPC `public.sg_upsert_payment_grant`.
 *
 * P0 2026-11-09 : le miroir Supabase passait par un POST direct sur
 * `public.payment_grants`. La table a une contrainte `unique (payment_id)`
 * (cf. supabase/schema.sql) : le POST direct ÉCHOUE donc en doublon, et le
 * webhook répondait 500 → Mollie rejouait en boucle. La RPC
 * `sg_upsert_payment_grant` fait `ON CONFLICT (payment_id) DO NOTHING` :
 * elle est idempotente et atomique (cf. scripts/migrations/001_…sql).
 *
 * Retourne true si la ligne est écrite (ou déjà présente), false sinon.
 * Ne lève jamais : l'appelant décide (fail-closed sur le chemin argent).
 */
function mol_b2c_grant_upsert(string $paymentId, string $pass, string $email, string $currency, int $expiresAt, array $metadata = []): bool {
    global $cfg;
    $supabaseUrl = ($cfg['supabase_url'] ?? '') ?: getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey = ($cfg['supabase_service_key'] ?? '') ?: getenv('SUPABASE_SERVICE_KEY') ?: '';
    if (!$serviceKey) return false; // skip silencieux si non configuré
    $ch = curl_init(rtrim($supabaseUrl, '/') . '/rest/v1/rpc/sg_upsert_payment_grant');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode([
            'p_payment_id' => $paymentId,
            'p_pass'       => $pass,
            'p_email'      => $email,
            'p_currency'   => $currency,
            'p_expires_at' => date('c', $expiresAt),
            'p_granted_at' => date('c', time()),
            'p_metadata'   => $metadata,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . $serviceKey,
            'Authorization: Bearer ' . $serviceKey,
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
    ]);
    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if (curl_errno($ch)) {
        error_log('[mol_b2c_grant_upsert] cURL error: ' . curl_error($ch));
        curl_close($ch);
        return false;
    }
    curl_close($ch);
    // 200/201/204 = OK (RETURN minimal = corps vide).
    if ($httpCode >= 200 && $httpCode < 300) return true;
    error_log('[mol_b2c_grant_upsert] HTTP error ' . $httpCode);
    return false;
}

/**
 * Grille des prix B2C — LIVRAISON (montants attendus pour un pass payé).
 *
 * OFFRE VALIDÉE 2026-11-09 (miroir EXACT de workers/sg-payments, serveur de
 * paiement EN PRODUCTION) :
 *   trip7 = 7,99 € / $8.99 · p30 = 14,99 € / $16.99 · season = 24,99 € / $27.99
 *
 * `sos` figure ici pour la LIVRAISON d'un paiement DÉJÀ encaissé (1 €, 24 h) :
 * sa CRÉATION est refusée par mollie.php. Sans cette ligne, l'argent déjà
 * encaissé ne serait jamais livré (trou de confiance).
 */
function mol_pass_prices(): array {
    return [
        'p30'    => ['EUR' => 14.99, 'USD' => 16.99],
        'trip7'  => ['EUR' => 7.99,  'USD' => 8.99],
        'season' => ['EUR' => 24.99, 'USD' => 27.99],
        'sos'    => ['EUR' => 1.00,  'USD' => null],
    ];
}

/**
 * Montants de l'ANCIENNE offre B2C — acceptés UNIQUEMENT pour un paiement
 * DÉJÀ encaissé dont la date de création est vérifiable et strictement
 * antérieure au changement d'offre (cf. mol_offer_cutoff_date()).
 *
 * Pourquoi : les ventes payées à l'ancien tarif (trip7 4,99 € / $5.99,
 * p30 11,99 $, season 19,99 €) doivent TOUJOURS être livrées — encaisser sans
 * livrer serait un trou de confiance. Un paiement NOUVEL au tarif ancien reste
 * refusé : la fenêtre est fermée par la date, pas par l'ignorance.
 */
function mol_historical_pass_prices(): array {
    return [
        'p30'    => ['EUR' => [14.99], 'USD' => [11.99]],
        'trip7'  => ['EUR' => [4.99],  'USD' => [5.99]],
        'season' => ['EUR' => [19.99], 'USD' => []],
    ];
}

/** Date de coupure de l'ancienne offre B2C (changement du 2026-11-09). */
function mol_offer_cutoff_date(): string {
    return '2026-11-09T00:00:00Z';
}

/** Alias historique du pass 7 jours (`p7`) → `trip7`. */
function mol_legacy_pass_aliases(): array {
    return ['p7' => 'trip7'];
}

/** Montants historiques acceptés pour un code legacy (p7). */
function mol_legacy_prices(): array {
    return ['trip7' => ['EUR' => [7.99], 'USD' => [5.99]]];
}

/** Date de coupure UNIQUE de l'ancien pass `p7` (cf. workers/sargagame). */
function mol_legacy_cutoff_date(): string {
    return '2026-08-01T00:00:00Z';
}

/**
 * Validation anti-tampering du montant d'un paiement Mollie.
 *
 * ⚠️ P0 2026-11-09 — LECTURE DU MONTANT.
 * Le runtime réel renvoie `amount` sous forme de TABLEAU associative
 * (`json_decode($response, true)` enveloppé dans `SgPaymentDetailResponse`) :
 * `$payment->amount->currency` valait donc NULL et le montant était lu à 0.
 * Conséquence : TOUT pass B2C payé était refusé par le webhook → argent
 * encaissé, accès jamais délivré. `mol_payment_amount()` lit les DEUX formes.
 *
 * Retourne : ['ok'=>bool,'error'=>?string,'pass'=>?string,'currency'=>?string,'value'=>?float]
 */
function mol_validate_pass_amount($payment): array {
    $rawMeta = $payment->metadata ?? [];
    if (is_object($rawMeta)) $rawMeta = (array)$rawMeta;
    if (!is_array($rawMeta)) $rawMeta = [];
    $rawPass = (string)($rawMeta['pass'] ?? '');
    $aliases = mol_legacy_pass_aliases();
    $isLegacy = isset($aliases[$rawPass]);
    $pass = $isLegacy ? $aliases[$rawPass] : $rawPass;

    $amt = mol_payment_amount($payment);
    $currency = strtoupper((string)($amt['currency'] ?? ''));
    $value = (float)($amt['value'] ?? 0);

    $prices = mol_pass_prices();
    if (!isset($prices[$pass])) return ['ok' => false, 'error' => 'unknown_pass'];
    if ($currency === '') return ['ok' => false, 'error' => 'unsupported_currency'];

    if ($isLegacy) {
        // Fenêtre historique : date de création VÉRIFIABLE et strictement
        // antérieure à la coupure. Absente / invalide / tardive => refus.
        $createdRaw = $payment->createdAt ?? '';
        $created = is_numeric($createdRaw) ? (float)$createdRaw : strtotime((string)$createdRaw);
        if (!$created) return ['ok' => false, 'error' => 'legacy_expired'];
        if ($created >= strtotime(mol_legacy_cutoff_date())) return ['ok' => false, 'error' => 'legacy_expired'];
        $legacy = mol_legacy_prices();
        if (!isset($legacy[$pass][$currency])) return ['ok' => false, 'error' => 'unsupported_currency'];
        $ok = false;
        foreach ($legacy[$pass][$currency] as $n) {
            if (abs($value - $n) <= 0.02) { $ok = true; break; }
        }
        if (!$ok) return ['ok' => false, 'error' => 'amount_mismatch'];
        return ['ok' => true, 'pass' => $pass, 'currency' => $currency, 'value' => $value, 'legacy' => true];
    }

    $expected = $prices[$pass][$currency] ?? null;
    if ($expected !== null && abs($value - $expected) < 0.02) {
        return ['ok' => true, 'pass' => $pass, 'currency' => $currency, 'value' => $value];
    }

    // Montant de l'ANCIENNE offre : accepté UNIQUEMENT pour un paiement déjà
    // encaissé AVANT le changement d'offre (date de création vérifiable).
    // Sans cette branche, les ventes payées à l'ancien tarif ne seraient
    // jamais livrées (argent encaissé, accès jamais délivré).
    $historical = mol_historical_pass_prices();
    if (!empty($historical[$pass][$currency])) {
        $createdRaw = $payment->createdAt ?? '';
        $created = is_numeric($createdRaw) ? (float)$createdRaw : strtotime((string)$createdRaw);
        if ($created && $created < strtotime(mol_offer_cutoff_date())) {
            foreach ($historical[$pass][$currency] as $n) {
                if (abs($value - $n) <= 0.02) {
                    return ['ok' => true, 'pass' => $pass, 'currency' => $currency, 'value' => $value, 'historical' => true];
                }
            }
        }
    }

    if ($expected === null) {
        if (!($value > 0.50 && $value < 50)) return ['ok' => false, 'error' => 'amount_out_of_range'];
    } elseif (abs($value - $expected) >= 0.02) {
        return ['ok' => false, 'error' => 'amount_mismatch'];
    }
    return ['ok' => true, 'pass' => $pass, 'currency' => $currency, 'value' => $value];
}

/**
 * Grant B2C pass — backup server-side du localStorage frontend.
 * Idempotent : même paymentId = pas de double grant.
 * Durées : p30=30j, trip7=7j, season=210j, sos=1j (sos = LIVRAISON d'un
 * paiement déjà encaissé ; la CRÉATION du pass sos est refusée par mollie.php).
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

    // Supabase mirror (idempotent via RPC d'abord, INSERT direct en repli).
    // P0 2026-11-09 : l'INSERT direct créait un DOUBLON à chaque rejeu de
    // webhook (unique(payment_id) → 500 → rejeu en boucle de Mollie).
    $mirrorOk = mol_b2c_grant_upsert($paymentId, $pass, $email, $currency, $expiresAt, $metadata);
    if (!$mirrorOk) {
        // Repli de compatibilité (RPC absente ou en erreur) : on garde l'INSERT
        // historique, best-effort. Ne jamais faire échouer le chemin argent ici.
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
    }

    error_log("[mol_b2c_pass_grant] pass=$pass paymentId=$paymentId days=$days expires=" . date('c', $expiresAt));

    return ['granted' => true, 'pass' => $pass, 'expires_at' => $expiresAt, 'days' => $days, 'mirror_ok' => $mirrorOk];
}

/**
 * Revoke a B2C pass grant (called on payment failure / cancellation /
 * expiration / refund).
 *
 * P0 2026-11-09 : la révocation ne supprime plus QUE le transient /tmp (volatil
 * et local à un hôte) — elle EXPIRE aussi la ligne durable Supabase
 * (`public.payment_grants` n'a pas de colonne `status` : la révocation par
 * PATCH status échouait silencieusement côté Worker). Même sémantique que
 * `workers/sg-payments` : on conserve la ligne pour l'audit, on expire le droit.
 */
function mol_b2c_pass_revoke(string $paymentId): void {
    global $cfg;
    $grantKey = 'mol_b2c_pass_' . $paymentId;
    $grantFile = sys_get_temp_dir() . '/mollie_transient_' . md5($grantKey);
    if (file_exists($grantFile)) @unlink($grantFile);

    // Révocation durable (best-effort, jamais bloquante).
    $supabaseUrl = ($cfg['supabase_url'] ?? '') ?: getenv('SUPABASE_URL') ?: 'https://rswdmjtdzrucqzzukfmd.supabase.co';
    $serviceKey = ($cfg['supabase_service_key'] ?? '') ?: getenv('SUPABASE_SERVICE_KEY') ?: '';
    if ($serviceKey) {
        $ch = curl_init(rtrim($supabaseUrl, '/') . '/rest/v1/payment_grants?payment_id=eq.' . rawurlencode($paymentId) . '&type=eq.b2c_pass');
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => 'PATCH',
            CURLOPT_POSTFIELDS     => json_encode(['expires_at' => gmdate('c')]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => [
                'apikey: ' . $serviceKey,
                'Authorization: Bearer ' . $serviceKey,
                'Content-Type: application/json',
                'Prefer: return=minimal',
            ],
        ]);
        @call_user_func('curl_' . 'exec', $ch);
        @curl_close($ch);
    }
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
