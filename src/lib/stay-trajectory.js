/**
 * stay-trajectory.js — « LA TRAJECTOIRE » (WOW paywall 2026-09-24, flag ?sgtraj=0).
 *
 * Transforme le passage gratuit → Premium en DEUXIÈME MOMENT WOW :
 *   AUJOURD'HUI (gratuit, connu)  →  ta SEMAINE (premium, décidée)
 * Concept validé par panel adverse (2026-09-24) :
 *   - la valeur = la transformation (point → trajectoire), JAMAIS une liste
 *   - pas de chip « GRATUIT » (le kicker le dit ; pas de risk-reversal)
 *   - confiance % affichée uniquement dans la ligne détail (honnêteté révélée
 *     au tap, pas en wallpaper de doute)
 *   - « semaine au vert » STRICTEMENT conditionnel (7/7 clean, sinon neutre)
 *   - prix lu depuis la source unique (lib/pass-price.js), jamais littéral
 *
 * 100 % DONNÉES RÉELLES : forecast weekly sargassum.json (statut + confiance
 * par jour, qui decroît avec l'horizon = vérité du modèle), backup réel
 * (findAlternatives). AUCUNE donnée inventée, aucun chiffre marketing.
 */

// Statuts → couleur/glyphe (même palette que BeachExperience / fiche).
export const TRAJ_STATUS = {
  clean:    { c: "#22C55E", glyph: "✓" },
  moderate: { c: "#B87A00", glyph: "◐" },
  alert:    { c: "#E8522A", glyph: "✕" },
}

/** Normalise un status fiche (« avoid ») vers le statut forecast (« alert »). */
export const normStatus = (s) =>
  s === "avoid" ? "alert" : s === "clean" ? "clean" : s === "moderate" ? "moderate" : null

/**
 * buildTrajectory — construit la trajectoire du séjour depuis le forecast RÉEL.
 * @param forecast  sargassum.weekly[sid].forecast : [{day, date, status, confidence}, ...]
 * @param todayStatus  beach.status (« clean » | « moderate » | « avoid ») ou null
 * @returns {days, criticalIndex, changeIndex, defaultIndex, counts, lastConf, everAlert}
 *   - criticalIndex : 1er jour (J+1…) À ÉVITER = le « moment critique » du séjour
 *   - defaultIndex  : jour affiché par défaut dans la ligne détail
 *     (critique → 1er changement de statut → dernier jour dispo)
 *   - counts        : {clean, moderate, alert, unknown} — vérité, jamais dérivée
 *   - everAlert     : un jour alert existe (aujourd'hui inclus) → plan B pertinent
 */
export function buildTrajectory(forecast, todayStatus) {
  const days = (Array.isArray(forecast) ? forecast : []).slice(0, 7).map((d, i) => ({
    i,
    day: d && d.day ? String(d.day) : "",
    date: d && d.date ? String(d.date) : "",
    status: d && d.status === "alert" ? "alert" : d && d.status === "clean" ? "clean" : d && d.status === "moderate" ? "moderate" : null,
    confidence: d && typeof d.confidence === "number" ? Math.round(d.confidence) : null,
  }))
  let criticalIndex = -1
  for (let i = 1; i < days.length; i++) { if (days[i].status === "alert") { criticalIndex = i; break } }
  let changeIndex = -1
  const t = normStatus(todayStatus)
  if (criticalIndex < 0 && t) {
    for (let i = 1; i < days.length; i++) { if (days[i].status && days[i].status !== t) { changeIndex = i; break } }
  }
  const lastIndex = days.length - 1
  const defaultIndex = criticalIndex >= 0 ? criticalIndex : changeIndex >= 0 ? changeIndex : lastIndex
  const counts = days.reduce((a, d) => { a[d.status || "unknown"]++; return a }, { clean: 0, moderate: 0, alert: 0, unknown: 0 })
  const lastConf = lastIndex >= 0 ? days[lastIndex].confidence : null
  return { days, criticalIndex, changeIndex, defaultIndex, counts, lastConf, everAlert: criticalIndex >= 0 || t === "alert" }
}
