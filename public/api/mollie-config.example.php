<?php
// Mollie config — DO NOT COMMIT REAL VALUES.
// Copy to mollie-config.php and fill in. The real file is gitignored
// (**/mollie-config.php) and blocked from HTTP via public/api/.htaccess
// (`Require all denied`). Deploy manually via FTP to each region's api/ dir
// (martinique-ftp/api/, guadeloupe-ftp/api/, …), like stripe-config.php.
//
// MODE = the api_key PREFIX. test_... = test mode (no real money),
// live_... = real charges. Switching to live = swap the key. There is NO
// separate env flag (unlike PayPal/Stripe) — Mollie infers it from the prefix.
return [
    'api_key'    => 'test_REPLACE_ME',   // test_ | live_ — SECRET, server only, never shipped to the browser
    'profile_id' => 'pfl_REPLACE_ME',    // PUBLIC — injected into mollie.js on the front (Components on-site)
    'resend_key' => '',                  // welcome email (optionnel, réutilise la clé Resend ; vide = pas d'email)
    // 'appsscript_url' => 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec',

    // Montants des abonnements récurrents. Mollie crée les subscriptions INLINE
    // (amount + interval), PAS de plan_id pré-créé comme PayPal. La présence de
    // l'entrée = allowlist serveur (anti-tampering : un montant forgé est rejeté).
    'subscription' => [
        'monthly' => ['amount' => '4.99',  'currency' => 'EUR', 'interval' => '1 month'],
        'annual'  => ['amount' => '39.99', 'currency' => 'EUR', 'interval' => '12 months'],
    ],
    // Passes one-time (SANS abonnement). cents = allowlist anti-tampering ; days = durée d'accès.
    'passes' => [
        'saison' => ['cents' => 1999, 'days' => 180, 'label' => 'Pass saison'],   // 19,99 € · 6 mois
        'p7'     => ['cents' => 799,  'days' => 7,   'label' => 'Pass 7 jours'],
        'p30'    => ['cents' => 1499, 'days' => 30,  'label' => 'Pass 30 jours'],
    ],
];
