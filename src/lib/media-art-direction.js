/**
 * media-art-direction.js — direction artistique média (2026-09-25J).
 *
 * Décide QUEL asset va OÙ : slots hero/hero_mobile/card/portrait/gallery/
 * poster/atmosphere/reject, depuis le stock RÉEL (photo-classes.json +
 * beachMedia). Règle d'or : un asset ne devient HERO ni parce qu'il
 * existe, ni parce qu'il est lourd — classe + lieu prouvés, sinon refus.
 *
 * PLACE vs ATMOSPHERIC : les médias d'ambiance (génériques licenciés)
 * vivent dans un slot SÉPARÉ avec provenance + licence + label, et ne
 * transitent JAMAIS par beachImageUrl (jamais présentés comme un lieu).
 * Aucun asset atmosphérique en stock aujourd'hui → slot documenté, vide.
 *
 * Pur module (zéro import produit — testable, réutilisable B2C/B2B/B2G).
 */

export const SLOTS = ["hero", "hero_mobile", "card", "portrait", "gallery", "poster", "atmosphere", "reject"]

const RANK = { REJECT: 0, THUMB: 1, CARD: 2, HERO: 3 }

/**
 * Slot d'un asset lieu : { slot, reason }.
 * - excluded/quarantaine → reject (scène SVG honnête).
 * - HERO/CARD → hero (+hero_mobile, même master, crop CSS).
 * - THUMB → card uniquement (≤160px).
 * - REJECT/inconnu → card si mappé (permissif, thumbs), jamais hero.
 */
export function slotFor(beachId, photoClasses) {
  try {
    const c = photoClasses && beachId != null ? photoClasses[beachId] : null
    const cls = typeof c === "string" ? c : (c && c.class) || null
    const excluded = !!(c && typeof c === "object" && c.excluded)
    if (excluded) return { slot: "reject", reason: "quarantine-lieu-douteux" }
    if (cls === "HERO" || cls === "CARD") return { slot: "hero", reason: `classe-${cls}` }
    if (cls === "THUMB") return { slot: "card", reason: "classe-THUMB" }
    if (cls === "REJECT") return { slot: "reject", reason: "classe-REJECT" }
    return { slot: "card", reason: "classe-inconnue-permissive" }
  } catch (_) { return { slot: "card", reason: "erreur" } }
}

/**
 * Totale absence d'assets portrait/gallery multi-photos : le système le
 * DIT au lieu de le masquer (planifie le media pass, jamais de fake).
 */
export function missingSlots() {
  return ["portrait", "gallery"]
}

/**
 * Réserve ATMOSPHERIC : aucun asset stocké. Quand un média d'ambiance
 * licencié existera : { src, license, author, label } + affichage du label
 * (« Ambiance Caraïbes — illustration ») + attribution si requise.
 * Validation : refuse tout asset sans licence, et tout usage en slot lieu.
 */
export function atmosphereSlot(asset) {
  if (!asset || !asset.src || !asset.license) return { slot: "reject", reason: "atmosphere-sans-licence" }
  return { slot: "atmosphere", reason: String(asset.license) }
}
