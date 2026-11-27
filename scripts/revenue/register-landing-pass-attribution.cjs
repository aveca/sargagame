#!/usr/bin/env node
'use strict'

/**
 * register-landing-pass-attribution.cjs — enregistre la mission « CTA voyageur
 * de l'accueil hors attribution » dans la queue Factory locale
 * (.ai/autopilot/queue.json) et dans l'état des missions
 * (.ai/autopilot/mission-state.json).
 *
 * Mission ENGINE revenue 2026-11-27 : le CTA « Pass voyageur / Traveler pass /
 * Pase viajero » du premier peint des 6 accueils de région était le SEUL
 * producteur utilisateur de `?paywall=1` sans `utm_source`. Funnel 28 j :
 * source `deeplink` = 504 ouvertures / 0 CTA. La plus grande entrée B2C à haute
 * intention retombait donc dans le bucket fourre-tout `deeplink`
 * (src/Sargasses_PROD.jsx:13709), indiscernable du bruit.
 *
 * Ce script est idempotent : il ne réécrit pas une entrée déjà présente.
 * Aucun réseau, aucun secret, aucun déploiement, aucun prix touché.
 *
 * Note d'intégration : seuls le PRÉSENT script et son test sont committés sur
 * la branche de mission (même convention que register-no-cold-autopaywall.cjs).
 * Les fichiers d'état locaux (queue.json, mission-state.json) restent du
 * runtime local : les committer créerait un couplage de merge artificiel avec
 * les autres missions revenue ouvertes.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const QUEUE_PATH = path.join(ROOT, '.ai', 'autopilot', 'queue.json')
const STATE_PATH = path.join(ROOT, '.ai', 'autopilot', 'mission-state.json')

const TASK_ID = 'B2C-LANDING-PASS-ATTRIBUTION-20261127'
// SHA résolu au runtime (non figé) : un amend de la branche ne doit jamais
// laisser un commit périmé enregistré dans la queue Factory locale.
const COMMIT = (() => {
  try {
    return require('node:child_process')
      .execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' })
      .trim()
  } catch (_) { return 'unknown' }
})()
const PR = 1497
const KEY = `aveca/sargagame#${PR}|${TASK_ID}`
const NOW = new Date().toISOString()

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  // Préserve les fins de ligne CRLF déjà utilisées par ces fichiers d'état.
  const eol = fs.readFileSync(file, 'utf8').includes('\r\n') ? '\r\n' : '\n'
  fs.writeFileSync(file, JSON.stringify(value, null, 2).split('\n').join(eol) + eol)
}

const evidence = [
  'LIVE 2026-11-26, lecture seule, aucun paiement, « Payer » JAMAIS cliqué : balayage des 6 domaines de région (martinique, guadeloupe, miami, cancun, tulum, puntacana) — chacun n a qu un lien `?paywall=1`, et il est NU : `/?paywall=1&pass=p30`, sans `utm_source`. C est le CTA voyageur du premier peint (scripts/lib/home-first.cjs, FR/EN/ES).',
  'Funnel ?action=funnel, 28 j : source `deeplink` = 504 ouvertures pour premium_modal_cta = 0. `deeplink` est le bucket fourre-tot du deep-link paywall (src/Sargasses_PROD.jsx:13709 : `utm_source` absent → `"deeplink_"+u` tronqué) → ces clics réels sont indiscernables du bruit.',
  'Preuve de l anomalie par comparaison dans le depot : TOUS les autres producteurs de `?paywall=1` passent un `utm_source` (`/a-propos/` = `utm_source=apropos`, noscript `/alertes/` = `utm_source=alertes_noscript`, campagnes, emails, fiche-dive = `utm_source=fiche_*`). Seul home-first.cjs l oubliait.',
  'Ce CTA porte un prix réel (Pass voyageur 14,99 € / Traveler pass $16.99 selon région) → c est la plus grande entrée B2C à haute intention, et elle n etait attribuable à aucune campagne.',
  'L offre ne changeait pas déjà : `?pass=p30` est bien consommé par PremiumModal (resolvePass → p30) ; le défaut est d attribution, pas de sélection d offre.',
  'Tests : nouveau test dédié + vérification par mutation (retirer `utm_source=landing_pass` d une langue fait échouer le test, exit 1 ; le restaurer le fait repasser).'
]

const opportunity = {
  type: 'revenue-blocker',
  id: TASK_ID,
  fingerprint: `revenue-diagnostic|aveca/sargagame|${PR}|${TASK_ID}`,
  title: 'CTA voyageur de l accueil hors attribution : 504 ouvertures `deeplink` indiscernables du bruit',
  source: 'diagnostic live agent (opencode), PR #1497',
  severity: 'medium',
  confidence: 'observed',
  actionable: 'agent',
  evidence: evidence.join(' | '),
  rollback: `git revert ${COMMIT} (branche agent/revenue/landing-pass-attribution) ; aucun déploiement effectué.`,
  expectedImpact: 'Le bucket `deeplink` cesse d être un fourre-tout : la prochaine fenêtre 28 j sépare les clics réels du CTA d accueil (`landing_pass`) du bruit résiduel, ce qui rend enfin décidable — sur des chiffres — si cette surface convertit ou si elle doit être retravaillée. Aucun gain direct attendu : le gain est la lisibilité de la mesure avant toute décision d offre.',
  status: 'pr_open',
  createdAt: NOW,
  scope: {
    files: [
      'scripts/lib/home-first.cjs',
      'tests/unit/landing-pass-cta-attribution.test.cjs'
    ]
  },
  persona: 'ui-ux',
  pr: {
    number: PR,
    url: `https://github.com/aveca/sargagame/pull/${PR}`,
    state: 'OPEN',
    branch: 'agent/revenue/landing-pass-attribution',
    base: 'main',
    commit: COMMIT
  },
  task: {
    id: TASK_ID,
    source: 'agent',
    priority: 'medium',
    mode: 'agent',
    moneyPath: true,
    humanGate: true,
    title: 'Attribuer le CTA voyageur du premier peint (utm_source=landing_pass)',
    diagnostic: 'Le CTA voyageur du premier peint des 6 accueils de région etait le seul producteur utilisateur de `?paywall=1` sans `utm_source`. Il retombait donc dans le bucket fourre-tout `deeplink` : 504 ouvertures / 0 CTA sur 28 j, alors que ce CTA porte un prix réel. Le défaut est d attribution, pas de sélection d offre (`?pass=p30` est déjà correctement consommé).',
    evidence,
    filesToRead: [
      'scripts/lib/home-first.cjs',
      'src/Sargasses_PROD.jsx',
      'src/PremiumModal.jsx',
      'tests/unit/landing-pass-cta-attribution.test.cjs'
    ],
    filesToModify: [
      'scripts/lib/home-first.cjs',
      'tests/unit/landing-pass-cta-attribution.test.cjs'
    ],
    implementation: [
      'Ajouter `utm_source=landing_pass` aux 3 liens `/?paywall=1&pass=p30` (ES, EN, FR) dans firstPaintInner.',
      'Conserver strictement `pass=p30` (l offre présélectionnée ne change pas).',
      'Verrouiller par un test : attribution présente dans la source ET dans le HTML généré (FR/EN/ES), aucun `?paywall=1` nu, libellés `Pass voyageur` / `Traveler pass` / `Pase viajero` inchangés.',
      'Vérifier par mutation que le test détecte la régression.'
    ],
    tests: [
      'tests/unit/landing-pass-cta-attribution.test.cjs (nouveau)',
      'mutation : retirer utm_source=landing_pass d une langue → exit 1 (attendu), le restaurer → exit 0'
    ],
    acceptance: [
      'Les 3 CTA `?paywall=1` du premier peint portent `utm_source=landing_pass`.',
      '`pass=p30` reste conservé sur les 3 langues (aucune offre modifiée).',
      'Aucun libellé de promo inventé, aucun prix changé.',
      'Aucun parcours de paiement modifié, aucun déploiement.'
    ],
    metric: 'premium_modal_open par source dans ?action=funnel (attendu : apparition de `landing_pass`, `deeplink` réduit au bruit résiduel) puis taux modal→CTA par source, pass_cta compté depuis #1495.',
    rollback: `git revert ${COMMIT}`,
    constraints: [
      'Ne changer AUCUN montant, aucune grille d offre (7,99/14,99/24,99 validés 2026-11-09), aucun webhook, aucun grant.',
      'Ne PAS toucher au parcours de paiement (checkout Mollie on-site vérifié vivant).',
      'Ne PAS inventer de campagne ni de promotion : seul un paramètre d attribution est ajouté.',
      'Pas de déploiement sans validation explicite sur le SHA exact.',
      'Aucun secret en Git ni dans les logs.'
    ],
    stopCondition: 'Stop si un correctif exige de changer un prix ou de merger/déployer sans décision fondateur.',
    beforeAfter: {
      routes: [
        'https://sargasses-martinique.com/',
        'https://sargasses-guadeloupe.com/',
        'https://sargassummiami.com/'
      ],
      viewports: ['390x844', '1440x900'],
      before: 'Le CTA voyageur du premier peint pointe vers `/?paywall=1&pass=p30` sans `utm_source` ; les clics réels se comptent dans `deeplink` (504 / 28 j).',
      after: 'Le même CTA pointe vers `/?paywall=1&pass=p30&utm_source=landing_pass` ; les clics sont segmentables dans `?action=funnel` sans changer l offre.'
    }
  },
  _score: 0,
  _economicBonus: 0,
  prOpenedAt: NOW
}

const mission = {
  taskId: TASK_ID,
  repo: 'aveca/sargagame',
  issue: PR,
  fingerprint: `chatgpt-issue|aveca/sargagame|${PR}|${TASK_ID}`,
  state: 'pr_open',
  agent: 'opencode',
  model: null,
  key: KEY,
  startedAt: NOW,
  lastHeartbeatAt: NOW,
  branch: 'agent/revenue/landing-pass-attribution',
  commit: COMMIT,
  tests: ['node tests/unit/landing-pass-cta-attribution.test.cjs', 'mutation exit 1'],
  pr: PR,
  attempts: 1,
  reason: null,
  pid: null,
  updatedAt: NOW,
  notes: 'PR ouverte, NON mergée, AUCUN déploiement. Aucun prix changé, aucun parcours de paiement modifié, aucun paiement réel, aucun secret.'
}

function registerQueue() {
  const q = readJson(QUEUE_PATH)
  q.opportunities = q.opportunities || []
  const existing = q.opportunities.find((o) => o.id === TASK_ID)
  if (existing) {
    // Mise à jour du seul lien PR/commit (idempotence sur le reste).
    existing.pr = opportunity.pr
    existing.prOpenedAt = opportunity.prOpenedAt
    existing.status = 'pr_open'
    console.log('queue : entrée déjà présente, seuls pr/commit/status rafraîchis')
  } else {
    q.opportunities.push(opportunity)
    console.log('queue : entrée ajoutée')
  }
  writeJson(QUEUE_PATH, q)
}

function registerState() {
  let s = {}
  try { s = readJson(STATE_PATH) } catch (_) { s = { missions: {} } }
  s.missions = s.missions || {}
  if (s.missions[KEY]) {
    Object.assign(s.missions[KEY], mission)
    console.log('state : mission déjà présente, rafraîchie')
  } else {
    s.missions[KEY] = mission
    console.log('state : mission enregistrée')
  }
  writeJson(STATE_PATH, s)
}

registerQueue()
registerState()
console.log(`→ mission ${TASK_ID} enregistrée (PR #${PR}, commit ${COMMIT})`)