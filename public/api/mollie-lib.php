<?php
// ── Mollie shared helpers ─────────────────────────────────────────────────────
// Requis par mollie.php (proxy) ET mollie-webhook.php (confirmation serveur) pour
// qu'ils NE DIVERGENT PAS sur le flux d'argent (creation subscription, fulfillment).
// Aucun effet de bord : ces fonctions ne lisent pas la config ni n'emettent de
// sortie ; le caller definit $cfg (global) et appelle.

// Appel API Mollie. Bearer api_key (le prefixe test_/live_ = le mode, pas d'env).
function mol_api($method, $path, $body = null) {
    global $cfg;
    $ch = curl_init('https://api.mollie.com/v2' . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . ($cfg['api_key'] ?? ''), 'Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 15,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode($resp, true)];
}

// EUR : MQ/GP (+ vide = défaut MQ). USD : florida/puntacana/rivieramaya — Mollie encaisse
// l'USD (FX ~2.5-3%), comme le B2C USD déjà live depuis le 26/06. Toute autre région = non
// supportée. Sert de garde-fou de COHÉRENCE devise↔région sur create_subscription (B2B) :
// une région USD ne peut souscrire qu'à un plan USD, une région EUR qu'à un plan EUR.
function mol_region_currency($island) {
    $i = strtolower((string)$island);
    if (in_array($i, ['mq', 'gp', ''], true)) return 'EUR';
    if (in_array($i, ['florida', 'puntacana', 'rivieramaya'], true)) return 'USD';
    return null; // région inconnue → rejet
}
// Conservé pour rétro-compat (anciens appels). EUR-region = true.
function mol_is_eur_region($island) {
    return mol_region_currency($island) === 'EUR';
}

// Forward fulfillment -> Apps Script, MEME shape que stripe-webhook.php (la Sheet
// 'payments' dedoublonne par id). $type permet annulation/echec (cycle de vie).
function mol_forward_fulfillment($cfg, $id, $email, $cents, $currency, $island, $plan, $source, $type = 'checkout.session.completed') {
    $url = $cfg['appsscript_url'] ?? 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
    $payload = json_encode([
        'type'           => $type,
        'verified'       => true,
        'webhook_source' => 'mollie',
        'data' => ['object' => array_filter([
            'id'                  => $id,
            'payment_status'      => 'paid',
            'amount_total'        => $cents,
            'currency'            => strtolower($currency),
            'customer_email'      => $email,
            'client_reference_id' => substr(($island !== '' ? $island : 'mq') . '_' . $plan . '_' . $source, 0, 200),
            'metadata'            => ['island' => ($island !== '' ? $island : 'mq')],
        ], function ($v) { return $v !== null && $v !== ''; })],
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_TIMEOUT => 8]);
    @curl_exec($ch);
    curl_close($ch);
}

// Mapping email->{customer,sub} pour verify/cancel + idempotence subscription.
function mol_store_dir() {
    $d = __DIR__ . '/data/mollie-subs';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}
function mol_store_path($email) { return mol_store_dir() . '/' . sha1(strtolower(trim($email))) . '.json'; }
function mol_store_read($email) {
    $f = mol_store_path($email);
    return is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
}
function mol_store_write($email, $data) { @file_put_contents(mol_store_path($email), json_encode($data)); }

// ── PASS one-time : durée (jours) par passKey + persistance serveur cross-device ─
// Le Pass B2C (paiement unique) ne vivait QU'EN localStorage → un acheteur qui change
// d'appareil perdait son accès. On enregistre désormais un record Pass côté serveur
// (mol_store) pour que verify_subscription puisse restaurer l'accès par email.
//
// MAP passKey -> jours : MIROIR EXACT du front (PassOffer.jsx + PremiumModal.jsx).
//   p7/trip7/trip = 7 j · p30 = 30 j · saison/season = 210 j · pNN = NN j (cap 120 j,
//   même règle que ?pass=pNN dans Sargasses_PROD.jsx). passKey inconnu → 7 j (défaut
//   front `_pc.days||7`). passKey déjà sanitisé [a-z0-9] côté create_payment.
function mol_pass_days($passKey) {
    $k = strtolower(preg_replace('/[^a-z0-9]/', '', (string)$passKey));
    $map = [
        'p7'    => 7,
        'trip7' => 7,
        'trip'  => 7,
        'p30'   => 30,
        'saison' => 210,
        'season' => 210,
    ];
    if (isset($map[$k])) return $map[$k];
    if (preg_match('/^p(\d{1,3})$/', $k, $m)) { // pNN générique (miroir du front)
        return max(1, min(120, (int)$m[1]));
    }
    return 7; // défaut = 7 j (miroir `_pc.days||7`)
}

// Enregistre/cumule un record PASS pour cet email (cross-device restore). IDEMPOTENT
// et ADDITIF : NE TOUCHE JAMAIS un record d'abonnement (présence d'un 'customer' →
// on n'écrase pas un abonné). Si un record Pass existe déjà, on garde max(existant,
// nouveau) sur pass_end (pass cumulables / referral / re-achat) — rejouable par
// payment_status ET le webhook sans doubler la durée. Verrou fichier (race
// payment_status vs webhook). $passEndOverride : si fourni (>0), borne pass_end à
// cette valeur (utilisé par le self-heal qui calcule depuis paidAt) ; sinon
// pass_end = maintenant + durée(passKey).
function mol_pass_grant_store($email, $passKey, $passEndOverride = 0) {
    $email = strtolower(trim((string)$email));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) return 0;
    $newEnd = ($passEndOverride > 0) ? (int)$passEndOverride : (time() + mol_pass_days($passKey) * 86400);
    $f = mol_store_path($email);
    $lock = fopen($f . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $rec = is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
    // Abonnement présent (customer) → on ne touche RIEN (additif, on ne dégrade pas un abo).
    if (is_array($rec) && !empty($rec['customer'])) {
        if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        return (int)($rec['pass_end'] ?? 0);
    }
    $prevEnd = (is_array($rec) && ($rec['kind'] ?? '') === 'pass') ? (int)($rec['pass_end'] ?? 0) : 0;
    $passEnd = max($prevEnd, $newEnd); // cumul : on ne raccourcit jamais un pass existant
    $out = [
        'email'    => $email,
        'kind'     => 'pass',
        'pass'     => preg_replace('/[^a-z0-9]/', '', strtolower((string)$passKey)),
        'plan'     => preg_replace('/[^a-z0-9]/', '', strtolower((string)$passKey)),
        'pass_end' => $passEnd,
        'ts'       => time(),
    ];
    @file_put_contents($f, json_encode($out));
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return $passEnd;
}

// ── Parrainage : LEDGER DE CRÉDIT par code parrain (REF-XXXXXX) ────────────────
// Mollie ne peut NI couponner NI créditer au checkout (cf. mollie.php). La récompense
// parrain est donc un CRÉDIT de jours de pass, stocké côté serveur par code, que l'app
// du parrain RÉCLAME au chargement (claim_referral_credit) et applique en étendant son
// sg_premium_pass_end local. Fichier par code (sha1), non servi par HTTP (sous /data).
// Schéma : { code, days, total_earned, payments:[pid…], ts }.
//   days         = jours NON ENCORE réclamés (remis à 0 au claim) ;
//   payments     = idempotence : un pid déjà crédité n'est jamais recompté ;
//   total_earned = plafond à vie (anti-abus).
define('SG_REF_BONUS_DAYS', 7);   // jours offerts au parrain par filleul-payant
define('SG_REF_CAP_DAYS', 90);    // plafond de crédit à vie par code

function mol_refcredit_dir() {
    $d = __DIR__ . '/data/mollie-refcredits';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}
function mol_refcredit_valid($code) { return is_string($code) && preg_match('/^REF-[A-Z0-9]{6}$/', $code); }
function mol_refcredit_path($code) { return mol_refcredit_dir() . '/' . sha1($code) . '.json'; }
function mol_refcredit_read($code) {
    if (!mol_refcredit_valid($code)) return null;
    $f = mol_refcredit_path($code);
    return is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
}

// Crédite un code parrain pour un paiement-filleul donné. IDEMPOTENT par pid (un
// re-traitement payment_status/webhook ne double-crédite jamais). Plafonné à vie.
// Retourne les jours effectivement ajoutés (0 si déjà crédité, plafond atteint, ou
// code invalide). Verrou fichier pour éviter une race payment_status vs webhook.
function mol_refcredit_grant($code, $pid, $bonus = SG_REF_BONUS_DAYS, $cap = SG_REF_CAP_DAYS) {
    if (!mol_refcredit_valid($code) || !is_string($pid) || $pid === '') return 0;
    $f = mol_refcredit_path($code);
    $lock = fopen($f . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $rec = is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
    if (!$rec) $rec = ['code' => $code, 'days' => 0, 'total_earned' => 0, 'payments' => [], 'ts' => time()];
    $added = 0;
    if (!in_array($pid, $rec['payments'], true)) {
        $room = max(0, $cap - (int)$rec['total_earned']);
        $added = min($bonus, $room);
        $rec['payments'][] = $pid;          // marque le pid traité même si plafond (anti-recompte)
        if ($added > 0) { $rec['days'] = (int)$rec['days'] + $added; $rec['total_earned'] = (int)$rec['total_earned'] + $added; }
        $rec['ts'] = time();
        @file_put_contents($f, json_encode($rec));
    }
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return $added;
}

// Réclame (et remet à 0) les jours non réclamés d'un code. Retourne les jours rendus.
function mol_refcredit_claim($code) {
    if (!mol_refcredit_valid($code)) return 0;
    $f = mol_refcredit_path($code);
    $lock = fopen($f . '.lock', 'c');
    if ($lock) flock($lock, LOCK_EX);
    $rec = is_file($f) ? (json_decode(@file_get_contents($f), true) ?: null) : null;
    $days = $rec ? (int)$rec['days'] : 0;
    if ($rec && $days > 0) { $rec['days'] = 0; $rec['ts'] = time(); @file_put_contents($f, json_encode($rec)); }
    if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
    return $days;
}

// Cree la Subscription UNE seule fois (idempotent). startDate = +1 intervalle :
// le 1er paiement 'first' a deja facture la periode 1, la subscription prend la suite.
function mol_create_subscription_once($cfg, $customerId, $email, $planIn, $island, $source) {
    $existing = mol_store_read($email);
    if ($existing && !empty($existing['sub'])) return $existing['sub']; // deja cree
    // Plans B2C (config) + plans B2B (pro_monthly/brief_monthly) via mol_b2b_plans()
    // — source unique, pour que CE chemin (webhook 3DS) résolve aussi les abos B2B.
    $sc = $cfg['subscription'][$planIn] ?? (mol_b2b_plans()[$planIn] ?? null);
    if (!$sc) return null;
    $interval = $sc['interval'];                       // '1 month' | '12 months'
    $startDate = date('Y-m-d', strtotime('+' . $interval));
    list($code, $sub) = mol_api('POST', '/customers/' . rawurlencode($customerId) . '/subscriptions', [
        'amount'      => ['currency' => $sc['currency'], 'value' => $sc['amount']],
        'interval'    => $interval,
        'startDate'   => $startDate,
        'description' => 'Sargasses ' . $planIn,
        'webhookUrl'  => 'https://sargasses-martinique.com/api/mollie-webhook.php',
        'metadata'    => ['island' => ($island !== '' ? $island : 'mq'), 'plan' => $planIn, 'source' => $source],
    ]);
    if ($code >= 400 || empty($sub['id'])) return null;
    mol_store_write($email, ['email' => $email, 'customer' => $customerId, 'sub' => $sub['id'], 'plan' => $planIn, 'ts' => time()]);
    return $sub['id'];
}

// ── B2B : plans mensuels récurrents (montants NON secrets, en repo) ───────────
// Source UNIQUE chargée par mollie.php ET mollie-webhook.php (tous deux require ce
// lib). 'kind'=>'b2b' = discriminant SERVEUR (non forgeable par le client) → grant
// d'un token Pro à la confirmation. Décision pricing 2026-06-29 : Pro 79 €/mois,
// Brief 29 €/mois (EUR). N'altère AUCUNE clé B2C ('monthly'/'annual' de la config).
function mol_b2b_plans() {
    return [
        // EUR (MQ/GP) — décision 2026-06-29.
        'pro_monthly'       => ['amount' => '79.00',  'currency' => 'EUR', 'interval' => '1 month', 'kind' => 'b2b'],
        'brief_monthly'     => ['amount' => '29.00',  'currency' => 'EUR', 'interval' => '1 month', 'kind' => 'b2b'],
        // USD (florida/puntacana/rivieramaya) — grille de réf. Pro $89 / Brief $39. Mollie
        // encaisse l'USD (comme le B2C USD). Le garde devise↔région (mol_region_currency)
        // garantit qu'une région USD ne reçoit QUE ces plans, jamais les EUR.
        'pro_monthly_usd'   => ['amount' => '89.00',  'currency' => 'USD', 'interval' => '1 month', 'kind' => 'b2b'],
        'brief_monthly_usd' => ['amount' => '39.00',  'currency' => 'USD', 'interval' => '1 month', 'kind' => 'b2b'],
    ];
}

// ── B2B : grant + livraison du token Pro à la confirmation de paiement ────────
// Idempotent par pid (marqueur fichier, même esprit que le marqueur webhook).
// Émet un token Pro signé (sg_widget_sign — MÊME mécanisme que b2b-trial.php) et le
// livre par email via mol_send_mail (MTA cPanel ; Resend retiré). Livraison
// best-effort : un échec d'envoi ne DOIT jamais faire
// échouer la confirmation de paiement. Appelé par mollie.php (inline) ET le webhook
// (3DS/renouvellements) — un nouveau pid à chaque facture mensuelle payée → le token
// est ré-émis 400 j (roll-forward tant que l'abo est payé).
function mol_b2b_grant_once($cfg, $pid, $email, $plan) {
    if (!is_string($pid) || $pid === '' || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) return false;
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $marker = $dir . '/b2bgrant_' . preg_replace('/[^a-zA-Z0-9_]/', '', $pid);
    if (file_exists($marker)) return false;          // déjà accordé pour ce paiement
    @file_put_contents($marker, date('c'));          // idempotence (posée avant l'email)

    require_once __DIR__ . '/widget-token.php';
    $k = sg_widget_sign($email, 400);                // token Pro 400 j (ré-émis chaque mois payé)

    // Email de bienvenue PAYANT (B2B Pro/Brief, caisse Mollie active) — via mol_send_mail
    // (MTA cPanel ; Resend RETIRÉ → sans ça le client payait et ne recevait RIEN). Best-effort :
    // le marker d'idempotence est déjà posé, un échec d'envoi n'annule pas le grant et le
    // token reste valable (l'espace s'ouvre avec ?k=).
    $isPro  = (strpos((string)$plan, 'pro_') === 0);
    $titre  = $isPro ? 'Votre abonnement Sargasses Pro est actif' : 'Votre abonnement Sargasses Brief est actif';
    $espace = 'https://sargasses-martinique.com/pro/espace/?k=' . rawurlencode($k);
    $html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:22px;color:#1a1a1a">'
        . '<h2 style="margin:0 0 12px">' . $titre . '</h2>'
        . '<p style="font-size:15px;line-height:1.6;margin:0 0 16px">Merci, et bienvenue. Votre accès Pro est actif : widget à votre marque (sans notre crédit), alertes par plage et mise en avant dans l\'app.</p>'
        . '<p style="margin:0 0 22px"><a href="' . htmlspecialchars($espace) . '" style="display:inline-block;padding:13px 26px;background:#009E8E;color:#fff;font-weight:600;text-decoration:none;border-radius:10px">Ouvrir mon espace Pro &rarr;</a></p>'
        . '<p style="font-size:13px;color:#666;line-height:1.55">Votre espace s\'ouvre déjà connecté à votre accès Pro. Gardez ce lien privé : il porte votre clé.</p>'
        . '<p style="font-size:12px;color:#999;margin-top:18px">Sargasses Martinique &mdash; Le Veilleur. Résiliable à tout moment.</p></div>';
    mol_send_mail($email, $titre, $html);
    return true;
}

// ── B2B : email de bienvenue ESSAI (durabilité du token self-serve) ───────────
// b2b-trial.php renvoie le token au navigateur ET applique la marque blanche tout
// de suite ; mais si l'hôtel ferme l'onglet, il perd son accès. On lui envoie donc
// AUSSI le lien de son espace (?k=token) par email — comme le fait mol_b2b_grant_once
// au paiement, mais cadré « essai 30 j » (pas « abonnement actif »). MÊME mécanisme
// d'envoi (mol_send_mail, MTA cPanel ; Resend retiré). Best-effort : un échec d'envoi ne
// DOIT jamais faire échouer l'activation de l'essai (le token est déjà rendu au front).
/**
 * mol_send_mail — envoi email HTML via le MTA local du cPanel (PHP mail()).
 * Resend est RETIRÉ (cf. scripts/automation/lib/email-send.cjs ligne 13 « PLUS de Resend » :
 * Node envoie en SMTP authentifié alerte@ ; la clé SMTP_PASS n'est PAS exposée côté PHP).
 * Le site PHP tourne SUR le cPanel premium115.web-hosting.com → mail() relaie via l'Exim
 * local EN TANT QUE le domaine, From aligné alerte@sargasses-martinique.com (SPF/DKIM OK,
 * aucune clé requise). Best-effort (bool). -f = envelope sender (Return-Path) → SPF.
 * Sujet encodé MIME base64 UTF-8 (emoji/accents). Remplace les appels Resend B2B.
 */
function mol_send_mail($to, $subject, $html, $replyTo = '') {
    $to = is_array($to) ? implode(',', $to) : (string)$to;
    if ($to === '') return false;
    $h  = "From: Sargasses Pro <alerte@sargasses-martinique.com>\r\n";
    $h .= "MIME-Version: 1.0\r\n";
    $h .= "Content-Type: text/html; charset=UTF-8\r\n";
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $h .= 'Reply-To: ' . $replyTo . "\r\n";
    $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($to, $subj, $html, $h, '-falerte@sargasses-martinique.com');
}

function mol_b2b_trial_email($cfg, $email, $token, $name = '') {
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$token) return false;
    // Plafond PAR DESTINATAIRE (indépendant de l'IP) : le cap par IP de _ratelimit.php
    // est contournable (CF-Connecting-IP forgé en direct-origin) → on borne aussi le
    // volume d'emails vers UNE adresse à 1/h, pour protéger l'inbox de la victime ET
    // notre réputation d'envoi. Marqueur fichier (même esprit que l'idempotence grant).
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $throttle = $dir . '/trialmail_' . substr(hash('sha256', strtolower($email)), 0, 24);
    if (file_exists($throttle) && (time() - @filemtime($throttle)) < 3600) return false; // déjà envoyé < 1 h
    @file_put_contents($throttle, date('c'));
    $hi     = $name !== '' ? (' ' . htmlspecialchars($name)) : '';
    $titre  = 'Votre essai Sargasses Pro — 30 jours, sans carte';
    $espace = 'https://sargasses-martinique.com/pro/espace/?k=' . rawurlencode($token);
    $html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:22px;color:#1a1a1a">'
        . '<h2 style="margin:0 0 12px">Votre essai Pro est actif</h2>'
        . '<p style="font-size:15px;line-height:1.6;margin:0 0 16px">Bienvenue' . $hi . '. Votre accès Pro est ouvert pour <strong>30 jours</strong> : widget à votre marque (sans notre crédit), alertes par plage et mise en avant dans l\'app. Aucune carte, aucun engagement.</p>'
        . '<p style="margin:0 0 22px"><a href="' . htmlspecialchars($espace) . '" style="display:inline-block;padding:13px 26px;background:#009E8E;color:#fff;font-weight:600;text-decoration:none;border-radius:10px">Ouvrir mon espace Pro &rarr;</a></p>'
        . '<p style="font-size:13px;color:#666;line-height:1.55">Votre espace s\'ouvre déjà connecté à votre accès d\'essai. Gardez ce lien privé : il porte votre clé. À la fin de l\'essai, vous pourrez verrouiller l\'année depuis votre espace.</p>'
        . '<p style="font-size:12px;color:#999;margin-top:18px">Sargasses Martinique &mdash; Le Veilleur. Il regarde la mer, jamais vos clients.</p></div>';
    return mol_send_mail($email, $titre, $html);
}

/**
 * mol_b2b_meeting_notify — notifie LE FONDATEUR (boîte Gmail) qu'une collectivité /
 * groupe hôtelier (tier Territoire) a activé son accès ET demande un point/devis.
 * Funnel HYBRIDE (décision fondateur) : l'accès reste 100% self-serve instantané, MAIS
 * le secteur public a besoin d'un interlocuteur (devis, bon de commande, marché). Cet
 * email transfère la demande au fondateur pour qu'il cale le RDV depuis son mobile.
 * Envoi via mol_send_mail (MTA cPanel, Resend retiré). Best-effort.
 * Throttle 1/h par email prospect (anti-doublon/relais). $d = {email, org, littoral, phone, island}.
 */
function mol_b2b_meeting_notify($cfg, $d) {
    $email = trim((string)($d['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return false;
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $throttle = $dir . '/meeting_' . substr(hash('sha256', strtolower($email)), 0, 24);
    if (file_exists($throttle) && (time() - @filemtime($throttle)) < 3600) return false;
    @file_put_contents($throttle, date('c'));
    $org      = substr(preg_replace('/[<>"]/', '', (string)($d['org'] ?? '')), 0, 80);
    $littoral = substr(preg_replace('/[<>"]/', '', (string)($d['littoral'] ?? '')), 0, 120);
    $phone    = substr(preg_replace('/[^0-9 +().-]/', '', (string)($d['phone'] ?? '')), 0, 30);
    $island   = substr(preg_replace('/[^A-Za-z]/', '', (string)($d['island'] ?? '')), 0, 12);
    $orgTxt   = $org !== '' ? $org : '(non précisé)';
    $litTxt   = $littoral !== '' ? $littoral : '(non précisé)';
    $telTxt   = $phone !== '' ? (' · tél ' . htmlspecialchars($phone)) : '';
    $regTxt   = $island !== '' ? (' [' . htmlspecialchars(strtoupper($island)) . ']') : '';
    $html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1a1a1a">'
        . '<h2 style="margin:0 0 10px;color:#b8860b">🟡 Territoire — ' . htmlspecialchars($orgTxt) . ' veut un point</h2>'
        . '<p style="font-size:15px;line-height:1.6;margin:0 0 8px">Nouvelle demande <strong>Territoire</strong>' . $regTxt . ' — l\'accès essai 30 j est <strong>déjà activé</strong>.</p>'
        . '<ul style="font-size:14px;line-height:1.7;margin:0 0 14px;padding-left:18px">'
        . '<li>Collectivité / établissement : <strong>' . htmlspecialchars($orgTxt) . '</strong></li>'
        . '<li>Littoral à couvrir : ' . htmlspecialchars($litTxt) . '</li>'
        . '<li>Contact : <a href="mailto:' . htmlspecialchars($email) . '">' . htmlspecialchars($email) . '</a>' . $telTxt . '</li>'
        . '</ul>'
        . '<p style="font-size:13px;color:#444;line-height:1.55"><strong>Action</strong> : réponds en 1 ligne pour caler 15 min + préparer le devis (PDF). Achat public = devis daté + CGV + SIRET sur demande, bon de commande / mandat administratif acceptés.</p>'
        . '<p style="font-size:12px;color:#999;margin-top:16px">Auto-alert from b2b-meeting.php — Le Veilleur</p></div>';
    $subject = '🟡 Territoire — ' . $orgTxt . ' veut un point (' . $litTxt . ')';
    return mol_send_mail('yacovassaraf@gmail.com', $subject, $html, $email);
}
