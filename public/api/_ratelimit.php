<?php
/**
 * _ratelimit.php — Limiteur de débit par IP pour les endpoints Stripe.
 *
 * ANTI card-testing : des rafales de SetupIntents / PaymentIntents (cartes volées
 * testées en boucle) déclenchent le gel du compte Stripe par Radar — soit 100% du
 * MRR perdu. Ce limiteur plafonne le nombre de requêtes sensibles par IP et par
 * heure, et répond 429 au-delà.
 *
 * FAIL-OPEN PAR CONCEPTION : si l'état n'est pas lisible / inscriptible (FS plein,
 * lock impossible, IP indéterminable), la requête PASSE. Un bug du limiteur ne doit
 * JAMAIS bloquer un client qui paie — c'est une couche défensive, pas un point de
 * passage obligé. Le risque card-testing reste couvert dans le cas nominal.
 *
 * RÉVERSIBLE : sg_rl_enabled() lit 'rate_limit_enabled' de stripe-config.php
 * (défaut true) ; définir SG_RL_KILL=true (ou rate_limit_enabled=false dans la
 * config) désactive entièrement le limiteur sans toucher au code des endpoints.
 *
 * CONFIDENTIALITÉ : l'IP n'est jamais stockée en clair — la clé de compteur est un
 * HMAC(IP|bucket) tronqué. L'état vit dans api/data/ (Require all denied) — jamais
 * servi par HTTP, seulement accédé en filesystem par PHP. Même répertoire et même
 * doctrine que les marqueurs d'idempotence du webhook (stripe-webhook.php).
 */

if (!defined('SG_RL_KILL')) define('SG_RL_KILL', false);

/** Secret dérivé du webhook_secret (jamais la clé Stripe brute), stable. */
function sg_rl_secret() {
    $cfg = @include __DIR__ . '/stripe-config.php';
    $base = (is_array($cfg) && !empty($cfg['webhook_secret'])) ? $cfg['webhook_secret'] : 'sargasses-rl';
    return hash('sha256', $base . '|sg-ratelimit-v1');
}

/** Limiteur actif ? Kill-switch dur (constante) puis flag config (défaut: actif). */
function sg_rl_enabled() {
    if (SG_RL_KILL) return false;
    $cfg = @include __DIR__ . '/stripe-config.php';
    if (is_array($cfg) && array_key_exists('rate_limit_enabled', $cfg)) return (bool)$cfg['rate_limit_enabled'];
    return true;
}

/**
 * IP cliente réelle, NON forgeable pour l'anti-abus. On N'utilise PAS X-Forwarded-For :
 * ce header est contrôlé par le client et un bot le ferait tourner pour contourner le
 * plafond. Ordre :
 *   1. CF-Connecting-IP — posé par Cloudflare (le site est fronté CF) ; non forgeable
 *      par le client tant que le trafic passe par CF. C'est la vraie IP cliente même
 *      quand REMOTE_ADDR est l'edge Cloudflare (sinon tous les visiteurs CF partagent
 *      un seul compteur → faux 429).
 *   2. REMOTE_ADDR — le pair TCP réel, jamais forgeable (régions servies en direct).
 * Durcissement déploiement recommandé (hors PHP) : verrouiller l'origine aux plages IP
 * Cloudflare / Authenticated Origin Pulls pour qu'un CF-Connecting-IP forgé en direct
 * ne contourne pas le plafond. Stripe Radar reste le filet en dernier recours.
 */
function sg_rl_client_ip() {
    $cands = [];
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) $cands[] = $_SERVER['HTTP_CF_CONNECTING_IP'];
    if (!empty($_SERVER['REMOTE_ADDR'])) $cands[] = $_SERVER['REMOTE_ADDR'];
    foreach ($cands as $ip) {
        $ip = trim($ip);
        if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
    }
    return ''; // IP indéterminable → fail-open (sg_rate_limit ne bloque pas)
}

/** S'assure que api/data/ existe et reste protégé du HTTP (défense en profondeur). */
function sg_rl_data_dir() {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    $ht = $dir . '/.htaccess';
    if (!file_exists($ht)) { @file_put_contents($ht, "Require all denied\n"); }
    return $dir;
}

/**
 * Plafonne $bucket à $maxPerHour requêtes par IP (fenêtre horaire fixe).
 * Émet 429 + JSON puis exit() si dépassé ; sinon incrémente le compteur et rend la
 * main. FAIL-OPEN sur toute condition d'erreur (jamais de blocage d'un payeur légitime).
 */
function sg_rate_limit($bucket, $maxPerHour = 20) {
    if (!sg_rl_enabled()) return;
    $ip = sg_rl_client_ip();
    if ($ip === '') return;                 // pas d'IP fiable → ne pas bloquer
    $dir = sg_rl_data_dir();
    if (!is_writable($dir)) return;         // FS non-inscriptible → fail-open

    $window = (int)floor(time() / 3600);    // fenêtre horaire fixe
    $key = substr(hash_hmac('sha256', $ip . '|' . $bucket, sg_rl_secret()), 0, 24);
    $file = $dir . '/rl_' . $key . '.json';

    $fh = @fopen($file, 'c+');
    if (!$fh) return;                       // ouverture impossible → fail-open
    $blocked = false;
    if (@flock($fh, LOCK_EX)) {
        $raw = stream_get_contents($fh);
        $st = json_decode($raw, true);
        $n = (is_array($st) && isset($st['w']) && (int)$st['w'] === $window) ? (int)$st['n'] : 0;
        $n++;
        if ($n > $maxPerHour) {
            $blocked = true;                 // ne pas réécrire : on plafonne, pas d'inflation
        } else {
            @ftruncate($fh, 0);
            @rewind($fh);
            @fwrite($fh, json_encode(['w' => $window, 'n' => $n]));
        }
        @flock($fh, LOCK_UN);
    }
    @fclose($fh);

    // Purge opportuniste (~1 requête sur 50) des compteurs périmés (>2h).
    if (mt_rand(1, 50) === 1) sg_rl_purge($dir);

    if ($blocked) {
        http_response_code(429);
        header('Retry-After: 3600');
        echo json_encode(['error' => 'rate_limited', 'retryAfter' => 3600]);
        exit;
    }
}

/** Supprime les fichiers compteurs rl_* dont le mtime dépasse 2h. */
function sg_rl_purge($dir) {
    $now = time();
    foreach ((scandir($dir) ?: []) as $f) {
        if (strpos($f, 'rl_') !== 0) continue;
        $p = $dir . '/' . $f;
        if (is_file($p) && ($now - (int)@filemtime($p)) > 7200) @unlink($p);
    }
}
