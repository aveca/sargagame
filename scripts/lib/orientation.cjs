/**
 * orientation.cjs — ORIENTATION moyen terme (J+14-21), honnête, calculée au build.
 *
 * Le verdict daté par plage s'arrête à ~4 j (forecast.cjs). Au-delà, on ne donne PAS
 * de prévision : on donne une ORIENTATION qualitative, à deux niveaux :
 *   1. RÉGION  — {phase saisonnière} × {tendance multi-semaines mesurée, SOUS GATE de bruit}
 *                + contexte « bancs au large » qualitatif. Sert la planif ramassage (B2B).
 *   2. PLAGE   — {phase région} × {exposition de la plage (côte au vent vs abritée)}
 *                + la trajectoire mesurée PROPRE à cette plage. Sert la décision de
 *                réservation (B2C, fiche plage complète, jamais la preview).
 *
 * GARDE-FOUS DURS (le moat = honnêteté) :
 *   - ZÉRO pourcentage, ZÉRO tonne, ZÉRO date, ZÉRO couleur de verdict par plage.
 *   - La DIRECTION {hausse/stable/baisse} ne sort QUE si la série passe le GATE DE BRUIT
 *     (|net| > 2× plus gros saut journalier ET ≤2 inversions). Sinon → direction:null
 *     (« pas de tendance nette, historique court ») : on n'habille jamais du bruit en tendance.
 *   - Vocabulaire strictement ORDINAL. Aucun littéral numérique exporté.
 *   - La phase saisonnière vient de season-climatology.cjs (sourcée), jamais inventée.
 *
 * Pur / déterministe / testable. Aucune fetch, aucune dépendance externe.
 */

const { phaseForRegion } = require('./season-climatology.cjs')

const TREND_WINDOW_DAYS = 28        // fenêtre tendance (l'historique fait ~31 j aujourd'hui)
const TREND_HALF_DAYS = 7           // demi-fenêtre pour comparer début vs fin
const STABLE_EPS = 0.012            // |net| sous ce seuil AFAI ⇒ 'stable' (pas de direction marquée)
const SWING_FACTOR = 2              // |net| doit dépasser SWING_FACTOR× le plus gros saut journalier
const MAX_REVERSALS = 2             // au-delà, la série zigzague ⇒ bruit ⇒ pas de direction

/** Moyenne AFAI régionale d'un snapshot (sur les plages à afai numérique). */
function snapshotMean(levels) {
  if (!Array.isArray(levels)) return null
  const v = levels.map(l => (l && typeof l.afai === 'number') ? l.afai : null).filter(x => x != null)
  if (!v.length) return null
  return v.reduce((a, b) => a + b, 0) / v.length
}

/** Extrait la série journalière de moyenne AFAI (triée par date, fenêtre limitée). */
function meanSeries(history, windowDays = TREND_WINDOW_DAYS) {
  const arr = Array.isArray(history) ? history : (history && history.history) || []
  const pts = arr
    .filter(e => e && e.date && Array.isArray(e.levels))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(e => ({ date: e.date, mean: snapshotMean(e.levels) }))
    .filter(p => p.mean != null)
  return pts.slice(-windowDays)
}

/**
 * Tendance multi-semaines SOUS GATE de bruit.
 * @returns {{ direction:'hausse'|'stable'|'baisse'|null, net:number, maxDaySwing:number, reversals:number, n:number }}
 *          direction:null = gate échoué (historique trop court / trop bruité).
 */
function trendUnderNoiseGate(series) {
  const n = series.length
  if (n < TREND_HALF_DAYS * 2) return { direction: null, net: 0, maxDaySwing: 0, reversals: 0, n }

  const head = series.slice(0, TREND_HALF_DAYS)
  const tail = series.slice(-TREND_HALF_DAYS)
  const avg = a => a.reduce((s, p) => s + p.mean, 0) / a.length
  const net = avg(tail) - avg(head)

  let maxDaySwing = 0, reversals = 0, prevDelta = 0
  for (let i = 1; i < n; i++) {
    const delta = series[i].mean - series[i - 1].mean
    if (Math.abs(delta) > maxDaySwing) maxDaySwing = Math.abs(delta)
    if (i > 1 && Math.sign(delta) !== 0 && Math.sign(prevDelta) !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) reversals++
    if (Math.sign(delta) !== 0) prevDelta = delta
  }

  // GATE : un mouvement net doit dominer clairement le plus gros saut journalier, et la
  // série ne doit pas zigzaguer. Sinon on refuse de nommer une tendance.
  const passes = Math.abs(net) > SWING_FACTOR * maxDaySwing && reversals <= MAX_REVERSALS
  let direction = null
  if (passes) direction = Math.abs(net) < STABLE_EPS ? 'stable' : (net > 0 ? 'hausse' : 'baisse')

  return {
    direction,
    net: Math.round(net * 1000) / 1000,
    maxDaySwing: Math.round(maxDaySwing * 1000) / 1000,
    reversals,
    n,
  }
}

/** Contexte « bancs au large » qualitatif (jamais de chiffre exporté). */
function offshoreContext(banks) {
  const count = banks && typeof banks.bankCount === 'number'
    ? banks.bankCount
    : (banks && Array.isArray(banks.banks) ? banks.banks.length : null)
  if (count == null) return 'inconnu'        // pas de donnée bancs
  if (count === 0) return 'aucun'            // aucun banc détecté dans la zone
  if (count <= 5) return 'peu'               // quelques bancs
  return 'present'                            // bancs nombreux au large
}

/**
 * ORIENTATION RÉGION (B2B planif ramassage).
 * @returns {{ phase, source, direction, trend, offshore }}
 */
function regionOrientation(island, history, banks, date) {
  const { phase, source } = phaseForRegion(island, date)
  const series = meanSeries(history)
  const trend = trendUnderNoiseGate(series)
  return {
    phase,
    source,
    direction: trend.direction,          // null si gate échoué
    trend,                                // détail pour test/debug, jamais affiché tel quel
    offshore: offshoreContext(banks),     // 'aucun'|'peu'|'present'|'inconnu'
  }
}

/** Série AFAI propre à UNE plage (sa propre trajectoire mesurée). */
function beachMeanSeries(beachId, history, windowDays = TREND_WINDOW_DAYS) {
  const arr = Array.isArray(history) ? history : (history && history.history) || []
  return arr
    .filter(e => e && e.date && Array.isArray(e.levels))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(e => {
      const bl = e.levels.find(l => l && l.id === beachId)
      return bl && typeof bl.afai === 'number' ? { date: e.date, mean: bl.afai } : null
    })
    .filter(Boolean)
    .slice(-windowDays)
}

/**
 * Exposition d'une plage : 'abritee' (côte sous le vent, rarement touchée même en saison)
 * vs 'exposee' (côte au vent / ouverte, reçoit le sargasse en saison). Dérivée du champ
 * `coast` de la donnée plage ('sheltered' → abritée). Sans donnée d'exposition → null
 * (on n'invente pas : on retombe sur l'orientation région seule).
 */
function beachExposure(beach) {
  if (!beach) return null
  if (beach.coast === 'sheltered') return 'abritee'
  if (beach.coast === 'atlantic') return 'exposee'
  return null
}

/**
 * Fraction de la trajectoire récente de la plage passée en « propre » (statut clean /
 * afai < 0.15). Qualitatif : sert à dire « cette plage est restée propre ces dernières
 * semaines » sans exporter de chiffre.
 * @returns {{ cleanShare:number, n:number } | null}
 */
function beachRecentCleanShare(beachId, history, windowDays = 14) {
  const s = beachMeanSeries(beachId, history, windowDays)
  if (s.length < 5) return null
  const clean = s.filter(p => p.mean < 0.15).length
  return { cleanShare: clean / s.length, n: s.length }
}

/**
 * ORIENTATION PLAGE (B2C, fiche complète, aide à la réservation).
 * Combine phase région × exposition × trajectoire propre de la plage. Renvoie des CLÉS
 * ordinales (pas de copy : la copy vit côté front/email, i18n). null si on n'a pas de
 * quoi dire quelque chose d'honnête et de spécifique à la plage.
 *
 * @returns {{ phase, exposure, outlook, selfTrack, region } | null}
 *   outlook ∈ 'epargnee'|'risque-faible'|'risque-modere'|'risque-eleve'
 */
function beachOrientation(beach, island, history, date) {
  if (!beach) return null
  const { phase, region } = phaseForRegion(island, date)
  const exposure = beachExposure(beach)
  if (!exposure) return null                       // pas d'expo connue → pas d'orientation plage spécifique

  // Combinaison phase × exposition → niveau d'orientation (ordinal, jamais daté/chiffré).
  let outlook
  if (exposure === 'abritee') {
    // Côte abritée : généralement épargnée même en pleine saison (alizés poussent au large).
    outlook = phase === 'pleine-saison' ? 'risque-faible' : 'epargnee'
  } else {
    // Côte exposée : suit la saison.
    outlook = phase === 'pleine-saison' ? 'risque-eleve'
      : phase === 'approche-saison' ? 'risque-modere'
      : 'risque-faible'
  }

  const clean = beachRecentCleanShare(beach.id, history)
  const selfTrack = clean == null ? null
    : clean.cleanShare >= 0.8 ? 'majoritairement-propre'
    : clean.cleanShare <= 0.3 ? 'majoritairement-chargee'
    : 'mitigee'

  return { phase, exposure, outlook, selfTrack, region }
}

/**
 * REPÈRE DE SAISON par plage (B2C, fiche complète, aide réservation 2-3 sem).
 *
 * Construit à partir de DEUX entrées réelles SEULEMENT (cf. audit honnêteté 2026-06-29) :
 *   (A) la phase climatologique RÉGIONALE sourcée (season-climatology.cjs) ;
 *   (B) le statut MESURÉ propre à CETTE plage (beach.status de beaches-list.json),
 *       seul signal réellement par-plage qu'on possède.
 *
 * NE DÉPEND PAS de l'exposition (coast/coastNormal = null pour les 136 plages en prod →
 * « côte exposée/abritée » serait de la physique fabriquée = violation du moat) NI de
 * l'historique par plage (broadcast par cluster, 53 ids → 24 traces identiques → pas
 * spécifique à la plage). Renvoie des CLÉS ordinales, jamais de copy (la copy/i18n vit
 * côté front). Aucune date, aucun %, aucune couleur de verdict.
 *
 * @returns {{ phase, measuredStatus, tone:'reassure'|'check'|'calm', source } | null}
 *          null si le statut de la plage est absent (règle « montrer MOINS » : on n'invente pas).
 */
function beachSeasonRepere(beach, island, date) {
  if (!beach) return null
  const status = beach.status
  if (status !== 'clean' && status !== 'moderate' && status !== 'avoid') return null // pas de statut mesuré → on se tait
  const { phase, source } = phaseForRegion(island != null ? island : beach.island, date)
  // tone : hors-saison → 'calm' (repère rassurant de basse saison, quel que soit le statut) ;
  // sinon rassurance si mesuré propre, « repasse vérifier » si chargé. Jamais d'alarme.
  const tone = phase === 'hors-saison' ? 'calm' : (status === 'clean' ? 'reassure' : 'check')
  return { phase, measuredStatus: status, tone, source }
}

module.exports = {
  regionOrientation,
  beachOrientation,
  beachSeasonRepere,
  beachExposure,
  // exportés pour tests / réutilisation
  meanSeries,
  trendUnderNoiseGate,
  offshoreContext,
  beachMeanSeries,
  beachRecentCleanShare,
  TREND_WINDOW_DAYS,
}
