#!/usr/bin/env node
'use strict'
/**
 * register-b2b-paylink-mission.cjs — enregistre la mission « CTA annuel B2B »
 * dans la queue Factory locale (.ai/autopilot/queue.json) et dans l'état des
 * missions (.ai/autopilot/mission-state.json).
 *
 * Mission ENGINE revenue 2026-11-26 : le CTA annuel du paywall B2B ne
 * s'affichait jamais (drapeau `reachable` exigé par selectB2bPaylink() mais
 * écrit par personne). Correctif commité, PR ouverte, NON mergée, NON déployée.
 *
 * Ce script est idempotent : il ne réécrit pas une entrée déjà présente.
 * Aucune réseau, aucun secret, aucun déploiement.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const QUEUE_PATH = path.join(ROOT, '.ai', 'autopilot', 'queue.json')
const STATE_PATH = path.join(ROOT, '.ai', 'autopilot', 'mission-state.json')

const TASK_ID = 'B2B-PAYLINK-REACHABLE-CTA-20261126'
const KEY = `aveca/sargagame#1494|${TASK_ID}`
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
  'LIVE 2026-11-26 : GET /api/b2b-paylinks.json (worker sg-payments) renvoyait {url, amount, currency} SEULS — sans `reachable`, sans `value`.',
  'selectB2bPaylink() (src/lib/b2b-paylink-offer.mjs:11, garde fa5f37f26) exige `link.reachable === true` → null en permanence.',
  'Aucun écrivain du drapeau `reachable` dans tout le dépôt (git -S reachable sur le JSON statique = 0 occurrence).',
  'LIVE : GET /api/mollie-pay?plan=pro_annual → 200 ; pro_annual_usd → 200 ; brief_annual / brief_annual_usd / territory_annual → 404 (hors B2B_PLANS).',
  'Les 10 URL de public/api/b2b-paylinks.json → 404 : même garde côté emails B2B (scripts/automation/lib/b2b-paylinks.cjs:21) sur un catalogue mort.',
  'Entonnoir 28 j (Apps Script ?action=funnel) : 21 875 session_starts → 1 159 ouvertures modal → 4 CTA → 4 checkout_redirect → 0 onsite_checkout_opened → 0 payment_paid.',
  'Revenu réel (daily-metrics.json) : 69,86 € MRR / 14 abonnés Stripe ; 0 nouveau paiement Stripe sur 30 j ; mollie.paid = {} ; b2b = 0.'
]

const opportunity = {
  type: 'revenue-blocker',
  id: TASK_ID,
  fingerprint: `revenue-diagnostic|aveca/sargagame|1494|${TASK_ID}`,
  title: 'CTA annuel B2B invisible : exposer `reachable` + `value` sur le catalogue de paylinks servi',
  source: 'diagnostic live agent (opencode), PR #1494',
  severity: 'high',
  confidence: 'observed',
  actionable: 'agent',
  evidence: evidence.join(' | '),
  rollback: 'git revert 2736b4ed4 (branche agent/revenue/b2b-paylink-restore) ; aucun déploiement effectué, donc rien à retirer en production.',
  expectedImpact: 'Le CTA annuel B2B redevient exposable (690 € / 790 $) au lieu d une retombée silencieuse /?pro=1 ; les paylinks des emails B2B redevient exploitables ; le drapeau `reachable` devient auto-entretenu (vérification live sans clé API à chaque run du générateur).',
  status: 'pr_open',
  createdAt: NOW,
  scope: {
    files: [
      'workers/sg-payments/index.js',
      'scripts/automation/mollie-paylinks.cjs',
      'src/lib/b2b-paylink-offer.mjs',
      'scripts/automation/lib/b2b-paylinks.cjs',
      'public/api/b2b-paylinks.json'
    ]
  },
  persona: 'ui-ux',
  pr: {
    number: 1494,
    url: 'https://github.com/aveca/sargagame/pull/1494',
    state: 'OPEN',
    branch: 'agent/revenue/b2b-paylink-restore',
    base: 'main',
    commit: '2736b4ed4'
  },
  task: {
    id: TASK_ID,
    source: 'agent',
    priority: 'high',
    mode: 'agent',
    moneyPath: true,
    humanGate: true,
    title: 'CTA annuel B2B invisible : exposer `reachable` + `value` sur le catalogue de paylinks servi',
    diagnostic: 'Le guard `reachable !== true` de selectB2bPaylink() (app) et de urlFromCatalog() (emails B2B) n était satisfait par AUCUN écrivain du dépôt. La worker publiait {url, amount, currency} seuls → le CTA annuel B2B ne s affichait jamais. Le catalogue statique était intégralement mort (404) et aucune alerte ne le signalait.',
    evidence,
    filesToRead: [
      'workers/sg-payments/index.js',
      'src/lib/b2b-paylink-offer.mjs',
      'scripts/automation/mollie-paylinks.cjs',
      'scripts/automation/lib/b2b-paylinks.cjs',
      'public/api/b2b-paylinks.json',
      'src/PremiumModal.jsx',
      'tests/unit/b2b-paylink-offer.test.cjs'
    ],
    filesToModify: [
      'workers/sg-payments/index.js',
      'scripts/automation/mollie-paylinks.cjs',
      'tests/unit/b2b-paylinks-worker-catalog.test.cjs',
      'tests/unit/b2b-paylink-offer.test.cjs'
    ],
    implementation: [
      'Exposer `value` (miroir exact de `amount`) + `reachable: true` sur les deux seuls tiers à page de paiement prouvée vivante (pro_annual 690 EUR, pro_annual_usd 790 USD).',
      'Garder `Cache-Control: no-store` (pas de catalogue figé).',
      'Ajouter une passe de vérification live SANS clé API qui écrit `reachable` + `verifiedAt` à chaque run du générateur.',
      'Restreindre l auto-réparation aux 5 tiers annuels B2B (même montant, même label).',
      'Vérifier-seulement les entrées B2C (grille périmée 4,99/12,99/19,99 vs offre validée 2026-11-09 à 7,99/14,99/24,99).',
      'Verrouiller le contrat par un nouveau test worker + corriger le test qui imposait l état tout-mort.'
    ],
    tests: [
      'tests/unit/b2b-paylinks-worker-catalog.test.cjs (nouveau)',
      'tests/unit/b2b-paylink-offer.test.cjs (contrat assoupli)',
      'npm test → 205/205',
      'npm run build → exit 0 (136 pages plage)',
      'node --check 3/3',
      'git diff --check → exit 0',
      'run locale du générateur : 10 URL sondées, drapeaux écrits, `Invalid Authorization header` attendu (aucune création sans clé)'
    ],
    acceptance: [
      'selectB2bPaylink(catalog, "pro", false) renvoie une URL + un montant depuis le catalogue SERVI par la worker.',
      'Aucun lien marqué `reachable: true` qui répond 404.',
      'Aucun prix changé : `value` reste le miroir de `amount`.',
      'Les tiers sans page de paiement vivante restent absents du catalogue.'
    ],
    metric: 'Part des sessions B2B avec un CTA annuel rendu (avant : 0). La mesure elle-même est cassée — daily-metrics.json figé depuis 2026-08-03 et analytics_events illisible en lecture anon.',
    rollback: 'git revert 2736b4ed4',
    constraints: [
      'Ne JAMAIS recreer les liens B2C (grille perimee) — cela minterait un prix non valide.',
      'Ne changer AUCUN montant, aucune grille d offre, aucun webhook, aucun grant.',
      'Ne jamais compter un paiement TEST comme une vente.',
      'Pas de deploiement sans validation explicite sur le SHA exact.',
      'Aucun secret en Git ni dans les logs.'
    ],
    stopCondition: 'Stop si un correctif exige de changer un prix ou de merger/deployer sans decision fondateur.',
    beforeAfter: {
      routes: [
        'https://sargasses-martinique.com/api/b2b-paylinks.json',
        'https://sargasses-martinique.com/api/mollie-pay?plan=pro_annual',
        'https://sargasses-martinique.com/api/mollie-pay?plan=pro_annual_usd'
      ],
      viewports: ['390x844', '1440x900'],
      before: 'Catalogue servi = {url, amount, currency} seuls → selectB2bPaylink() → null → CTA annuel jamais affiché.',
      after: 'Catalogue servi = {url, amount, currency, value, reachable: true} → CTA annuel 690 € / 790 $ rendu ; vérification live à chaque run.'
    }
  },
  _score: 0,
  _economicBonus: 0,
  prOpenedAt: NOW
}

const mission = {
  taskId: TASK_ID,
  repo: 'aveca/sargagame',
  issue: 1494,
  fingerprint: `chatgpt-issue|aveca/sargagame|1494|${TASK_ID}`,
  state: 'pr_open',
  agent: 'opencode',
  model: null,
  key: KEY,
  startedAt: NOW,
  lastHeartbeatAt: NOW,
  branch: 'agent/revenue/b2b-paylink-restore',
  commit: '2736b4ed4',
  tests: ['npm test 205/205', 'npm run build exit 0', 'node --check 3/3', 'git diff --check exit 0'],
  pr: 1494,
  attempts: 1,
  reason: null,
  pid: null,
  updatedAt: NOW,
  notes: 'PR ouverte, NON mergée, AUCUN déploiement. Aucun prix changé, aucun paiement réel, aucun secret.'
}

function registerQueue() {
  const q = readJson(QUEUE_PATH)
  q.opportunities = q.opportunities || []
  const exists = q.opportunities.some((o) => o && o.id === TASK_ID)
  if (exists) {
    console.log(`  = queue : ${TASK_ID} déjà enregistré (rien réécrit)`)
    return
  }
  q.opportunities.push(opportunity)
  writeJson(QUEUE_PATH, q)
  console.log(`  + queue : ${TASK_ID} enregistré (status pr_open)`)
}

function registerState() {
  const s = readJson(STATE_PATH)
  s.missions = s.missions || {}
  if (s.missions[KEY]) {
    console.log(`  = mission-state : ${KEY} déjà enregistré (rien réécrit)`)
    return
  }
  s.missions[KEY] = mission
  s.updatedAt = NOW
  writeJson(STATE_PATH, s)
  console.log(`  + mission-state : ${KEY} → state=pr_open`)
}

console.log('=== Enregistrement mission B2B paylink (Factory locale) ===')
registerQueue()
registerState()
console.log('Fait. Aucun deploiement, aucun secret, aucun prix touché.')