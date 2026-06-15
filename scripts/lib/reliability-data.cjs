/**
 * reliability-data.cjs — Source de vérité UNIQUE de la fiabilité publiée.
 *
 * Consommé par les SURFACES STATIQUES (jamais re-hardcoder un chiffre ailleurs) :
 *   - scripts/lib/reliability-page.cjs → /fiabilite/ (FR) + /reliability/ /fiabilidad/ (régions)
 *     ET écrit <dist>/api/reliability.json (servi) pour les pages purement statiques.
 *   - public/a-propos/index.html → fetch /api/reliability.json côté client (fallback honnête).
 *
 * RÈGLE : ne LIT que la sortie du backtest (scripts/automation/data/backtest-results.json).
 * Ne touche JAMAIS forecast.cjs / confidence.cjs / backtest-forecast.cjs (voie forecast).
 *
 * HONNÊTE, PAS self-harm :
 *   - on publie le HIT RATE PAR RÉGIME (byRegime : statut correct / total), pas l'accuracy
 *     par direction (calm|ALERT 0/638 = le modèle sur-signale en saison calme, en cours de
 *     correction). Le hit-rate par régime est robuste et ne ment pas globalement.
 *   - la calibration saison calme est EN COURS (un correctif réduit les fausses alertes et se
 *     propage à l'archive) → on le DIT, le chiffre s'améliore, on ne cache rien.
 *   - taille d'échantillon toujours affichée (auditable, pas une garantie future).
 * Donnée absente/inexploitable → retourne null → la surface saute la section / garde son fallback.
 */

// Libellés régime. `unknown` = début d'archive (régime non encore classé) = saison haute
// d'après le terrain (l'archive démarre en queue de saison haute) — directive fondateur.
const REGIME_LABEL = {
  calm:       { fr: 'saison calme',  en: 'calm season',     es: 'temporada tranquila' },
  high:       { fr: 'saison haute',  en: 'high season',     es: 'temporada alta' },
  unknown:    { fr: 'saison haute',  en: 'high season',     es: 'temporada alta' },
  transition: { fr: 'transition',    en: 'transition',      es: 'transición' },
}
const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-MX' }
const nf = (lang, n) => Number(n).toLocaleString(LOCALES[lang] || 'fr-FR')

/**
 * Hit rate par régime depuis bt.byRegime (statut prévu == statut observé / total).
 * Trié par taille d'échantillon décroissante (régime dominant d'abord). null si rien.
 * @returns {null | {regimes:Array<{regime,hitRate,samples}>, days, from, to, calmCalibrating}}
 */
function extractRegimeHitRates(bt) {
  const byRegime = bt && bt.byRegime
  if (!byRegime || typeof byRegime !== 'object') return null
  const regimes = []
  for (const [regime, v] of Object.entries(byRegime)) {
    if (!v || !(Number(v.n) > 0) || typeof v.hit !== 'number') continue
    regimes.push({ regime, hitRate: Math.round((v.hit / v.n) * 100), samples: Number(v.n) })
  }
  if (!regimes.length) return null
  regimes.sort((a, b) => b.samples - a.samples)
  // Saison calme en cours de calibration ssi le régime calm porte encore des fausses alertes.
  const calm = byRegime.calm
  const calmCalibrating = !!(calm && Number(calm.falseAlarm) > 0)
  return {
    regimes,
    days: (bt.archiveDays && Number(bt.archiveDays)) || null,
    from: (bt.dateRange && bt.dateRange.archiveFrom) || null,
    to: (bt.dateRange && bt.dateRange.archiveTo) || null,
    calmCalibrating,
  }
}

/** Hit rate par horizon (J+1..J+7) depuis bt.byHorizon. [] si rien. */
function extractHorizons(bt) {
  const bh = bt && bt.byHorizon
  if (!bh) return []
  const out = []
  for (let i = 1; i <= 7; i++) {
    const h = bh[`day${i}`]
    if (!h || !(Number(h.pairs) > 0) || typeof h.statusHitRate !== 'number') continue
    out.push({ horizon: i, hitRate: h.statusHitRate, pairs: Number(h.pairs) })
  }
  return out
}

/**
 * Objet écrit dans <dist>/api/reliability.json — consommé par les pages statiques (a-propos)
 * côté client. Chiffres bruts + libellés régime fr/en/es. null si backtest inexploitable.
 */
function buildReliabilityJson(bt) {
  const reg = extractRegimeHitRates(bt)
  if (!reg) return null
  return {
    computed: bt.computed || null,
    window: { from: reg.from, to: reg.to, days: reg.days },
    overallHitRate: bt.overall && typeof bt.overall.statusHitRate === 'number' ? bt.overall.statusHitRate : null,
    byRegime: reg.regimes.map(r => ({
      regime: r.regime,
      label: REGIME_LABEL[r.regime] || { fr: r.regime, en: r.regime, es: r.regime },
      hitRate: r.hitRate,
      samples: r.samples,
    })),
    byHorizon: extractHorizons(bt),
    calmCalibrating: reg.calmCalibrating,
    note: 'Hit rate = statut prévu (propre/modéré/à éviter) confirmé par le satellite. Calibration saison calme en cours.',
  }
}

module.exports = { extractRegimeHitRates, extractHorizons, buildReliabilityJson, REGIME_LABEL, nf }
