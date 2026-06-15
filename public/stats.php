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
$regionFilter = isset($_GET['region']) ? preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$_GET['region'])) : '';
$dir  = __DIR__ . '/sg-data';
$sessions = array(); // sid -> dernier résumé (dédoublonnage)

// Étapes du funnel conversion (ordre) — les rates par région se calculent dessus.
// Source de vérité = noms d'events track() de l'app (audit 2026-06-14).
$FUNNEL = array('sg_session_start','sg_forecast_lock_click','sg_premium_modal_open','sg_premium_modal_cta','sg_checkout_redirect','sg_conversion','sg_email_submit');

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
  'days' => $days, 'region_filter' => ($regionFilter ?: null), 'sessions' => 0,
  'events' => array(), 'screens' => array(), 'ab' => array(), 'regions' => array(),
  'byRegion' => array(), 'generated' => gmdate('c')
);

// Accumulateur funnel par région : sessions, étapes, ennui pondéré, top events.
function _regAcc() {
  return array('sessions'=>0,'funnel'=>array(),'screens_dwell'=>0,'screens_bored'=>0,'screens_visits'=>0,'events'=>array());
}
$byR = array();

foreach ($sessions as $d) {
  $rg = !empty($d['region']) ? $d['region'] : 'unknown';
  // Filtre région optionnel (?region=florida) : on ignore tout le reste.
  if ($regionFilter !== '' && $rg !== $regionFilter) continue;
  $out['sessions']++;
  $out['regions'][$rg] = ($out['regions'][$rg] ?? 0) + 1;
  if (!isset($byR[$rg])) $byR[$rg] = _regAcc();
  $byR[$rg]['sessions']++;

  if (!empty($d['ab']) && is_array($d['ab'])) foreach ($d['ab'] as $k => $v) {
    $kk = $k . ':' . $v; $out['ab'][$kk] = ($out['ab'][$kk] ?? 0) + 1;
  }
  // Events comptés UNE fois par session pour le funnel (présence, pas volume) ;
  // le compteur global garde le volume brut.
  $seen = array();
  if (!empty($d['ev']) && is_array($d['ev'])) foreach ($d['ev'] as $e) {
    $en = $e['e'] ?? null; if (!$en) continue;
    $out['events'][$en] = ($out['events'][$en] ?? 0) + 1;
    $byR[$rg]['events'][$en] = ($byR[$rg]['events'][$en] ?? 0) + 1;
    $seen[$en] = true;
  }
  foreach ($FUNNEL as $step) if (isset($seen[$step])) {
    $byR[$rg]['funnel'][$step] = ($byR[$rg]['funnel'][$step] ?? 0) + 1;
  }

  if (!empty($d['scr']) && is_array($d['scr'])) foreach ($d['scr'] as $s => $o) {
    if (!isset($out['screens'][$s])) $out['screens'][$s] = array('visits'=>0,'dwell_ms'=>0,'bored'=>0,'acts'=>0);
    $out['screens'][$s]['visits']  += $o['n'] ?? 0;
    $out['screens'][$s]['dwell_ms'] += $o['dwell'] ?? 0;
    $out['screens'][$s]['bored']   += $o['bored'] ?? 0;
    $out['screens'][$s]['acts']    += $o['acts'] ?? 0;
    $byR[$rg]['screens_visits'] += $o['n'] ?? 0;
    $byR[$rg]['screens_dwell']  += $o['dwell'] ?? 0;
    $byR[$rg]['screens_bored']  += $o['bored'] ?? 0;
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

// Synthèse par région : funnel + taux de conversion par étape + ennui + top events.
foreach ($byR as $rg => $a) {
  $f = $a['funnel'];
  $start  = max(1, $a['sessions']);
  $lock   = $f['sg_forecast_lock_click'] ?? 0;
  $modal  = $f['sg_premium_modal_open'] ?? 0;
  $cta    = $f['sg_premium_modal_cta'] ?? 0;
  $redir  = $f['sg_checkout_redirect'] ?? 0;
  $conv   = $f['sg_conversion'] ?? 0;
  $email  = $f['sg_email_submit'] ?? 0;
  $sv     = max(1, $a['screens_visits']);
  arsort($a['events']);
  $out['byRegion'][$rg] = array(
    'sessions'  => $a['sessions'],
    'funnel'    => array(
      'forecast_lock'    => $lock,
      'modal_open'       => $modal,
      'modal_cta'        => $cta,
      'checkout_redirect'=> $redir,
      'conversion'       => $conv,
      'email_submit'     => $email,
    ),
    'rates' => array(
      // % de sessions atteignant chaque étape (lisible cross-région).
      'session_to_modal'     => round(100 * $modal / $start, 1),
      'modal_to_cta'         => $modal ? round(100 * $cta / $modal, 1) : 0,
      'cta_to_redirect'      => $cta ? round(100 * $redir / $cta, 1) : 0,
      // La MARCHE REVENU — l'angle mort que le funnel ne voyait pas (surtout USD).
      'redirect_to_conversion' => $redir ? round(100 * $conv / $redir, 1) : 0,
      'session_to_conversion'  => round(100 * $conv / $start, 2),
      // Intention payante la plus forte (lock 121 > cta 77) — mesurée isolée.
      'lock_to_cta'          => $lock ? round(100 * $cta / $lock, 1) : 0,
      'session_to_email'     => round(100 * $email / $start, 1),
    ),
    'bored_rate' => round($a['screens_bored'] / $sv, 3),
    'avg_dwell_ms' => round($a['screens_dwell'] / $sv),
    'top_events' => array_slice($a['events'], 0, 8, true),
  );
}
// Régions triées par sessions décroissantes (la plus active en tête).
uasort($out['byRegion'], function($x, $y){ return $y['sessions'] - $x['sessions']; });

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
