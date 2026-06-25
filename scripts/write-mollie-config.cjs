#!/usr/bin/env node
// ── Génère api/mollie-config.php au DÉPLOIEMENT, depuis le secret GitHub MOLLIE_API_KEY ──
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

const apiKey = (process.env.MOLLIE_API_KEY || '').trim()
if (!apiKey) { console.error('MOLLIE_API_KEY absent → mollie-config.php non généré (les paiements restent en mode capture). Ajoute le secret GitHub pour activer Mollie.'); process.exit(0) }
if (!/^(live|test)_/.test(apiKey)) { console.error('MOLLIE_API_KEY : préfixe inattendu (live_ ou test_ attendu) → abandon, rien écrit.'); process.exit(1) }

const php = `<?php
// GÉNÉRÉ par scripts/write-mollie-config.cjs au déploiement — NE PAS COMMITTER, NE PAS ÉDITER.
// api_key = secret GitHub MOLLIE_API_KEY. Bloqué en HTTP via api/.htaccess (Require all denied).
return [
    'api_key'    => ${JSON.stringify(apiKey)},
    'profile_id' => 'pfl_t8KCk4Cm2C',
    'resend_key' => '',
    'subscription' => [
        'monthly' => ['amount' => '4.99',  'currency' => 'EUR', 'interval' => '1 month'],
        'annual'  => ['amount' => '49.00', 'currency' => 'EUR', 'interval' => '12 months'],
    ],
    'passes' => [
        'trip7'  => ['cents' => 499,  'days' => 7,   'label' => 'Pass 7 jours (séjour)'],
        'saison' => ['cents' => 1999, 'days' => 180, 'label' => 'Pass saison'],
        'p7'     => ['cents' => 799,  'days' => 7,   'label' => 'Pass 7 jours'],
        'p30'    => ['cents' => 1499, 'days' => 30,  'label' => 'Pass 30 jours'],
    ],
];
`

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
  fs.writeFileSync(path.join(apiDir, 'mollie-config.php'), php, 'utf-8')
  written++
  console.log('   → mollie-config.php écrit dans ' + d + '/api/  (préfixe clé ' + apiKey.slice(0, 5) + ')')
}
if (written === 0) console.error('⚠️ Aucun mollie-config.php écrit (lancer APRÈS prepare-ftp.cjs). Ignorés : ' + (skipped.join('; ') || 'aucun dossier *-ftp/api/ trouvé'))
else if (skipped.length) console.log('   (ignorés par sécurité : ' + skipped.join('; ') + ')')
