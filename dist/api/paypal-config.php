<?php
// PayPal config — REMPLIS LES 2 VALEURS ci-dessous (client_id + secret).
// Gitignored (**/paypal-config.php) + bloqué HTTP (.htaccess). Ne se commit jamais.
//
// 'env' : 'sandbox' pour TESTER (zéro argent réel) | 'live' pour ENCAISSER.
//         On commence en sandbox, on bascule 'live' quand le test passe.
return [
    'env'        => 'live',                 // <- 'sandbox' (test) puis 'live' (réel)
    'client_id'  => 'AadXarqTbu1KiLVh89ESKJ9tIXn-RZ_2U43fDU8lnQ3TgzChda6ZPVZKbpyqO70ySqerJIDXLUyFukSI', // live
    'secret'     => 'EH3_iyc1ZPOJMfjTQ1dLcpheATh4-OrDdfXLQI71Jgq8osYShr7fHU91PzTrH6ikuD76qf6LXwUE1GX1', // live

    'webhook_id' => 'PAYPAL_WEBHOOK_ID',       // (plus tard : après création du webhook)
    'resend_key' => '',                        // (optionnel : email de bienvenue)

    // Plans de facturation récurrents — JE les remplis automatiquement quand je
    // lance scripts/create-paypal-plans.cjs (ne touche pas à ces lignes).
    'plans' => [
        'monthly' => 'P-68F60416PW205280SNI474LI',
        'annual'  => 'P-2B698370FU622014SNI474LI',
    ],
];
