<?php
// PayPal config — DO NOT COMMIT REAL VALUES.
// Copy to paypal-config.php and fill in live creds. The real file is gitignored
// (**/paypal-config.php) and blocked from HTTP via public/api/.htaccess
// (`Require all denied`). Deploy manually via FTP to each region's api/ dir
// (martinique-ftp/api/, guadeloupe-ftp/api/, …), exactly like stripe-config.php.
//
// Where each value comes from (PayPal Developer dashboard → Apps & Credentials) :
//   client_id / secret  → your REST API app (Sandbox tab for tests, Live tab for prod)
//   env                 → 'sandbox' while testing, 'live' once validated
//   webhook_id          → Developer → Webhooks → your endpoint (/api/paypal-webhook.php)
//   plans               → billing plan IDs (P-xxxx) created once for the monthly/annual
//                         subscription. Generate with scripts/create-paypal-plans.cjs
//                         (or PayPal dashboard → Pay & get paid → Subscriptions).
return [
    'env'        => 'sandbox',            // 'sandbox' | 'live' — switches the API base URL
    'client_id'  => 'PAYPAL_CLIENT_ID',   // public — also injected into the JS SDK on the front
    'secret'     => 'PAYPAL_SECRET',      // SECRET — server only, never shipped to the browser
    'webhook_id' => 'PAYPAL_WEBHOOK_ID',  // for paypal-webhook.php signature verification

    // Resend (welcome email post-paiement) — réutilise la même clé que stripe-config.php.
    // Laisser vide pour désactiver l'email (le déblocage premium ne dépend pas de l'email).
    'resend_key' => 're_REPLACE_ME',

    // Optionnel : override de l'URL Apps Script (forward fulfillment). Défaut =
    // déploiement canonique (même que stripe-webhook.php / create-checkout.php).
    // 'appsscript_url' => 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec',

    // Billing plan IDs des abonnements récurrents. Plat = fallback EUR (MQ/GP).
    // Par région si tu crées des plans USD séparés (Florida/Cancún/PuntaCana).
    'plans' => [
        'monthly' => 'P-REPLACE_ME_MONTHLY',
        'annual'  => 'P-REPLACE_ME_ANNUAL',
    ],
    // 'plans_by_region' => [
    //     'florida'   => ['monthly' => 'P-...', 'annual' => 'P-...'],
    //     'rivieramaya' => ['monthly' => 'P-...', 'annual' => 'P-...'],
    //     'puntacana' => ['monthly' => 'P-...', 'annual' => 'P-...'],
    // ],
];
