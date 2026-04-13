<?php
// Stripe config — DO NOT COMMIT REAL VALUES.
// Copy to stripe-config.php and fill in live keys. The real file is gitignored
// and blocked from HTTP via public/api/.htaccess (`Require all denied`).
// Deploy manually via FTP to both martinique-ftp/api/ and guadeloupe-ftp/api/.
return [
    'sk'         => 'sk_live_REPLACE_ME',
    'resend_key' => 're_REPLACE_ME',
    'prices' => [
        'monthly' => 'price_REPLACE_ME',
        'annual'  => 'price_REPLACE_ME',
        'season'  => 'price_REPLACE_ME',
    ],
];
