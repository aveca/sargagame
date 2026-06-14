<?php
/**
 * Lecture AGRÉGÉE first-party (clé requise) — aucune dépendance externe.
 * Remplace GA/Sheets pour suivre : funnel (events), engagement & ENNUI par écran
 * (avg dwell, bored_rate), A/B, régions. Dédoublonne par session (sid), garde le dernier résumé.
 * Usage : https://<site>/stats.php?key=...&days=7   (JSON)
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Clé LUE côté serveur (jamais dans le repo public) — générée par collect.php au 1er hit,
// dans sg-data/.statskey. Pour suivre les stats : récupère cette valeur par FTP puis
// GET /stats.php?key=<contenu de sg-data/.statskey>.
$keyFile = __DIR__ . '/sg-data/.statskey';
$KEY = is_file($keyFile) ? trim((string)@file_get_contents($keyFile)) : '';
if ($KEY === '' || ($_GET['key'] ?? '') !== $KEY) {
  http_response_code(403);
  echo '{"error":"forbidden — clé dans sg-data/.statskey (FTP)"}';
  exit;
}

$days = max(1, min(30, (int)($_GET['days'] ?? 7)));
$dir  = __DIR__ . '/sg-data';
$sessions = array(); // sid -> dernier résumé (dédoublonnage)

for ($i = 0; $i < $days; $i++) {
  $f = $dir . '/sg-' . gmdate('Y-m-d', time() - $i * 86400) . '.ndjson';
  if (!is_file($f)) continue;
  $fh = fopen($f, 'r');
  if (!$fh) continue;
  while (($l = fgets($fh)) !== false) {
    $r = json_decode($l, true);
    if (!is_array($r) || !isset($r['d']) || !is_array($r['d'])) continue;
    $d = $r['d'];
    $sid = $d['sid'] ?? null;
    if (!$sid) continue;
    $sessions[$sid] = $d;
  }
  fclose($fh);
}

$out = array(
  'days' => $days, 'sessions' => count($sessions),
  'events' => array(), 'screens' => array(), 'ab' => array(), 'regions' => array(),
  'generated' => gmdate('c')
);
foreach ($sessions as $d) {
  if (!empty($d['region'])) { $rg = $d['region']; $out['regions'][$rg] = ($out['regions'][$rg] ?? 0) + 1; }
  if (!empty($d['ab']) && is_array($d['ab'])) foreach ($d['ab'] as $k => $v) {
    $kk = $k . ':' . $v; $out['ab'][$kk] = ($out['ab'][$kk] ?? 0) + 1;
  }
  if (!empty($d['ev']) && is_array($d['ev'])) foreach ($d['ev'] as $e) {
    $en = $e['e'] ?? null; if ($en) $out['events'][$en] = ($out['events'][$en] ?? 0) + 1;
  }
  if (!empty($d['scr']) && is_array($d['scr'])) foreach ($d['scr'] as $s => $o) {
    if (!isset($out['screens'][$s])) $out['screens'][$s] = array('visits'=>0,'dwell_ms'=>0,'bored'=>0,'acts'=>0);
    $out['screens'][$s]['visits']  += $o['n'] ?? 0;
    $out['screens'][$s]['dwell_ms'] += $o['dwell'] ?? 0;
    $out['screens'][$s]['bored']   += $o['bored'] ?? 0;
    $out['screens'][$s]['acts']    += $o['acts'] ?? 0;
  }
}
foreach ($out['screens'] as $s => &$o) {
  $v = max(1, $o['visits']);
  $o['avg_dwell_ms'] = round($o['dwell_ms'] / $v);
  $o['bored_rate']   = round($o['bored'] / $v, 3);
  $o['avg_acts']     = round($o['acts'] / $v, 2);
}
unset($o);
arsort($out['events']);
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
