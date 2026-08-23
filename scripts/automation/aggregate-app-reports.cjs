#!/usr/bin/env node
/**
 * aggregate-app-reports.cjs — snapshot des SIGNALEMENTS IN-APP pour le 1er rendu (anti-flash).
 *
 * POURQUOI : les utilisateurs signalent DANS l'app (bouton « signaler » → Apps Script
 * /beach_reports). Cet endpoint est LENT (~2,5 s) → il était fetché en différé → les plages
 * signalées s'affichaient d'abord au statut satellite (vert) puis basculaient en rouge/jaune
 * quand l'overlay arrivait = le flash. On bake ici le snapshot dans un fichier statique RAPIDE
 * (public/api/community/app-reports.json) que l'app fusionne au PREMIER rendu (le live différé
 * reste pour la fraîcheur des reports faits depuis le dernier snapshot).
 *
 * Lancé en CI avant le build (continue-on-error). Format identique à fb-reports.json
 * ({reports:{id:{clean,moderate,avoid,total,...}}}) → merge direct côté front.
 *
 * Usage: node scripts/automation/aggregate-app-reports.cjs
 */
const fs = require('fs')
const path = require('path')

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=beach_reports'
const OUT = path.join(__dirname, '..', '..', 'public', 'api', 'community', 'app-reports.json')

async function main() {
  let data
  try {
    const res = await fetch(ENDPOINT, { redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (!res.ok) { console.warn(`[app-reports] HTTP ${res.status} — on garde le fichier existant`); return }
    data = await res.json()
  } catch (e) {
    console.warn('[app-reports] fetch échoué — on garde le fichier existant:', e.message)
    return
  }
  if (!data || !data.reports || typeof data.reports !== 'object') {
    console.warn('[app-reports] réponse sans .reports — on garde l\'existant')
    return
  }
  const out = {
    _comment: 'Snapshot des signalements IN-APP (/beach_reports) pour appliquer le bon statut au 1er rendu (anti-flash). Régénéré par aggregate-app-reports.cjs avant chaque build. Le front re-fetch le live en différé pour la fraîcheur.',
    source: 'app',
    updatedAt: new Date().toISOString(),
    beachCount: Object.keys(data.reports).length,
    reports: data.reports,
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out))
  console.log(`[app-reports] écrit ${out.beachCount} plages → ${path.relative(process.cwd(), OUT)}`)

  // ── JOURNAL DATÉ append-only des signalements FRAIS (sprint #3) ─────────────────────────────
  // Pour valider nos prévisions contre la VÉRITÉ-TERRAIN CITOYENNE (report-vs-prédiction, méthode
  // NOAA/Epicollect) : build-citizen-accuracy.cjs matche ce journal à forecast-archive.json. On
  // journalise UNIQUEMENT les plages avec un signalement dans les dernières 24h (recent24h) = le
  // signal frais du jour. Append-only : on n'écrit QUE la clé du jour, jamais les dates passées.
  try {
    const LOG = path.join(__dirname, '..', '..', 'public', 'api', 'community', 'reports-log.json')
    const today = new Date().toISOString().slice(0, 10)
    let log = {}
    try { log = JSON.parse(fs.readFileSync(LOG, 'utf-8')) } catch (_) {}
    if (!log.logByDate) log.logByDate = {}
    const todays = {}
    for (const [id, r] of Object.entries(data.reports)) {
      const r24 = r.recent24h || {}
      const c = r24.clean || 0, m = r24.moderate || 0, a = r24.avoid || 0
      if (c + m + a <= 0) continue // pas de signalement frais aujourd'hui pour cette plage
      const status = (a >= m && a >= c) ? 'avoid' : (m >= c) ? 'moderate' : 'clean'
      todays[id] = { status, c, m, a }
    }
    if (Object.keys(todays).length) {
      log.logByDate[today] = todays // idempotent si re-run le même jour ; jamais les jours passés
      log.updatedAt = new Date().toISOString()
      log._comment = 'Journal APPEND-ONLY des signalements communautaires datés (recent24h) = vérité-terrain citoyenne, pour build-citizen-accuracy.cjs (report-vs-prédiction). Ne JAMAIS réécrire les dates passées.'
      fs.writeFileSync(LOG, JSON.stringify(log))
      console.log(`[reports-log] ${today} : ${Object.keys(todays).length} plage(s) avec signalement frais journalisée(s)`)
    } else {
      console.log('[reports-log] aucun signalement frais (recent24h) aujourd\'hui — rien à journaliser')
    }
  } catch (e) { console.warn('[reports-log] échec (non bloquant):', e.message) }
}

main()
