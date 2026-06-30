<?php
// ── Webhook Mollie ────────────────────────────────────────────────────────────
// Mollie POST un SEUL parametre : id=tr_xxx. AUCUNE signature (par design). La
// securite = on RE-FETCH le paiement par id avec NOTRE cle (un id qui n'est pas a
// nous renvoie 404), + idempotence (marqueur fichier) pour ne pas fulfiller 2x.
// NE JAMAIS faire confiance au body ni chercher une signature HMAC : Mollie n'en
// envoie pas, et le statut n'est pas transmis -> un POST forge ne debloque rien.
//
// A 'paid' : forward fulfillment (meme shape que stripe-webhook.php) + (abo) creation
// idempotente de la Subscription. Couvre aussi les renouvellements recurrents (chaque
// paiement genere par la subscription rappelle ce webhook). Mirror de stripe-webhook.php.

ini_set('display_errors', '0');
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') { http_response_code(405); echo json_encode(['error' => 'method']); exit; }

$cfg = require __DIR__ . '/mollie-config.php';
require_once __DIR__ . '/mollie-lib.php';

// Mollie envoie application/x-www-form-urlencoded : id=tr_xxx.
$pid = $_POST['id'] ?? '';
$pid = preg_replace('/[^a-zA-Z0-9_]/', '', $pid);
if (!$pid || strpos($pid, 'tr_') !== 0) { http_response_code(200); echo json_encode(['received' => true, 'ignored' => 'no_id']); exit; }

// ── Idempotence : marqueur fichier dans api/data/ (non servi par HTTP) ────────
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) { @mkdir($dataDir, 0755, true); }
$marker = $dataDir . '/mol_' . $pid;
if (file_exists($marker)) { http_response_code(200); echo json_encode(['received' => true, 'duplicate' => true]); exit; }

// ── Re-fetch autoritatif par id (= garde "c'est bien NOTRE paiement") ─────────
list($code, $pay) = mol_api('GET', '/payments/' . rawurlencode($pid));
if ($code === 404) { http_response_code(200); echo json_encode(['received' => true, 'ignored' => 'not_ours']); exit; }
if ($code >= 400 || !is_array($pay)) { http_response_code(200); echo json_encode(['received' => true, 'ignored' => 'fetch_failed']); exit; }

$status = $pay['status'] ?? '';
$meta   = $pay['metadata'] ?? [];
$amount = $pay['amount'] ?? [];
$cents  = isset($amount['value']) ? (int)round(((float)$amount['value']) * 100) : null;
$currency = $amount['currency'] ?? 'EUR';
$island = $meta['island'] ?? 'mq';
$plan   = $meta['plan'] ?? ($meta['pass'] ?? 'unknown');
$source = $meta['source'] ?? 'unknown';
$email  = $meta['email'] ?? ($pay['details']['cardHolder'] ?? '');

// 200 a Mollie AVANT le travail aval (un echec aval ne doit pas provoquer de retry
// infini ; Mollie rappelle de toute facon a chaque changement de statut).
http_response_code(200);
echo json_encode(['received' => true, 'status' => $status]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }

if ($status === 'paid') {
    @file_put_contents($marker, ''); // marque APRES confirmation 'paid' (les statuts open/pending rappellent)
    mol_forward_fulfillment($cfg, $pid, $email, $cents, $currency, $island, $plan, $source);
    // PASS one-time : persiste un record Pass côté serveur (cross-device restore via
    // verify_subscription). Même helper partagé que payment_status → ne diverge pas.
    // Idempotent (cumul max(), ne touche pas un abo) ; le marqueur mol_<pid> ci-dessus
    // empêche déjà un 2e passage webhook.
    if (!empty($meta['pass']) && $email) {
        mol_pass_grant_store($email, $meta['pass']);
        mol_pass_grant_once($cfg, $pid, $email, $meta['pass'], $island); // email d'accès INSTANTANÉ (idempotent par pid)
    }
    // Abo : 1er paiement 'first' paye -> cree la Subscription (idempotent).
    if (($meta['kind'] ?? '') === 'sub_first') {
        $cust = $pay['customerId'] ?? '';
        if ($email && $cust) mol_create_subscription_once($cfg, $cust, $email, ($meta['plan'] ?? 'monthly'), $island, $source);
    }
    // B2B : paiement Pro/Brief confirmé (1er paiement OU renouvellement mensuel —
    // nouveau pid à chaque facture) → émet+livre le token Pro (idempotent par pid).
    if (($meta['b2b'] ?? '') === '1' || in_array(($meta['plan'] ?? ''), ['pro_monthly', 'brief_monthly'], true)) {
        mol_b2b_grant_once($cfg, $pid, $email, ($meta['plan'] ?? ''), $island);
    }
    // Parrainage : crédite le parrain (referred_by). Idempotent par pid — le marqueur
    // mol_<pid> empêche déjà un 2e passage webhook, et mol_refcredit_grant dédup le pid.
    if (!empty($meta['referred_by'])) mol_refcredit_grant($meta['referred_by'], $pid);
} elseif (in_array($status, ['failed', 'canceled', 'expired'], true)) {
    // Echec de paiement (one-time ou facture recurrente) -> trace dunning, meme
    // mapping que stripe-webhook.php (invoice.payment_failed). Pas de marqueur :
    // un retry recurrent ulterieur peut repasser 'paid'.
    mol_forward_fulfillment($cfg, $pid, $email, $cents, $currency, $island, $plan, $source, 'invoice.payment_failed');
}
exit;
