/**
 * sgMotion — helpers de la SARGAGAME MOTION GRAMMAR (voir src/sg-motion.css).
 * Zéro dépendance. Réutilisable par tout écran (home, map, premium, checkout…).
 *
 * off()     → true si la chorégraphie doit être inhibée (?sgmotion=0 ou
 *             prefers-reduced-motion). Le contenu reste, la motion saute.
 * days7()   → 7 jours RÉELS à partir d'aujourd'hui (labels + dates) pour les
 *             cascades « semaine » — calculés depuis Date, jamais inventés.
 * STATUS_C  → palette canonique statut (alignée sur STC / VERDICT).
 */

export function off() {
  try {
    if (/[?&]sgmotion=0(?:&|$)/.test(window.location.search)) return true
  } catch (_) {}
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true
  } catch (_) {}
  return false
}

export const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" }

const DAYS = {
  fr: ["D", "L", "M", "M", "J", "V", "S"],
  en: ["S", "M", "T", "W", "T", "F", "S"],
  es: ["D", "L", "M", "M", "J", "V", "S"],
}

// 7 jours réels dès aujourd'hui : [{day:"L", num:25}] — données calendaires,
// zéro fabrication (conforme au moat honnêteté).
export function days7(lang) {
  const labels = DAYS[lang] || DAYS.fr
  const out = []
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    out.push({ day: labels[d.getDay()], num: d.getDate() })
  }
  return out
}
