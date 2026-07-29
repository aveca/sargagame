<?php
/**
 * Mollie webhook handler — payments + subscriptions (B2B mensuel + annuel)
 * Config dans mollie-config.php (gitignored) — template mollie-config.example.php
 */

require_once __DIR__ . '/mollie-config.php';
require_once __DIR__ . '/mollie-lib.php';

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');

// Vérification signature webhook Mollie (fail-open si non configuré)
// Mollie envoie X-Mollie-Signature = HMAC-SHA256(body, webhook_secret)
$webhookSecret = defined('MOLLIE_WEBHOOK_SECRET') ? MOLLIE_WEBHOOK_SECRET : '';
if ($webhookSecret && !empty($_SERVER['HTTP_X_MOLLIE_SIGNATURE'])) {
    $expectedSig = hash_hmac('sha256', $raw, $webhookSecret);
    if (!hash_equals($expectedSig, $_SERVER['HTTP_X_MOLLIE_SIGNATURE'])) {
        error_log('[mollie-webhook] INVALID SIGNATURE — possible forgery');
        http_response_code(403);
        echo json_encode(['error' => 'invalid_signature']);
        exit;
    }
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

        if ($status === 'paid') {
            $source = $metadata['source'] ?? 'unknown';
            $pass = $metadata['pass'] ?? '';
            $email = $metadata['email'] ?? '';

            if (in_array($source, ['b2b_annual'], true)) {
                mol_b2b_grant_once($email, 'pro_monthly', $id, 365);
                error_log("[mollie-webhook] payment.paid b2b_annual paymentId=$id");
            } elseif (in_array($source, ['b2b_monthly'], true)) {
                // B2B monthly - grant handled by subscription webhook
                error_log("[mollie-webhook] payment.paid source=$source paymentId=$id");
            } elseif ($pass && in_array($pass, ['p30', 'trip7', 'season'], true)) {
                // B2C pass — grant côté serveur (backup du localStorage frontend)
                mol_b2c_pass_grant($id, $pass, $email, $metadata);
            }
        }
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
                     mol_b2b_grant_once($customerId, $planKey, $subscription->id);
                 }
             }
         }

         if ($event === 'subscription.paid') {
             if ($planKey && in_array($planKey, ['pro_monthly', 'brief_monthly'], true)) {
                 mol_b2b_grant_once($customerId, $planKey, $subscription->id);
                 error_log("[mollie-webhook] subscription.paid renewal grant id=$id plan=$planKey customer=$customerId");
             }
         }

         if ($event === 'subscription.charge_failed') {
             error_log("[mollie-webhook] subscription.charge_failed id=$id plan=$planKey customer=$customerId");
         }

         if ($event === 'payment.failed') {
             mol_b2c_pass_revoke($id);
             error_log("[mollie-webhook] payment.failed pass paymentId=$id");
         }

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