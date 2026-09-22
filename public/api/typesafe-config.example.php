<?php
/**
 * typesafe-config.example.php — gabarit (commiter OK). La vraie clé :
 *   public/api/typesafe-config.php (gitignored) OU env TYPESAFE_API_KEY (CI/serveur).
 * JAMAIS de clé dans le repo, le frontend, les logs.
 */
return [
    'api_key' => 'REMPLACER_PAR_LA_CLE_LIVE',
    'mode'    => 'on', // 'off' = kill switch (endpoint renvoie fallback, produit intact)
];
