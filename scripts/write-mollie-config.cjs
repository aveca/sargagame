#!/usr/bin/env node
// ── Génère api/mollie-config.php au DÉPLOIEMENT, depuis les secrets GitHub MOLLIE_API_KEY + MOLLIE_WEBHOOK_SECRET ──
// But : le fondateur colle sa clé Mollie UNE fois dans GitHub (Settings → Secrets →
// Actions → MOLLIE_API_KEY) et le déploiement écrit/livre le fichier tout seul, sur les
// régions EUR. Plus aucune manip FTP/cPanel. La clé n'est jamais committée
// (.gitignore **/mollie-config.php), lue uniquement depuis l'env, jamais loggée (on
// n'affiche que le préfixe live_/test_).
//
// SÉCURITÉ : on n'écrit QUE dans un dossier api/ dont le .htaccess refuse DÉJÀ
// mollie-config.php (Require all denied). Ainsi la clé ne peut jamais devenir lisible
// en HTTP, même si une nouvelle région sans .htaccess apparaissait.
//
// À lancer APRÈS scripts/prepare-ftp.cjs (les dossiers <region>-ftp/ doivent exister).
const fs = require('fs')
const path = require('path')
const { getAllRegions } = require('../regions/index.cjs')

const apiKey = (process.env.MOLLIE_API_KEY || '').trim()
if (!apiKey) { console.error('MOLLIE_API_KEY absent → mollie-config.php non généré (les paiements restent en mode capture). Ajoute le secret GitHub pour activer Mollie.'); process.exit(1) }
if (!/^(live|test)_/.test(apiKey)) { console.error('MOLLIE_API_KEY : préfixe inattendu (live_ ou test_ attendu) → abandon, rien écrit.'); process.exit(1) }

const webhookSecret = (process.env.MOLLIE_WEBHOOK_SECRET || '').trim()
if (!webhookSecret) {
  console.error('MOLLIE_WEBHOOK_SECRET absent → build bloqué. Le webwebhook Mollie est fail-closed (HTTP 503 sans secret). Ajoute le secret GitHub MOLLIE_WEBHOOK_SECRET (Dashboard Mollie → Webhooks → Secret).')
  process.exit(1)
}
if (webhookSecret.length < 16) {
  console.error('MOLLIE_WEBHOOK_SECRET trop court (min 16 caractères) → abandon.')
  process.exit(1)
}

// BUG-2026-011 : SUPABASE_SERVICE_KEY nécessaire pour payment_grants mirror (webhook)
// + verify_subscription (mollie.php). Sans clé : mirror skip silently + handler retourne
// lookup_failed (fallback Stripe préserve l'UX, mais cross-device pass recovery inopérant).
// Non bloquant (process.exit(0)) car les paiements Mollie restent fonctionnels sans Supabase.
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_KEY || '').trim()
const supabaseUrl = 'https://rswdmjtdzrucqzzukfmd.supabase.co'  // public Project Ref, hardcoded comme mollie-lib.php:255 fallback
if (!supabaseServiceKey) {
  console.warn('⚠️ SUPABASE_SERVICE_KEY absent → mollie-config.php généré sans supabase_service_key. payment_grants mirror + verify_subscription resteront inopérants (BUG-2026-011 latent). Ajoute le secret GitHub SUPABASE_SERVICE_KEY pour activer cross-device pass recovery.')
}

// Mapping région → devise et pricing
function getRegionConfig(regionId) {
  const regions = getAllRegions()
  const region = regions.find(r => r.id === regionId)
  if (!region) return { currency: 'EUR', isUSD: false }
  const isUSD = region.currency === 'USD'
  return { currency: region.currency || 'EUR', isUSD }
}

function generateConfig(currency, isUSD) {
  if (isUSD) {
    return `<?php
// GÉNÉRÉ par scripts/write-mollie-config.cjs au déploiement — NE PAS COMMITTER, NE PAS ÉDITER.
// api_key = secret GitHub MOLLIE_API_KEY. webhook_secret = secret GitHub MOLLIE_WEBHOOK_SECRET.
// supabase_service_key = secret GitHub SUPABASE_SERVICE_KEY (service_role, RLS bypass).
// Bloqué en HTTP via api/.htaccess (Require all denied).
return [
    'api_key'       => ${JSON.stringify(apiKey)},
    'webhook_secret' => ${JSON.stringify(webhookSecret)},
    'profile_id'    => 'pfl_t8KCk4Cm2C',
    'resend_key'    => '',
    'supabase_url'         => ${JSON.stringify(supabaseUrl)},
    'supabase_service_key' => ${JSON.stringify(supabaseServiceKey)},
    'subscription'  => [
        'monthly' => ['amount' => '9.99',  'currency' => 'USD', 'interval' => '1 month'],
        'annual'  => ['amount' => '79.00', 'currency' => 'USD', 'interval' => '12 months'],
    ],
    'passes' => [
        'trip7'  => ['cents' => 599,  'days' => 7,   'label' => 'Trip Pass 7 days'],
        'saison' => ['cents' => 1999, 'days' => 210, 'label' => 'Season Pass'],
        'p7'     => ['cents' => 799,  'days' => 7,   'label' => 'Pass 7 days'],
        'p30'    => ['cents' => 1499, 'days' => 30,  'label' => 'Pass 30 days'],
    ],
];
`
  } else {
    return `<?php
// GÉNÉRÉ par scripts/write-mollie-config.cjs au déploiement — NE PAS COMMITTER, NE PAS ÉDITER.
// api_key = secret GitHub MOLLIE_API_KEY. webhook_secret = secret GitHub MOLLIE_WEBHOOK_SECRET.
// supabase_service_key = secret GitHub SUPABASE_SERVICE_KEY (service_role, RLS bypass).
// Bloqué en HTTP via api/.htaccess (Require all denied).
return [
    'api_key'       => ${JSON.stringify(apiKey)},
    'webhook_secret' => ${JSON.stringify(webhookSecret)},
    'profile_id'    => 'pfl_t8KCk4Cm2C',
    'resend_key'    => '',
    'supabase_url'         => ${JSON.stringify(supabaseUrl)},
    'supabase_service_key' => ${JSON.stringify(supabaseServiceKey)},
    'subscription'  => [
        'monthly' => ['amount' => '4.99',  'currency' => 'EUR', 'interval' => '1 month'],
        'annual'  => ['amount' => '49.00', 'currency' => 'EUR', 'interval' => '12 months'],
    ],
    'passes' => [
        'trip7'  => ['cents' => 499,  'days' => 7,   'label' => 'Pass 7 jours (séjour)'],
        'saison' => ['cents' => 1999, 'days' => 210, 'label' => 'Pass saison'],
        'p7'     => ['cents' => 799,  'days' => 7,   'label' => 'Pass 7 jours'],
        'p30'    => ['cents' => 1499, 'days' => 30,  'label' => 'Pass 30 jours'],
    ],
];
`
  }
}

const root = path.join(__dirname, '..')
const stagingDirs = fs.readdirSync(root).filter(d => d.endsWith('-ftp') && fs.existsSync(path.join(root, d, 'api')))
let written = 0
const skipped = []
for (const d of stagingDirs) {
  const apiDir = path.join(root, d, 'api')
  const ht = path.join(apiDir, '.htaccess')
  // Garde-fou : n'écrire que si le .htaccess refuse déjà mollie-config.php en HTTP.
  const htOk = fs.existsSync(ht) && /mollie-config\.php[\s\S]*?Require all denied/i.test(fs.readFileSync(ht, 'utf-8'))
  if (!htOk) { skipped.push(d + ' (api/.htaccess ne protège pas mollie-config.php)'); continue }
  
  // Déterminer la région depuis le nom du dossier FTP
  const regionId = d.replace('-ftp', '')
  const { currency, isUSD } = getRegionConfig(regionId)
  const php = generateConfig(currency, isUSD)
  
  fs.writeFileSync(path.join(apiDir, 'mollie-config.php'), php, 'utf-8')
  written++
  // Log safe : préfixe clé Mollie + 4 derniers chars webhook_secret + supabase present/absent (jamais la valeur)
  const supaStatus = supabaseServiceKey ? 'present (***' + supabaseServiceKey.slice(-4) + ')' : 'ABSENT'
  console.log('   → mollie-config.php écrit dans ' + d + '/api/  (préfixe clé ' + apiKey.slice(0, 5) + ', webhook_secret: ***' + webhookSecret.slice(-4) + ', supabase_service_key: ' + supaStatus + ', currency: ' + currency + ')')
}
if (written === 0) console.error('⚠️ Aucun mollie-config.php écrit (lancer APRÈS prepare-ftp.cjs). Ignorés : ' + (skipped.join('; ') || 'aucun dossier *-ftp/api/ trouvé'))
else if (skipped.length) console.log('   (ignorés par sécurité : ' + skipped.join('; ') + ')')
