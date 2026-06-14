<?php
/**
 * Collecteur analytics FIRST-PARTY — aucune dépendance externe (ni GA, ni Sheets, ni tiers).
 * Vit sur NOTRE hébergeur, à côté du site (déployé par le pipeline FTP). L'app POST en
 * same-origin un résumé de session JSON ; on l'append en NDJSON dans sg-data/ (protégé).
 * AUCUNE donnée perso stockée : l'IP ne sert qu'à un hash quotidien salé (unicité anonyme).
 */
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { http_response_code(405); exit; }

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

$rec  = array('rt' => gmdate('c'), 'vh' => $vh, 'd' => $data);
$line = json_encode($rec, JSON_UNESCAPED_UNICODE);
if ($line === false) { http_response_code(204); exit; }
@file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);

http_response_code(204); // No Content — léger, fire-and-forget
