#!/usr/bin/env node
'use strict'
/**
 * register-no-cold-autopaywall.cjs — enregistre la mission « paywall ouvert à
 * froid sur /alertes/ » dans la queue Factory locale (.ai/autopilot/queue.json)
 * et dans l'état des missions (.ai/autopilot/mission-state.json).
 *
 * Mission ENGINE revenue 2026-11-27 : le paywall s'ouvrait TOUT SEUL à la
 * première visite sur /alertes/ (+ EN/ES) — overlay z=1100 couvrant tout le
 * viewport, page invisible. Funnel 28 j : `alertes_landing` = 305 ouvertures
 * pour `premium_modal_cta` = 0, contre beach_sheet 5,9 % et chasse_detail 1,3 %
 * sur la même fenêtre. Contredit la doctrine enregistrée dans le même fichier
 * (« le mur ne s'ouvre PLUS que sur intention CHAUDE »).
 *
 * Ce script est idempotent : il ne réécrit pas une entrée déjà présente.
 * Aucun réseau, aucun secret, aucun déploiement, aucun prix touché.
 *
 * Note d'intégration : seuls le PRÉSENT script et son test sont committés sur
 * la branche de mission (même convention que register-b2c-cta-mission.cjs).
 * Les fichiers d'état locaux (queue.json, mission-state.json) restent du
 * runtime local : les committer créerait un couplage de merge artificiel avec
 * les autres missions revenue ouvertes.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const QUEUE_PATH = path.join(ROOT, '.ai', 'autopilot', 'queue.json')
const STATE_PATH = path.join(ROOT, '.ai', 'autopilot', 'mission-state.json')

const TASK_ID = 'B2C-NO-COLD-AUTOPAYWALL-20261127'
// SHA résolu au runtime (non figé) : un amend de la branche ne doit jamais
// laisser un commit périmé enregistré dans la queue Factory locale.
const COMMIT = (() => {
  try {
    return require('node:child_process')
      .execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' })
      .trim()
  } catch (_) { return 'unknown' }
})()
const PR = 1496
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
  'LIVE 2026-11-26, lecture seule, aucun paiement, « Payer » JAMAIS cliqué : https://sargasses-martinique.com/alertes/ ouvre le paywall à froid à la première visite ; l overlay (z=1100) couvre tout le viewport ; le DOM de la page n a que 3 <a>, dont UN seul atteignable, et il est DANS la modale (« Avant de payer, voyez nos erreurs → » vers /fiabilite/).',
  'Funnel ?action=funnel, 28 j : alertes_landing = 305 ouvertures pour premium_modal_cta = 0. Sur la même fenêtre, les sources où le mur s ouvre sur intention réelle : beach_sheet 34/2 (5,9 %), chasse_detail 158/2 (1,3 %).',
  'Cause : src/Sargasses_PROD.jsx:13719 `else if(ALERT_PATHS.test(pathname)) openPremium("alertes_landing")` — ouverture sur intention NULLE (simple arrivée sur l URL), sans scroll ni clic.',
  'Contradiction de doctrine prouvée dans le même fichier, 15 lignes plus bas : useEffect « engagement 50 s » neutralisé par un early return volontaire — « l auto-open ouvrait le paywall sur intention TIÈDE → ~0 % CTA + gonflait le dénominateur modal_open + modal interruptif = anti-doctrine calme. Le mur ne s ouvre PLUS que sur intention CHAUDE. »',
  'Décalage offre/demande : le visiteur d /alertes/ vient pour une ALERTE (page rédigée pour ça, cf. contenu noscript `alertes` de vite.config.js) ; on lui servait une offre de prévision 7 jours.',
  'Intention B2C mesurée depuis le correctif #1495 (mergé, 42d832210) : pass_cta est enfin compté, donc la prochaine fenêtre 28 j dira ce que /alertes/ rapporte réellement.',
  'Tests : nouveau test dédié + vérification par mutation (réintroduire la branche fait échouer le test, exit 1) ; suite du worktree de dev 234/282 (les 48 échecs sont préexistants, identiques avant le correctif).'
]

const opportunity = {
  type: 'revenue-blocker',
  id: TASK_ID,
  fingerprint: `revenue-diagnostic|aveca/sargagame|${PR}|${TASK_ID}`,
  title: 'Paywall ouvert à froid sur /alertes/ : 305 ouvertures / 0 CTA, page masquée par le mur',
  source: 'diagnostic live agent (opencode), PR #1496',
  severity: 'medium',
  confidence: 'observed',
  actionable: 'agent',
  evidence: evidence.join(' | '),
  rollback: `git revert ${COMMIT} (branche agent/revenue/no-cold-autopaywall-alertes) ; aucun déploiement effectué.`,
  expectedImpact: 'Retire 305 ouvertures/mois qui convertissaient à 0 : le visiteur d /alertes/ récupère sa page, le dénominateur premium_modal_open cesse d être gonflé (taux modal→CTA redevient lisible), et le code rentre dans sa propre doctrine (mur seulement sur intention chaude). Aucun gain direct attendu — le gain est mesurable après #1495 : ?action=funnel donnera le vrai taux par source sur /alertes/, ce qui rend la prochaine optimisation de l offre sur cette page décidable sur des chiffres au lieu de 0.',
  status: 'pr_open',
  createdAt: NOW,
  scope: {
    files: [
      'src/Sargasses_PROD.jsx',
      'tests/unit/no-cold-paywall-autopen.test.cjs'
    ]
  },
  persona: 'ui-ux',
  pr: {
    number: PR,
    url: `https://github.com/aveca/sargagame/pull/${PR}`,
    state: 'OPEN',
    branch: 'agent/revenue/no-cold-autopaywall-alertes',
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
    title: 'Arrêter l ouverture automatique du paywall sur les chemins d atterrissage d alertes',
    diagnostic: 'Le paywall s ouvrait tout seul sur /alertes/ (+ EN/ES) et masquait entièrement la page (overlay z=1100, seul 1 lien atteignable hors modale). 305 ouvertures / 0 CTA sur 28 j, contre 5,9 % sur beach_sheet et 1,3 % sur chasse_detail à intention réelle. Cause : ouverture sur la seule arrivée dans l URL, sans intention. Contredit la doctrine enregistrée quelques lignes plus bas dans le même fichier.',
    evidence,
    filesToRead: [
      'src/Sargasses_PROD.jsx',
      'vite.config.js',
      'tests/unit/no-cold-paywall-autopen.test.cjs'
    ],
    filesToModify: [
      'src/Sargasses_PROD.jsx',
      'tests/unit/no-cold-paywall-autopen.test.cjs'
    ],
    implementation: [
      'Retirer la branche `else if(ALERT_PATHS.test(pathname)) openPremium("alertes_landing")` de l effet deeplink (src/Sargasses_PROD.jsx).',
      'Documenter sur place la suppression, la preuve live et ce qui reste ouvert (?paywall=1|cancel, ?pro=1, deep-link /alertes/).',
      'Verrouiller par un test : plus aucune ouverture automatique sur un chemin d alertes, entrées explicites intactes, timer « engagement 50 s » toujours neutralisé.',
      'Vérifier par mutation que le test détecte la réintroduction de la branche.'
    ],
    tests: [
      'tests/unit/no-cold-paywall-autopen.test.cjs (nouveau)',
      'mutation : réintroduire la branche → exit 1 (attendu), sans elle → exit 0',
      'node scripts/run-tests.cjs → 234/282 fichiers OK (48 échecs préexistants, inchangés)'
    ],
    acceptance: [
      'Aucun openPremium() appelé sur un chemin d atterrissage d alertes (source alertes_landing supprimée).',
      '?paywall=1|cancel et ?pro=1 continuent d ouvrir le mur (visiteur ayant déjà agi).',
      '/alertes/ conserve son entrée de vente par CLIC : /?paywall=1&utm_source=alertes_noscript.',
      'Aucun prix changé, aucun parcours de paiement modifié.'
    ],
    metric: 'premium_modal_open par source dans ?action=funnel (attendu : alertes_landing à 0) puis taux modal→CTA par source, pass_cta compté depuis #1495.',
    rollback: `git revert ${COMMIT}`,
    constraints: [
      'Ne changer AUCUN montant, aucune grille d offre (7,99/14,99/24,99 validés 2026-11-09), aucun webhook, aucun grant.',
      'Ne PAS toucher au parcours de paiement (checkout Mollie on-site vérifié vivant).',
      'Ne PAS rouvrir un auto-open sur intention tiède (même si le test de conversion le demande) sans décision fondateur.',
      'Pas de déploiement sans validation explicite sur le SHA exact.',
      'Aucun secret en Git ni dans les logs.'
    ],
    stopCondition: 'Stop si un correctif exige de changer un prix ou de merger/déployer sans décision fondateur.',
    beforeAfter: {
      routes: [
        'https://sargasses-martinique.com/alertes/',
        'https://sargasses-guadeloupe.com/alertes/',
        'https://sargasses-martinique.com/'
      ],
      viewports: ['390x844', '1440x900'],
      before: 'Premier chargement de /alertes/ : paywall ouvert automatiquement, overlay couvrant tout le viewport, 3 <a> dans la page dont 1 seul atteignable et DANS la modale.',
      after: 'Premier chargement de /alertes/ : la page s affiche, aucun mur à froid ; le mur ne s ouvre que sur CTA réel (verrou de prévision, dock Veilleur) ou deep-link explicite ?paywall=1.'
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
  branch: 'agent/revenue/no-cold-autopaywall-alertes',
  commit: COMMIT,
  tests: ['node scripts/run-tests.cjs 234/282 (48 échecs préexistants)', 'mutation exit 1'],
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