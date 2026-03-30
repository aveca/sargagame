/**
 * Vérifie que les données Copernicus / sargassum sont à jour et prêtes pour publication FTP.
 * À lancer après "npm run daily" ou avant envoi FTP.
 * Lit public/api/copernicus/sargassum.json (ou dist après build).
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const BEACH_IDS = [
  'grande-anse', 'anse-mitan', 'anse-noire', 'tartane', 'anse-madame', 'diamant', 'pt-marin', 'sainte-anne', 'les-salines', 'vauclin',
  'gp-grande-anse', 'gp-malendure', 'gp-sainte-anne', 'gp-pt-chateaux', 'gp-gosier', 'gp-caravelle', 'gp-bas-du-fort', 'gp-deshaies', 'gp-moule', 'gp-vieux-fort',
]

function checkFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ${label} absent : ${filePath}`)
    return null
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    console.error(`❌ ${label} invalide (JSON) : ${filePath}`, e.message)
    return null
  }
}

function main() {
  console.log('Vérification données Copernicus / FTP du jour\n')
  let ok = true

  const sargPath = path.join(root, 'public', 'api', 'copernicus', 'sargassum.json')
  let data = checkFile(sargPath, 'public/api/copernicus/sargassum.json')
  if (!data) {
    const distPath = path.join(root, 'dist', 'api', 'copernicus', 'sargassum.json')
    data = checkFile(distPath, 'dist/api/copernicus/sargassum.json')
  }
  if (!data) {
    console.log('\n→ Lancez "npm run daily" (ou "node scripts/scrape-copernicus.cjs" puis "npm run build") pour générer les données du jour.')
    process.exit(1)
  }

  if (!data.source || typeof data.source !== 'string') {
    console.error('❌ Champ "source" manquant ou invalide')
    ok = false
  } else {
    console.log('   source:', data.source)
  }

  if (!data.updatedAt) {
    console.error('❌ Champ "updatedAt" manquant')
    ok = false
  } else {
    const d = new Date(data.updatedAt)
    const today = new Date()
    const sameDay = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
    console.log('   updatedAt:', data.updatedAt, sameDay ? '(date du jour ✓)' : '(attention: pas la date du jour)')
    if (!sameDay) console.warn('   ⚠ Pour un déploiement "du jour", relancez: npm run daily')
  }

  if (!Array.isArray(data.levels)) {
    console.error('❌ Champ "levels" absent ou non-tableau')
    ok = false
  } else {
    const ids = new Set(data.levels.map(l => l.id))
    const missing = BEACH_IDS.filter(id => !ids.has(id))
    const invalid = data.levels.filter(l => !l.id || (l.afai == null && l.status == null))
    if (missing.length) {
      console.error('❌ levels: plages manquantes:', missing.join(', '))
      ok = false
    }
    if (invalid.length) {
      console.error('❌ levels: entrées sans id/afai/status:', invalid.length)
      ok = false
    }
    if (!missing.length && !invalid.length) {
      console.log('   levels:', data.levels.length, 'plages ✓')
    }
  }

  if (!data.weekly || typeof data.weekly !== 'object') {
    console.error('❌ Champ "weekly" (prévisions 7j) manquant ou invalide')
    ok = false
  } else {
    const missingWeekly = BEACH_IDS.filter(id => !data.weekly[id])
    if (missingWeekly.length) {
      console.error('❌ weekly: prévisions manquantes pour:', missingWeekly.join(', '))
      ok = false
    } else {
      console.log('   weekly: 20 plages avec prévisions 7j ✓')
    }
  }

  console.log('')
  if (ok) {
    console.log('✅ Données Copernicus / sargassum prêtes pour publication FTP.')
    console.log('   → Envoie le contenu de martinique-ftp/ et guadeloupe-ftp/ sur tes serveurs FTP.')
  } else {
    console.error('❌ Corriger les erreurs ci-dessus avant publication.')
    process.exit(1)
  }
}

main()
