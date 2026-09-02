'use strict'
// forecast-contract.cjs — CONTRAT UNIQUE de prévision plage (partagé front + tests).
//
// Source unique de normalisation des séries J+0…J+6 servies par :
//   - public/api/copernicus[/<region>]/sargassum.json   (weekly[id].forecast, J+0/J+1 public)
//   - public/api/copernicus/forecast-beach.php           (7 jours, 1 plage, gratuit)
//   - public/api/copernicus/forecast.php                 (bulk, payant)
//
// Le frontend N'INVENTE JAMAIS de jour manquant : une journée invalide/absente est
// renvoyée comme `null` (à rendre « indisponible », jamais rebouchée avec des données
// artificielles). C'est la règle produit intouchable (moat = honnêteté).

const VALID_STATUS = new Set(['clean', 'moderate', 'avoid'])

/** Jour normalisé : {day,date,afai,status,confidence,type} ou null si invalide. */
function normalizeForecastDay(d) {
  if (!d || typeof d !== 'object') return null
  const status = VALID_STATUS.has(d.status) ? d.status : null
  if (!status) return null
  const afai = typeof d.afai === 'number' && isFinite(d.afai) && d.afai >= 0 ? d.afai : null
  const confidence = typeof d.confidence === 'number' && isFinite(d.confidence)
    ? Math.max(0, Math.min(100, Math.round(d.confidence)))
    : null
  return {
    day: typeof d.day === 'string' ? d.day : null,
    date: typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null,
    afai,
    status,
    confidence,
    type: typeof d.type === 'string' ? d.type : null,
  }
}

/**
 * Normalise une série brute → tableau de 0..7 jours valides (séries plus longues
 * tronquées à 7). Toute journée invalide DANS la fenêtre est un null positionnel
 * (rendu « indisponible ») — jamais supprimée silencieusement, jamais fabriquée.
 * Retourne [] si l'entrée n'est pas un tableau ou ne contient aucun jour valide.
 */
function normalizeForecast(raw, maxDays) {
  if (!Array.isArray(raw)) return []
  const n = Math.min(maxDays || 7, 7)
  const out = []
  for (let i = 0; i < Math.min(raw.length, n); i++) out.push(normalizeForecastDay(raw[i]))
  const anyValid = out.some(Boolean)
  return anyValid ? out : []
}

/** Vrai si la série couvre AU MOINS n jours valides consécutifs à partir de J+0. */
function hasDays(days, n) {
  if (!Array.isArray(days)) return false
  for (let i = 0; i < n; i++) if (!days[i]) return false
  return true
}

const RANK = { clean: 0, moderate: 1, avoid: 2 }

/**
 * Tendance J0 → J+n depuis la série (réelle).
 * Retour : {dir:'up'|'down'|'flat', from, to, atIndex} ou null si <2 jours valides.
 * 'up' = dégradation (risque en hausse), 'down' = amélioration.
 */
function trendFromDays(days) {
  if (!Array.isArray(days) || !days[0]) return null
  if (!days.slice(1).some(Boolean)) return null // une seule journée → pas de tendance
  const first = days[0]
  for (let i = 1; i < days.length; i++) {
    const d = days[i]
    if (!d) continue
    if (RANK[d.status] !== RANK[first.status]) {
      return {
        dir: RANK[d.status] > RANK[first.status] ? 'up' : 'down',
        from: first.status,
        to: d.status,
        atIndex: i,
      }
    }
  }
  // Même statut : baser sur afai (Δ > 0.1 = signal réel ; seuils calés sur statusFromAfai 0.15/0.40)
  let last = null
  for (let i = 1; i < days.length; i++) { if (days[i] && typeof days[i].afai === 'number') last = days[i] }
  if (last && typeof first.afai === 'number') {
    const delta = last.afai - first.afai
    if (delta >= 0.1) return { dir: 'up', from: first.status, to: first.status, atIndex: days.length - 1 }
    if (delta <= -0.1) return { dir: 'down', from: first.status, to: first.status, atIndex: days.length - 1 }
  }
  return { dir: 'flat', from: first.status, to: first.status, atIndex: 0 }
}

/** Clé jour local YYYY-MM-DD (fuseau utilisateur — c'est SA journée qui compte). */
function localDayKey(d) {
  const dt = d instanceof Date ? d : new Date()
  const p = n => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/**
 * Compare le snapshot d'hier avec l'état courant → la boucle « revenir demain ».
 * prev = {day,status} (stocké localStorage), todayStatus = statut courant, todayKey = localDayKey().
 * Retour : {changed:boolean, from, to} ou null si pas de snapshot d'un jour précédent.
 */
function dailyChange(prev, todayStatus, todayKey) {
  if (!prev || !prev.day || !VALID_STATUS.has(prev.status)) return null
  if (!VALID_STATUS.has(todayStatus)) return null
  if (prev.day === todayKey) return { changed: false, from: prev.status, to: todayStatus }
  return { changed: prev.status !== todayStatus, from: prev.status, to: todayStatus }
}

module.exports = {
  VALID_STATUS,
  RANK,
  normalizeForecastDay,
  normalizeForecast,
  hasDays,
  trendFromDays,
  localDayKey,
  dailyChange,
}
