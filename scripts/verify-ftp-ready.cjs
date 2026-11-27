/**
 * Vérifie que les données Copernicus / sargassum sont à jour et prêtes pour publication FTP.
 * À lancer après "npm run daily" ou avant envoi FTP.
 * Lit public/api/copernicus/sargassum.json (ou dist après build).
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { evaluateObservation, evaluatePublicationEligibility, evaluateFleetPublicationEligibility, MAX_AGE_MINUTES } = require('./autopilot/check-predeploy-satellite-freshness.cjs')

function readGitHeadJson(relPath) {
  try {
    const raw = execFileSync('git', ['show', `HEAD:${relPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const root = path.join(__dirname, '..')
// Allowlist des sources LIVE (partagée racine + régions) — cf. garde MOAT #1.
const LIVE_SOURCES = ['erddap-live', 'copernicus']
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
    // ── Garde MOAT #1 : ne JAMAIS publier une carte issue d'une source DÉGRADÉE
    // ou de RÉFÉRENCE (jamais de fausse carte verte). Seules les sources LIVE
    // réelles sont autorisées ; 'reference' / 'reference-fallback' (données
    // hardcodées) / 'erddap-fallback' (grille ERDDAP manquante) sont bloquées.
    // Allowlist (et non blocklist) = robuste à une source dégradée inconnue.
    if (!LIVE_SOURCES.includes(data.source)) {
      console.error(`❌ source="${data.source}" non-live (dégradée / référence) — publication FTP bloquée pour ne pas diffuser une carte sans données réelles. Le prochain run re-tentera la source live.`)
      ok = false
    }
  }

  // Operational SLA is separate from the public 36-hour stale marker.
  // updatedAt proves publication time only; erddapTimestamp proves observation time.
  const rootFreshness = evaluateObservation(data.erddapTimestamp)
  const rootPrevious = readGitHeadJson('public/api/copernicus/sargassum.json')
  // The working tree file is the candidate (already overwritten by fetch). Compare
  // against the last committed observation to reject regressions; the 900-minute
  // operational SLA remains mandatory even when the candidate is newer.
  const rootElig = evaluatePublicationEligibility(data.erddapTimestamp, {
    previousTimestamp: rootPrevious && rootPrevious.erddapTimestamp,
    allowLabeledStale: true
  })
  if (!rootElig.publishable) {
    const marker = !rootFreshness.ok ? 'observation hors SLA — ' : ''
    console.error(`❌ Observation satellite racine refusée : ${marker}${rootElig.reason} (SLA ${MAX_AGE_MINUTES} min)`)
    ok = false
  } else if (rootElig.labeledStale) {
    console.log(`   observation racine: ${rootFreshness.ageMinutes.toFixed(2)} min, au-delà du SLA ${MAX_AGE_MINUTES} min, publication avec la date et la mention non actualisée`)
  } else {
    console.log(`   observation racine: ${rootFreshness.ageMinutes.toFixed(2)} min (SLA ${MAX_AGE_MINUTES} min) ✓`)
  }

  // ── Garde MOAT #2 : pic "tout vert" suspect. Un bond brutal du taux de plages
  // propres (>40 points vs le dernier jour DISTINCT de l'historique) est traité
  // comme une anomalie d'intégrité (source, couverture ou no-data masqué en
  // "clean"), pas comme une limite physique ou une demi-vie calibrée.
  // Source-agnostique : attrape la fausse carte verte même si le flag source ment.
  // Lecture historique fail-open (si illisible → garde inactive, pas de blocage).
  if (Array.isArray(data.levels) && data.levels.length) {
    let prevCleanRatio = null
    try {
      const hist = JSON.parse(fs.readFileSync(path.join(root, 'public', 'api', 'copernicus', 'history.json'), 'utf-8'))
      const entries = Array.isArray(hist.history) ? hist.history : []
      const curDate = String(data.updatedAt || '').slice(0, 10)
      // Dernier jour DISTINCT : l'historique contient déjà le run du jour, donc
      // comparer au tout dernier reviendrait à se comparer à soi-même (no-op).
      const prior = [...entries].reverse().find(e => e && e.date && e.date !== curDate && Array.isArray(e.levels) && e.levels.length)
      if (prior) prevCleanRatio = prior.levels.filter(l => l.status === 'clean').length / prior.levels.length
    } catch (_) {}
    const curCleanRatio = data.levels.filter(l => l.status === 'clean').length / data.levels.length
    if (prevCleanRatio !== null && (curCleanRatio - prevCleanRatio) > 0.4) {
      console.error(`❌ Pic "tout vert" suspect : ${Math.round(prevCleanRatio * 100)}% → ${Math.round(curCleanRatio * 100)}% de plages propres en <24h. Anomalie d'intégrité — vérifier la source et la couverture avant publication.`)
      ok = false
    }
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

  // Same source and operational freshness contract for every required regional payload.
  const copDir = path.join(root, 'public', 'api', 'copernicus')
  const requiredRegionDirs = ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']
  let discoveredRegionDirs = []
  try {
    discoveredRegionDirs = fs.readdirSync(copDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(dirName => fs.existsSync(path.join(copDir, dirName, 'sargassum.json')))
  } catch (e) {
    console.error('❌ Répertoire Copernicus régional illisible — publication bloquée:', e.message)
    ok = false
  }
  // Require the six production regions and also validate every additional regional
  // payload already present (e.g. Barbados), so no stale side payload is skipped.
  const regionDirs = [...new Set([...requiredRegionDirs, ...discoveredRegionDirs])]
  const requiredRegionEligibility = []
  for (const dirName of regionDirs) {
    const regPath = path.join(copDir, dirName, 'sargassum.json')
    if (!fs.existsSync(regPath)) {
      console.error(`❌ [${dirName}] payload régional absent — publication bloquée`)
      ok = false
      continue
    }
    let reg = null
    try {
      reg = JSON.parse(fs.readFileSync(regPath, 'utf-8'))
    } catch (e) {
      if (requiredRegionDirs.includes(dirName)) {
        console.error(`❌ [${dirName}] payload régional JSON invalide: ${e.message}`)
        ok = false
      } else {
        console.warn(`   ⚠ [${dirName}] payload non-production illisible (fraîcheur non évaluée): ${e.message}`)
      }
      continue
    }
    const regSource = reg && reg.source
    if (!LIVE_SOURCES.includes(regSource)) {
      console.error(`❌ [${dirName}] source="${regSource}" non-live — publication bloquée`)
      ok = false
      continue
    }
    // The 900-minute deploy SLA applies to the six deployed domains only.
    // Additional catalog payloads (e.g. Barbados) retain the existing source guard
    // but must not block the six-domain release on an experimental region's age.
    if (!requiredRegionDirs.includes(dirName)) {
      console.log(`   région catalogue ${dirName}: source=${regSource} ✓ (hors SLA production six domaines)`)
      continue
    }
    const freshness = evaluateObservation(reg.erddapTimestamp)
    const prevReg = readGitHeadJson(`public/api/copernicus/${dirName}/sargassum.json`)
    const elig = evaluatePublicationEligibility(reg.erddapTimestamp, {
      previousTimestamp: prevReg && prevReg.erddapTimestamp,
      allowLabeledStale: true
    })
    requiredRegionEligibility.push({ regionId: dirName, publishable: elig.publishable, reason: elig.reason })
    if (!elig.publishable) {
      const marker = !freshness.ok ? 'observation hors SLA — ' : ''
      console.error(`❌ [${dirName}] observation refusée : ${marker}${elig.reason} (SLA ${MAX_AGE_MINUTES} min)`)
      ok = false
    } else if (elig.labeledStale) {
      console.log(`   région ${dirName}: source=${regSource}, observation=${freshness.ageMinutes.toFixed(2)} min, au-delà du SLA ${MAX_AGE_MINUTES} min, mention non actualisée requise au déploiement`)
    } else {
      console.log(`   région ${dirName}: source=${regSource}, observation=${freshness.ageMinutes.toFixed(2)} min ✓`)
    }
  }

  const fleetEligibility = evaluateFleetPublicationEligibility(requiredRegionEligibility, requiredRegionDirs.length)
  if (!fleetEligibility.publishable) {
    const blocked = fleetEligibility.blockedRegions.length
      ? fleetEligibility.blockedRegions.join(', ')
      : `résultats valides ${fleetEligibility.checked}/${fleetEligibility.expected}`
    console.error(`❌ Garde flotte six régions refusée : ${blocked}`)
    ok = false
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
