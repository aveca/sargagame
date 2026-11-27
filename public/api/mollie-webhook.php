<?php
/**
 * Mollie webhook handler — payments + subscriptions (B2B mensuel + annuel)
 * Config dans mollie-config.php (gitignored) — template mollie-config.example.php
 *
 * ══ CONTRAT P0 2026-11-09 (retrait du parcours SOS + webhook LIVE fiable) ══
 *
 * 1. DEUX FORMATS DE WEBHOOK MOLLIE SONT ACCEPTÉS, SIGNATURE VÉRIFIÉE DANS LES
 *    DEUX CAS (fail-closed : 503 si le secret manque, 403 si la signature ne
 *    correspond pas) :
 *      • CLASSIQUE — corps `application/x-www-form-urlencoded` : `id=tr_…`
 *        (+ `event=paid|failed|…` quand Mollie l'envoie).
 *      • NEXT-GEN  — corps JSON : { "eventId":"event_…", "type":"payment.paid",
 *        "entityId":"tr_…" }. L'identifiant d'ÉVÉNEMENT sert à l'idempotence,
 *        l'identifiant d'ENTITÉ sert à récupérer l'état réel.
 *    AVANT : ce handler n'acceptait que le JSON classique (`id` + `type`). Un
 *    webhook Next-gen officiel tombait en 400 « id + type requis » et un
 *    webhook classique form-urlencoded en 400 également → l'argent était
 *    encaissé et l'accès JAMAIS délivré.
 *    Le statut présent dans le corps du webhook n'est JAMAIS lu : l'état réel
 *    provient toujours de l'API Mollie.
 *
 * 2. PAS `sos` (1 €, rapport 24 h) : sa CRÉATION est refusée (mollie.php).
 *    Sa LIVRAISON reste possible pour les paiements DÉJÀ encaissés — encaisser
 *    sans livrer serait un trou de confiance.
 *
 * 3. IDEMPOTENCE : l'écriture du grant passe par la RPC idempotente
 *    `public.sg_upsert_payment_grant(...)` (ON CONFLICT (payment_id) DO NOTHING)
 *    + un marqueur posé APRÈS l'écriture (jamais avant).
 *
 * 4. ÉTATS TERMINAUX NÉGATIFS (canceled / expired / failed / refunded) : le
 *    grant B2C est RÉVOQUÉ (transient + expiration de la ligne durable).
 */

require_once __DIR__ . '/mollie-lib.php';

// Vérifie qu'un paiement Mollie correspond à un montant/devise autorisés (anti-tampering).
// `sos` reste accepté ICI (et uniquement ici) : c'est un pass déjà encaissé,
// pas une création. Toute création `sos` est refusée par mollie.php.
//
// ⚠️ CORRECTIF P0 2026-11-09 — LECTURE DU MONTANT.
// Le runtime réel renvoie `amount` sous forme de TABLEAU associative
// (`json_decode($response, true)` enveloppé dans `SgPaymentDetailResponse`) :
// `$payment->amount->currency` valait donc NULL, le montant était lu à 0 et
// TOUT pass B2C payé était refusé (`amount_mismatch` / `amount_out_of_range`)
// → argent encaissé, accès JAMAIS délivré. `mol_payment_amount()` (déjà
// présent dans mollie-lib.php) lit les deux formes (tableau OU objet).
function validateMollieAmountPHP($payment){
  return mol_validate_pass_amount($payment);
}

/**
 * Parse le corps d'un webhook Mollie — CLASSIQUE ou NEXT-GEN.
 *
 * Formats (cf. docs Mollie) :
 *  • CLASSIQUE : `application/x-www-form-urlencoded`, corps `id=tr_…`
 *    (l'API Mollie n'envoie QUE l'identifiant : l'état se relit auprès d'elle).
 *  • NEXT-GEN  : JSON `{ "resource":"event", "id":"event_…", "type":"payment.paid",
 *    "entityId":"tr_…", "_embedded":{…} }`. L'identifiant d'ÉVÉNEMENT (`id`)
 *    n'est JAMAIS l'identifiant d'ENTITÉ (`entityId`) : les confondre fait
 *    échouer la lecture de l'état (404 sur `event_…`).
 *
 * Ne fait AUCUNE confiance au statut annoncé : il ne sert qu'à router.
 */
function parseMollieWebhookPHP(string $raw, string $contentType): array {
  $isForm = stripos($contentType, 'application/x-www-form-urlencoded') !== false;
  $entityId = ''; $event = ''; $eventId = ''; $resource = '';
  if ($isForm) {
    $form = [];
    parse_str($raw, $form);
    $entityId = trim((string)($form['id'] ?? ''));
    $event = trim((string)($form['event'] ?? ''));
    if ($entityId !== '') $resource = strpos($entityId, 'sub_') === 0 ? 'subscription' : 'payment';
  } else {
    $data = json_decode($raw, true);
    if (!is_array($data)) return ['malformed' => true];
    $rawId = trim((string)($data['id'] ?? ''));
    $eventId = trim((string)($data['eventId'] ?? ''));
    if ($eventId === '' && strpos($rawId, 'event_') === 0) $eventId = $rawId;
    $entityId = trim((string)($data['entityId'] ?? ''));
    $type = trim((string)($data['type'] ?? ''));
    $event = trim((string)($data['event'] ?? ''));
    if ($event === '' && $type !== '') {
      // Next-gen : type = "payment.paid" / "payment-link.paid" / …
      $event = $type;
      $dot = strpos($type, '.');
      $resource = $dot !== false ? substr($type, 0, $dot) : '';
    }
    // JSON classique : `id` est alors l'identifiant d'ENTITÉ (tr_… / sub_…).
    if ($entityId === '' && preg_match('/^(tr|sub)_[A-Za-z0-9]+$/', $rawId)) $entityId = $rawId;
    if ($event === '' && $entityId !== '' && isset($data['status'])) {
      $event = trim((string)$data['status']);
    }
    if ($resource === '' && $entityId !== '') {
      $resource = strpos($entityId, 'sub_') === 0 ? 'subscription' : 'payment';
    }
  }
  if ($entityId === '' || $resource === '') return ['malformed' => true];
  return ['malformed' => false, 'resource' => $resource, 'entityId' => $entityId, 'event' => $event, 'eventId' => $eventId];
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

$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
$parsed = parseMollieWebhookPHP($raw, $contentType);
if ($parsed['malformed']) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_payload']);
    exit;
}

$id = $parsed['entityId'];
$resource = $parsed['resource'];
$event = $parsed['event'];
$eventId = $parsed['eventId'];

// Idempotence : l'écriture du grant est elle-même idempotente (RPC ON CONFLICT).
// Le marqueur évite un second aller-retour API ; il est posé APRÈS l'écriture.
$markerSource = $eventId !== '' ? $eventId : $id;
$markerKey = 'mollie_hook_' . md5($markerSource);

try {
    $mollie = getMollieClient();

    if ($resource === 'payment') {
        $payment = $mollie->payments->get($id);
        $status = $payment->status ?? '';
        $metadata = (array)($payment->metadata ?? []);

        // ── États terminaux négatifs : on RETIRE l'accès ────────────────────
        // (avant toute délivrance). `settled` = payé + viré : traité comme payé.
        if (in_array($status, ['canceled', 'expired', 'failed'], true)) {
            mol_b2c_pass_revoke($id);
            error_log("[mollie-webhook] payment.$status REVOKED paymentId=$id");
            http_response_code(200);
            echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status, 'event' => $event, 'granted' => false, 'revoked' => true]);
            exit;
        }
        if ($event === 'payment.refunded' || $event === 'refunded') {
            mol_b2c_pass_revoke($id);
            error_log("[mollie-webhook] payment.refunded REVOKED paymentId=$id");
            http_response_code(200);
            echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status, 'event' => $event, 'granted' => false, 'revoked' => true]);
            exit;
        }

        // Seul un paiement RÉELLEMENT payé (état relu auprès de Mollie) délivre.
        if (!in_array($status, ['paid', 'settled'], true)) {
            http_response_code(200);
            echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status, 'event' => $event, 'granted' => false]);
            exit;
        }

        // Vérification indépendante du montant et de la devise (anti-tampering).
        // ── P0 money path 2026-11-10 : la classe de livraison n'est plus
        // déduite de `source` (champ choisi par le client). Elle vient :
        //   • du MONTANT pour un paiement issu d'un LIEN DE PAIEMENT Mollie
        //     (donc sans metadata) : seul un montant de la grille annuelle
        //     APPROUVÉE (290/690/1990 EUR - 390/790 USD) ouvre 365 jours ;
        //   • de `offer_kind`, écrit par le SERVEUR à la création.
        // Un paiement porteur d'un pass B2C ne peut JAMAIS être requalifié
        // en B2B annuel : c'est exactement le forged-metadata qui offrait
        // 365 jours d'acces Pro pour un pass B2C a 14,99 €.
        $offerKind = (string)($metadata['offer_kind'] ?? '');
        $source = $metadata['source'] ?? 'unknown';
        $pass = $metadata['pass'] ?? '';
        $email = $metadata['email'] ?? '';
        $sgAmt = mol_payment_amount($payment);
        $annualTier = mol_paylink_classify($sgAmt['value'] ?? null, $sgAmt['currency'] ?? null);
        $isApprovedAnnual = is_array($annualTier) && (($annualTier['kind'] ?? '') === 'b2b_annual');
        // Attribution HISTORIQUE du canal annuel (paiements crees avant le
        // correctif). Ce signal NE VAUT PAS autorisation : il ne sert qu'a la
        // trace. L'octroi de 365 jours exige le montant APPROUVE ET l'absence
        // de pass B2C.
        $legacyAnnualSource = in_array($source, ['b2b_annual'], true);
        // Un paiement SANS pass et dont le montant est une offre B2B annuelle
        // approuvée : c'est un paiement de lien de paiement (pas de metadata).
        // Le controle du montant base sur le pass ne s'y applique pas.
        $skipPassAmountCheck = ($isApprovedAnnual && !$pass);
        $amountCheck = validateMollieAmountPHP($payment);
        if(!$skipPassAmountCheck && !$amountCheck['ok']){
            // TÉLÉMÉTRIE (2026-11-04) : le refus est rendu VISIBLE.
            // ⚠️ Le code HTTP reste 400 et AUCUN accès n'est accordé : ce bloc
            // n'écrit que dans `analytics_events` (table de mesure, sans secret).
            // Objectif : que l'argent encaissé sans service SERVÍ ne soit plus
            // un trou muet, mais un signal mesuré et daté.
            $sgAmt = mol_payment_amount($payment);
            $sgTier = mol_paylink_classify($sgAmt['value'] ?? null, $sgAmt['currency'] ?? null);
            sg_payment_rejected($id, [
                'error'    => $amountCheck['error'],
                'value'    => $sgAmt['value'] ?? null,
                'currency' => $sgAmt['currency'] ?? null,
                'tier'     => $sgTier['tier'] ?? null,
                'kind'     => $sgTier['kind'] ?? null,
                'has_meta' => $metadata ? 1 : 0,
            ]);
            http_response_code(400);
            echo json_encode(['error'=>$amountCheck['error']]);
            exit;
        }

        // ── P0 money path 2026-11-10 : l'octroi B2B annuel est recognise
        // par le MONTANT APPROUVE (paiement de lien de paiement, sans
        // metadata) ou par offer_kind ecrit par le SERVEUR a la creation.
        // source reste une attribution de canal : il ne selectionne plus
        // l'octroi de 365 jours. ($offerKind, $source, $pass, $email,
        // $sgAmt, $annualTier et $isApprovedAnnual sont determines
        // AVANT le controle du montant.)

        if ($isApprovedAnnual && !$pass) {
            $grant = mol_b2b_grant_once($email, 'pro_monthly', $id, 365);
            // TÉLÉMÉTRIE (2026-11-04) : conversion B2B annuelle.
            // Déduplonnée par identifiant de paiement → un encaissement
            // n'est compté qu'une fois, même si Mollie rejoue le webhook.
            sg_b2b_emit_conversion($id, 'pro_annual', 'annual');
            $mirrorOk = $grant['mirror_ok'] ?? false;
            if (!$mirrorOk) {
                http_response_code(500);
                echo json_encode(['error' => 'mirror_failed', 'retry' => true]);
                exit;
            }
            error_log("[mollie-webhook] payment.paid b2b_annual paymentId=$id tier=" . ($annualTier['tier'] ?? '?') . " legacy_source=" . ($legacyAnnualSource ? '1' : '0'));
        } elseif ($offerKind === 'b2b_monthly') {
            // B2B monthly - grant handled by subscription webhook
            error_log("[mollie-webhook] payment.paid offer_kind=b2b_monthly paymentId=$id");
        } elseif ($pass && in_array($pass, ['p30', 'trip7', 'p7', 'season', 'sos'], true)) {
            // B2C pass — grant côté serveur (backup du localStorage frontend)
            // sos (rapport 24h) : LIVRAISON d'un paiement déjà encaissé uniquement
            // (la création `sos` est refusée par mollie.php). Email vide toléré.
            $grant = mol_b2c_pass_grant($id, $pass, $email, $metadata);
            $mirrorOk = $grant['mirror_ok'] ?? false;
            if (!$mirrorOk) {
                http_response_code(500);
                echo json_encode(['error' => 'mirror_failed', 'retry' => true]);
                exit;
            }
            error_log("[mollie-webhook] payment.paid pass=$pass paymentId=$id mirror_ok=$mirrorOk");
        } else {
            // Paiement payé sans pass connu : rien n'est délivré, et le refus est
            // tracé (pas de trou muet). 400 → Mollie rejoue (le cas se rare).
            sg_payment_rejected($id, ['error' => 'no_eligible_pass', 'has_meta' => $metadata ? 1 : 0]);
            http_response_code(400);
            echo json_encode(['error' => 'no_eligible_pass']);
            exit;
        }
        set_transient($markerKey, '1', 86400);
        http_response_code(200);
        echo json_encode(['received' => true, 'type' => 'payment', 'status' => $status, 'event' => $event]);
        exit;
    }

    if ($resource === 'subscription') {
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
                     $grant = mol_b2b_grant_once($customerId, $planKey, $subscription->id);
                     $mirrorOk = $grant['mirror_ok'] ?? false;
                     if (!$mirrorOk) {
                         http_response_code(500);
                         echo json_encode(['error' => 'mirror_failed', 'retry' => true]);
                         exit;
                     }
                 }
             }
         }

         if ($event === 'subscription.paid') {
             if ($planKey && in_array($planKey, ['pro_monthly', 'brief_monthly'], true)) {
                 $grant = mol_b2b_grant_once($customerId, $planKey, $subscription->id);
                 // TÉLÉMÉTRIE (2026-11-04) : conversion B2B mensuelle.
                 // Dédupliquée par identifiant d'ABONNEMENT → le taux
                 // essai→payé compte une conversion par client, pas par
                 // renouvellement.
                 sg_b2b_emit_conversion($subscription->id, $planKey, 'monthly');
                 $mirrorOk = $grant['mirror_ok'] ?? false;
                 if (!$mirrorOk) {
                     http_response_code(500);
                     echo json_encode(['error' => 'mirror_failed', 'retry' => true]);
                     exit;
                 }
                 error_log("[mollie-webhook] subscription.paid renewal grant id=$id plan=$planKey customer=$customerId mirror_ok=$mirrorOk");
             }
         }

         if ($event === 'subscription.charge_failed') {
             error_log("[mollie-webhook] subscription.charge_failed id=$id plan=$planKey customer=$customerId");
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

    if ($resource === 'customer') {
        $customer = $mollie->customers->get($id);
        error_log("[mollie-webhook] customer.$event id=$id");
        http_response_code(200);
        echo json_encode(['received' => true, 'type' => 'customer']);
        exit;
    }

    if ($resource === 'mandate') {
        error_log("[mollie-webhook] mandate.$event id=$id");
        http_response_code(200);
        echo json_encode(['received' => true, 'type' => 'mandate']);
        exit;
    }

    http_response_code(200);
    echo json_encode(['received' => true, 'type' => $resource, 'note' => 'unhandled_type_logged']);
} catch (Throwable $e) {
    error_log('[mollie-webhook] ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
