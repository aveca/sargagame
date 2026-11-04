<?php
/**
 * b2b-trial.php — démarre un essai Pro 30 jours, INSTANTANÉ et 100% self-serve.
 *
 * POST {email, name?, beach?, island?} → émet un TOKEN PRO temporaire (30 j) signé
 * (réutilise sg_widget_sign() de widget-token.php : la marque blanche du widget
 * passe active, vérifiée côté serveur à l'affichage). Le token est RENVOYÉ au front
 * → l'hôtel l'a tout de suite, aucune dépendance email/humain. À J+30 le token
 * expire (sg_widget_verify rejette `exp` dépassé) → l'essai se termine proprement.
 *
 * Best-effort : (1) enregistre le lead (onglet 'emails' du Sheet, source b2b_trial)
 * via l'action Apps Script EXISTANTE `email_signup` — AUCUN clasp push requis ;
 * (2) envoie à l'hôtel le lien de son espace (?k=token) par EMAIL (mol_b2b_trial_email,
 * Resend) → si l'onglet est fermé, l'accès n'est pas perdu (tient la promesse « votre
 * accès Pro arrive par email »). Les deux best-effort : un échec n'empêche JAMAIS le
 * token d'être rendu au front (l'essai s'active de toute façon).
 *
 * CONSENTEMENT MARKETING (2026-11-04) : `marketingConsent` OPTIONNEL, JAMAIS
 * pré-coché côté front. Quand il est vrai, le lead porte le consentement + sa
 * version + son horodatage + sa source (payload Apps Script + événement analytics
 * `b2b_marketing_consent`). L'essai lui-même reste TRANSACTIONNEL : cet endpoint
 * n'envoie que l'email de l'essai et NE déclenche AUCUNE campagne marketing.
 *
 * ZÉRO secret nouveau (signature dérivée de stripe-config ; email via cfg.resend_key
 * déjà partagé, comme mol_b2b_grant_once). Additif : n'altère AUCUN flux de paiement.
 */
require_once __DIR__ . '/widget-token.php';
require_once __DIR__ . '/mollie-lib.php';   // mol_b2b_trial_email (livraison du lien espace)
require_once __DIR__ . '/_ratelimit.php';   // anti-abus : l'envoi d'email rend l'endpoint relais-able

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

// Plafond par IP : une activation d'essai est rare et légitime (un hôtel le fait une
// fois). 6/h/IP laisse passer le cas nominal et coupe le bombardement d'emails (on
// envoie un email à l'adresse fournie → sans plafond, l'endpoint serait un relais).
// Fail-open par conception (cf. _ratelimit.php) : un bug du limiteur ne bloque personne.
sg_rate_limit('b2b_trial', 6);

$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) $in = $_POST;

$email = trim((string)($in['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_email']);
    exit;
}
$name   = substr(preg_replace('/[<>"]/', '', (string)($in['name'] ?? '')), 0, 60);
// Slug de LA plage de l'établissement (ex. plage-des-salines) : re-propagé dans le
// lien espace emailé (?k=&beach=&name=) pour que l'espace ré-ouvre PERSONNALISÉ —
// widget pré-réglé + démo « mise en avant » ancrée au bon endroit dans l'app
// (le lien historique ?k= nu perdait ce contexte à chaque retour, grief 2026-07-02).
$beach  = strtolower(substr(preg_replace('/[^A-Za-z0-9-]/', '', (string)($in['beach'] ?? '')), 0, 60));
// Island : EUR (MQ/GP) + USD (florida/puntacana/rivieramaya), même périmètre que la
// caisse Mollie. Sans les USD, un hôtelier florida/puntacana/rivieramaya retombait sur
// MQ → email FR vers le mauvais domaine. Normalisation insensible à la casse, inconnu → MQ.
$islandRaw = strtolower(preg_replace('/[^A-Za-z]/', '', (string)($in['island'] ?? 'mq')));
$ISLAND_MAP = [
    'mq' => 'MQ', 'gp' => 'GP',
    'florida' => 'florida', 'puntacana' => 'puntacana', 'rivieramaya' => 'rivieramaya',
];
$island = $ISLAND_MAP[$islandRaw] ?? 'MQ';

// ── Consentement MARKETING (optionnel, JAMAIS pré-coché) ─────────────────────
// L'essai 30 jours est transactionnel : il part SANS consentement marketing.
// Si (et seulement si) l'hôtelier a coché explicitement la case d'opt-in,
// on enregistre le consentement AVEC sa version, son horodatage et sa source.
// Aucun envoi d'email marketing n'est déclenché ici : ce fichier n'envoie que
// l'email TRANSACTIONNEL de l'essai (mol_b2b_trial_email) et n'en change pas le
// comportement. La campagne reste bloquée tant que l'historique d'envoi, la
// désinscription et le consentement ne sont pas audités côté envoi.
$CONSENT_VERSION = '2026-11-04';
$marketingConsent = false;
$rawConsent = $in['marketingConsent'] ?? null;
if ($rawConsent === true || $rawConsent === 1 || $rawConsent === '1' || $rawConsent === 'true' || $rawConsent === 'on') {
    $marketingConsent = true;
}
$consentSource = strtolower(substr(preg_replace('/[^A-Za-z0-9_-]/', '', (string)($in['consentSource'] ?? 'b2b_trial_form')), 0, 40));
if ($consentSource === '') $consentSource = 'b2b_trial_form';
$consentTs = $marketingConsent ? gmdate('c') : '';

// Token Pro 30 jours. host = email (traçabilité) ; le widget ne vérifie que la
// validité/expiration du jeton, pas une correspondance de domaine.
$token = sg_widget_sign($email, 30);

// Best-effort : livre le lien de l'espace (?k=token) par email → accès durable même
// si l'onglet est fermé. Charge la config (resend_key) sans bloquer si absente en local.
$cfg = @include __DIR__ . '/mollie-config.php';
if (!is_array($cfg)) $cfg = [];
if (function_exists('mol_b2b_trial_email')) { @mol_b2b_trial_email($cfg, $email, $token, $name, $island, $beach); }

// Best-effort : enregistre le lead via l'action Apps Script EXISTANTE (zéro clasp).
// Échec silencieux : ne JAMAIS bloquer l'activation de l'essai sur ce log.
// Clés ADDITIVES pour le consentement marketing (version + horodatage + source).
$exec = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec';
$payload = json_encode([
    'type'             => 'email_signup',
    'email'            => $email,
    'source'           => 'b2b_trial',
    'island'           => $island,
    'org'              => $name,
    'marketing_consent' => $marketingConsent ? 1 : 0,
    'consent_v'        => $marketingConsent ? $CONSENT_VERSION : '',
    'consent_ts'       => $consentTs,
    'consent_source'   => $marketingConsent ? $consentSource : '',
]);
$ch = curl_init($exec);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 6,
    CURLOPT_FOLLOWLOCATION => true,
]);
@curl_exec($ch);
@curl_close($ch);

// Instrumente l'ENTRÉE du funnel B2B (essai démarré) dans Supabase — le seul funnel
// qui rapporte, désormais VISIBLE (funnel-b2b-from-supabase.cjs). sg_analytics_event
// vient de mollie-lib.php (déjà requis L22). Best-effort, jamais bloquant, zéro PII.
// ⚠️ function_exists() : la fonction avait disparu de mollie-lib.php (cf. commit
// 16eb15e12c) → appel d'une fonction inexistante = Error FATALE en PHP (le `@` ne
// supprime pas) → l'endpoint renvoyait 500 AVANT de rendre le token. Filet de
// sécurité : l'essai doit être activé même si la télémétrie tombe.
if (function_exists('sg_analytics_event')) {
    @sg_analytics_event('b2b_trial_started', ['org' => $name, 'beach' => $beach], $island);
}
// Consentement marketing (mesurable, sans PII, sans envoi) : on ne trace QUE
// l'opt-in explicite. Aucune campagne ne se déclenche depuis cet endpoint.
if ($marketingConsent && function_exists('sg_analytics_event')) {
    @sg_analytics_event('b2b_marketing_consent', [
        'consent' => 1,
        'v'       => $CONSENT_VERSION,
        'ts'      => $consentTs,
        'src'     => $consentSource,
    ], $island);
}

echo json_encode([
    'ok'    => true,
    'token' => $token,
    'days'  => 30,
]);
