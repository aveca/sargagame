#!/usr/bin/env node
'use strict'

/**
 * revenue-mission-registration.test.cjs — verrouille l'enregistrement de la
 * mission « CTA annuel B2B » dans la queue Factory locale.
 *
 * Enjeu : une mission revenue livrée (PR ouverte) mais ABSENTE de la queue
 * retombe dans l'oubli — aucun agent ne la reprend, aucun suivi de merge,
 * aucun suivi de deploiement. A l'inverse, un doublon dans la queue fait
 * retravailler un correctif déjà livré (et risque un second déploiement).
 *
 * Le test est en LECTURE SEULE sur l'état : il ne réécrit rien, il constate
 * que le contrat d'enregistrement est tenu.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const QUEUE_PATH = path.join(ROOT, '.ai', 'autopilot', 'queue.json')
const STATE_PATH = path.join(ROOT, '.ai', 'autopilot', 'mission-state.json')
const SCRIPT = path.join(ROOT, 'scripts', 'revenue', 'register-b2b-paylink-mission.cjs')
const TASK_ID = 'B2B-PAYLINK-REACHABLE-CTA-20261126'
const KEY = `aveca/sargagame#1494|${TASK_ID}`

let n = 0
function t(cond, label) {
  n++
  assert.ok(cond, label)
  console.log('OK  ' + label)
}

function main() {
  t(fs.existsSync(QUEUE_PATH), 'queue Factory locale presente')
  t(fs.existsSync(SCRIPT), 'script d enregistrement present')

  const q = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'))
  const hits = (q.opportunities || []).filter((o) => o && o.id === TASK_ID)
  t(hits.length === 1, `une seule entree ${TASK_ID} dans la queue (pas de doublon)`)

  const o = hits[0]
  t(o.status === 'pr_open', 'statut = pr_open (livree, NON mergée, NON déployée)')
  t(o.severity === 'high', 'severite high (defaut commercial P0)')
  t(o.confidence === 'observed', 'confidence observed (preuves live, pas déduit)')
  t(o.task && o.task.moneyPath === true, 'moneyPath: true (touche le chemin argent)')
  t(o.task && o.task.humanGate === true, 'humanGate: true (validation fondateur requise)')
  t(o.pr && o.pr.number === 1494, 'PR #1494 referencee')
  t(o.pr && o.pr.branch === 'agent/revenue/b2b-paylink-restore', 'branche de la PR referencee')
  t(o.pr && o.pr.state === 'OPEN', 'PR encore ouverte')
  t(
    typeof o.rollback === 'string' && o.rollback.includes('git revert'),
    'rollback documenté (git revert)'
  )
  t(
    Array.isArray(o.task.constraints) &&
      o.task.constraints.some((c) => /B2C|prix non valide/i.test(c)) &&
      o.task.constraints.some((c) => /AUCUN montant|prix/i.test(c)),
    'contrainte explicite : ne PAS recreer les liens B2C (prix non valide), aucun montant touché'
  )
  t(
    Array.isArray(o.task.evidence) && o.task.evidence.length >= 5,
    'au moins 5 preuves live citees (sonde worker, garde selectB2bPaylink, sondes mollie-pay, 404 catalogue, entonnoir, revenu reel)'
  )
  t(
    o.task.evidence.some((e) => /404/.test(e)) && o.task.evidence.some((e) => /200/.test(e)),
    'les preuves distinguent clairement 200 (vivant) et 404 (mort)'
  )

  // Idempotence : relancer le script ne doit RIEN ajouter.
  const before = fs.readFileSync(QUEUE_PATH, 'utf8')
  const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
  t(/d.j. enregistr/.test(out), 'relance = idempotente (aucune reecriture)')
  t(fs.readFileSync(QUEUE_PATH, 'utf8') === before, 'le fichier de queue est inchange apres relance')

  // Etat des missions (fichier local non suivi par Git).
  if (fs.existsSync(STATE_PATH)) {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
    t(!!s.missions[KEY], `mission enregistree dans mission-state (${KEY})`)
    t(s.missions[KEY].state === 'pr_open', 'mission-state : state = pr_open')
  }

  console.log(`revenue-mission-registration: OK (${n} assertions)`)
}

main()