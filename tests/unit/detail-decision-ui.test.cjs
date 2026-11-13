#!/usr/bin/env node
'use strict'
/**
 * tests/unit/detail-decision-ui.test.cjs — régression du CONTRAT DE MESURE de
 * l'état décisionnel de la fiche plage (`lc-detail`).
 *
 * Contexte (défaut mesuré le 2026-11-07, gate `verify` du run 42227027205) :
 * 12 défauts bloquants `stale-current-decision` (6 domaines × 2 viewports).
 * Le détecteur qui les attrape doit être HONNÊTE dans les deux sens, sinon il
 * laisse passer une régression ou fabrique un faux positif :
 *
 *  1. Faux NÉGATIF — mesurer le score via `[data-testid="lc-detail-score"]`
 *     (qui n'existe QUE dans les builds fail-closed) annule la détection sur
 *     les builds legacy : le score est porté par `.lc-detail-scnum`, présent
 *     dans TOUS les builds. Il faut donc mesurer le TEXTE RENDU de la classe
 *     legacy.
 *  2. Faux POSITIF — `/\d/` matche le suffixe `/100` : un score masqué
 *     (`—/100`) doit PAS compter comme un score courant.
 *  3. Angle mort prévision — le CTA « VOIR LES 7 PROCHAINS JOURS » est le
 *     libellé de la ligne `.lc-detail-fc-row` : il doit être traité comme un
 *     CTA de décision en mode fail-closed (interdit), et comme un libellé
 *     normal quand la grille est affichée.
 *
 * Ce test verrouille ces règles AU NIVEAU UNITAIRE (sans navigateur), et
 * verrouille le câblage : l'audit parcours et le contrôle navigateur DOIVENT
 * utiliser le module partagé (une copie divergente = dérive silencieuse).
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..', '..')
const {
  measureDetailDecisionUiInBrowser,
  checkFailClosedDecisionUi,
  isFailClosedDecisionUi,
  checkCurrentDecisionUi,
  isCurrentDecisionUi,
  HEAD_FAIL_CLOSED_RE
} = require('../../scripts/automation/lib/detail-decision-ui.cjs')

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

// ── 1. Contrat fail-closed : un état conforme passe ─────────────────────────
const COMPLIANT = {
  head: 'À VÉRIFIER',
  scoreText: '',
  hasCurrentScore: false,
  scorePaused: true,
  staleNotice: true,
  hasForecast: false,
  forecastPaused: true,
  hasForecastCta: false,
  verdictWords: []
}
t(isFailClosedDecisionUi(COMPLIANT), 'état fail-closed conforme => contrat tenu')
t(checkFailClosedDecisionUi(COMPLIANT).violations.length === 0, 'aucune violation sur un état conforme')

// ── 2. Contrat fail-closed : chaque fuite est détectée ──────────────────────
const leaks = [
  ['score courant affiché', { ...COMPLIANT, hasCurrentScore: true, scoreText: '66' }],
  ['badge score suspendu absent', { ...COMPLIANT, scorePaused: false }],
  ['avis observation absent', { ...COMPLIANT, staleNotice: false }],
  ['grille de prévision affichée', { ...COMPLIANT, hasForecast: true }],
  ['badge prévision suspendue absent', { ...COMPLIANT, forecastPaused: false }],
  ['CTA de prévision affiché', { ...COMPLIANT, hasForecastCta: true }],
  ['en-tête non fail-closed', { ...COMPLIANT, head: 'GO - Baignade OK' }]
]
for (const [label, ui] of leaks) {
  const result = checkFailClosedDecisionUi(ui)
  t(!result.ok, 'fuite détectée : ' + label)
  t(result.violations.length > 0, 'violation décrite : ' + label)
}

// ── 3. Contrat fail-closed : les en-têtes multi-langues ─────────────────────
for (const head of ['À VÉRIFIER', 'A VERIFICAR', 'CHECK REQUIRED', 'POR VERIFICAR']) {
  t(isFailClosedDecisionUi({ ...COMPLIANT, head }), 'en-tête fail-closed reconnu : ' + head)
}
t(!isFailClosedDecisionUi({ ...COMPLIANT, head: 'À SURVEILLER' }), 'en-tête non fail-closed rejeté : À SURVEILLER')
t(HEAD_FAIL_CLOSED_RE.test('à vérifier'), 'regex en-tête insensible à la casse')

// ── 4. Contrat symétrique « décision courante » ─────────────────────────────
const CURRENT = {
  head: 'À SURVEILLER',
  scoreText: '66',
  hasCurrentScore: true,
  scorePaused: false,
  staleNotice: false,
  hasForecast: true,
  forecastPaused: false,
  hasForecastCta: true,
  verdictWords: ['Propre']
}
t(isCurrentDecisionUi(CURRENT), 'observation fraîche => décision courante jugée conforme')
t(!isCurrentDecisionUi({ ...CURRENT, hasCurrentScore: false }), 'observation fraîche sans score => défaut')
t(!isCurrentDecisionUi({ ...CURRENT, scorePaused: true }), 'observation fraîche avec score suspendu => défaut')
t(!isCurrentDecisionUi({ ...CURRENT, staleNotice: true }), 'observation fraîche avec avis périmé => défaut')
t(!isCurrentDecisionUi({ ...CURRENT, hasForecast: false }), 'observation fraîche sans prévision => défaut')
t(!isCurrentDecisionUi({ ...CURRENT, forecastPaused: true }), 'observation fraîche avec prévision suspendue => défaut')

// ── 5. La fonction navigateur est AUTOCONTAINUE ─────────────────────────────
// Elle est sérialisée par Playwright puis évaluée dans la page : toute
// référence à une constante du scope Node serait une ReferenceError en
// production du test (et un faux « contrat tenu » silencieux).
const browserFnSource = measureDetailDecisionUiInBrowser.toString()
for (const forbidden of ['FORECAST_CTA_RE', 'VERDICT_WORD_RE', 'HEAD_FAIL_CLOSED_RE', 'require(', 'module.exports']) {
  t(!browserFnSource.includes(forbidden), 'fonction navigateur sans référence externe : ' + forbidden)
}

// ── 6. La mesure du score ignore le suffixe « /100 » ───────────────────────
// Reproduit la règle appliquée dans le navigateur : le `<small>/100</small>`
// est retiré avant le test numérique (« —/100 » n'est PAS un score).
const scoreTextWithoutScale = (raw) => String(raw).replace(/\/100/g, '').trim()
t(!/\d/.test(scoreTextWithoutScale('—/100')), 'score masqué « —/100 » => pas un score courant')
t(/\d/.test(scoreTextWithoutScale('66/100')), 'score réel « 66/100 » => score courant')

// ── 7. Câblage : l'audit et le contrôle navigateur utilisent le module ──────
const auditSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'automation', 'user-journey-audit.cjs'), 'utf8')
t(/require\('\.\/lib\/detail-decision-ui\.cjs'\)/.test(auditSrc), 'audit parcours : module partagé importé')
t(/measureDetailDecisionUi\(page\)/.test(auditSrc), 'audit parcours : mesure partagée utilisée')
t(/checkFailClosedDecisionUi\(decisionUi\)/.test(auditSrc), 'audit parcours : contrat partagé utilisé')
t(/--base-url/.test(auditSrc), 'audit parcours : mode artefact local (--base-url) disponible')
// L'ancien code inline (mesure fautive) doit avoir disparu.
t(!/hasCurrentScore: visible\(score\) && \/\\d\//.test(auditSrc), 'audit parcours : mesure inline fautive retirée')

const checkSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'automation', 'freshness-contract-check.cjs'), 'utf8')
t(/require\('\.\/lib\/detail-decision-ui\.cjs'\)/.test(checkSrc), 'contrôle navigateur : module partagé importé')
t(/measureDetailDecisionUi/.test(checkSrc) && /checkFailClosedDecisionUi/.test(checkSrc) && /checkCurrentDecisionUi/.test(checkSrc), 'contrôle navigateur : contrat partagé utilisé dans les deux sens')
t(/desktop/.test(checkSrc) && /mobile/.test(checkSrc), 'contrôle navigateur : desktop ET mobile couverts')

console.log('\nDETAIL_DECISION_UI_TESTS PASS (' + n + ' assertions)')
