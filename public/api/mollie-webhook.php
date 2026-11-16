<?php
/**
 * Mollie webhook handler — payments + subscriptions (B2B mensuel + annuel)
 * Config dans mollie-config.php (gitignored) — template mollie-config.example.php
 */

require_once __DIR__ . '/mollie-lib.php';

// Vérifie qu'un paiement Mollie correspond à un montant/devise autorisés (anti-tampering).
function validateMollieAmountPHP($payment){
  $md = is_array($payment->metadata ?? []) ? (array)($payment->metadata ?? []) : [];
  $pass = $md['pass'] ?? '';
  $currency = strtoupper($payment->amount->currency ?? '');
  $value = (float)($payment->amount->value ?? 0);
  $prices = ['p30'=>['EUR'=>14.99,'USD'=>11.99],'trip7'=>['EUR'=>4.99,'USD'=>null],'season'=>['EUR'=>19.99,'USD'=>null],'sos'=>['EUR'=>1.00,'USD'=>null]];
  if(!isset($prices[$pass])) return ['ok'=>false,'error'=>'unknown_pass'];
  $expected = $prices[$pass][$currency] ?? null;
  if($expected===null){
    if(!($value>0.50 && $value<50)) return ['ok'=>false,'error'=>'amount_out_of_range'];
  } elseif(abs($value-$expected)>=0.02){
    return ['ok'=>false,'error'=>'amount_mismatch'];
  }
  return ['ok'=>true,'pass'=>$pass,'currency'=>$currency,'value'=>$value];
}

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
if (!hash_equals($expectedSig, strtolower(preg_replace('/^sha256=/i', '', $_SERVER['HTTP_X_MOLLIE_SIGNATURE'] ?? '')))) {
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
        $source = $metadata['source'] ?? 'unknown';
        $pass = $metadata['pass'] ?? '';
        $email = $metadata['email'] ?? '';
        $currency = strtoupper((string)($payment->amount->currency ?? ''));
        $value = (float)($payment->amount->value ?? 0);

        // ── B2B one-shot (paiement annuel) ──────────────────────────────────
        // RÈGLE : le MONTANT réellement payé fait foi. La metadata est
        // forgeable par le client : sans ce contrôle, un pass B2C `sos`
        // (1,00 EUR) combiné à source=b2b_annual déclencherait un grant
        // Pro 365 jours.
        if (in_array($source, ['b2b_annual', 'b2b_first'], true)) {
            $planMeta = (isset($metadata['plan']) && is_string($metadata['plan'])) ? $metadata['plan'] : null;
            $planCheck = mol_b2b_validate_plan_amount($planMeta, $currency, $value);
            if (!$planCheck['ok']) {
                // Repli : le lien annuel statique n'envoie aucune metadata.
                $planCheck = mol_b2b_plan_by_amount($currency, $value);
            }
            if (!$planCheck['ok']) {
                error_log("[mollie-webhook] payment.paid B2B REFUSE source=$source amount=$currency $value reason=" . $planCheck['error']);
                http_response_code(400);
                echo json_encode(['error' => $planCheck['error']]);
                exit;
            }
            $planKey = $planCheck['plan'];
            $durationDays = (int)$planCheck['duration_days'];

            // Grant uniquement sur confirmation serveur du paiement.
            if (in_array($status, ['paid', 'settled'], true)) {
                $grant = mol_b2b_grant_once($email, $planKey, $id, $durationDays, $email);
                $mirrorOk = $grant['mirror_ok'] ?? false;
                if (!$mirrorOk) {
                    error_log("[mollie-webhook] payment.paid b2b plan=$planKey paymentId=$id mirror SKIPPED (SUPABASE_SERVICE_KEY absent ou erreur mirror)");
                    webhook_journal_write("$event.$id", [
                        'type' => 'payment',
                        'event' => $event,
                        'id' => $id,
                        'plan_key' => $planKey,
                        'customer_id' => null,
                        'customer_email' => $email,
                        'status' => $status,
                        'action' => 'b2b_grant',
                    ]);
                } else {
                    error_log("[mollie-webhook] payment.paid b2b plan=$planKey paymentId=$id mirror_ok=$mirrorOk");
                }
            }
            http_response_code(200);
            echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status]);
            exit;
        }

        // ── B2C : validation du pass (allowlist anti-tampering) ──────────────
        $amountCheck = validateMollieAmountPHP($payment);
        if(!$amountCheck['ok']){
            http_response_code(400);
            echo json_encode(['error'=>$amountCheck['error']]);
            exit;
        }

        if ($status === 'paid') {
            if (in_array($source, ['b2b_monthly'], true)) {
                // B2B monthly - grant handled by subscription webhook
                error_log("[mollie-webhook] payment.paid source=$source paymentId=$id");
            } elseif ($pass && in_array($pass, ['p30', 'trip7', 'p7', 'season', 'sos'], true)) {
                // B2C pass — grant côté serveur (backup du localStorage frontend)
                // sos (rapport 24h) : durée 1 jour, email vide acceptable.
                $grant = mol_b2c_pass_grant($id, $pass, $email, $metadata);
                $mirrorOk = $grant['mirror_ok'] ?? false;
                if (!$mirrorOk) {
                    error_log("[mollie-webhook] payment.paid pass=$pass paymentId=$id mirror SKIPPED (SUPABASE_SERVICE_KEY absent ou erreur mirror)");
                } else {
                    error_log("[mollie-webhook] payment.paid pass=$pass paymentId=$id mirror_ok=$mirrorOk");
                }
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

        // Récupère l'email du customer Mollie pour le stocker dans le grant
        // (permet verify_subscription par email, type=b2b_pro, cross-device).
        $customerEmail = '';
        try {
            $customer = $mollie->customers->get($customerId);
            $customerEmail = $customer->email ?? '';
        } catch (Throwable $e) {
            error_log("[mollie-webhook] customer fetch failed id=$customerId: " . $e->getMessage());
        }

        // Allowlist serveur des plans B2B (source unique : mol_b2b_plans()).
        $b2bPlans = ['pro_monthly', 'brief_monthly', 'pro_annual', 'brief_annual'];

        // Grant Pro token pour les abonnements B2B.
        //
        // SÉCURITÉ FINANCIÈRE :
        //  - 'pending' n'est PAS une confirmation de paiement. On exige 'active'
        //    (Mollie bascule l'abonnement en active après encaissement) ou un
        //    événement subscription.paid (renouvellement facturé).
        //  - le montant + la devise payés sont validés contre l'allowlist
        //    serveur des plans : la metadata est forgeable, le montant fait foi.
        if (in_array($event, ['subscription.created', 'subscription.updated', 'subscription.activated'], true)) {
            if ($planKey && in_array($planKey, $b2bPlans, true) && $status === 'active') {
                $amt = mol_b2b_subscription_amount($subscription);
                $subCurrency = $amt['currency'];
                $subValue = $amt['value'];
                if ($subCurrency === '' || $subValue <= 0) {
                    error_log("[mollie-webhook] subscription.$event REFUSE id=$id plan=$planKey raison=montant_absent");
                    webhook_journal_write("$event.$id", ['type' => 'subscription', 'event' => $event, 'id' => $id, 'plan_key' => $planKey, 'customer_id' => $customerId, 'customer_email' => $customerEmail, 'status' => $status, 'action' => 'refused_amount_missing']);
                    http_response_code(400);
                    echo json_encode(['error' => 'subscription_amount_missing']);
                    exit;
                }
                $planCheck = mol_b2b_validate_plan_amount($planKey, $subCurrency, $subValue);
                if (!$planCheck['ok']) {
                    error_log("[mollie-webhook] subscription.$event REFUSE id=$id plan=$planKey montant=$subCurrency $subValue raison=" . $planCheck['error']);
                    webhook_journal_write("$event.$id", ['type' => 'subscription', 'event' => $event, 'id' => $id, 'plan_key' => $planKey, 'customer_id' => $customerId, 'customer_email' => $customerEmail, 'status' => $status, 'action' => 'refused_' . $planCheck['error']]);
                    http_response_code(400);
                    echo json_encode(['error' => $planCheck['error']]);
                    exit;
                }
                $durationDays = (int)$planCheck['duration_days'];

                // Idempotence STRICTE ici (created / updated / activated) :
                // pas de prolongation d'accès — seule l'ouverture de la période
                // accorde la fenêtre. La prolongation se fait sur subscription.paid.
                $grant = mol_b2b_grant_once($customerId, $planKey, $subscription->id, $durationDays, $customerEmail);
                $mirrorOk = $grant['mirror_ok'] ?? false;
                if (!$mirrorOk) {
                    error_log("[mollie-webhook] subscription.$event id=$id plan=$planKey customer=$customerId email=$customerEmail mirror SKIPPED (SUPABASE_SERVICE_KEY absent ou erreur mirror)");
                    webhook_journal_write("$event.$id", [
                        'type' => 'subscription',
                        'event' => $event,
                        'id' => $id,
                        'plan_key' => $planKey,
                        'customer_id' => $customerId,
                        'customer_email' => $customerEmail,
                        'status' => $status,
                        'action' => 'b2b_grant',
                    ]);
                } else {
                    error_log("[mollie-webhook] subscription.$event id=$id plan=$planKey customer=$customerId email=$customerEmail mirror_ok=$mirrorOk");
                }
            }
        }

        if ($event === 'subscription.paid') {
            if ($planKey && in_array($planKey, $b2bPlans, true)) {
                // Renouvellement CONFIRME par le serveur Mollie (subscription.paid) :
                // $renewable = true prolonge la fenêtre d'accès (30j mensuel, 365j annuel).
                // Sans ce flag, le transient 'mollie_grant_<subId>' faisait court-circuit
                // (already_granted) et l'hôtel perdait son accès au jour 31 malgré son
                // paiement du mois 2. Idempotent dans la période : deux événements le
                // même jour donnent la même expiration.
                $amt = mol_b2b_subscription_amount($subscription);
                $subCurrency = $amt['currency'];
                $subValue = $amt['value'];
                if ($subCurrency === '' || $subValue <= 0) {
                    error_log("[mollie-webhook] subscription.paid REFUSE id=$id plan=$planKey raison=montant_absent");
                    webhook_journal_write("$event.$id", ['type' => 'subscription', 'event' => $event, 'id' => $id, 'plan_key' => $planKey, 'customer_id' => $customerId, 'customer_email' => $customerEmail, 'status' => $status, 'action' => 'refused_amount_missing']);
                    http_response_code(400);
                    echo json_encode(['error' => 'subscription_amount_missing']);
                    exit;
                }
                $planCheck = mol_b2b_validate_plan_amount($planKey, $subCurrency, $subValue);
                if (!$planCheck['ok']) {
                    error_log("[mollie-webhook] subscription.paid REFUSE id=$id plan=$planKey montant=$subCurrency $subValue raison=" . $planCheck['error']);
                    webhook_journal_write("$event.$id", ['type' => 'subscription', 'event' => $event, 'id' => $id, 'plan_key' => $planKey, 'customer_id' => $customerId, 'customer_email' => $customerEmail, 'status' => $status, 'action' => 'refused_' . $planCheck['error']]);
                    http_response_code(400);
                    echo json_encode(['error' => $planCheck['error']]);
                    exit;
                }
                $durationDays = (int)$planCheck['duration_days'];

                $grant = mol_b2b_grant_once($customerId, $planKey, $subscription->id, $durationDays, $customerEmail, true);
                $mirrorOk = $grant['mirror_ok'] ?? false;
                if (!$mirrorOk) {
                    error_log("[mollie-webhook] subscription.paid id=$id plan=$planKey customer=$customerId email=$customerEmail mirror SKIPPED (SUPABASE_SERVICE_KEY absent ou erreur mirror)");
                    webhook_journal_write("$event.$id", [
                        'type' => 'subscription',
                        'event' => $event,
                        'id' => $id,
                        'plan_key' => $planKey,
                        'customer_id' => $customerId,
                        'customer_email' => $customerEmail,
                        'status' => $status,
                        'action' => 'b2b_renewal',
                    ]);
                } else {
                    error_log("[mollie-webhook] subscription.paid renewal grant id=$id plan=$planKey customer=$customerId email=$customerEmail mirror_ok=$mirrorOk");
                }
            }
        }

         if ($event === 'subscription.charge_failed') {
             error_log("[mollie-webhook] subscription.charge_failed id=$id plan=$planKey customer=$customerId");
         }

         if ($event === 'payment.failed' || $status === 'failed') {
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
