'use strict'
/**
 * detail-decision-ui.cjs — mesure HONNÊTE de l'état décisionnel de la fiche
 * plage (`lc-detail`), partagée par l'audit parcours ET par les tests.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * L'audit parcours (`scripts/automation/user-journey-audit.cjs`) mesurait la
 * fiche plage avec des sélecteurs qui mentaient dans les deux sens :
 *
 *  1. Faux NÉGATIF — `data-testid="lc-detail-score"` n'existe QUE dans les
 *     builds porteurs de la garde fail-closed. Tant que la garde n'est pas
 *     déployée, `querySelector` renvoie `null` => « pas de score » alors que
 *     le score EST à l'écran (il est porté par la classe legacy
 *     `.lc-detail-scnum`, présente dans tous les builds). Le détecteur
 *     annonçait donc « conforme » sur un build qui affichait un verdict
 *     courant : c'est exactement la famille de défaut que l'audit doit
 *     attraper (`stale-current-decision`).
 *
 *  2. Faux POSITIF — `/\d/` matche le suffixe `/100` rendu dans le `<small>`
 *     du score. Un score masqué (`—/100`) comptait donc comme un score
 *     courant.
 *
 *  3. Angle mort analogue sur la prévision : le CTA « VOIR LES 7 PROCHAINS
 *     JOURS » n'est pas un `.lc-detail-fc-row`, donc `hasForecast` valait
 *     false alors que le CTA de prévision était visible.
 *
 * CORRECTION
 * ----------
 * On mesure le TEXTE RENDU (`innerText`) et la VISIBILITÉ réelle
 * (`getClientRects()` + styles calculés) des nœuds LEGACY, qui existent dans
 * tous les builds, et on retire le suffixe `/100` avant de décider si le score
 * est un nombre. Les `data-testid` de la garde restent utilisés, mais
 * uniquement pour les états « suspendu » (qui, eux, n'existent que dans le
 * build fail-closed — c'est le comportement attendu).
 *
 * Le module est utilisable :
 *   - côté navigateur : `measureDetailDecisionUiInBrowser` (autocontenue,
 *     sérialisée par Playwright et évaluée dans la page) ;
 *   - côté Node : `measureDetailDecisionUi(page)` + `isFailClosedDecisionUi(ui)`
 *     + `isCurrentDecisionUi(ui)`, testables sans navigateur.
 */

// ── Constantes de contrat (partagées) ───────────────────────────────────────
/** En-tête « état à vérifier » affiché quand aucune décision courante n'est prouvable. */
const HEAD_FAIL_CLOSED_RE = /À\s*VÉRIFIER|A\s*VERIFICAR|CHECK\s+REQUIRED|POR\s+VERIFICAR/i
/** CTA de prévision 7 jours : sa présence prouve qu'une décision de prévision est proposée. */
const FORECAST_CTA_RE = /VOIR LES 7 PROCHAINS JOURS|SEE THE NEXT 7 DAYS|VER LOS 7 D[IÍ]AS/i
/** Mots qui prêtent un verdict favorable/negatif courant à l'utilisateur. */
const VERDICT_WORD_RE = /PROPRE|CLEAN|LIMPIA|MOD[ÉE]R[ÉE]|MODERATE|BAIGNADE OK|SAFE TO SWIM|BA[ÑN]O OK|À ÉVITER|AVOID|EVITAR/i

// ── Côté navigateur ─────────────────────────────────────────────────────────
/**
 * Fonction AUTOCONTAINUE (aucune référence externe : elle est sérialisée par
 * Playwright et évaluée dans la page).
 */
function measureDetailDecisionUiInBrowser() {
  var isVisible = function (el) {
    if (!el || el.nodeType !== 1) return false
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false
    var style = null
    try { style = window.getComputedStyle(el) } catch (_) { style = null }
    if (style) {
      if (style.display === 'none') return false
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false
      if (Number(style.opacity || 1) === 0) return false
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
  // Les regex sont RÉDÉCLARÉES ici (et non importées) : cette fonction est
  // sérialisée par Playwright puis évaluée dans la page, où le scope Node
  // n'existe pas.
  var forecastCtaRe = /VOIR LES 7 PROCHAINS JOURS|SEE THE NEXT 7 DAYS|VER LOS 7 D[IÍ]AS/i
  var verdictWordRe = /PROPRE|CLEAN|LIMPIA|MOD[ÉE]R[ÉE]|MODERATE|BAIGNADE OK|SAFE TO SWIM|BA[ÑN]O OK|À ÉVITER|AVOID|EVITAR/i
  var forecastCta = null
  var ctas = visibleAll('button, a, [role="button"]')
  for (var c = 0; c < ctas.length; c++) {
    if (forecastCtaRe.test(renderedText(ctas[c]))) { forecastCta = ctas[c]; break }
  }

  var body = renderedText(document.body)

  return {
    head: renderedText(headNode),
    scoreText: scoreNumber,
    hasCurrentScore: !!scoreNode && /^\d+(?:[.,]\d+)?$/.test(scoreNumber),
    scorePaused: visibleAll('[data-testid="lc-detail-score-paused"], .lc-detail-score-paused').length > 0,
    staleNotice: visibleAll('[data-testid="lc-detail-stale"], .lc-detail-stale').length > 0,
    hasForecast: !!fcRow,
    forecastPaused: visibleAll('[data-testid="lc-detail-forecast-paused"], .lc-detail-forecast-paused').length > 0,
    hasForecastCta: !!forecastCta,
    verdictWords: (body.match(new RegExp(verdictWordRe.source, 'gi')) || []).slice(0, 8)
  }
}

// ── Côté Node ───────────────────────────────────────────────────────────────
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
 * @param {object} ui
 * @returns {{ok: boolean, violations: string[]}}
 */
function checkFailClosedDecisionUi(ui) {
  const violations = []
  if (!ui) return { ok: false, violations: ['mesure DOM absente'] }
  if (ui.hasCurrentScore) violations.push('score courant affiché (' + (ui.scoreText || '') + ')')
  if (!ui.scorePaused) violations.push('badge "score suspendu" absent')
  if (!ui.staleNotice) violations.push('avis "observation à vérifier" absent')
  if (ui.hasForecast) violations.push('grille de prévision 7 jours affichée')
  if (!ui.forecastPaused) violations.push('badge "prévision suspendue" absent')
  if (ui.hasForecastCta) violations.push('CTA de prévision 7 jours affiché')
  if (!HEAD_FAIL_CLOSED_RE.test(ui.head || '')) violations.push('en-tête non fail-closed: ' + JSON.stringify(ui.head || ''))
  return { ok: violations.length === 0, violations }
}

/**
 * Variante booléenne (compat callers historiques).
 */
function isFailClosedDecisionUi(ui) {
  return checkFailClosedDecisionUi(ui).ok
}

/**
 * Contrat « décision courante » : une observation fraîche DOIT pouvoir produire
 * un score et une prévision (garde-fou symétrique : on ne peut pas « vérifier »
 * le fail-closed en masquant tout le temps).
 *
 * NB : le CTA « VOIR LES 7 PROCHAINS JOURS » est le libellé de la LIGNE de
 * prévision (`.lc-detail-fc-row`, cf. ChasseHome.jsx) : il est donc présent
 * quand la grille est affichée. Il n'est un défaut que dans le sens
 * fail-closed (CTA sans grille ET verdict suspendu) — voir
 * `checkFailClosedDecisionUi`.
 */
function checkCurrentDecisionUi(ui) {
  const violations = []
  if (!ui) return { ok: false, violations: ['mesure DOM absente'] }
  if (!ui.hasCurrentScore) violations.push('aucun score courant affiché sur une observation fraîche')
  if (ui.scorePaused) violations.push('score suspendu alors que l\'observation est fraîche')
  if (ui.staleNotice) violations.push('avis "observation périmée" alors que l\'observation est fraîche')
  if (!ui.hasForecast) violations.push('aucune grille de prévision sur une observation fraîche')
  if (ui.forecastPaused) violations.push('prévision suspendue alors que l\'observation est fraîche')
  return { ok: violations.length === 0, violations }
}

function isCurrentDecisionUi(ui) {
  return checkCurrentDecisionUi(ui).ok
}

module.exports = {
  measureDetailDecisionUiInBrowser,
  measureDetailDecisionUi,
  checkFailClosedDecisionUi,
  isFailClosedDecisionUi,
  checkCurrentDecisionUi,
  isCurrentDecisionUi,
  HEAD_FAIL_CLOSED_RE,
  FORECAST_CTA_RE,
  VERDICT_WORD_RE
}
