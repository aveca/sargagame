<?php
/**
 * provision-mollie-config.php — Provisionne les secrets d'un fichier mollie-config.php
 * a partir de variables d'environnement, sans jamais afficher ni logger les valeurs.
 *
 * Usage (via scripts/provision-local-mollie-config.ps1 ou manuellement) :
 *   setx / $env:SG_PROV_API_KEY=...        (Mollie api_key)
 *   $env:SG_PROV_WEBHOOK_SECRET=...        (signature webhook)
 *   $env:SG_PROV_PROFILE_ID=...            (profil de paiement)
 *   $env:SG_PROV_SUPABASE_URL=...          (URL projet Supabase)
 *   $env:SG_PROV_SUPABASE_SERVICE_KEY=...  (cle service_role Supabase)
 *   $env:SG_PROV_RESEND_KEY=...            (Resend)
 *   php scripts/provision-mollie-config.php [--config=path] [--backup-dir=path] [--dry-run]
 *
 * Sortie : rapport JSON par cle { "set": bool, "len": int, "fp": sha256[0:12] }.
 * Les valeurs ne sont JAMAIS sorties, JAMAIS loguees.
 */

declare(strict_types=1);

$opts = getopt('', ['config::', 'backup-dir::', 'dry-run']);
$configPath = $opts['config'] ?? (__DIR__ . '/../public/api/mollie-config.php');
$backupDir  = $opts['backup-dir'] ?? (__DIR__ . '/../.vault/backups');
$dryRun     = array_key_exists('dry-run', $opts);

// Mapping : variable d'environnement => cle de configuration
$map = [
    'SG_PROV_API_KEY'               => 'api_key',
    'SG_PROV_WEBHOOK_SECRET'        => 'webhook_secret',
    'SG_PROV_PROFILE_ID'            => 'profile_id',
    'SG_PROV_SUPABASE_URL'          => 'supabase_url',
    'SG_PROV_SUPABASE_SERVICE_KEY'  => 'supabase_service_key',
    'SG_PROV_RESEND_KEY'            => 'resend_key',
];

// 1. Charger la config existante (structure) ou le template
$cfg = [];
if (is_file($configPath)) {
    $loaded = @include $configPath;
    if (is_array($loaded)) { $cfg = $loaded; }
}
if (!$cfg) {
    $example = __DIR__ . '/../public/api/mollie-config.example.php';
    if (is_file($example)) {
        $loaded = @include $example;
        if (is_array($loaded)) { $cfg = $loaded; }
    }
}
if (!$cfg) {
    fwrite(STDERR, "ERREUR: impossible de charger la config existante ni le template.\n");
    exit(2);
}

// 2. Appliquer les secrets depuis l'environnement
$report = [];
$changed = 0;
foreach ($map as $envName => $cfgKey) {
    $value = getenv($envName);
    if ($value === false || $value === '') {
        $report[$cfgKey] = ['set' => false, 'len' => 0, 'fp' => 'none'];
        continue;
    }
    $old = (string)($cfg[$cfgKey] ?? '');
    $isNew = ($old !== $value);
    if ($isNew) { $changed++; }
    $cfg[$cfgKey] = $value;
    $report[$cfgKey] = [
        'set'   => true,
        'len'   => strlen($value),
        'fp'    => substr(hash('sha256', $value), 0, 12),
        'rotated' => $isNew,
    ];
    unset($value);
}

// 3. Ecriture (sauf dry-run)
if ($dryRun) {
    echo json_encode(['dry_run' => true, 'changed' => $changed, 'keys' => $report], JSON_PRETTY_PRINT), "\n";
    exit(0);
}

// 4. Backup avant ecriture
if (is_file($configPath)) {
    if (!is_dir($backupDir) && !@mkdir($backupDir, 0700, true) && !is_dir($backupDir)) {
        fwrite(STDERR, "ERREUR: impossible de creer le dossier de backup.\n");
        exit(3);
    }
    $stamp = gmdate('Ymd-His');
    $backupPath = rtrim($backupDir, '/\\') . DIRECTORY_SEPARATOR . 'mollie-config-' . $stamp . '.php.bak';
    if (!@copy($configPath, $backupPath)) {
        fwrite(STDERR, "ERREUR: impossible de creer la sauvegarde. Abandon (aucune ecriture).\n");
        exit(3);
    }
    echo json_encode(['backup' => basename($backupPath)]), "\n";
}

// 5. Serialisation du fichier de config
$export = function (array $data): string {
    $out = "<?php\n";
    $out .= "// Mollie config - GENERE PAR scripts/provision-mollie-config.php - NE PAS COMMITTER.\n";
    $out .= "// Secrets injectes depuis Windows Credential Manager (SARGAGAME_*).\n";
    $out .= "// Fichier gitignore (**/mollie-config.php) et bloque en HTTP via api/.htaccess.\n";
    $out .= "return [\n";
    foreach ($data as $k => $v) {
        if (is_array($v)) {
            $out .= "    '" . addslashes((string)$k) . "' => [\n";
            foreach ($v as $k2 => $v2) {
                if (is_array($v2)) {
                    $parts = [];
                    foreach ($v2 as $k3 => $v3) {
                        $parts[] = "'" . addslashes((string)$k3) . "' => " . var_export($v3, true);
                    }
                    $out .= "        '" . addslashes((string)$k2) . "' => [" . implode(', ', $parts) . "],\n";
                } else {
                    $out .= "        '" . addslashes((string)$k2) . "' => " . var_export($v2, true) . ",\n";
                }
            }
            $out .= "    ],\n";
        } else {
            $out .= "    '" . addslashes((string)$k) . "' => " . var_export($v, true) . ",\n";
        }
    }
    $out .= "];\n";
    return $out;
};

$php = $export($cfg);
$tmp = $configPath . '.tmp';
if (@file_put_contents($tmp, $php) === false) {
    fwrite(STDERR, "ERREUR: echec d'ecriture du fichier temporaire.\n");
    exit(4);
}
if (!@rename($tmp, $configPath)) {
    @unlink($tmp);
    fwrite(STDERR, "ERREUR: echec du renommage (config inchangee).\n");
    exit(4);
}

echo json_encode(['written' => basename($configPath), 'changed' => $changed, 'keys' => $report], JSON_PRETTY_PRINT), "\n";
exit(0);
