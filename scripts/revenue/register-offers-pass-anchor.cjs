#!/usr/bin/env node
'use strict'

/**
 * register-offers-pass-anchor.cjs — enregistre la mission « ancre #pass
 * manquante sur /offres/ » dans la queue Factory locale
 * (.ai/autopilot/queue.json) et dans l'état des missions
 * (.ai/autopilot/mission-state.json).
 *
 * Mission ENGINE revenue 2026-11-27 : l'ancien script de récupération de panier
 * (`scripts/automation/cart-recovery-j3.cjs`) pointait vers `/#pass`, une ancre
 * qui n'existait nulle part. La seule ancre de la page `/offres/` était
 * `id="pro"` (section B2B). Le lien de récupération B2C ne pouvait donc pas
 * atterrir sur la grille des passes.
 *
 * Contexte honnête : le script n'est référencé par aucun workflow GitHub ; il n'y
 * a donc AUCUN impact live aujourd'hui. Le changement supprime un piège dormant
 * et verrouille la cohérence pour une réactivation future.
 *
 * Ce script est idempotent : il ne réécrit pas une entrée déjà présente.
 * Aucun réseau, aucun secret, aucun déploiement, aucun prix touché.
 *
 * Note d'intégration : seuls le PRÉSENT script et son test sont committés sur la
 * branche de mission. Les fichiers d'état locaux (queue.json, mission-state.json)
 * restent du runtime local : les committer créerait un couplage de merge
 * artificiel avec les autres missions revenue ouvertes.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const QUEUE_PATH = path.join(ROOT, '.ai', 'autopilot', 'queue.json')
const STATE_PATH = path.join(ROOT, '.ai', 'autopilot', 'mission-state.json')

const TASK_ID = 'B2C-OFFERS-PASS-ANCHOR-20261127'
// SHA résolu au runtime (non figé) : un amend de la branche ne doit jamais
// laisser un commit périmé enregistré dans la queue Factory locale.
const COMMIT = (() => {
  try {
    return require('node:child_process')
      .execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' })
      .trim()
  } catch (_) { return 'unknown' }
})()
const PR = 1498
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
  'Code sur origin/main : scripts/automation/cart-recovery-j3.cjs:46 = `https://sargasses-martinique.com/#pass`, alors que `/#pass` n existe dans aucune source ni page générée.',
  'Le seul `#pass` du dépôt sur origin/main était cette constante morte ; la page `/offres/` générée par scripts/lib/offers-page.cjs n exposait que `<section id="pro">` et `<div class="grid">` sans ancre B2C.',
  'Les CTA Pro de scripts/lib/home-first.cjs sont volontairement `/offres/#pro` : ce sont des CTA B2B, ils ne doivent pas devenir la cible d un email de récupération B2C.',
  'Contexte d impact honnête : `cart-recovery-j3.cjs` n est référencé par aucun workflow GitHub ; le workflow vivant est sales-lifecycle-emails.yml → recover-abandoned-cart.cjs. Aucun impact live aujourd hui.',
  'Tests : nouveau test dédié + vérification par mutation (retirer id="pass" et rétablir `/#pass` → exit 1 ; restaurer → exit 0).'
]

const opportunity = {
  type: 'revenue-blocker',
  id: TASK_ID,
  fingerprint: `revenue-diagnostic|aveca/sargagame|${PR}|${TASK_ID}`,
  title: 'Ancre `#pass` manquante sur /offres/ : email de récupération B2C vers un lien dormant',
  source: 'diagnostic dépôt agent (opencode), PR #1498',
  severity: 'low',
  confidence: 'observed',
  actionable: 'agent',
  evidence: evidence.join(' | '),
  rollback: `git revert ${COMMIT} (branche agent/revenue/offers-pass-anchor) ; aucun déploiement effectué.`,
  expectedImpact: 'Aucun gain live direct aujourd hui : le script de récupération concerné n est pas câblé sur un workflow. Le gain est la suppression d un lien mort B2C dormant et la garantie qu une réactivation future de l ancien script attériralissait sur la grille des passes, pas sur le haut de page.',
  status: 'pr_open',
  createdAt: NOW,
  scope: {
    files: [
      'scripts/lib/offers-page.cjs',
      'scripts/automation/cart-recovery-j3.cjs',
      'tests/unit/offers-pass-anchor.test.cjs'
    ]
  },
  persona: 'ui-ux',
  pr: {
    number: PR,
    url: `https://github.com/aveca/sargagame/pull/${PR}`,
    state: 'OPEN',
    branch: 'agent/revenue/offers-pass-anchor',
    base: 'main',
    commit: COMMIT
  },
  task: {
    id: TASK_ID,
    source: 'agent',
    priority: 'low',
    mode: 'agent',
    moneyPath: true,
    humanGate: true,
    title: 'Exposer id="pass" sur la grille B2C et réparer le lien /offres/#pass',
    diagnostic: 'Le script de récupération B2C pointait vers `/#pass`, ancre inexistante. La page `/offres/` n exposait que `id=\"pro\"` (B2B). Le lien ne pouvait donc pas cibler la grille des passes. Impact live nul aujourd hui car le script n est référencé par aucun workflow, mais c est un piège de conversion dormant.',
    evidence,
    filesToRead: [
      'scripts/lib/offers-page.cjs',
      'scripts/automation/cart-recovery-j3.cjs',
      'scripts/lib/home-first.cjs',
      'tests/unit/offers-pass-anchor.test.cjs'
    ],
    filesToModify: [
      'scripts/lib/offers-page.cjs',
      'scripts/automation/cart-recovery-j3.cjs',
      'tests/unit/offers-pass-anchor.test.cjs'
    ],
    implementation: [
      'Ajouter `id=\"pass\"` à la grille B2C générée par buildOffersPage.',
      'Corriger `PASS_URL` vers `https://sargasses-martinique.com/offres/#pass`.',
      'Verrouiller par test : id=\"pass\" présent et unique, id=\"pro\" conservé et unique, CTA Pro non recâblés.',
      'Vérifier par mutation que le test détecte la régression.'
    ],
    tests: [
      'tests/unit/offers-pass-anchor.test.cjs (nouveau)',
      'mutation : retirer id=\"pass\" + rétablir `/#pass` → exit 1 (attendu) ; restaurer → exit 0'
    ],
    acceptance: [
      'La grille B2C porte id=\"pass\".',
      'La section B2B conserve id=\"pro\" et les CTA Pro restent `/offres/#pro`.',
      'Aucun lien résiduel vers `/#pass` dans le script.',
      'Aucun prix changé, aucune offre modifiée, aucun parcours de paiement touché, aucun déploiement.'
    ],
    metric: 'Aucune métrique live directe aujourd hui. En cas de réactivation future du script de récupération : taux d atterrissage sur /offres/#pass puis CTR depuis l email, avec ancrage effectif vérifié.',
    rollback: `git revert ${COMMIT}`,
    constraints: [
      'Ne changer AUCUN montant, aucune grille d offre (7,99/14,99/24,99 validés 2026-11-09), aucun webhook, aucun grant.',
      'Ne PAS toucher au parcours de paiement (checkout Mollie on-site).',
      'Ne PAS recâbler les CTA B2B `/offres/#pro` vers la grille B2C.',
      'Ne PAS réactiver ni envoyer d emails de récupération dans cette PR.',
      'Pas de déploiement sans validation explicite sur le SHA exact.',
      'Aucun secret en Git ni dans les logs.'
    ],
    stopCondition: 'Stop si un correctif exige de toucher un prix, un email vivant, ou de merger/déployer sans décision fondateur.',
    beforeAfter: {
      routes: [
        'https://sargasses-martinique.com/offres/'
      ],
      viewports: ['390x844', '1440x900'],
      before: '`PASS_URL` pointe vers `/#pass`, ancre inexistante ; la grille B2C n a aucune id.',
      after: '`PASS_URL` pointe vers `/offres/#pass`, la grille B2C porte id=\"pass\", la section B2B conserve id=\"pro\".'
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
  branch: 'agent/revenue/offers-pass-anchor',
  commit: COMMIT,
  tests: ['node tests/unit/offers-pass-anchor.test.cjs', 'mutation exit 1 puis exit 0'],
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