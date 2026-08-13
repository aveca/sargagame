<?php
// Stripe config — ce fichier est bloque par .htaccess (acces direct interdit)
return [
    'sk' => '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',
    'resend_key' => 're_dcpGouua_5Fj62VY6BQm1aTgVFAHvUqwF',
    'webhook_secret' => 'whsec_i6HrJ0HRFjx4oF1hkwSaUrvdFj0DmOoo',
    'prices' => [
        'monthly' => 'price_1TJ6dyP9RK8Orx51HK6tQCBu', // 4.99 EUR/mois
        'annual'  => 'price_1TJ6dGP9RK8Orx51m2PrTz13',  // 39.99 EUR/an
        'season'  => 'price_1TJgClP9RK8Orx51b3dLz3Xx',      // 19.99 EUR pass saison (avr-sep, 6 mois)
        'pro_widget_monthly' => 'price_1Tkp8pP9RK8Orx516ZDsHyhN', // 29 EUR/mois — widget hotel PRO (B2B self-serve, prod_UkJmpcnIxHwzb7)
        'pro_widget_annual'  => 'price_1Tkp8pP9RK8Orx51uc7nb5lX', // 199 EUR/an — widget hotel PRO (B2B self-serve)
    ],
    // Prix par région pour le checkout embedded (mêmes prices que les
    // Payment Links — extraits via l'API le 2026-06-10).
    'prices_by_region' => [
        'mq'          => ['monthly' => 'price_1TJ6dyP9RK8Orx51HK6tQCBu', 'annual' => 'price_1TJ6dGP9RK8Orx51m2PrTz13'],
        'gp'          => ['monthly' => 'price_1TJ6dyP9RK8Orx51HK6tQCBu', 'annual' => 'price_1TJ6dGP9RK8Orx51m2PrTz13'],
        'puntacana'   => ['monthly' => 'price_1TgafPP9RK8Orx51o5YrMcgd', 'annual' => 'price_1TgafPP9RK8Orx51lGuQvBUQ'],
        'florida'     => ['monthly' => 'price_1Tgc8SP9RK8Orx51I3pK41W7', 'annual' => 'price_1Tgc8SP9RK8Orx515NtJzugN'],
        'rivieramaya' => ['monthly' => 'price_1Tgc8UP9RK8Orx51RYjh5Qpy', 'annual' => 'price_1Tgc8VP9RK8Orx515ZK16pl4'],
    ],
];
