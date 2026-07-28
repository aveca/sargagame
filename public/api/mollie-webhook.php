<?php
/**
 * Mollie webhook handler — payments + subscriptions (B2B mensuel + annuel)
 * Config dans mollie-config.php (gitignored) — template mollie-config.example.php
 */

require_once __DIR__ . '/mollie-config.php';
require_once __DIR__ / 'mollie-lib.php';

header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
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

            if (in_array($source, ['b2b_annual', 'b2b_monthly'], true)) {
                // B2B annual or monthly - grant handled by subscription webhook
                // but we log for audit
                error_log("[mollie-webhook] payment.paid source=$source paymentId=$id");
            } elseif (str_starts_with($source, 'b2c_')) {
                // B2C pass - handled by existing logic if needed
                error_log("[mollie-webhook] B2C payment.paid source=$source paymentId=$id");
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

        // Handle cancellation/expiration
        if (in_array($event, ['subscription.canceled', 'subscription.expired'], true)) {
            // Could revoke token here if needed - for now just log
            error_log("[mollie-webhook] subscription.$event id=$id plan=$planKey customer=$customerId");
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