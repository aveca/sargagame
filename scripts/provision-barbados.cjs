#!/usr/bin/env node
/**
 * provision-barbados.cjs — Auto-provisionne la région Barbados (Mollie + build + deploy)
 *
 * 1. Crée un profil Mollie pour sargassumbarbados.com (USD)
 * 2. Génère mollie-config.php avec le bon profile_id
 * 3. Construit le site Barbados
 * 4. Prépare FTP + fast-deploy si DEPLOY_TOKEN disponible
 *
 * Usage :
 *   node scripts/provision-barbados.cjs           # dry-run
 *   node scripts/provision-barbados.cjs --send    # exécute
 *
 * Prérequis : MOLLIE_API_KEY dans l'env (secret GH Actions)
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SEND = process.argv.includes('--send')
const MOLLIE_KEY = (process.env.MOLLIE_API_KEY || '').trim()
const DEPLOY_TOKEN = (process.env.DEPLOY_TOKEN || '').trim()

const REGION = 'barbados'
const DOMAIN = 'sargassumbarbados.com'
const CURRENCY = 'USD'

async function molliePost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + MOLLIE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mollie ${url}: ${j.detail || res.status}`)
  return j
}

async function mollieGet(url) {
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + MOLLIE_KEY },
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mollie ${url}: ${j.detail || res.status}`)
  return j
}

async function main() {
  console.log('=== Provision Barbados ===')
  console.log('Mode:', SEND ? 'EXECUTE' : 'DRY-RUN')

  if (!MOLLIE_KEY) {
    console.log('MOLLIE_API_KEY absent — skip. (sera provisionné en CI avec le secret GH)')
    if (!SEND) { process.exit(0); return }
    process.exit(1)
  }

  const prefix = MOLLIE_KEY.startsWith('test_') ? 'test_' : 'live_'
  console.log('Clé Mollie:', prefix + '...')

  // 1. Vérifier si un profil Barbados existe déjà
  console.log('\n1. Vérification des profils Mollie existants...')
  const profiles = await mollieGet('https://api.mollie.com/v2/profiles?limit=250')
  const existing = (profiles._embedded?.profiles || []).find(p =>
    p.website && p.website.toLowerCase().includes('barbados')
  )

  let profileId
  if (existing) {
    profileId = existing.id
    console.log(`   → Profil existant: ${profileId} (${existing.name})`)
  } else {
    console.log('   → Aucun profil Barbados trouvé')
    if (!SEND) {
      console.log('   [DRY] Créerait profil: "Sargassum Barbados", website: ' + DOMAIN + ', currency: USD')
      profileId = 'pfl_PLACEHOLDER_DRY'
    } else {
      console.log('   → Création du profil Mollie pour Barbados...')
      const profile = await molliePost('https://api.mollie.com/v2/profiles', {
        name: 'Sargassum Barbados',
        website: 'https://' + DOMAIN,
        email: 'alerts@' + DOMAIN,
        phone: '+12464340000',
        // Mode test si clé test_ — Mollie infère depuis le préfixe de la clé API
      })
      profileId = profile.id
      console.log(`   → Profil créé: ${profileId}`)
    }
  }

  // Attendre que le profil soit approuvé (optionnel)
  if (SEND && prefix === 'live_') {
    console.log('   → Activation du profil (enableGiftCard, enableCreditCard)...')
    try {
      await molliePost(`https://api.mollie.com/v2/profiles/${profileId}/methods`, {
        id: 'creditcard',
        enabled: true,
        // Les méthodes sont auto-activées en live après onboarding
      })
      console.log('   → Méthodes activées')
    } catch (e) {
      console.log('   ⚠️ Activation methods:', e.message, '(peut nécessiter onboarding)')
    }
  }

  // 2. Générer mollie-config.php pour Barbados
  console.log('\n2. Génération mollie-config.php...')
  const phpContent = `<?php
// GÉNÉRÉ par scripts/provision-barbados.cjs — NE PAS COMMITTER
return [
    'api_key'    => ${JSON.stringify(MOLLIE_KEY)},
    'profile_id' => ${JSON.stringify(profileId)},
    'resend_key' => '',
    'subscription' => [
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
  const configDir = path.join(__dirname, '..', REGION + '-ftp', 'api')
  if (!fs.existsSync(configDir)) {
    console.log(`   ⚠️ ${configDir}/ n'existe pas — build d'abord`)
  } else if (SEND) {
    fs.writeFileSync(path.join(configDir, 'mollie-config.php'), phpContent)
    console.log(`   → Écrit dans ${REGION}-ftp/api/mollie-config.php`)
  } else {
    console.log(`   [DRY] Écrirait dans ${REGION}-ftp/api/mollie-config.php`)
  }

  // 3. Déployer via fast-deploy si DEPLOY_TOKEN disponible
  if (DEPLOY_TOKEN && SEND) {
    console.log('\n3. Fast-deploy vers', DOMAIN)
    const deployDir = path.join(__dirname, '..', REGION + '-ftp')
    if (fs.existsSync(deployDir)) {
      try {
        const { fastDeploy } = require('./lib/fast-deploy.cjs')
        await fastDeploy(DOMAIN, deployDir, DEPLOY_TOKEN)
        console.log('   → Fast-deploy OK')
      } catch (e) {
        console.log('   ⚠️ Fast-deploy échoué:', e.message, '(fallback FTP ou déploiement manuel requis)')
      }
    }
  } else if (DEPLOY_TOKEN) {
    console.log('\n3. [DRY] Fast-deployerait vers', DOMAIN)
  } else {
    console.log('\n3. DEPLOY_TOKEN absent — fast-deploy non disponible')
  }

  console.log('\n=== Done ===')
  if (!SEND) {
    console.log('Passe --send pour exécuter (ou déclenche le workflow GH Actions)')
  }
  console.log('Profil Mollie ID:', profileId)
  console.log('Site:', DOMAIN)
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
