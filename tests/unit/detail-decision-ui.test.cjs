#!/usr/bin/env node
'use strict'
/**
 * detail-decision-ui.test.cjs — preuve navigateur de la correction du
 * sélecteur de l'audit parcours (mission P0.118 §9).
 *
 * DÉFAUT MESURÉ (2026-11-05)
 * --------------------------
 * L'audit mesurait `hasCurrentScore` via
 * `document.querySelector('[data-testid="lc-detail-score"]')`.
 * Ce data-testid est introduit PAR LA GARDE fail-closed (7a4c6a21) : tant
 * qu'elle n'est pas déployée, le build servi ne le contient pas, le
 * sélecteur renvoie `null`, et l'audit annonce `hasCurrentScore=false`
 * ALORS QUE LA CAPTURE MONTRE UN SCORE À L'ÉCRAN (porté par la classe legacy
 * `.lc-detail-scnum`, présente dans tous les builds).
 *
 * Second défaut : `/\d/.test(scoreValue)` matchait le suffixe `/100`, donc un
 * score MASQUÉ (« —/100 ») comptait comme un score courant.
 *
 * Troisième angle mort : le CTA de prévision « VOIR LES 7 PROCHAINS JOURS »
 * du build legacy n'est pas un `.lc-detail-fc-row` => `hasForecast=false`
 * alors que le CTA est visible.
 *
 * CE TEST
 * --------
 * Joue 4 fixtures HTML dans un vrai Chromium et vérifie la MESURE (texte
 * rendu + visibilité), pas la source :
 *   F1 build legacy   → score visible + CTA 7 j visible  => mesuré « courant »
 *   F2 score masqué   → « —/100 »                          => PAS un score
 *   F3 fail-closed    → score/prévision suspendus         => contrat respecté
 *   F4 score masqué par CSS (display:none)                => invisible = ignoré
 * + la régression : l'ANCIEN sélecteur se trompe sur F1 (le défaut est réel).
 */

const assert = require('node:assert/strict')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const {
  measureDetailDecisionUiInBrowser,
  isFailClosedDecisionUi
} = require(path.join(ROOT, 'scripts', 'automation', 'lib', 'detail-decision-ui.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

// ── Fixtures HTML ───────────────────────────────────────────────────────────

// F1 : build LEGACY (avant garde), cas RÉEL de production : la prévision n'est
// pas disponible => pas de `.lc-detail-fc-row`, mais le CTA « VOIR LES 7
// PROCHAINS JOURS » est bien rendu à l'écran.
const LEGACY_HTML = `<!doctype html><html lang="fr"><body>
  <div class="lc-detail">
    <div class="lc-detail-head s-ok">BAIGNADE OK</div>
    <div class="lc-detail-score">
      <span class="lc-detail-scnum">72<small>/100</small></span>
      <span class="lc-hp"><span class="lc-hpfill s-ok"></span></span>
    </div>
    <button type="button" class="lc-cta yel">VOIR LES 7 PROCHAINS JOURS →</button>
  </div>
</body></html>`

// F1b : build LEGACY avec les 7 jours réellement disponibles (`.lc-detail-fc-row`).
const LEGACY_WITH_ROWS_HTML = `<!doctype html><html lang="fr"><body>
  <div class="lc-detail">
    <div class="lc-detail-head s-ok">BAIGNADE OK</div>
    <div class="lc-detail-score">
      <span class="lc-detail-scnum">72<small>/100</small></span>
    </div>
    <div class="lc-detail-fc">
      <div class="lc-detail-fc-row"><span>J0</span></div>
    </div>
    <button type="button" class="lc-cta yel">VOIR LES 7 PROCHAINS JOURS →</button>
  </div>
</body></html>`

// F2 : score MASQUÉ mais présent dans le DOM (« —/100 »).
const MASKED_SCORE_HTML = `<!doctype html><html lang="fr"><body>
  <div class="lc-detail">
    <div class="lc-detail-head s-mod">À SURVEILLER</div>
    <div class="lc-detail-score">
      <span class="lc-detail-scnum">—<small>/100</small></span>
    </div>
  </div>
</body></html>`

// F3 : build FAIL-CLOSED (avec la garde) — score et prévision suspendus.
const FAIL_CLOSED_HTML = `<!doctype html><html lang="fr"><body>
  <div class="lc-detail">
    <div class="lc-detail-head s-mod">À VÉRIFIER</div>
    <p class="lc-detail-stale" data-testid="lc-detail-stale" role="status">Observation ancienne ou non validée : aucun verdict, score ou prévision actuelle.</p>
    <div class="lc-detail-score-paused" data-testid="lc-detail-score-paused" role="status">Score masqué : observation non validée.</div>
    <div class="lc-detail-fc" data-testid="lc-detail-forecast-paused" role="status">
      <div class="lc-detail-fc-h">PRÉVISION SUSPENDUE</div>
      <p>Prévision suspendue jusqu'à une nouvelle observation validée.</p>
    </div>
  </div>
</body></html>`

// F4 : nœud legacy présent mais masqué par CSS (visibility) => invisible.
const HIDDEN_SCORE_HTML = `<!doctype html><html lang="fr"><body>
  <div class="lc-detail">
    <div class="lc-detail-head s-mod">À SURVEILLER</div>
    <div class="lc-detail-score" style="display:none">
      <span class="lc-detail-scnum">72<small>/100</small></span>
    </div>
  </div>
</body></html>`

// Ancien sélecteur (le défaut), rejoué tel quel pour prouver la régression.
const OLD_SELECTOR_FN = () => {
  const score = document.querySelector('[data-testid="lc-detail-score"]')
  const scoreValue = score?.querySelector('.lc-detail-scnum')?.textContent?.trim() || ''
  return { hasCurrentScore: !!score && /\d/.test(scoreValue), hasForecast: !!document.querySelector('.lc-detail-fc-row') }
}

async function main() {
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

    // ── F1 : build legacy — la mesure doit voir le score ET le CTA ──────────
    await page.setContent(LEGACY_HTML)
    const legacy = await page.evaluate(measureDetailDecisionUiInBrowser)
    const old = await page.evaluate(OLD_SELECTOR_FN)
    t(old.hasCurrentScore === false, 'RÉGRESSION : l\'ancien sélecteur dit « pas de score » sur le build legacy (le défaut est bien réel)')
    t(old.hasForecast === false, 'RÉGRESSION : l\'ancien sélecteur dit « pas de prévision » alors que le CTA 7 j est visible')
    t(legacy.hasCurrentScore === true, 'CORRECTION : le score VISIBLE du build legacy est détecté (texte rendu + visibilité)')
    t(legacy.scoreText === '72', 'CORRECTION : le score lu est le nombre seul (« 72 »), pas « 72/100 »')
    t(legacy.hasForecast === true, 'CORRECTION : le CTA de prévision 7 jours visible est détecté')
    t(legacy.scorePaused === false && legacy.staleNotice === false && legacy.forecastPaused === false,
      'CORRECTION : le build legacy ne prétend pas être fail-closed')
    t(isFailClosedDecisionUi(legacy) === false, 'CORRECTION : le build legacy n\'est PAS classé fail-closed')

    // ── F1b : build legacy AVEC les 7 jours disponibles (.lc-detail-fc-row) ───
    await page.setContent(LEGACY_WITH_ROWS_HTML)
    const legacyRows = await page.evaluate(measureDetailDecisionUiInBrowser)
    const oldRows = await page.evaluate(OLD_SELECTOR_FN)
    t(oldRows.hasForecast === true, 'RÉGRESSION : l\'ancien sélecteur trouve la `.lc-detail-fc-row` quand elle existe')
    t(legacyRows.hasCurrentScore === true, 'CORRECTION : le score visible est détecté (cas avec 7 jours)')
    t(legacyRows.hasForecast === true, 'CORRECTION : la prévision courante est détectée (cas avec 7 jours)')

    // ── F2 : score masqué « —/100 » → pas un score courant ──────────────────
    await page.setContent(MASKED_SCORE_HTML)
    const masked = await page.evaluate(measureDetailDecisionUiInBrowser)
    t(masked.hasCurrentScore === false, 'CORRECTION : un score masqué « —/100 » ne compte PAS comme score courant (le suffixe /100 ne trompe plus)')
    t(masked.scoreText === '—', 'CORRECTION : le texte du score masqué est bien « — »')

    // ── F3 : build fail-closed → contrat respecté ───────────────────────────
    await page.setContent(FAIL_CLOSED_HTML)
    const closed = await page.evaluate(measureDetailDecisionUiInBrowser)
    t(closed.hasCurrentScore === false, 'FAIL-CLOSED : aucun score courant affiché')
    t(closed.scorePaused === true, 'FAIL-CLOSED : le bandeau « score masqué » est visible')
    t(closed.staleNotice === true, 'FAIL-CLOSED : le message de vérification est visible')
    t(closed.hasForecast === false, 'FAIL-CLOSED : aucune prévision courante')
    t(closed.forecastPaused === true, 'FAIL-CLOSED : la prévision suspendue est visible')
    t(/À VÉRIFIER/.test(closed.head), 'FAIL-CLOSED : le verdict affiché est « À VÉRIFIER »')
    t(isFailClosedDecisionUi(closed) === true, 'FAIL-CLOSED : le contrat fail-closed est reconnu')

    // ── F4 : nœud masqué par CSS → invisible, donc ignoré ───────────────────
    await page.setContent(HIDDEN_SCORE_HTML)
    const hidden = await page.evaluate(measureDetailDecisionUiInBrowser)
    t(hidden.hasCurrentScore === false, 'VISIBILITÉ : un score masqué par CSS (display:none) n\'est pas compté')

    console.log(`\nDETAIL_DECISION_UI_TESTS PASS (${n} assertions)`)
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch(err => { console.error(err); process.exit(1) })
