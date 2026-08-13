<?php
// GÉNÉRÉ par scripts/write-mollie-config.cjs au déploiement — NE PAS COMMITTER, NE PAS ÉDITER.
// api_key = secret GitHub MOLLIE_API_KEY. Bloqué en HTTP via api/.htaccess (Require all denied).
return [
    'api_key'    => "live_H6BUh7uxdUkFKAnBQhz3tRVsuerNPs",
    'profile_id' => 'pfl_t8KCk4Cm2C',
    'resend_key' => '',
    'webhook_secret' => 'test_secret_for_local_only',
    'subscription' => [
        'monthly' => ['amount' => '4.99',  'currency' => 'EUR', 'interval' => '1 month'],
        'annual'  => ['amount' => '49.00', 'currency' => 'EUR', 'interval' => '12 months'],
    ],
    'passes' => [
        'trip7'  => ['cents' => 499,  'days' => 7,   'label' => 'Pass 7 jours (séjour)'],
        'season' => ['cents' => 1999, 'days' => 210, 'label' => 'Pass saison'],
        'p30'    => ['cents' => 1499, 'days' => 30,  'label' => 'Pass 30 jours'],
    ],
];