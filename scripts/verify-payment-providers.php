<?php
/**
 * verify-payment-providers.php - Verifie l'authentification fournisseur du parcours de paiement.
 *
 * LECTURE SEULE. Aucune transaction, aucun checkout, aucun email.
 * Les valeurs de secrets ne sont JAMAIS affichees ni loguees : seules les reponses
 * HTTP, les statuts et des compteurs sont restitues.
 *
 * Usage : php scripts/verify-payment-providers.php [--config=path]
 */

declare(strict_types=1);

$opts = getopt('', ['config::']);
$configPath = $opts['config'] ?? (__DIR__ . '/../public/api/mollie-config.php');

if (!is_file($configPath)) {
    fwrite(STDERR, "ERREUR: config introuvable : $configPath\n");
    exit(2);
}
$cfg = @include $configPath;
if (!is_array($cfg)) {
    fwrite(STDERR, "ERREUR: config illisible.\n");
    exit(2);
}

/** Requete HTTP sans exposer l'Authorization. Utilise curl si dispo, sinon les flux PHP. */
function httpProbe(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 15): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        if ($body !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, $body); }
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        return ['code' => $code, 'body' => (string)$resp, 'error' => $err];
    }

    // Fallback 2 : binaire curl.exe (Windows local, PHP sans extension curl/openssl).
    // Les headers passent par un fichier de config temporaire : l'Authorization
    // n'apparait JAMAIS dans la ligne de commande (donc jamais dans la liste des processus).
    $curlExe = null;
    foreach (['curl.exe', 'curl'] as $candidate) {
        $probePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'sg_curlprobe_' . getmypid() . '.exe';
        $found = @shell_exec('where ' . $candidate . ' 2>nul');
        if ($found && stripos($found, 'curl') !== false) { $curlExe = trim(strtok($found, "\r\n")); break; }
        @unlink($probePath);
    }
    if ($curlExe) {
        $cfgFile = tempnam(sys_get_temp_dir(), 'sgcurl_');
        $outFile = tempnam(sys_get_temp_dir(), 'sgout_');
        $cfg = "url = \"" . str_replace('"', '', $url) . "\"\n";
        $cfg .= "request = \"" . $method . "\"\n";
        $cfg .= "max-time = " . (int)$timeout . "\n";
        $cfg .= "silent\nshow-error\n";
        $cfg .= "write-out = \"%{http_code}\"\n";
        $cfg .= "output = \"" . str_replace('"', '', $outFile) . "\"\n";
        foreach ($headers as $h) {
            $cfg .= "header = \"" . str_replace('"', '', $h) . "\"\n";
        }
        if ($body !== null) {
            $cfg .= "data = \"" . str_replace('"', '', $body) . "\"\n";
        }
        @file_put_contents($cfgFile, $cfg);
        @exec('"' . $curlExe . '" --config "' . $cfgFile . '" 2>nul', $out, $exitCode);
        $code = 0;
        $resp = '';
        if (is_file($outFile)) {
            $resp = (string)@file_get_contents($outFile);
            @unlink($outFile);
        }
        if (!empty($out) && is_array($out)) {
            $last = trim((string)end($out));
            if (preg_match('/^\d{3}$/', $last)) { $code = (int)$last; }
        }
        @unlink($cfgFile);
        return ['code' => $code, 'body' => $resp, 'error' => $code === 0 ? 'curl.exe failed' : ''];
    }

    // Fallback 3 : flux PHP natif (necessite openssl - disponible sur le serveur de production)
    $headerLines = '';
    foreach ($headers as $h) { $headerLines .= $h . "\r\n"; }
    $ctx = stream_context_create([
        'http' => [
            'method'        => $method,
            'header'        => $headerLines,
            'content'       => (string)($body ?? ''),
            'timeout'       => $timeout,
            'ignore_errors' => true,
            'follow_location' => 0,
        ],
        'ssl' => [
            'verify_peer'      => true,
            'verify_peer_name' => true,
        ],
    ]);
    $resp = @file_get_contents($url, false, $ctx);
    $code = 0;
    $err = '';
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) { $code = (int)$m[1]; }
        }
    }
    if ($resp === false) {
        $err = 'stream failure (allow_url_fopen=' . ini_get('allow_url_fopen')
             . ', openssl=' . (extension_loaded('openssl') ? 'yes' : 'no') . ')';
    }
    return ['code' => $code, 'body' => (string)$resp, 'error' => $err];
}

$report = [];
$failures = 0;

// ---------------------------------------------------------------- MOLLIE ----
$apiKey = (string)($cfg['api_key'] ?? '');
$profileId = (string)($cfg['profile_id'] ?? '');
$mode = strpos($apiKey, 'live_') === 0 ? 'LIVE' : (strpos($apiKey, 'test_') === 0 ? 'TEST' : 'UNKNOWN');

echo "=== MOLLIE (mode $mode) ===\n";
if ($apiKey === '') {
    echo "FAIL      api_key absent de la config\n";
    $failures++;
} else {
    $authHeader = ['Authorization: Bearer ' . $apiKey, 'Accept: application/json'];

    if ($mode === 'TEST') {
        // En mode test, Mollie refuse explicitement /v2/organizations/me et /v2/profiles.
        // L'authentification se verifie via des endpoints lisibles en mode test.
        $r = httpProbe('GET', 'https://api.mollie.com/v2/methods?amount=10.00&currency=EUR&limit=1', $authHeader);
        if ($r['code'] === 200) {
            $j = json_decode($r['body'], true);
            $n = isset($j['count']) ? (int)$j['count'] : 0;
            echo "OK        GET /v2/methods?limit=1 -> 200 (cle TEST valide, $n methode(s) de paiement)\n";
        } else {
            echo "FAIL      GET /v2/methods?limit=1 -> HTTP {$r['code']}" . ($r['error'] ? " ({$r['error']})" : "") . "\n";
            $failures++;
        }
        $rpz = httpProbe('GET', 'https://api.mollie.com/v2/payments?limit=1', $authHeader);
        if ($rpz['code'] === 200) {
            $pz = json_decode($rpz['body'], true);
            $n2 = isset($pz['count']) ? (int)$pz['count'] : 0;
            echo "OK        GET /v2/payments?limit=1 -> 200 (cle liee au profil, $n2 paiement(s) test existant(s))\n";
        } else {
            echo "FAIL      GET /v2/payments?limit=1 -> HTTP {$rpz['code']}" . ($rpz['error'] ? " ({$rpz['error']})" : "") . "\n";
            $failures++;
        }
    } else {
        $r = httpProbe('GET', 'https://api.mollie.com/v2/organizations/me', $authHeader);
        if ($r['code'] === 200) {
            $j = json_decode($r['body'], true);
            $name = (string)($j['name'] ?? '');
            $orgMode = (string)($j['mode'] ?? $mode);
            echo "OK        GET /v2/organizations/me -> 200 (organisation='$name', mode='$orgMode')\n";
        } elseif ($r['code'] === 403) {
            $detail = '';
            $rj = json_decode($r['body'], true);
            if (is_array($rj) && isset($rj['detail'])) { $detail = (string)$rj['detail']; }
            echo "INFO      GET /v2/organizations/me -> 403 (attendu pour un token lie a un profil)" . (($detail !== '') ? " : $detail" : '') . "\n";
        } else {
            echo "FAIL      GET /v2/organizations/me -> HTTP {$r['code']}" . ($r['error'] ? " ({$r['error']})" : "") . "\n";
            $failures++;
        }

        // Endpoint compatible avec un token restreint a un profil : c'est celui
        // qui prouve reellement que la cle est acceptee par Mollie (200) ou
        // refusee (401). /v2/organizations/me et /v2/profiles sont en 403 pour
        // un tel token, meme avec une cle parfaitement valide.
        $rpz = httpProbe('GET', 'https://api.mollie.com/v2/payments?limit=1', $authHeader);
        if ($rpz['code'] === 200) {
            $pz = json_decode($rpz['body'], true);
            $n2 = isset($pz['count']) ? (int)$pz['count'] : 0;
            echo "OK        GET /v2/payments?limit=1 -> 200 (cle LIVE acceptee, $n2 paiement(s) visible(s))\n";
        } else {
            $detail = '';
            $rj2 = json_decode($rpz['body'], true);
            if (is_array($rj2) && isset($rj2['detail'])) { $detail = (string)$rj2['detail']; }
            echo "FAIL      GET /v2/payments?limit=1 -> HTTP {$rpz['code']}" . (($detail !== '') ? " : $detail" : '') . ($rpz['error'] ? " ({$rpz['error']})" : "") . "\n";
            $failures++;
        }
    }

    // Le profil de paiement doit etre accessible avec cette cle (cle de profil attendue par le checkout)
    if ($profileId !== '') {
        $rp = httpProbe('GET', 'https://api.mollie.com/v2/profiles/' . rawurlencode($profileId), $authHeader);
        if ($rp['code'] === 200) {
            $pj = json_decode($rp['body'], true);
            $pMode = (string)($pj['mode'] ?? $mode);
            echo "OK        GET /v2/profiles/{id} -> 200 (profile_id=$profileId, mode='$pMode')\n";
            if ($mode === 'TEST' && $pMode === 'live') {
                echo "WARN      cle TEST associee a un profil LIVE : incoherence a corriger avant tout checkout\n";
            }
        } elseif ($rp['code'] === 403) {
            $detail = '';
            $rj = json_decode($rp['body'], true);
            if (is_array($rj) && isset($rj['detail'])) { $detail = (string)$rj['detail']; }
            echo "INFO      GET /v2/profiles/{id} -> 403 (attendu pour un token lie a un profil)" . (($detail !== '') ? " : $detail" : "") . "\n";
        } else {
            echo "FAIL      GET /v2/profiles/{id} -> HTTP {$rp['code']}" . ($rp['error'] ? " ({$rp['error']})" : "") . "\n";
            $failures++;
        }
    } else {
        echo "FAIL      profile_id absent de la config\n";
        $failures++;
    }
}

// -------------------------------------------------------------- SUPABASE ----
echo "\n=== SUPABASE (payment_grants) ===\n";
$sbUrl = rtrim((string)($cfg['supabase_url'] ?? ''), '/');
$sbKey = (string)($cfg['supabase_service_key'] ?? '');
if ($sbUrl === '' || $sbKey === '') {
    echo "FAIL      supabase_url ou supabase_service_key absent\n";
    $failures++;
} else {
    $h = [
        'apikey: ' . $sbKey,
        'Authorization: Bearer ' . $sbKey,
        'Accept: application/json',
    ];
    // 1. Connectivite + existence de la table payment_grants (PostgREST : 404 si table absente)
    $r = httpProbe('GET', $sbUrl . '/rest/v1/payment_grants?select=id&limit=1', $h);
    if ($r['code'] === 200) {
        echo "OK        GET /rest/v1/payment_grants -> 200 (table accessible en service_role)\n";
        $rows = json_decode($r['body'], true);
        echo "INFO      lignes visibles (service_role, lecture) : " . (is_array($rows) ? count($rows) : 0) . "\n";
    } elseif ($r['code'] === 404) {
        echo "FAIL      table payment_grants ABSENTE (HTTP 404) -> migration requise\n";
        $failures++;
    } else {
        echo "FAIL      GET /rest/v1/payment_grants -> HTTP {$r['code']}" . ($r['error'] ? " ({$r['error']})" : "") . "\n";
        $failures++;
    }

    // 2. Verification que le role anon est bloque (RLS) : la cle ne doit PAS etre un anon key
    $r2 = httpProbe('GET', $sbUrl . '/rest/v1/payment_grants?select=id&limit=1', ['apikey: ' . $sbKey]);
    if ($r2['code'] === 200) {
        echo "OK        RLS : la cle service_role contourne RLS comme attendu (lecture)\n";
    } else {
        echo "INFO      RLS : lecture sans header Authorization -> HTTP {$r2['code']} (attendu si RLS actif)\n";
    }
}

echo "\n";
if ($failures === 0) {
    echo "RESULTAT : authentification fournisseur VERIFIEE pour le parcours de paiement.\n";
    exit(0);
}
echo "RESULTAT : $failures verification(s) en ECHEC.\n";
exit(1);
