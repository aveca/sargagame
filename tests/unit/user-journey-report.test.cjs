#!/usr/bin/env node
// tests/unit/user-journey-report.test.cjs — régression mission #41 (factory-control) :
// parcours utilisateurs réels. Verrouille : clé de déduplication stable, classification
// bloquant/ux, matrice de domaines officielle (regions/index.cjs, live!==false),
// présence du workflow récurrent (cron + dispatch + post-deploy).
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const ROOT = path.resolve(__dirname, '..', '..')

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const { dedupKey, classify, isKnownOutOfScopeResponse } = require('../../scripts/automation/user-journey-audit.cjs')

// 1. Clé de déduplication : stable, composée (domaine|étape|type|détail).
const k1 = dedupKey({ domain: 'x.com', step: 'fiche', type: 'ux', detail: 'label' })
const k2 = dedupKey({ domain: 'x.com', step: 'fiche', type: 'ux', detail: 'label' })
const k3 = dedupKey({ domain: 'y.com', step: 'fiche', type: 'ux', detail: 'label' })
const k4 = dedupKey({ domain: 'x.com', step: 'home', type: 'ux', detail: 'label' })
t(k1 === k2, 'même défaut => même clé de déduplication')
t(k1 !== k3, 'domaine différent => clé différente')
t(k1 !== k4, 'étape différente => clé différente')
const staleMobile = {
  domain: 'sargazotulum.com',
  step: 'fiche',
  type: 'stale-current-decision',
  detail: 'observation stale/unknown (ageMinutes=4863.513283333334) mais UI non fail-closed: {"head":"A VIGILAR","hasCurrentScore":false,"scorePaused":false,"staleNotice":false,"hasForecast":true,"forecastPaused":false}'
}
const staleDesktop = {
  ...staleMobile,
  detail: staleMobile.detail.replace('4863.513283333334', '4863.906983333333')
}
t(dedupKey(staleMobile) === dedupKey(staleDesktop),
  'même défaut stale sur mobile/desktop => âge mesuré variable ignoré')
const distinctUi = {
  ...staleMobile,
  detail: staleMobile.detail.replace('"hasForecast":true', '"hasForecast":false')
}
t(dedupKey(staleMobile) !== dedupKey(distinctUi),
  'état UI matériel différent => incident distinct conservé')
t(k1 === k1.toLowerCase(), 'clé normalisée en minuscules')

// 1bis. Réponses 404 connues hors périmètre.
t(isKnownOutOfScopeResponse(404, 'https://sargassummiami.com/api/b2b-partners.json?pdv=123'),
  'le miroir legacy /api/b2b-partners.json intercepté par sg-payments ne crée pas de faux incident')
t(!isKnownOutOfScopeResponse(404, 'https://sargassummiami.com/data/b2b-partners.json'),
  'le chemin canonique /data/b2b-partners.json reste surveillé')
t(!isKnownOutOfScopeResponse(404, 'https://sargassummiami.com/api/other.json'),
  'un autre 404 API reste signalé')
t(!isKnownOutOfScopeResponse(200, 'https://sargassummiami.com/api/b2b-partners.json'),
  'la réponse 200 n’est pas classée comme exception 404')
t(!isKnownOutOfScopeResponse(500, 'https://sargassummiami.com/api/b2b-partners.json'),
  'une erreur serveur sur le chemin legacy reste signalée')

// 1ter. Le contrôle DOM doit détecter l'ancien HTML de production, pas seulement les test IDs du nouveau build.
const auditSource = fs.readFileSync(path.join(ROOT, 'scripts', 'automation', 'user-journey-audit.cjs'), 'utf8')
t(/data-testid="lc-detail-score", \.lc-detail-score/.test(auditSource),
  'l’audit détecte le score dans le build legacy et le build instrumenté')
t(/VOIR LES 7 PROCHAINS JOURS\|SEE THE NEXT 7 DAYS\|VER LOS 7 DÍAS/.test(auditSource),
  'l’audit détecte le CTA prévision legacy réellement visible')
t(/!decisionUi\.hasForecastCta/.test(auditSource),
  'le contrat stale exige aussi la disparition du CTA prévision')

// 2. Classification bloquant/ux.
const cls = classify([
  { type: 'fatal-js' }, { type: 'blank-page' }, { type: 'nav-broken' },
  { type: 'misleading-state' }, { type: 'stale-current-decision' }, { type: 'primary-cta-dead' },
  { type: 'ux' }, { type: 'console-error' }, { type: 'server-error' }
])
t(cls.blocking.length === 6, '6 types bloquants classés, dont stale-current-decision')
t(cls.blocking.some(d => d.type === 'stale-current-decision'), 'une décision périmée est bloquante')
t(cls.ux.length === 3, 'types non-bloquants classés ux (recommandations)')

// 3. Matrice de domaines officielle : regions/index.cjs live!==false.
const regions = require(path.join(ROOT, 'regions', 'index.cjs')).getAllRegions().filter(r => r.live !== false)
t(regions.length === 6, `6 domaines live dans la matrice officielle (trouvé ${regions.length})`)
for (const r of regions) {
  t(!!r.domain && !!r.id, `région ${r.id} a un domaine (${r.domain})`)
}
const expectedDomains = ['sargasses-martinique.com', 'sargasses-guadeloupe.com', 'sargassummiami.com', 'sargassumpuntacana.com', 'sargassumcancun.com', 'sargazotulum.com']
t(regions.map(r => r.domain).sort().join(',') === [...expectedDomains].sort().join(','), 'matrice = les 6 domaines de production (aucun inventé)')

// 4. Workflow récurrent : cron ~4h + workflow_dispatch + post-deploy + rapport.
const wfPath = path.join(ROOT, '.github', 'workflows', 'user-journey-audit.yml')
t(fs.existsSync(wfPath), 'workflow user-journey-audit.yml existe')
if (fs.existsSync(wfPath)) {
  const wf = fs.readFileSync(wfPath, 'utf8')
  t(/cron:/.test(wf), 'workflow : cadence cron présente')
  t(/workflow_dispatch/.test(wf), 'workflow : workflow_dispatch (preuve manuelle du mandat)')
  t(/workflow_run/.test(wf), 'workflow : déclenchement post-déploiement (workflow_run)')
  t(/user-journey-audit\.cjs/.test(wf), 'workflow : exécute le script de parcours')
  t(/actions\/upload-artifact/.test(wf), 'workflow : rapport/ Screenshots uploadés en artefact')
}

console.log(`\nUSER_JOURNEY_REPORT_TESTS PASS (${n} assertions)`)
