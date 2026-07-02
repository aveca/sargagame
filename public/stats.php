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
$W = array('total'=>0,'byHost'=>array(),'byBeach'=>array(),'last'=>null); // installs widget B2B (embed)

// Étapes du funnel conversion (ordre) — les rates par région se calculent dessus.
// Source de vérité = noms d'events track() de l'app (audit 2026-06-14).
$FUNNEL = array('sg_session_start','sg_forecast_lock_click','sg_premium_modal_open','sg_premium_modal_cta','sg_checkout_redirect','sg_conversion','sg_email_submit','sg_hero_email_submit','sg_capture_gate_view','sg_capture_gate_submit','sg_gap_freemium_unlock','sg_capture_gate_pay');

// Attribution canal (P5) : classe le referrer en canal d'acquisition. Source = $d['ref']
// (document.referrer, déjà collecté par l'app). Pas de PII, juste le host.
function _sgChannel($ref) {
  $ref = strtolower(trim((string)$ref));
  if ($ref === '') return 'direct';
  $host = parse_url($ref, PHP_URL_HOST);
  if (!$host) $host = $ref;
  if (preg_match('/(^|\.)(google|bing|duckduckgo|ecosia|yahoo|qwant|yandex|baidu)\./', $host)) return 'search';
  if (preg_match('/(facebook|fb\.|instagram|t\.co|twitter|x\.com|tiktok|youtube|youtu\.be|whatsapp|pinterest|reddit|linkedin|snapchat)/', $host)) return 'social';
  if (preg_match('/sargasses-|sargassum/', $host)) return 'internal';
  return 'referral';
}

for ($i = 0; $i < $days; $i++) {
  $f = $dir . '/sg-' . gmdate('Y-m-d', time() - $i * 86400) . '.ndjson';
  if (!is_file($f)) continue;
  $fh = fopen($f, 'r');
  if (!$fh) continue;
  while (($l = fgets($fh)) !== false) {
    $r = json_decode($l, true);
    if (!is_array($r) || !isset($r['d']) || !is_array($r['d'])) continue;
    $d = $r['d'];
    // Installs widget B2B (embed) : agrégés à part, jamais comptés comme sessions/funnel.
    if (($d['type'] ?? '') === 'widget') {
      $wh = preg_replace('/[^a-z0-9.\-]/', '', strtolower((string)($d['host'] ?? '(direct)')));
      if ($wh === '') $wh = '(direct)';
      $wb = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)($d['beach'] ?? '')));
      $W['total']++;
      $W['byHost'][$wh] = ($W['byHost'][$wh] ?? 0) + 1;
      if ($wb !== '') $W['byBeach'][$wb] = ($W['byBeach'][$wb] ?? 0) + 1;
      $W['last'] = $r['rt'] ?? $W['last'];
      continue;
    }
    $sid = $d['sid'] ?? null;
    if (!$sid) continue;
    $sessions[$sid] = $d;
  }
  fclose($fh);
}

$out = array(
  'days' => $days, 'region_filter' => ($regionFilter ?: null), 'sessions' => 0,
  'events' => array(), 'screens' => array(), 'clicks' => array(), 'ab' => array(), 'regions' => array(),
  'byRegion' => array(), 'generated' => gmdate('c')
);

// Accumulateur funnel par région : sessions, étapes, ennui pondéré, top events.
function _regAcc() {
  return array('sessions'=>0,'funnel'=>array(),'screens_dwell'=>0,'screens_bored'=>0,'screens_visits'=>0,'events'=>array());
}
$byR = array();
$abx = array(); // A/B cross-tab : test -> variante -> {sessions, events funnel, engagement}
$chan = array();   // P5 attribution canal : canal -> {sessions, conversion, modal_cta, email}
$cidSeq = array(); // P4 cohorte : cid -> [{ts, conv, cta}] (rang de visite calculé après la boucle)

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

  // P5 attribution canal + P4 cohorte rang de visite — réutilisent $seen (events de
  // la session). conversion = sg_conversion (peut sous-compter en absolu → on garde
  // aussi modal_cta = intention fiable pour la comparaison RELATIVE canal/rang).
  $convHit  = isset($seen['sg_conversion']);
  $ctaHit   = isset($seen['sg_premium_modal_cta']);
  $emailHit = isset($seen['sg_email_submit']) || isset($seen['sg_hero_email_submit']);
  $ch = _sgChannel($d['ref'] ?? '');
  if (!isset($chan[$ch])) $chan[$ch] = array('sessions'=>0,'conversion'=>0,'modal_cta'=>0,'email'=>0);
  $chan[$ch]['sessions']++;
  if ($convHit)  $chan[$ch]['conversion']++;
  if ($ctaHit)   $chan[$ch]['modal_cta']++;
  if ($emailHit) $chan[$ch]['email']++;
  $cid = isset($d['cid']) ? (string)$d['cid'] : '';
  if ($cid !== '') $cidSeq[$cid][] = array('ts'=>(int)($d['ts'] ?? 0), 'conv'=>$convHit, 'cta'=>$ctaHit);

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

  // HEATMAP first-party (clk) : densité de clics + DEAD-CLICKS par écran et par bucket
  // de grille (16×24 normalisée). Remplace Clarity : on voit OÙ ça clique et où ça clique
  // dans le vide (frustration). Agrégé sur toutes les sessions de la fenêtre.
  if (!empty($d['clk']) && is_array($d['clk'])) foreach ($d['clk'] as $s => $o) {
    if (!isset($out['clicks'][$s])) $out['clicks'][$s] = array('n'=>0,'dead'=>0,'b'=>array(),'d'=>array());
    $out['clicks'][$s]['n'] += $o['n'] ?? 0;
    if (!empty($o['b']) && is_array($o['b'])) foreach ($o['b'] as $k => $c) { $out['clicks'][$s]['b'][$k] = ($out['clicks'][$s]['b'][$k] ?? 0) + $c; }
    if (!empty($o['d']) && is_array($o['d'])) foreach ($o['d'] as $k => $c) { $out['clicks'][$s]['d'][$k] = ($out['clicks'][$s]['d'][$k] ?? 0) + $c; $out['clicks'][$s]['dead'] += $c; }
  }
  // Coupables NOMMÉS des dead-clicks (élément, pas juste bucket) — remontés par le client (de).
  // Transforme « dead-clicks sur l'écran X » en « dead-clicks sur <tag#id.classe> » → fix ciblé.
  if (!empty($d['de']) && is_array($d['de'])) foreach ($d['de'] as $s => $m) {
    if (!isset($out['clicks'][$s])) $out['clicks'][$s] = array('n'=>0,'dead'=>0,'b'=>array(),'d'=>array());
    if (!isset($out['clicks'][$s]['de'])) $out['clicks'][$s]['de'] = array();
    if (is_array($m)) foreach ($m as $desc => $c) { $out['clicks'][$s]['de'][$desc] = ($out['clicks'][$s]['de'][$desc] ?? 0) + $c; }
  }
  // CLIC DROIT NOMMÉ (rc) — clic droit sur zone non-interactive = confusion desktop
  // (jumeau du dead-click). Le menu navigateur n'est jamais détourné côté client.
  if (!empty($d['rc']) && is_array($d['rc'])) foreach ($d['rc'] as $s => $m) {
    if (!isset($out['clicks'][$s])) $out['clicks'][$s] = array('n'=>0,'dead'=>0,'b'=>array(),'d'=>array());
    if (!isset($out['clicks'][$s]['rc'])) $out['clicks'][$s]['rc'] = array();
    if (is_array($m)) foreach ($m as $desc => $c) { $out['clicks'][$s]['rc'][$desc] = ($out['clicks'][$s]['rc'][$desc] ?? 0) + $c; }
  }
  // SURVOL-HÉSITATION NOMMÉ (hv) — CTA survolé ≥600ms puis quitté sans clic. Chaque
  // desc = {n, ms} → on cumule pour calculer le dwell moyen (avg_ms) à la finalisation.
  if (!empty($d['hv']) && is_array($d['hv'])) foreach ($d['hv'] as $s => $m) {
    if (!isset($out['clicks'][$s])) $out['clicks'][$s] = array('n'=>0,'dead'=>0,'b'=>array(),'d'=>array());
    if (!isset($out['clicks'][$s]['hv'])) $out['clicks'][$s]['hv'] = array();
    if (is_array($m)) foreach ($m as $desc => $o) {
      if (!is_array($o)) continue;
      if (!isset($out['clicks'][$s]['hv'][$desc])) $out['clicks'][$s]['hv'][$desc] = array('n'=>0,'ms'=>0);
      $out['clicks'][$s]['hv'][$desc]['n']  += $o['n']  ?? 0;
      $out['clicks'][$s]['hv'][$desc]['ms'] += $o['ms'] ?? 0;
    }
  }

  // A/B CROSS-TAB : par test -> par variante -> sessions + présence d'events funnel + engagement.
  // Permet l'éval A/B automatisée (quelle variante convertit/engage le mieux) sans Google.
  if (!empty($d['ab']) && is_array($d['ab'])) {
    $sd = 0; $sb = 0; $sv2 = 0;
    if (!empty($d['scr']) && is_array($d['scr'])) foreach ($d['scr'] as $o) {
      $sd += $o['dwell'] ?? 0; $sb += $o['bored'] ?? 0; $sv2 += $o['n'] ?? 0;
    }
    foreach ($d['ab'] as $test => $variant) {
      if (!is_scalar($variant)) continue;
      if (!isset($abx[$test][$variant])) $abx[$test][$variant] = array('sessions'=>0,'ev'=>array(),'dwell'=>0,'bored'=>0,'visits'=>0);
      $abx[$test][$variant]['sessions']++;
      $abx[$test][$variant]['dwell']  += $sd;
      $abx[$test][$variant]['bored']  += $sb;
      $abx[$test][$variant]['visits'] += $sv2;
      foreach ($seen as $en => $_) $abx[$test][$variant]['ev'][$en] = ($abx[$test][$variant]['ev'][$en] ?? 0) + 1;
    }
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
// Heatmap : dead-rate par écran + buckets les + chauds (clics & dead-clicks) — la grille
// complète reste dispo (b/d) pour rendre la carte de chaleur ; le dead-rate trie les écrans
// frustrants (où l'utilisateur tape sans réponse).
foreach ($out['clicks'] as $s => &$c) {
  $c['dead_rate'] = $c['n'] ? round($c['dead'] / $c['n'], 3) : 0;
  arsort($c['b']); arsort($c['d']);
  $c['top_dead_buckets'] = array_slice($c['d'], 0, 6, true);
  if (!empty($c['de'])) { arsort($c['de']); $c['top_dead_els'] = array_slice($c['de'], 0, 8, true); }
  // Clic droit confus : élément le plus visé (comme top_dead_els).
  if (!empty($c['rc'])) { arsort($c['rc']); $c['top_rclick_els'] = array_slice($c['rc'], 0, 8, true); }
  // Survol-hésitation : élément le plus regardé-sans-clic + dwell moyen (ms).
  if (!empty($c['hv'])) {
    uasort($c['hv'], function($x, $y){ return ($y['n'] ?? 0) - ($x['n'] ?? 0); });
    $topH = array_slice($c['hv'], 0, 8, true);
    foreach ($topH as $desc => &$o) { $o['avg_ms'] = (!empty($o['n']) ? (int)round($o['ms'] / $o['n']) : 0); }
    unset($o);
    $c['top_hover_els'] = $topH;
  }
}
unset($c);
// Écrans triés par volume de clics décroissant (le + cliqué en tête).
uasort($out['clicks'], function($x, $y){ return ($y['n'] ?? 0) - ($x['n'] ?? 0); });

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
  // Capture-mode (gate email) : comptés depuis les events bruts par région ($a['events']).
  $gv = $a['events']['sg_capture_gate_view'] ?? 0;
  $gs = $a['events']['sg_capture_gate_submit'] ?? 0;
  $gu = $a['events']['sg_gap_freemium_unlock'] ?? 0;
  $gp = $a['events']['sg_capture_gate_pay'] ?? 0;
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
      'gate_view'        => $gv,
      'gate_submit'      => $gs,
      'gate_unlock'      => $gu,
      'gate_cb'          => $gp,
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
      // CAPTURE MODE : la gate email intercepte modal_open (~85% du forecast-intent,
      // `return` avant setShowPremium) → modal_to_cta ci-dessus est MÉCANIQUEMENT déflaté
      // (artefact de mesure, pas une régression d'offre). On mesure la gate à part + un
      // taux d'intention dé-biaisé (gate views comptées comme intention premium).
      'gate_capture_rate'    => $gv ? round(100 * $gs / $gv, 1) : 0,
      'gate_to_cb'           => $gv ? round(100 * $gp / $gv, 1) : 0,
      'intent_to_action'     => ($modal + $gv) ? round(100 * ($cta + $gs + $gp) / ($modal + $gv), 1) : 0,
    ),
    'bored_rate' => round($a['screens_bored'] / $sv, 3),
    'avg_dwell_ms' => round($a['screens_dwell'] / $sv),
    // FRICTION : rage-clicks (sg_friction) = "ça marche pas / bloqué" — alerte UX.
    'friction' => $a['events']['sg_friction'] ?? 0,
    'top_events' => array_slice($a['events'], 0, 8, true),
  );
}
// Régions triées par sessions décroissantes (la plus active en tête).
uasort($out['byRegion'], function($x, $y){ return $y['sessions'] - $x['sessions']; });

// A/B breakdown : par test, par variante -> % de sessions atteignant chaque event funnel
// + engagement (dwell, ennui). L'outil ab-eval lit ça pour sortir le verdict par test.
$out['ab_breakdown'] = array();
foreach ($abx as $test => $vars) {
  $row = array();
  foreach ($vars as $variant => $a) {
    $s = max(1, $a['sessions']);
    $rates = array();
    foreach ($FUNNEL as $step) {
      if (isset($a['ev'][$step])) $rates[$step] = round(100 * $a['ev'][$step] / $s, 2);
    }
    $vis = max(1, $a['visits']);
    $row[$variant] = array(
      'sessions'     => $a['sessions'],
      'rates_pct'    => $rates,
      'avg_dwell_ms' => round($a['dwell'] / $vis),
      'bored_rate'   => round($a['bored'] / $vis, 3),
    );
  }
  // variantes triées par nb de sessions (la + exposée en tête)
  uasort($row, function($x, $y){ return $y['sessions'] - $x['sessions']; });
  $out['ab_breakdown'][$test] = $row;
}

// INSTALLS WIDGET B2B : combien de chargements, depuis quels DOMAINES hôtes (= qui nous
// embarque), pour quelles plages. distinctHosts = nombre de sites tiers qui affichent le widget.
arsort($W['byHost']);
arsort($W['byBeach']);
$out['widget'] = array(
  'total'        => $W['total'],
  'distinctHosts'=> count($W['byHost']),
  'byHost'       => $W['byHost'],
  'byBeach'      => $W['byBeach'],
  'last'         => $W['last'],
);

// P5 — ATTRIBUTION CANAL : quelle source d'acquisition convertit/engage le mieux.
$out['channels'] = array();
foreach ($chan as $c => $a) {
  $s = max(1, $a['sessions']);
  $out['channels'][$c] = array(
    'sessions'       => $a['sessions'],
    'conversion'     => $a['conversion'],
    'modal_cta'      => $a['modal_cta'],
    'email'          => $a['email'],
    'conv_rate_pct'  => round(100 * $a['conversion'] / $s, 2),
    'cta_rate_pct'   => round(100 * $a['modal_cta'] / $s, 2),
    'email_rate_pct' => round(100 * $a['email'] / $s, 2),
  );
}
uasort($out['channels'], function($x, $y){ return $y['sessions'] - $x['sessions']; });

// P4 — COHORTE PAR RANG DE VISITE : les visiteurs qui reviennent convertissent-ils mieux ?
// Rang = position de la session dans la suite (ordonnée par ts) des sessions du même cid
// VUES DANS LA FENÊTRE. Approximation honnête : une « 1re visite » ici peut avoir des
// visites antérieures hors fenêtre — d'où le buckets 1 / 2 / 3+ et la note.
$rankBuckets = array(
  '1'     => array('sessions'=>0,'conversion'=>0,'cta'=>0),
  '2'     => array('sessions'=>0,'conversion'=>0,'cta'=>0),
  '3plus' => array('sessions'=>0,'conversion'=>0,'cta'=>0),
);
foreach ($cidSeq as $arr) {
  usort($arr, function($x, $y){ return $x['ts'] - $y['ts']; });
  foreach ($arr as $i => $sess) {
    $rk = $i === 0 ? '1' : ($i === 1 ? '2' : '3plus');
    $rankBuckets[$rk]['sessions']++;
    if ($sess['conv']) $rankBuckets[$rk]['conversion']++;
    if ($sess['cta'])  $rankBuckets[$rk]['cta']++;
  }
}
foreach ($rankBuckets as &$b) {
  $s = max(1, $b['sessions']);
  $b['conv_rate_pct'] = round(100 * $b['conversion'] / $s, 2);
  $b['cta_rate_pct']  = round(100 * $b['cta'] / $s, 2);
}
unset($b);
$out['cohort_visit_rank'] = array(
  'note'    => 'Rang de visite par cid DANS la fenêtre (?days). Une 1re visite ici peut avoir des visites antérieures hors fenêtre — comparer les TAUX entre rangs, pas les volumes absolus. conv = sg_conversion (sous-compte en absolu) ; cta = sg_premium_modal_cta (intention fiable).',
  'distinct_cids' => count($cidSeq),
  'buckets' => $rankBuckets,
);

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
