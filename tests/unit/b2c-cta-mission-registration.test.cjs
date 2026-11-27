#!/usr/bin/env node
'use strict'

/**
 * b2c-cta-mission-registration.test.cjs — verrouille le CONTRAT du script
 * d'enregistrement de la mission « CTA B2C hors mesure » (scripts/revenue/
 * register-b2c-cta-mission.cjs) dans un BAC A SABLE, jamais sur l'état réel.
 *
 * POURQUOI UN BAC A SABLE (et pas une assertion sur .ai/autopilot/queue.json) :
 * mesuré le 2026-11-26 — `npm test` DETRUIT l'état local suivi par Git. La
 * queue réelle (.ai/autopilot/queue.json, fichier SUIVI) sort de la suite
 * complete avec `OPP-TEST-PERSIST` / status `in_progress` (résidu des tests
 * autopilot qui écrivent la vraie queue). Une mission revenue enregistrée
 * localement disparaît donc au premier `npm test`, et un test qui assert
 * l'état réel échoue ensuite — pour une raison qui n'a rien à voir avec la
 * mission. Le contrat, lui, est testable sansEtat partagé : on rejoue le
 * script dans un repo temporaire et on vérifie ce qu'il écrit.
 *
 * Ce test n'écrit RIEN dans le repo : tout est créé puis supprimé dans
 * os.tmpdir(). Aucun réseau, aucun secret, aucun déploiement, aucun prix.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const SCRIPT = path.join(ROOT, 'scripts', 'revenue', 'register-b2c-cta-mission.cjs')
const TASK_ID = 'B2C-PASS-CTA-MEASUREMENT-20261126'

let n = 0
function t(cond, label) {
  n++
  assert.ok(cond, label)
  console.log('OK  ' + label)
}

function main() {
  t(fs.existsSync(SCRIPT), 'script d enregistrement present')

  // ── 1. Le script ne doit contenir aucune capacité réseau ni secret ─────────
  const src = fs.readFileSync(SCRIPT, 'utf8')
  t(
    !/\brequire\(['"](node:)?(http|https|dns|tls)['"]\)/.test(src) &&
      !/\bfetch\(/.test(src) &&
      !/\bhttps?:\/\/[^'"\s]*paylink|payment_link/.test(src),
    'aucun appel réseau, aucun lien de paiement de deviné dans le script'
  )
  // Ne cherche que des VALEURS en dur, pas le mot « secret » dans une consigne.
  t(
    !/(?:api[_-]?key|secret|token|password|bearer)\s*[:=]\s*['"][^'"\s]{8,}['"]/i.test(src),
    'aucune valeur de secret en dur dans le script (les mots seuls dans les consignes ne comptent pas)'
  )
  t(
    !/spawn|exec\(|execSync/.test(src),
    'le script n execute aucun processus externe (idempotence sure)'
  )

  // ── 2. Bac à sable : mini-repo avec les deux fichiers d'état ───────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b2c-reg-'))
  const sandbox = path.join(tmp, 'repo')
  const apDir = path.join(sandbox, '.ai', 'autopilot')
  fs.mkdirSync(path.join(sandbox, 'scripts', 'revenue'), { recursive: true })
  fs.mkdirSync(apDir, { recursive: true })
  const SANDBOX_QUEUE = path.join(apDir, 'queue.json')
  const SANDBOX_STATE = path.join(apDir, 'mission-state.json')
  fs.writeFileSync(SANDBOX_QUEUE, JSON.stringify({ opportunities: [] }, null, 2) + '\n', 'utf8')
  fs.writeFileSync(SANDBOX_STATE, JSON.stringify({ missions: {} }, null, 2) + '\n', 'utf8')
  // Copie byte pour byte : __dirname/../.. du script pointe alors sur le bac.
  fs.copyFileSync(SCRIPT, path.join(sandbox, 'scripts', 'revenue', 'register-b2c-cta-mission.cjs'))

  const run = () =>
    execFileSync(process.execPath, [path.join(sandbox, 'scripts', 'revenue', 'register-b2c-cta-mission.cjs')], {
      encoding: 'utf8'
    })

  try {
    // ── 3. Premier passage : la mission est enregistrée ──────────────────────
    const out1 = run()
    t(/queue : .*enregistr/.test(out1), 'premier passage : entrée ajoutée à la queue du bac')
    t(/mission-state : .*pr_open/.test(out1), 'premier passage : mission enregistrée en pr_open')

    const q = JSON.parse(fs.readFileSync(SANDBOX_QUEUE, 'utf8'))
    const hits = (q.opportunities || []).filter((o) => o && o.id === TASK_ID)
    t(hits.length === 1, 'exactement une entrée de mission (pas de doublon)')

    const o = hits[0]
    t(o.status === 'pr_open', 'statut pr_open (livrée, NON mergée, NON déployée)')
    t(o.severity === 'high', 'sévérité high (défaut de mesure P0 sur le chemin argent)')
    t(o.confidence === 'observed', 'confidence observed (preuves live, pas déduit)')
    t(o.type === 'revenue-blocker', 'typé revenue-blocker (chemin argent)')
    t(o.task && o.task.moneyPath === true, 'moneyPath: true (le CTA est l entrée du checkout)')
    t(o.task && o.task.humanGate === true, 'humanGate: true (validation fondateur requise)')
    t(o.pr && o.pr.number === 1495, 'PR #1495 renseignée')
    t(o.pr && o.pr.branch === 'agent/revenue/b2c-cta-measurement', 'branche de la PR renseignée')
    t(o.pr && o.pr.commit === '60c9eac4e', 'commit du correctif renseigné')
    t(o.pr && o.pr.state === 'OPEN', 'PR déclarée ouverte')
    t(
      typeof o.rollback === 'string' && o.rollback.includes('git revert'),
      'rollback documenté (git revert)'
    )
    t(
      Array.isArray(o.scope.files) &&
        o.scope.files.includes('src/PassOffer.jsx') &&
        o.scope.files.includes('src/PremiumModal.jsx') &&
        o.scope.files.includes('src/Sargasses_PROD.jsx') &&
        o.scope.files.includes('tests/unit/pass-cta-measurement.test.cjs'),
      'périmètre du correctif déclaré (3 fichiers src + le test)'
    )
    t(
      Array.isArray(o.task.constraints) &&
        o.task.constraints.some((c) => /AUCUN montant/i.test(c)) &&
        o.task.constraints.some((c) => /paiement/i.test(c)),
      'contrainte explicite : aucun montant touché, parcours de paiement intact'
    )
    t(
      Array.isArray(o.task.evidence) && o.task.evidence.length >= 5,
      'au moins 5 preuves live citées'
    )
    t(
      o.task.evidence.some((e) => /pass_cta 0/.test(e)) &&
        o.task.evidence.some((e) => /1 147|1147/.test(e)),
      'les preuves citent le chiffre exact du défaut (1 147 ouvertures, pass_cta 0)'
    )
    t(
      o.task.evidence.some((e) => /Code\.js:585/.test(e)) &&
        o.task.evidence.some((e) => /Supabase/.test(e)),
      'les preuves citent la source de l agrégateur et le contrôle navigateur'
    )
    t(
      o.task.beforeAfter &&
        o.task.beforeAfter.routes.includes('https://sargasses-martinique.com/alertes/') &&
        o.task.beforeAfter.before.length > 0 &&
        o.task.beforeAfter.after.length > 0,
      'avant/après documenté avec les routes de contrôle'
    )
    t(
      o.task.metric && /pass_cta/.test(o.task.metric),
      'métrique de suivi nommée (pass_cta mesuré par ?action=funnel)'
    )

    const s = JSON.parse(fs.readFileSync(SANDBOX_STATE, 'utf8'))
    const KEY = 'aveca/sargagame#1495|' + TASK_ID
    t(!!s.missions[KEY], 'mission présente dans mission-state')
    t(s.missions[KEY].state === 'pr_open', 'mission-state : state = pr_open')
    t(s.missions[KEY].branch === 'agent/revenue/b2c-cta-measurement', 'mission-state : branche renseignée')

    // ── 4. Idempotence : relancer ne doit RIEN changer (byte pour byte) ──────
    const queueBefore = fs.readFileSync(SANDBOX_QUEUE)
    const stateBefore = fs.readFileSync(SANDBOX_STATE)
    const out2 = run()
    t(/d.j. enregistr/.test(out2), 'relance : les deux messages disent « déjà enregistré »')
    t(
      fs.readFileSync(SANDBOX_QUEUE).equals(queueBefore) && fs.readFileSync(SANDBOX_STATE).equals(stateBefore),
      'relance : les deux fichiers sont inchangés au byte près'
    )
    t(
      JSON.parse(fs.readFileSync(SANDBOX_QUEUE, 'utf8')).opportunities.length === 1,
      'relance : toujours une seule entrée (pas de doublon)'
    )

    // ── 5. Le bac à sable n a jamais touché l'état réel du repo ──────────────
    const REAL_QUEUE = path.join(ROOT, '.ai', 'autopilot', 'queue.json')
    const realClean = !fs.existsSync(REAL_QUEUE)
      ? true
      : (JSON.parse(fs.readFileSync(REAL_QUEUE, 'utf8')).opportunities || []).every((x) => x.id !== TASK_ID)
    t(realClean, 'l état réel du repo n a pas été pollué par le test')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  console.log(`b2c-cta-mission-registration: OK (${n} assertions)`)
}

main()