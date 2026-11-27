#!/usr/bin/env node
'use strict'
/**
 * register-b2c-cta-mission.cjs — enregistre la mission « CTA B2C hors mesure »
 * dans la queue Factory locale (.ai/autopilot/queue.json) et dans l'état des
 * missions (.ai/autopilot/mission-state.json).
 *
 * Mission ENGINE revenue 2026-11-26 : `?action=funnel` comptait `pass_cta = 0`
 * sur 28 j alors que le clic CTA existe (prouvé au navigateur) — la beacon
 * Apps Script ne partait jamais (cause n°1) et le clic était compté deux fois
 * (cause n°2). Correctif commité, PR ouverte, NON mergée, NON déployée.
 *
 * Ce script est idempotent : il ne réécrit pas une entrée déjà présente.
 * Aucun réseau, aucun secret, aucun déploiement, aucun prix touché.
 *
 * Note d'intégration : seuls le PRÉSENT script et son test sont committés sur
 * la branche de mission. Les fichiers d'état locaux (queue.json,
 * mission-state.json) restent du runtime local — les committer créerait un
 * couplage de merge artificiel avec les autres missions revenue ouvertes
 * (chacune ajoutant sa propre entrée au même tableau `opportunities`).
 * L'enregistrement local, lui, est bien effectué par l'exécution de ce script.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const QUEUE_PATH = path.join(ROOT, '.ai', 'autopilot', 'queue.json')
const STATE_PATH = path.join(ROOT, '.ai', 'autopilot', 'mission-state.json')

const TASK_ID = 'B2C-PASS-CTA-MEASUREMENT-20261126'
const KEY = `aveca/sargagame#1495|${TASK_ID}`
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
  'LIVE 2026-11-26, ?action=funnel (28 j) : session_start 21 813 → premium_modal_open 1 147 → premium_modal_cta 4 → pass_cta 0 → checkout_redirect 4 → onsite_checkout_opened 0 → payment_paid 0 → payments_real 0 → revenue_real 0.',
  'scripts/appscript/Code.js:585 — l agrégateur lui-même déclare pass_cta = « le VRAI CTA du storefront (sg_pass_cta) » depuis le flip pass-only du 2026-06-25.',
  'Contrôle navigateur sur https://sargasses-martinique.com/alertes/ (aucun paiement, « Payer » JAMAIS cliqué) : le clic sur la carte CTA émet bien sg_pass_cta + CTA_click + 3 POST Supabase analytics_events → le clic existe, la mesure le perdait.',
  'Cause n°1 : track() (src/Sargasses_PROD.jsx) n envoie vers Apps Script (feuille analytics_events, lue par ?action=funnel) que les événements `critical` ; la liste couvrait startsWith("sg_premium") — l ANCIEN abonnement, surface retirée — mais PAS sg_pass_cta, seul CTA réel depuis 5 mois.',
  'Cause n°2 : PassOffer.buy() émettait sg_pass_cta (avec copy_variant), PUIS le onBuy de PremiumModal émettait le MÊME événement (avec source, sans copy_variant) → 2 lignes par clic ; corriger n°1 seul aurait gonflé le taux affiché ×2.',
  'modal_by_source (live, 28 j) : deeplink 504 ouvertures / 0 CTA, alertes_landing 305 / 0 → 809/1 147 (70 %) des ouvertures à zéro clic ; meilleures sources beach_sheet 5,9 % et chasse_detail 1,3 %.',
  'Prix affichés live intacts après correctif : Pass 30 jours 14,99 € (0,50 €/jour) — aucun prix touché, aucun parcours de paiement modifié.',
  'Tests : nouveau test dédié + vérification par mutation (retirer sg_pass_cta de `critical` OU ré-émettre depuis le onBuy fait échouer le test, exit 1) ; suite complète 207/207.'
]

const opportunity = {
  type: 'revenue-blocker',
  id: TASK_ID,
  fingerprint: `revenue-diagnostic|aveca/sargagame|1495|${TASK_ID}`,
  title: 'CTA B2C hors mesure : `pass_cta = 0` alors que le clic existe — corriger la mesure avant de toucher à l offre',
  source: 'diagnostic live agent (opencode), PR #1495',
  severity: 'high',
  confidence: 'observed',
  actionable: 'agent',
  evidence: evidence.join(' | '),
  rollback: 'git revert 60c9eac4e (branche agent/revenue/b2c-cta-measurement) ; aucun déploiement effectué, donc rien à retirer en production.',
  expectedImpact: 'Le taux modal→CTA affiché par ?action=funnel mesurera le parcours qui encaisse (pass 14,99 €) au lieu de 0 structurel — préalable indispensable avant tout ajustement de l offre sur les 70 % d ouvertures à zéro clic (deeplink + alertes_landing) ; la segmentation par source redevient exploitable (copy_variant ET source sur une seule ligne).',
  status: 'pr_open',
  createdAt: NOW,
  scope: {
    files: [
      'src/Sargasses_PROD.jsx',
      'src/PassOffer.jsx',
      'src/PremiumModal.jsx',
      'tests/unit/pass-cta-measurement.test.cjs'
    ]
  },
  persona: 'ui-ux',
  pr: {
    number: 1495,
    url: 'https://github.com/aveca/sargagame/pull/1495',
    state: 'OPEN',
    branch: 'agent/revenue/b2c-cta-measurement',
    base: 'main',
    commit: '60c9eac4e'
  },
  task: {
    id: TASK_ID,
    source: 'agent',
    priority: 'high',
    mode: 'agent',
    moneyPath: true,
    humanGate: true,
    title: 'CTA B2C hors mesure : corriger la beacon sg_pass_cta (cause n°1) et le doublon d émission (cause n°2)',
    diagnostic: 'Le funnel Apps Script comptait pass_cta = 0 sur 28 j alors que le clic CTA est bien émis (prouvé au navigateur : 3 POST Supabase). La beacon Apps Script ne partait jamais — sg_pass_cta absent de la liste `critical` de track() — et le clic était compté deux fois (PassOffer.buy + onBuy de PremiumModal). Le taux modal→CTA affiché mesurait une surface morte (ancien abonnement) au lieu du parcours qui encaisse.',
    evidence,
    filesToRead: [
      'src/Sargasses_PROD.jsx',
      'src/PassOffer.jsx',
      'src/PremiumModal.jsx',
      'scripts/appscript/Code.js',
      'tests/unit/pass-offer-copy.test.cjs'
    ],
    filesToModify: [
      'src/Sargasses_PROD.jsx',
      'src/PassOffer.jsx',
      'src/PremiumModal.jsx',
      'tests/unit/pass-cta-measurement.test.cjs'
    ],
    implementation: [
      'Ajouter sg_pass_cta à la liste `critical` de track() → la beacon Apps Script part, ?action=funnel voit le vrai CTA.',
      'Émettre sg_pass_cta UNE seule fois par clic, depuis PassOffer, avec l attribution complète (copy_variant + source via la nouvelle prop ctaSource, segment, onsite, method card, montants base + effectif).',
      'Les deux points de montage de PassOffer dans PremiumModal transmettent ctaSource={source||"unknown"} et ne ré-émettent plus l événement.',
      'Verrouiller les deux causes + l invariant « aucune étape du tunnel déclarée dans SG_FUNNEL_EVENTS n est hors de la file critique » par un test dédié, vérifié par mutation.'
    ],
    tests: [
      'tests/unit/pass-cta-measurement.test.cjs (nouveau)',
      'mutation 1 : retirer sg_pass_cta de critical → exit 1 (attendu)',
      'mutation 2 : ré-émettre sg_pass_cta depuis le onBuy → exit 1 (attendu)',
      'npm test → 207/207 fichiers OK'
    ],
    acceptance: [
      'sg_pass_cta figure dans la liste `critical` de track().',
      'PassOffer émet sg_pass_cta exactement une fois par clic, avec copy_variant ET source.',
      'Aucune émission sg_pass_cta dans PremiumModal ne lit le payload PassOffer (item.*).',
      'Aucun prix changé, aucun parcours de paiement modifié (le clic ouvre toujours le même checkout Mollie on-site).'
    ],
    metric: 'pass_cta mesuré par ?action=funnel (avant : 0 structurel) puis taux modal→CTA par source (deeplink, alertes_landing, beach_sheet, chasse_detail).',
    rollback: 'git revert 60c9eac4e',
    constraints: [
      'Ne changer AUCUN montant, aucune grille d offre (7,99/14,99/24,99 validés 2026-11-09), aucun webhook, aucun grant.',
      'Ne PAS toucher au parcours de paiement (checkout Mollie on-site vérifié vivant).',
      'Ne jamais compter un paiement TEST comme une vente.',
      'Pas de déploiement sans validation explicite sur le SHA exact.',
      'Aucun secret en Git ni dans les logs.'
    ],
    stopCondition: 'Stop si un correctif exige de changer un prix ou de merger/déployer sans décision fondateur.',
    beforeAfter: {
      routes: [
        'https://sargasses-martinique.com/alertes/',
        'https://sargasses-martinique.com/'
      ],
      viewports: ['390x844', '1440x900'],
      before: 'Clic CTA émis (GA4 + Supabase) mais beacon Apps Script jamais partie → ?action=funnel : pass_cta = 0, et 2 lignes par clic une fois n°1 corrigé seul.',
      after: 'Une seule ligne par clic, beacon partie, attribution complète (copy_variant + source) → pass_cta et le taux modal→CTA mesurent le parcours qui encaisse.'
    }
  },
  _score: 0,
  _economicBonus: 0,
  prOpenedAt: NOW
}

const mission = {
  taskId: TASK_ID,
  repo: 'aveca/sargagame',
  issue: 1495,
  fingerprint: `chatgpt-issue|aveca/sargagame|1495|${TASK_ID}`,
  state: 'pr_open',
  agent: 'opencode',
  model: null,
  key: KEY,
  startedAt: NOW,
  lastHeartbeatAt: NOW,
  branch: 'agent/revenue/b2c-cta-measurement',
  commit: '60c9eac4e',
  tests: ['npm test 207/207', 'mutation 1 exit 1', 'mutation 2 exit 1'],
  pr: 1495,
  attempts: 1,
  reason: null,
  pid: null,
  updatedAt: NOW,
  notes: 'PR ouverte, NON mergée, AUCUN déploiement. Aucun prix changé, aucun parcours de paiement modifié, aucun paiement réel, aucun secret.'
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

console.log('=== Enregistrement mission B2C CTA mesure (Factory locale) ===')
registerQueue()
registerState()
console.log('Fait. Aucun deploiement, aucun secret, aucun prix touché.')