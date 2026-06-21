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
}

main()
