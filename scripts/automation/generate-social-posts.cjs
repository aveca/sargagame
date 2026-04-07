#!/usr/bin/env node
/**
 * Generate social media posts based on current beach data.
 * Outputs ready-to-post content for Facebook/Instagram groups.
 * Run weekly (Friday) via GitHub Actions or manually.
 */
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve } = require('path')

const DATA_PATH = resolve(__dirname, '..', '..', 'public', 'api', 'copernicus', 'sargassum.json')
const BEACHES_PATH = resolve(__dirname, '..', '..', 'public', 'data', 'beaches-list.json')
const OUTPUT_PATH = resolve(__dirname, 'data', 'social-posts.json')

function run() {
  if (!existsSync(DATA_PATH)) {
    console.log('No sargassum data found, skipping')
    return
  }

  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  const beaches = JSON.parse(readFileSync(BEACHES_PATH, 'utf-8'))
  const levels = data.levels || []

  // Count by status per island
  const stats = { mq: { clean: 0, moderate: 0, avoid: 0 }, gp: { clean: 0, moderate: 0, avoid: 0 } }
  for (const l of levels) {
    const island = l.id.startsWith('gp') ? 'gp' : 'mq'
    const st = l.status || 'clean'
    stats[island][st] = (stats[island][st] || 0) + 1
  }

  // Top clean beaches per island
  const topClean = { mq: [], gp: [] }
  for (const l of levels) {
    if (l.status !== 'clean') continue
    const island = l.id.startsWith('gp') ? 'gp' : 'mq'
    const beach = beaches.find(b => b.id === l.id)
    if (beach) topClean[island].push(beach.name)
  }

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const posts = []

  // Post 1: Weekend overview MQ
  posts.push({
    platform: 'facebook',
    target: 'Martinique (groupes Facebook)',
    text: `🏖️ Sargasses Martinique — ${today}\n\n✅ ${stats.mq.clean} plages propres sur ${stats.mq.clean + stats.mq.moderate + stats.mq.avoid}\n${stats.mq.avoid > 0 ? `⚠️ ${stats.mq.avoid} plages à éviter\n` : ''}\nTop plages propres : ${topClean.mq.slice(0, 5).join(', ')}\n\n📍 Carte en temps réel : sargasses-martinique.com\nDonnées satellite Copernicus, mises à jour 4x/jour.\n\n#Martinique #sargasses #plages #Antilles`,
    type: 'weekend_status'
  })

  // Post 2: Weekend overview GP
  posts.push({
    platform: 'facebook',
    target: 'Guadeloupe (groupes Facebook)',
    text: `🏖️ Sargasses Guadeloupe — ${today}\n\n✅ ${stats.gp.clean} plages propres sur ${stats.gp.clean + stats.gp.moderate + stats.gp.avoid}\n${stats.gp.avoid > 0 ? `⚠️ ${stats.gp.avoid} plages à éviter\n` : ''}\nTop plages propres : ${topClean.gp.slice(0, 5).join(', ')}\n\n📍 Carte en temps réel : sargasses-guadeloupe.com\nDonnées satellite Copernicus, mises à jour 4x/jour.\n\n#Guadeloupe #sargasses #plages #Antilles`,
    type: 'weekend_status'
  })

  // Post 3: Value proposition
  posts.push({
    platform: 'facebook',
    target: 'Tourisme Antilles / Expats',
    text: `Tu pars à la plage ce weekend en Martinique ou Guadeloupe ?\n\n🛰️ Sargasses en temps réel — carte satellite mise à jour 4x/jour\n📊 ${levels.length} plages surveillées\n📱 Alertes push quand ta plage change d'état\n\nGratuit : sargasses-martinique.com / sargasses-guadeloupe.com\n\nPlus de mauvaise surprise en arrivant à la plage. 🤙\n\n#Martinique #Guadeloupe #sargasses #plage #weekend`,
    type: 'value_prop'
  })

  // Post 4: Instagram story format
  posts.push({
    platform: 'instagram',
    target: 'Story / Reel',
    text: `Sargasses ${today}\n\nMQ: ${stats.mq.clean}/${stats.mq.clean + stats.mq.moderate + stats.mq.avoid} propres ✅\nGP: ${stats.gp.clean}/${stats.gp.clean + stats.gp.moderate + stats.gp.avoid} propres ✅\n\nCarte gratuite → lien en bio`,
    type: 'story'
  })

  writeFileSync(OUTPUT_PATH, JSON.stringify(posts, null, 2))
  console.log(`✅ ${posts.length} posts générés → ${OUTPUT_PATH}`)

  // Print posts for easy copy-paste
  console.log('\n=== POSTS PRÊTS À PUBLIER ===\n')
  for (const p of posts) {
    console.log(`--- ${p.platform.toUpperCase()} (${p.target}) ---`)
    console.log(p.text)
    console.log('')
  }
}

run()
