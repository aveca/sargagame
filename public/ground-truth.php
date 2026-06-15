<?php
/**
 * ground-truth.php — CAPTURE first-party des confirmations terrain (le moat #2).
 *
 * PHASE 0 a verrouillé les PRÉDICTIONS datées. Ceci capture le RÉALISÉ observé par
 * les vrais visiteurs (« tu es sur cette plage ? confirme l'état »). C'est le SEUL
 * actif data NON-copiable : Copernicus est public et re-traitable, mais les
 * observations sol calibrées NON. Croisé avec forecast-archive = le track-record
 * auditable « prédiction datée vs réalisé, calibré par N observations terrain ».
 *
 * Append-only STRICT : fichiers MENSUELS sg-data/gt-YYYY-MM.ndjson, JAMAIS purgés.
 * Anonyme : aucune PII. L'IP ne sert qu'à un hash quotidien salé (anti-doublon).
 * Pas de photo en v1 (évite la surface PII/modération ; photo = v2 avec consentement).
 *
 *   POST {b:beachId, s:state(clean|moderate|avoid), r:region, sid?:session} → 204
 *   GET  ?key=<sg-data/.statskey>&days=N  → résumé communautaire par plage (clé requise)
 *
 * Contrat pour le widget Ground-Truth Snap (lane monolithe) : POST same-origin JSON.
 */
header('X-Content-Type-Options: nosniff');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$dir = __DIR__ . '/sg-data';

// État protégé + clé (réutilise le mécanisme collect.php/stats.php).
if (!is_dir($dir)) {
  @mkdir($dir, 0755, true);
  @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
}
$keyFile = $dir . '/.statskey';
if (!is_file($keyFile)) {
  $k = function_exists('random_bytes') ? bin2hex(random_bytes(16)) : sha1(uniqid('', true) . mt_rand());
  @file_put_contents($keyFile, $k);
}

$STATES = array('clean' => 1, 'moderate' => 1, 'avoid' => 1);

if ($method === 'POST') {
  // Confirmation = quelques octets ; corps capé à 4 Ko (anti-abus).
  $raw = file_get_contents('php://input', false, null, 0, 4096);
  if ($raw === false || strlen($raw) < 2) { http_response_code(204); exit; }
  $d = json_decode($raw, true);
  if (!is_array($d)) { http_response_code(204); exit; }

  // Validation STRICTE par whitelist — rien de non borné n'entre, aucun vecteur d'injection.
  $b = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)($d['b'] ?? '')));
  $s = (string)($d['s'] ?? '');
  $r = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)($d['r'] ?? '')));
  $sid = preg_replace('/[^a-z0-9_-]/', '', substr((string)($d['sid'] ?? ''), 0, 40));
  if ($b === '' || strlen($b) > 40 || !isset($STATES[$s])) { http_response_code(204); exit; }
  if (strlen($r) > 16) $r = substr($r, 0, 16);

  $day = gmdate('Y-m-d');
  $file = $dir . '/gt-' . gmdate('Y-m') . '.ndjson';
  // Garde-disque mutualisé : 50 Mo/mois (jamais atteint au volume de confirmations).
  if (is_file($file) && filesize($file) > 52428800) { http_response_code(204); exit; }

  // Hash visiteur quotidien salé (anti-doublon, ZÉRO PII stockée).
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 120);
  $vh = substr(hash('sha256', $day . '|' . $ip . '|' . $ua), 0, 16);

  $rec = array('rt' => gmdate('c'), 'day' => $day, 'vh' => $vh, 'b' => $b, 's' => $s);
  if ($r !== '') $rec['r'] = $r;
  if ($sid !== '') $rec['sid'] = $sid;
  $line = json_encode($rec, JSON_UNESCAPED_UNICODE);
  if ($line !== false) @file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);
  http_response_code(204); // fire-and-forget
  exit;
}

// ── GET : résumé communautaire par plage (clé requise, même clé que stats.php) ──
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$KEY = is_file($keyFile) ? trim((string)@file_get_contents($keyFile)) : '';
if ($KEY === '' || ($_GET['key'] ?? '') !== $KEY) {
  http_response_code(403);
  echo '{"error":"forbidden — cle dans sg-data/.statskey (FTP)"}';
  exit;
}
$days = max(1, min(120, (int)($_GET['days'] ?? 30)));
$cutoff = gmdate('Y-m-d', time() - ($days - 1) * 86400);
// Dédoublonnage : 1 confirmation comptée par (plage, visiteur, jour) — dernier état gagne.
$seen = array();
$months = array();
for ($i = 0; $i < $days; $i++) $months[gmdate('Y-m', time() - $i * 86400)] = 1;
foreach (array_keys($months) as $m) {
  $f = $dir . '/gt-' . $m . '.ndjson';
  if (!is_file($f)) continue;
  $fh = fopen($f, 'r'); if (!$fh) continue;
  while (($l = fgets($fh)) !== false) {
    $rec = json_decode($l, true);
    if (!is_array($rec) || empty($rec['b']) || empty($rec['s'])) continue;
    $rd = isset($rec['day']) ? $rec['day'] : substr((string)($rec['rt'] ?? ''), 0, 10);
    if ($rd < $cutoff) continue;
    $seen[$rec['b'] . '|' . ($rec['vh'] ?? '') . '|' . $rd] = array('b' => $rec['b'], 's' => $rec['s'], 'r' => isset($rec['r']) ? $rec['r'] : '', 'day' => $rd);
  }
  fclose($fh);
}
$beaches = array();
foreach ($seen as $v) {
  $b = $v['b'];
  if (!isset($beaches[$b])) $beaches[$b] = array('clean' => 0, 'moderate' => 0, 'avoid' => 0, 'total' => 0, 'region' => $v['r'], 'last' => '');
  $beaches[$b][$v['s']]++;
  $beaches[$b]['total']++;
  if ($v['day'] > $beaches[$b]['last']) $beaches[$b]['last'] = $v['day'];
}
// Verdict communautaire = état majoritaire + accord (part du majoritaire).
foreach ($beaches as &$o) {
  $maj = 'clean'; $mx = -1;
  foreach (array('clean', 'moderate', 'avoid') as $st) if ($o[$st] > $mx) { $mx = $o[$st]; $maj = $st; }
  $o['community'] = $maj;
  $o['agreement'] = $o['total'] ? round($mx / $o['total'], 2) : 0;
}
unset($o);
uasort($beaches, function ($x, $y) { return $y['total'] - $x['total']; });
echo json_encode(array('days' => $days, 'beaches_confirmed' => count($beaches), 'total_confirmations' => count($seen), 'beaches' => $beaches, 'generated' => gmdate('c')), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
