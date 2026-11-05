'use strict'
/**
 * detail-decision-ui.cjs — mesure HONNÊTE de l'état décisionnel de la fiche
 * plage (lc-detail), réutilisée par l'audit parcours ET par les tests.
 *
 * POURQUOI CE MODULE EXISTE (défaut mesuré le 2026-11-05)
 * --------------------------------------------------------
 * L'audit parcours mesurait le score courant avec :
 *
 *     const score = document.querySelector('[data-testid="lc-detail-score"]')
 *     const scoreValue = score?.querySelector('.lc-detail-scnum')?.textContent?.trim() || ''
 *     hasCurrentScore: !!score && /\d/.test(scoreValue)
 *
 * Deux défauts making la mesure FAUSSE :
 *
 *  1. `data-testid="lc-detail-score"` est introduit PAR LA GARDE fail-closed
 *     (7a4c6a21). Tant que la garde n'est pas déployée, le build servi ne
 *     contient pas ce data-testid => `querySelector` renvoie null =>
 *     `hasCurrentScore=false`. Or la CAPTURE montre un score À L'ÉCRAN : le
 *     score est porté par la classe LEGACY `.lc-detail-scnum`, présente dans
 *     tous les builds. Conclusion : l'audit annonçait « pas de score » pendant
 *     qu'un score était visible (faux négatif).
 *  2. `/\d/` matche le suffixe `/100` rendu dans le `<small>` du score. Un
 *     score MASQUÉ (« —/100 ») comptait donc comme un score courant (faux
 *     positif).
 *
 * Le forecast avait le même angle mort : le build legacy affiche un CTA
 * « VOIR LES 7 PROCHAINS JOURS » qui n'est PAS un `.lc-detail-fc-row`, donc
 * `hasForecast` valait false alors que le CTA de prévision était visible.
 *
 * CORRECTION
 * ----------
 * On mesure le TEXTE RENDU (`innerText`) et la VISIBILITÉ réelle
 * (`getClientRects()` + styles calculés) des nœuds Legacy, qui existent dans
 * tous les builds, et on retire le suffixe `/100` avant de décider si le score
 * est un nombre. Les data-testid de la garde restent utilisés, mais uniquement
 * pour les états « suspendu » (qui, eux, n'existent que dans le build
 * fail-closed — c'est le comportement attendu).
 */

// ── Côté navigateur ─────────────────────────────────────────────────────────
// Fonction AUTOCONTAINUE (aucune référence externe) : elle est sérialisée par
// Playwright et évaluée dans la page.
function measureDetailDecisionUiInBrowser() {
  var isVisible = function (el) {
    if (!el || el.nodeType !== 1) return false
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false
    var style = null
    try { style = window.getComputedStyle(el) } catch (_) { style = null }
    if (style) {
      if (style.display === 'none') return false
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false
    }
    return true
  }
  var visibleAll = function (selector) {
    var out = []
    var nodes = document.querySelectorAll(selector)
    for (var i = 0; i < nodes.length; i++) if (isVisible(nodes[i])) out.push(nodes[i])
    return out
  }
  var renderedText = function (el) {
    if (!el) return ''
    var text = (typeof el.innerText === 'string' && el.innerText) ? el.innerText : (el.textContent || '')
    return String(text).replace(/\s+/g, ' ').trim()
  }

  // Score visible : classe LEGACY `.lc-detail-scnum` (présente avant ET après
  // la garde). Le suffixe « /100 » est retiré : « —/100 » n'est PAS un score.
  var scoreNode = visibleAll('.lc-detail-scnum')[0] || null
  var scoreNumber = ''
  if (scoreNode) {
    var clone = scoreNode.cloneNode(true)
    var smalls = clone.querySelectorAll('small')
    for (var s = 0; s < smalls.length; s++) smalls[s].parentNode.removeChild(smalls[s])
    scoreNumber = String(clone.textContent || '').replace(/\s+/g, ' ').trim()
  }

  var headNode = visibleAll('.lc-detail-head')[0] || null
  var fcRow = visibleAll('.lc-detail-fc-row')[0] || null
  var ctaRe = /VOIR LES 7 PROCHAINS JOURS|SEE THE NEXT 7 DAYS|VER LOS 7 DÍAS/i
  var forecastCta = null
  var ctas = visibleAll('button, a, [role="button"]')
  for (var c = 0; c < ctas.length; c++) {
    if (ctaRe.test(renderedText(ctas[c]))) { forecastCta = ctas[c]; break }
  }

  return {
    head: renderedText(headNode),
    scoreText: scoreNumber,
    hasCurrentScore: !!scoreNode && /^\d+(?:[.,]\d+)?$/.test(scoreNumber),
    scorePaused: visibleAll('[data-testid="lc-detail-score-paused"]').length > 0,
    staleNotice: visibleAll('[data-testid="lc-detail-stale"]').length > 0,
    hasForecast: !!fcRow || !!forecastCta,
    forecastPaused: visibleAll('[data-testid="lc-detail-forecast-paused"]').length > 0
  }
}

// ── Côté Node ───────────────────────────────────────────────────────────────
const HEAD_FAIL_CLOSED_RE = /À VÉRIFIER|CHECK REQUIRED|POR VERIFICAR/i

/**
 * Mesure l'état décisionnel dans une page Playwright.
 * @param {import('playwright').Page} page
 */
async function measureDetailDecisionUi(page) {
  return await page.evaluate(measureDetailDecisionUiInBrowser)
}

/**
 * Contrat fail-closed : aucun verdict/score/prévision courant ne doit être
 * affiché quand l'observation satellite n'est pas courante.
 * @param {{hasCurrentScore:boolean,scorePaused:boolean,staleNotice:boolean,hasForecast:boolean,forecastPaused:boolean,head:string}} ui
 */
function isFailClosedDecisionUi(ui) {
  if (!ui) return false
  return !ui.hasCurrentScore && ui.scorePaused === true && ui.staleNotice === true &&
    !ui.hasForecast && ui.forecastPaused === true && HEAD_FAIL_CLOSED_RE.test(ui.head || '')
}

module.exports = {
  measureDetailDecisionUiInBrowser,
  measureDetailDecisionUi,
  isFailClosedDecisionUi,
  HEAD_FAIL_CLOSED_RE
}
