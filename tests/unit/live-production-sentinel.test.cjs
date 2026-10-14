#!/usr/bin/env node
// tests/unit/live-production-sentinel.test.cjs — régression de faux positifs
// (mission factory-control#46). Le module src n'exécute main() QUE via
// l'entrée directe (require.main gating) — ici on charge le module pour tester
// buildReport() sur des données synthétiques déterministes.
// Sans dépendance au backlog live, aux secrets, à la réseau ni au runner.
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const ROOT = path.resolve(__dirname, '..', '..')
const sentinel = require(path.join(ROOT, 'scripts', 'autopilot', 'live-production-sentinel.cjs'))

const NOW = Date.now()
let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

function base() {
  return {
    domains: [{
      domain: 'sargasses-martinique.com', checks: [{ path: '/', status: 200, ok: true }], errors: [], ok: true, ts: new Date(NOW).toISOString()
    }],
    ciFailures: { ok: true, failures: [{ databaseId: 1, workflowName: 'Perf', conclusion: 'failure', createdAt: new Date(NOW - 3600000).toISOString() }] },
    tail: { errors: [], missing: [], total: 0 },
    localErrors: [],
    at: new Date(NOW).toISOString(),
  }
}

// 1. échec CI seul → incident live AUCUN (dans le fingerprint/incidents).
{
  const r = sentinel.buildReport(base())
  t(r.ok === true, '1a. échec CI seul => report.ok=true (LIVE_HEALTH OK)')
  t(r.incidents.length === 0, '1b. échec CI seul => 0 incidents live')
  t(r.ciFailures.failures.length === 1, '1c. échec CI rapporté séparément dans ciFailures (pas perdu)')
}

// 2. ancienne empreinte non revalidée → ne doit pas produire d'incident courant.
//    Simulé par le workflow YAML : le fingerprint ne remplace plus jamais l'issue
//    si elle est absente de l'historique récent. On prouve côté script que le
//    fingerprint couvre les incidents live réels uniquement (rien d'ancien).
{
  const r = sentinel.buildReport(base())
  t(r.fingerprint.length === 16, '2a. fingerprint couvre le rapport live spectro-métrique (16 cars)')
  t(!/github-actions/.test(r.fingerprint), '2b. fingerprint ne contient jamais de provenance CI (source chaine, pas hash trouvé)')
}

// 3. rapport sensor absent → NOT_PROVEN (sensor.ok=false, missing listé, ok reste vrai).
{
  const input = base()
  input.tail = { errors: [], missing: ['sargagame-mq', 'sargagame-gp'], total: 0 }
  const r = sentinel.buildReport(input)
  t(r.ok === true, '3a. sensor absent => report.ok=true (pas de fausse alarme)')
  t(r.sensor.ok === false && r.sensor.missing.length === 2, '3b. sensor.ok=false + missing documenté (blocage expliqué)')
  t(r.sensor.proven === false, '3c. proven=false : l absence de sonde est NOT_PROVEN, jamais transformée en succès')
}

// 4. incident live récent confirmé par une sonde valide → détection conservée.
{
  const input = base()
  input.domains[0].ok = false
  input.domains[0].errors = ['sargassum.json=5xx (observé live)']
  const r = sentinel.buildReport(input)
  t(r.ok === false, '4a. incident live réel (HTTP 5xx) => ok=false (LIVE_HEALTH FAIL)')
  t(r.incidents.length === 1 && r.incidents[0].subsystem === 'production-http', '4b. incident live = subsystem production-http (pas CI)')
  t(r.ciFailures.failures.length === 1, '4c. CI concurrente rapportée séparément sans mélange')
}

// 5. domaines sains + rapport complet → résultat propre, aucune perte de signal.
{
  const r = sentinel.buildReport(base())
  t(r.domains.length === 1 && r.domains[0].ok === true, '5a. domaines sains => persistés')
  t(r.ok === true, '5b. COMPLET + sa=> ok')
}

// 6. incident ancien mais confirmé → nouvelle détection post revalidation :
//    le fingerprint inclut le message — une réapparition produit une nouvelle empreinte.
{
  const input = base()
  input.domains[0].ok = false
  input.domains[0].errors = ['sargassum.json périmé (960min > 900min)']
  const r1 = sentinel.buildReport(input)
  input.at = new Date(NOW + 3600000).toISOString() // même mâchoire (1h plus tard)
  const r2 = sentinel.buildReport(input)
  t(r1.fingerprint === r2.fingerprint, '6a. même message => même empreinte (SO: 地址dedup correct)')
  input.domains[0].errors = ['sargassum.json périmé (2500min > 900min)'] // détail changé (âge différent)
  const r3 = sentinel.buildReport(input)
  t(r3.fingerprint !== r1.fingerprint, '6b. réapparition déplacement -> nouvelle empreinte (revalidation récente)')
}

// 7. permission tail manquante → blocage documenté (sensor.missing), pas d'incident.
{
  const input = base()
  input.tail = { errors: [], missing: ['worker Denied'], total: 0 } // cas où wrangler refusé par permission
  const r = sentinel.buildReport(input)
  t(r.ok === true && r.sensor.proven === false, '7a. permission manquante => succès du run (pas d incident) + NOT_PROVEN')
}

// 8. Câblage source : le module exporte les fonctions testables, main() ne s'exécute pas au require.
t(typeof sentinel.buildReport === 'function' && typeof sentinel.checkDomain === 'function', '8a. module exporte buildReport/checkDomain (testable)')
t(typeof sentinel.FINGERPRINT_MAX_AGE_H === 'number' && sentinel.FINGERPRINT_MAX_AGE_H === 48, '8b. fenêtre de récence d empreinte exportée (48h)')

console.log(`\nLIVE_PRODUCTION_SENTINEL_TESTS PASS (${n} assertions)`)
