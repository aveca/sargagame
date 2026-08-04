<?php
/**
 * Mollie webhook handler — payments + subscriptions (B2B mensuel + annuel)
 * Config dans mollie-config.php (gitignored) — template mollie-config.example.php
 */

require_once __DIR__ . '/mollie-lib.php';

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');

// Vérification signature webhook Mollie (fail-closed : HTTP 503 si webhook_secret absent)
// Mollie envoie X-Mollie-Signature = HMAC-SHA256(body, webhook_secret)
// BUG-2026-008 (corrigé 2026-08-03) : on utilisait require_once deux fois sur
// mollie-config.php. Le 2e appel retournait `true` (fichier déjà inclus) au lieu
// du tableau retourné par `return [...]`. Conséquence : $cfg = true,
// is_array(true) = false → $webhookSecret = '' → HTTP 503 éternel.
// Fix : un seul require (sans _once) qui récupère la valeur du return.
$cfg = require __DIR__ . '/mollie-config.php';
$webhookSecret = is_array($cfg) ? ($cfg['webhook_secret'] ?? '') : (defined('MOLLIE_WEBHOOK_SECRET') ? MOLLIE_WEBHOOK_SECRET : '');
if (!$webhookSecret) {
    error_log('[mollie-webhook] webhook_secret missing');
    http_response_code(503);
    echo json_encode(['error' => 'webhook_unavailable']);
    exit;
}
$expectedSig = hash_hmac('sha256', $raw, $webhookSecret);
if (!hash_equals($expectedSig, $_SERVER['HTTP_X_MOLLIE_SIGNATURE'] ?? '')) {
    error_log('[mollie-webhook] INVALID SIGNATURE — possible forgery');
    http_response_code(403);
    echo json_encode(['error' => 'invalid_signature']);
    exit;
}

$data = json_decode($raw, true) ?? [];

$id = $data['id'] ?? '';
$type = $data['type'] ?? '';
$event = $data['event'] ?? '';

if (!$id || !$type) {
    http_response_code(400);
    echo json_encode(['error' => 'id + type requis']);
    exit;
}

try {
    $mollie = getMollieClient();

    if ($type === 'payment') {
        $payment = $mollie->payments->get($id);
        $status = $payment->status ?? '';
        $metadata = (array)($payment->metadata ?? []);

        // Handle payment.failed in payment branch (BUG-2026-011)
        if ($event === 'payment.failed' || $status === 'failed') {
            $source = $metadata['source'] ?? 'unknown';
            $pass = $metadata['pass'] ?? '';
            $email = $metadata['email'] ?? '';
            
            if ($pass && in_array($pass, ['p30', 'trip7', 'season'], true)) {
                mol_b2c_pass_revoke($id);
                error_log("[mollie-webhook] payment.failed revoke pass=$pass paymentId=$id");
            }
            http_response_code(200);
            echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status, 'event' => $event]);
            exit;
        }

        if ($status === 'paid') {
            $source = $metadata['source'] ?? 'unknown';
            $pass = $metadata['pass'] ?? '';
            $email = $metadata['email'] ?? '';

            $mirrorOk = true;
            
            if (in_array($source, ['b2b_annual'], true)) {
                $result = mol_b2b_grant_once($email, 'pro_monthly', $id, 365);
                $mirrorOk = $result['mirror_ok'] ?? true;
                error_log("[mollie-webhook] payment.paid b2b_annual paymentId=$id mirror_ok=" . ($mirrorOk ? 'true' : 'false'));
            } elseif (in_array($source, ['b2b_monthly'], true)) {
                // B2B monthly - grant handled by subscription webhook
                error_log("[mollie-webhook] payment.paid source=$source paymentId=$id");
            } elseif ($pass && in_array($pass, ['p30', 'trip7', 'season'], true)) {
                // B2C pass — grant côté serveur (backup du localStorage frontend)
                $result = mol_b2c_pass_grant($id, $pass, $email, $metadata);
                $mirrorOk = $result['mirror_ok'] ?? true;
                error_log("[mollie-webhook] payment.paid pass=$pass paymentId=$id mirror_ok=" . ($mirrorOk ? 'true' : 'false'));
            }
            
            if (!$mirrorOk) {
                http_response_code(500);
                echo json_encode(['error' => 'mirror_failed', 'retry' => true]);
                exit;
            }
            
            http_response_code(200);
            echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status]);
            exit;
        }
        
        // For other payment statuses (pending, canceled, expired, etc.)
        http_response_code(200);
        echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status]);
        exit;
    }

    if ($type === 'subscription') {
        $subscription = $mollie->customer_subscriptions->get($id);
        $status = $subscription->status ?? '';
        $metadata = (array)($subscription->metadata ?? []);
        $planKey = $metadata['plan'] ?? '';
        $customerId = $subscription->customerId ?? '';

        error_log("[mollie-webhook] subscription.$event id=$id status=$status plan=$planKey customer=$customerId");

        // Grant Pro token for B2B monthly subscriptions (active/pending)
         if (in_array($event, ['subscription.created', 'subscription.updated'], true)) {
             if ($planKey && in_array($planKey, ['pro_monthly', 'brief_monthly'], true)) {
                 if (in_array($status, ['active', 'pending'], true)) {
                     $result = mol_b2b_grant_once($customerId, $planKey, $subscription->id);
                     if (!($result['mirror_ok'] ?? true)) {
                         http_response_code(500);
                         echo json_encode(['error' => 'mirror_failed', 'retry' => true]);
                         exit;
                     }
                 }
             }
         }

         if ($event === 'subscription.paid') {
             if ($planKey && in_array($planKey, ['pro_monthly', 'brief_monthly'], true)) {
                 $result = mol_b2b_grant_once($customerId, $planKey, $subscription->id);
                 if (!($result['mirror_ok'] ?? true)) {
                     http_response_code(500);
                     echo json_encode(['error' => 'mirror_failed', 'retry' => true]);
                     exit;
                 }
                 error_log("[mollie-webhook] subscription.paid renewal grant id=$id plan=$planKey customer=$customerId");
             }
         }

         if ($event === 'subscription.charge_failed') {
             error_log("[mollie-webhook] subscription.charge_failed id=$id plan=$planKey customer=$customerId");
         }

         // payment.failed for subscriptions is now handled in payment branch

         // Handle cancellation/expiration — revoke Pro token
         if (in_array($event, ['subscription.canceled', 'subscription.expired'], true)) {
             mol_b2b_revoke($subscription->id);
             error_log("[mollie-webhook] subscription.$event REVOKED id=$id plan=$planKey customer=$customerId");
         }

         http_response_code(200);
         echo json_encode(['received' => true, 'type' => 'subscription', 'status' => $status, 'event' => $event]);
         exit;
    }

    if ($type === 'customer') {
        $customer = $mollie->customers->get($id);
        error_log("[mollie-webhook] customer.$event id=$id");
        http_response_code(200);
        echo json_encode(['received' => true, 'type' => 'customer']);
        exit;
    }

    if ($type === 'mandate') {
        error_log("[mollie-webhook] mandate.$event id=$id");
        http_response_code(200);
        echo json_encode(['received' => true, 'type' => 'mandate']);
        exit;
    }

    http_response_code(200);
    echo json_encode(['received' => true, 'type' => $type, 'note' => 'unhandled_type_logged']);
} catch (Throwable $e) {
    error_log('[mollie-webhook] ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}