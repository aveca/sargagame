<?php
/**
 * verify-mollie-config.php — Vérification de présence des variables de config Mollie/Supabase.
 *
 * Affiche UNIQUEMENT des statuts OK / MISSING / EMPTY — JAMAIS les valeurs des secrets.
 * Destiné à être exécuté après provisionnement pour valider que chaque variable est présente.
 *
 * Usage : php scripts/verify-mollie-config.php [chemin/vers/mollie-config.php]
 *         Défaut : public/api/mollie-config.php
 */

declare(strict_types=1);

$configPath = $argv[1] ?? __DIR__ . '/../public/api/mollie-config.php';

if (!file_exists($configPath)) {
    echo "MISSING: fichier de config introuvable : $configPath\n";
    exit(2);
}

/**
 * Charge le fichier de config de manière sûre.
 * Retourne un tableau associatif ou un tableau vide en cas d'erreur.
 */
function loadConfig(string $path): array {
    $cfg = @include $path;
    return is_array($cfg) ? $cfg : [];
}

$cfg = loadConfig($configPath);

// Clés attendues et leur source de vérité
$expected = [
    'api_key'             => 'MOLLIE_API_KEY (clé API Mollie)',
    'webhook_secret'      => 'MOLLIE_WEBHOOK_SECRET (signature webhook)',
    'profile_id'          => 'MOLLIE_PROFILE_ID (profil de paiement)',
    'supabase_service_key'=> 'SUPABASE_SERVICE_KEY (service_role Supabase)',
    'resend_key'          => 'RESEND_KEY (emails transactionnels)',
];

$exitCode = 0;
foreach ($expected as $key => $label) {
    $value = $cfg[$key] ?? null;
    if ($value === null || $value === '') {
        echo "MISSING: $key ($label) — absent ou vide\n";
        $exitCode = 1;
    } else {
        echo "OK:       $key ($label) — présent\n";
    }
}

// Vérification spécifique : webhook_secret non vide (requis pour fail-closed)
if (empty($cfg['webhook_secret'] ?? '')) {
    echo "ALERTE: webhook_secret absent → mollie-webhook.php retournera 503\n";
    $exitCode = 1;
}

// Vérification spécifique : supabase_service_key (si absent, verify_subscription → lookup_failed)
if (empty($cfg['supabase_service_key'] ?? '')) {
    echo "ALERTE: supabase_service_key absent → verify_subscription retournera lookup_failed (best-effort uniquement)\n";
    // Pas d'erreur fatale : best-effort préservé, mais signalé
}

echo "\n";
echo ($exitCode === 0) ? "RÉSULTAT : toutes les variables requises sont présentes.\n" : "RÉSULTAT : au moins une variable manquante — provisionnement incomplet.\n";
exit($exitCode);