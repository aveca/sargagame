<?php
// Mollie config — DO NOT COMMIT REAL VALUES.
// Template for deployment: scripts/write-mollie-config.cjs reads
// MOLLIE_API_KEY + MOLLIE_WEBHOOK_SECRET from GitHub Secrets and
// generates the real mollie-config.php (gitignored, blocked from HTTP via .htaccess).
return [
    'api_key'       => 'live_REPLACE_ME',   // test_ | live_ — SECRET, server only, never shipped to the browser
    'webhook_secret' => 'whsec_REPLACE_ME', // HMAC secret for webhook signature verification (Mollie dashboard → Webhooks → Secret)
    'profile_id'    => 'pfl_t8KCk4Cm2C',    // PUBLIC — injected into mollie.js on the front (Components on-site)
    'resend_key'    => '',                  // welcome email (optionnel, réutilise la clé Resend ; vide = pas d'email)
    // 'appsscript_url' => 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec',

    // Supabase — payment_grants persistence (BUG-2026-010 cross-device pass recovery
    // + BUG-2026-011 webhook mirror). URL = public (Project Ref), service_key = SECRET
    // service_role (bypass RLS). Lu par mollie.php:verify_subscription + mollie-lib.php
    // mol_supabase_mirror(). Sans service_key, mirror skip silently + verify_subscription
    // retourne lookup_failed (fallback Stripe préserve l'UX).
    'supabase_url'         => 'https://rswdmjtdzrucqzzukfmd.supabase.co',  // PUBLIC — Project Ref
    'supabase_service_key' => '',                                           // SECRET service_role — vide = désactivé

    // Montants des abonnements récurrents. Mollie crée les subscriptions INLINE
    // (amount + interval), PAS de plan_id pré-créé comme PayPal. La présence de
    // l'entrée = allowlist serveur (anti-tampering : un montant forgé est rejeté).
    'subscription' => [
        'monthly' => ['amount' => '4.99',  'currency' => 'EUR', 'interval' => '1 month'],
        'annual'  => ['amount' => '49.00', 'currency' => 'EUR', 'interval' => '12 months'], // aligné sur l'affichage front (49 €/an)
    ],
    // Passes one-time (SANS abonnement). cents = allowlist anti-tampering ; days = durée d'accès.
    'passes' => [
        'trip7'  => ['cents' => 499,  'days' => 7,   'label' => 'Pass 7 jours (séjour)'], // 4,99 € · miroir du tripPass USD
        'saison' => ['cents' => 1999, 'days' => 210, 'label' => 'Pass saison'],   // 19,99 € · saison (mars→oct ~7 mois)
        'p7'     => ['cents' => 799,  'days' => 7,   'label' => 'Pass 7 jours'],
        'p30'    => ['cents' => 1499, 'days' => 30,  'label' => 'Pass 30 jours'],
    ],
];
