<?php
// Stripe config — DO NOT COMMIT REAL VALUES.
// Copy to stripe-config.php and fill in live keys. The real file is gitignored
// and blocked from HTTP via public/api/.htaccess (`Require all denied`).
// Deploy manually via FTP to both martinique-ftp/api/ and guadeloupe-ftp/api/.
return [
    'sk'         => 'sk_live_REPLACE_ME',
    'resend_key' => 're_REPLACE_ME',
    // Signing secret du webhook Stripe (dashboard → Developers → Webhooks →
    // endpoint /api/stripe-webhook.php). Si un stripe-config.php est DEJA
    // deploye, ajouter simplement cette ligne dedans :
    'webhook_secret' => 'whsec_REPLACE_ME',
    // Optionnel (tests/staging) : override de l'URL Apps Script du forward
    // webhook. Defaut = deployment canonique (voir stripe-webhook.php).
    // 'appsscript_url' => 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec',
    'prices' => [
        'monthly' => 'price_REPLACE_ME',
        'annual'  => 'price_REPLACE_ME',
        'season'  => 'price_REPLACE_ME',
    ],
];
