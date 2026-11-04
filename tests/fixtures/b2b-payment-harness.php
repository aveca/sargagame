<?php
/**
 * Harness PHP — exécution RÉELLE du code de paiement Sargasses, sans ext-curl.
 *
 * Le CLI PHP du poste de dev n'a PAS l'extension ext-curl (vérifié : `php -m`
 * ne liste pas `curl`). On installe donc des STUBS curl_* qui CAPTURENT l'URL
 * et le body réellement envoyés — c'est ce qui permet d'affirmer ce qui est
 * écrit dans `analytics_events`, et non ce qu'on suppose.
 *
 * Scénarios exécutés (tous sur le TEXTE RÉEL des fichiers du dépôt) :
 *
 *  S1  `sg_b2b_emit_conversion()` — idempotence de l'événement de conversion.
 *  S2  `validateMollieAmountPHP()` — reconnaissance des paiements B2B.
 *  S3  `mol_b2b_classify_annual()` — classification du paiement par la
 *      grille B2B annuelle (description + montant).
 *
 * Sortie : JSON sur stdout.
 *   env SG_CONV_ID : identifiant d'encaissement à tester (fourni par le test).
 */

$GLOBALS['__sg_curl_calls'] = [];
$GLOBALS['__sg_curl'] = ['url' => '', 'body' => ''];
$GLOBALS['__sg_stubbed'] = false;

if (!function_exists('curl_init')) {
    // Les constantes CURLOPT_* n'existent pas sans ext-curl : on en définit
    // des valeurs distinctes (elles ne servent QUE de clés dans le stub).
    foreach ([
        'CURLOPT_POST' => 19999, 'CURLOPT_POSTFIELDS' => 19998,
        'CURLOPT_RETURNTRANSFER' => 19997, 'CURLOPT_TIMEOUT' => 19996,
        'CURLOPT_HTTPHEADER' => 19995, 'CURLOPT_URL' => 19994,
        'CURLINFO_HTTP_CODE' => 19993,
    ] as $name => $val) {
        if (!defined($name)) define($name, $val);
    }
    function curl_init($url = null) {
        $GLOBALS['__sg_curl'] = ['url' => (string)$url, 'body' => ''];
        return 1;
    }
    function curl_setopt_array($ch, $opts) {
        // ⚠️ `$ch` est un TABLEAU : passé par valeur, il ne revient pas à
        // l'appelant. On passe donc par un registre global.
        if (isset($opts[CURLOPT_URL])) $GLOBALS['__sg_curl']['url'] = $opts[CURLOPT_URL];
        if (isset($opts[CURLOPT_POSTFIELDS])) $GLOBALS['__sg_curl']['body'] = $opts[CURLOPT_POSTFIELDS];
        return true;
    }
    function curl_setopt($ch, $opt, $val) {
        if ($opt === CURLOPT_URL) $GLOBALS['__sg_curl']['url'] = $val;
        return true;
    }
    function curl_exec($ch) {
        $GLOBALS['__sg_curl_calls'][] = $GLOBALS['__sg_curl'];
        return '';
    }
    function curl_close($ch) { return true; }
    function curl_getinfo($ch, $opt = 0) { return 204; }
    function curl_errno($ch) { return 0; }
    function curl_error($ch) { return ''; }
    $GLOBALS['__sg_stubbed'] = true;
}

$ROOT = dirname(__DIR__, 2);
require_once $ROOT . '/public/api/mollie-lib.php';

$out = [
    'stubbed'    => $GLOBALS['__sg_stubbed'],
    'php'        => PHP_VERSION,
    's1'         => ['function_exists' => function_exists('sg_b2b_emit_conversion'), 'events' => []],
    's2'         => ['available' => false, 'cases' => []],
    's3'         => ['available' => false, 'cases' => []],
    's4'         => ['available' => false, 'grid' => []],
];

// ── S1 — idempotence de l'événement de conversion ────────────────────────────
// On appelle le MÊME encaissement deux fois (donc un rejeu de webhook) puis un
// encaissement DIFFÉRENT (contrôle).
$convId = (string)(getenv('SG_CONV_ID') ?: '');
if ($out['s1']['function_exists'] && $convId !== '') {
    $before = count($GLOBALS['__sg_curl_calls']);
    sg_b2b_emit_conversion($convId, 'pro_monthly', 'monthly');
    sg_b2b_emit_conversion($convId, 'pro_monthly', 'monthly');
    sg_b2b_emit_conversion($convId . '__other', 'pro_annual', 'annual');
    $out['s1']['events'] = array_slice($GLOBALS['__sg_curl_calls'], $before);
}

// ── S2 — validateMollieAmountPHP sur des paiements RÉELS ─────────────────────
// La fonction est extraite du FICHIER LIVRÉ (pas recopiée) et exécutée telle
// quelle : c'est le comportement de production qui est mesuré.
$hookSrc = (string)@file_get_contents($ROOT . '/public/api/mollie-webhook.php');
if (preg_match('/function\s+validateMollieAmountPHP\s*\(.*?\n\}/s', $hookSrc, $m)) {
    eval($m[0]);
    $out['s2']['available'] = true;

    // IMPORTANT — faithful à la production : le client Mollie du dépôt décode
    // en TABLEAU ASSOCIATIF (`json_decode($response, true)`) puis l'enveloppe
    // dans `SgPaymentDetailResponse` (accès par `__get`). Un stdClass ne
    // correspondrait PAS au runtime réel et donnerait un diagnostic FAUX.
    $mk = function (array $amount, array $metadata = [], string $desc = '') {
        return new SgPaymentDetailResponse([
            'amount'      => $amount,
            'metadata'    => $metadata,
            'description' => $desc,
            'status'      => 'paid',
        ]);
    };

    $out['s2']['cases'] = [
        // B2C — pass p30 payé via le checkout normal (metadata `pass` présent)
        'b2c_p30_eur' => validateMollieAmountPHP($mk(
            ['currency' => 'EUR', 'value' => '14.99'], ['pass' => 'p30']
        )),
        // B2C — pass p30 payé avec un MONTANT FAUX (anti-tampering)
        'b2c_p30_eur_wrong_amount' => validateMollieAmountPHP($mk(
            ['currency' => 'EUR', 'value' => '1.00'], ['pass' => 'p30']
        )),
        // B2B MENSUEL — subscription Mollie (metadata source/plan, PAS de `pass`)
        'b2b_monthly_79' => validateMollieAmountPHP($mk(
            ['currency' => 'EUR', 'value' => '79.00'],
            ['source' => 'b2b_monthly', 'plan' => 'pro_monthly']
        )),
        // B2B ANNUEL — payment link 690 € (l'API payment-links N'ACCEPTE PAS de
        // metadata : le paiement arrive donc SANS `pass` ni `source`)
        'b2b_annual_paylink_690' => validateMollieAmountPHP($mk(
            ['currency' => 'EUR', 'value' => '690.00'], [],
            'Sargasses Pro — Pro : widget marque-blanche + brief + alertes (abonnement annuel)'
        )),
        // B2C ANNUEL — payment link B2C season 19,99 € (même absence de metadata)
        'b2c_paylink_season_1999' => validateMollieAmountPHP($mk(
            ['currency' => 'EUR', 'value' => '19.99'], [],
            'Sargasses Pass — Saison 30 jours (EUR)'
        )),
    ];
}

// ── S3 — classification du paiement par la grille des liens de paiement ──────
if (function_exists('mol_paylink_classify')) {
    $out['s3']['available'] = true;
    $mk3 = function (string $value, string $currency, string $desc) {
        return new SgPaymentDetailResponse([
            'amount'      => ['currency' => $currency, 'value' => $value],
            'metadata'    => [],
            'description' => $desc,
            'status'      => 'paid',
        ]);
    };
    $cls = function ($p) {
        $a = $p->amount;
        return mol_paylink_classify($a['value'] ?? null, $a['currency'] ?? null);
    };
    $out['s3']['cases'] = [
        'pro_annual_690' => $cls($mk3(
            '690.00', 'EUR',
            'Sargasses Pro — Pro : widget marque-blanche + brief + alertes (abonnement annuel)'
        )),
        'brief_annual_290' => $cls($mk3(
            '290.00', 'EUR',
            'Sargasses Pro — Brief (abonnement annuel)'
        )),
        'territory_annual_1990' => $cls($mk3(
            '1990.00', 'EUR',
            'Sargasses Pro — Territoire : tout le littoral baie par baie + rapports + API (abonnement annuel)'
        )),
        'b2c_sejour_1299' => $cls($mk3(
            '12.99', 'EUR', 'Sargasses Pass — Séjour 7 jours (EUR)'
        )),
        'b2c_saison_1999' => $cls($mk3(
            '19.99', 'EUR', 'Sargasses Pass — Saison 30 jours (EUR)'
        )),
        'montant_inconnu' => $cls($mk3(
            '123.45', 'EUR', 'Sargasses Pass — Saison 30 jours (EUR)'
        )),
    ];
}

// ── S4 — grille des liens de paiement (parité avec le script qui les crée) ──
if (function_exists('mol_paylink_grid')) {
    $out['s4']['available'] = true;
    $out['s4']['grid'] = mol_paylink_grid();
}

echo json_encode($out);