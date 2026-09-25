/**
 * intents.js — « PERFECT BEACH TRIP » (2026-09-24B)
 *
 * Intentions utilisateur → plages RÉELLES du build. RÈGLE D'OR : un intent
 * n'existe que s'il est adossé à une donnée source RÉELLE du Beach Object
 * (flag kids/snorkel/parking, statut live satellite, coordonnées géographiques).
 * Aucune inférence marketing : « romance », « sauvage », « pêche » et « voile »
 * ne sont PAS proposés (aucun flag source) — ils rejoindront la liste quand une
 * donnée réelle existera. Rollback global : ?sgintent=0 (chips jamais rendus).
 *
 * Pur module (zéro import produit — testable, réutilisable B2C/B2B/B2G).
 */

// Côtés sous le vent = réalité géographique des deux îles (même grille de
// lecture que l'orientation SEO des pages plages, vite.config.js).
const LEEWARD_LNG_MAX = { mq: -61.1, gp: -61.6 }

export const INTENTS = [
  { id: "top",    icon: "⛱",  fr: "Top du jour",   en: "Today's best", es: "Lo mejor hoy",
    match: b => b && b.status === "clean" },
  { id: "snorkel", icon: "🤿", fr: "Snorkeling",    en: "Snorkeling",   es: "Snorkel",
    match: b => !!(b && b.snorkel) },
  { id: "family", icon: "🧒", fr: "Famille",        en: "Family",       es: "Familia",
    match: b => !!(b && b.kids) },
  { id: "sunset", icon: "🌅", fr: "Sunset",         en: "Sunset",       es: "Atardecer",
    match: (b, ctx) => !!(b && isLeeward(b, ctx && ctx.islandBeaches)) },
  { id: "easy",   icon: "🚗", fr: "Accès simple",   en: "Easy access",  es: "Acceso fácil",
    match: b => !!(b && b.parking) },
]

export function intentById(id) {
  return INTENTS.find(i => i.id === id) || null
}

/**
 * Côte sous le vent / orientée coucher de soleil — géométrie RÉELLE :
 * longitude plage < seuil leeward connu (MQ/GP), sinon percentile 25 % ouest
 * des plages de la même île (déterministe, coords uniquement).
 */
export function isLeeward(beach, islandBeaches) {
  if (!beach || beach.lng == null) return false
  const win = LEEWARD_LNG_MAX[beach.island]
  if (win != null) return beach.lng < win
  const lngs = (islandBeaches || []).filter(x => x && x.lng != null && x.island === beach.island).map(x => x.lng).sort((a, b) => a - b)
  if (lngs.length < 4) return false
  const q25 = lngs[Math.floor((lngs.length - 1) * 0.25)]
  return beach.lng <= q25
}

/**
 * Plages pertinentes pour une intention : filtrées par la donnée réelle puis
 * triées clean d'abord, score décroissant. Jamais de plage fabricade : si 0
 * match, retour [] (la surface affiche l'honnêteté, pas un faux résultat).
 */
export function intentBeaches(intentId, beaches, ctx = {}) {
  if (!Array.isArray(beaches) || !beaches.length) return []
  const it = intentById(intentId)
  if (!it) return []
  const rank = s => (s === "clean" ? 0 : s === "moderate" ? 1 : 2)
  return beaches
    .filter(b => b && b.id && it.match(b, ctx))
    .sort((a, b2) => (rank(a.status) - rank(b2.status)) || ((b2.score || 0) - (a.score || 0)))
}

// Phrase d'orientation factuelle (mêmes libellés que les pages plages SEO).
export function coastSentence(beach, lang = "fr") {
  if (!beach || beach.lng == null) return null
  const lee = isLeeward(beach)
  if (lang === "en") return lee ? "Leeward coast (west) — the sheltered side of the island." : "Windward coast (east) — more exposed side."
  if (lang === "es") return lee ? "Costa de sotavento (oeste) — el lado protegido de la isla." : "Costa de barlovento (este) — el lado más expuesto."
  return lee ? "Côte sous le vent (ouest) — versant abrité de l'île." : "Côte au vent (est) — versant exposé de l'île."
}
