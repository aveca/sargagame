<?php
/**
 * Collecteur analytics FIRST-PARTY — aucune dépendance externe (ni GA, ni Sheets, ni tiers).
 * Vit sur NOTRE hébergeur, à côté du site (déployé par le pipeline FTP). L'app POST en
 * same-origin un résumé de session JSON ; on l'append en NDJSON dans sg-data/ (protégé).
 * AUCUNE donnée perso stockée : l'IP ne sert qu'à un hash quotidien salé (unicité anonyme).
 */
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { http_response_code(405); exit; }

// Garde Origin/Referer (défense en profondeur) : l'écriture disque ne doit être
// déclenchable que depuis NOS domaines. Un Origin présent mais étranger = 403.
// Absent (certains modes privacy le retirent) → on retombe sur Referer ; absent
// des deux → on tolère (le cap 25 Mo/j + le rate-limit ci-dessous bornent l'abus)
// pour ne JAMAIS perdre une mesure légitime.
$ALLOWED_HOSTS = array(
  'sargasses-martinique.com','sargasses-guadeloupe.com',
  'sargassummiami.com','sargassumpuntacana.com','sargassumcancun.com'
);
function sg_host_ok($url, $allowed) {
  if (!$url) return null; // header absent
  $h = parse_url($url, PHP_URL_HOST);
  if (!$h) return false;
  $h = strtolower($h);
  foreach ($allowed as $d) {
    if ($h === $d || substr($h, -(strlen($d) + 1)) === '.' . $d) return true;
  }
  return false;
}
$ok = sg_host_ok($_SERVER['HTTP_ORIGIN'] ?? '', $ALLOWED_HOSTS);
if ($ok === null) $ok = sg_host_ok($_SERVER['HTTP_REFERER'] ?? '', $ALLOWED_HOSTS);
if ($ok === false) { http_response_code(403); exit; }

// Corps JSON, capé à 64 Ko (anti-abus)
$raw = file_get_contents('php://input', false, null, 0, 65536);
if ($raw === false || strlen($raw) < 2) { http_response_code(204); exit; }
$data = json_decode($raw, true);
if (!is_array($data)) { http_response_code(204); exit; }

// Dossier de données protégé (hors lecture web sur Apache)
$dir = __DIR__ . '/sg-data';
if (!is_dir($dir)) {
  @mkdir($dir, 0755, true);
  @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
}
// Génère la clé stats côté serveur au 1er hit (jamais dans le repo public)
$keyFile = $dir . '/.statskey';
if (!is_file($keyFile)) {
  $k = function_exists('random_bytes') ? bin2hex(random_bytes(16)) : sha1(uniqid('', true) . mt_rand());
  @file_put_contents($keyFile, $k);
}
$day  = gmdate('Y-m-d');
$file = $dir . '/sg-' . $day . '.ndjson';

// Cap taille/jour ~25 Mo : protège le disque mutualisé
if (is_file($file) && filesize($file) > 26214400) { http_response_code(204); exit; }

// Hash visiteur quotidien salé — compte les uniques SANS stocker IP/PII
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 120);
$vh = substr(hash('sha256', $day . '|' . $ip . '|' . $ua), 0, 16);

// Rate-limit léger par visiteur (clé = vh, non-PII) : fenêtre 60 s, max 60 hits.
// Borne le flood d'une même source (le cap 25 Mo/j protège déjà le disque global).
// Compteur dans sg-data/rl/ (hérite du Require-all-denied parent). Drop silencieux
// (204) au dépassement. Nettoyage opportuniste des vieux compteurs (1/200 req).
$rlDir = $dir . '/rl';
if (!is_dir($rlDir)) { @mkdir($rlDir, 0755, true); }
$rlFile = $rlDir . '/' . $vh;
$now = time(); $win = $now; $cnt = 1;
if (is_file($rlFile)) {
  $prev = json_decode(@file_get_contents($rlFile), true);
  if (is_array($prev) && isset($prev['w']) && ($now - $prev['w']) < 60) {
    $win = $prev['w']; $cnt = (int)($prev['c'] ?? 0) + 1;
  }
}
if ($cnt > 60) { http_response_code(204); exit; }
@file_put_contents($rlFile, json_encode(array('w' => $win, 'c' => $cnt)), LOCK_EX);
if (mt_rand(1, 200) === 1) {
  foreach (@glob($rlDir . '/*') ?: array() as $f) {
    if (@filemtime($f) < $now - 7200) @unlink($f);
  }
}

$rec  = array('rt' => gmdate('c'), 'vh' => $vh, 'd' => $data);
$line = json_encode($rec, JSON_UNESCAPED_UNICODE);
if ($line === false) { http_response_code(204); exit; }
@file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);

http_response_code(204); // No Content — léger, fire-and-forget
