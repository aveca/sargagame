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

/**
 * Décisions par slot (2026-09-25K, §12) — { asset, slot, reason, provenance }.
 * Jamais une URL seule : chaque choix est expliqué et sourcé. Entrées :
 * imageMap (catalogue), photoClasses (HERO/CARD/THUMB/REJECT + excluded),
 * attributions (photo-attributions.json, CC). Tout est optionnel (null-safe).
 */
function decide(beachId, slot, imageMap, photoClasses, attributions) {
  const none = (reason) => ({ asset: null, slot, reason, provenance: null })
  try {
    const file = imageMap && beachId != null ? imageMap[beachId] : null
    if (!file || typeof file !== "string") return none("pas-de-photo-cataloguee")
    const c = photoClasses ? photoClasses[beachId] : null
    const cls = typeof c === "string" ? c : (c && c.class) || null
    const excluded = !!(c && typeof c === "object" && c.excluded)
    if (excluded) return none("quarantaine-lieu-douteux")
    const src = "/beaches/" + file
    const prov = { source: "catalogue", file, class: cls, attribution: (attributions && attributions[beachId]) || null }
    if (slot === "hero" || slot === "hero_mobile") {
      if (cls === "HERO" || cls === "CARD") return { asset: src, slot, reason: `classe-${cls}`, provenance: prov }
      return none(`classe-${cls || "inconnue"}-insuffisante-pour-hero`)
    }
    if (slot === "card" || slot === "poster") {
      if (cls === "REJECT") return none("classe-REJECT")
      return { asset: src, slot, reason: `classe-${cls || "inconnue"}-ok-carte`, provenance: prov }
    }
    if (slot === "portrait" || slot === "gallery") {
      return none("slot-non-catalogue-manquant-documente")
    }
    return none("slot-inconnu")
  } catch (_) { return none("erreur") }
}

export const hero = (beachId, ctx = {}) => decide(beachId, "hero", ctx.imageMap, ctx.photoClasses, ctx.attributions)
export const heroMobile = (beachId, ctx = {}) => decide(beachId, "hero_mobile", ctx.imageMap, ctx.photoClasses, ctx.attributions)
export const card = (beachId, ctx = {}) => decide(beachId, "card", ctx.imageMap, ctx.photoClasses, ctx.attributions)
export const portrait = (beachId, ctx = {}) => decide(beachId, "portrait", ctx.imageMap, ctx.photoClasses, ctx.attributions)
export const gallery = (beachId, ctx = {}) => decide(beachId, "gallery", ctx.imageMap, ctx.photoClasses, ctx.attributions)
export const poster = (beachId, ctx = {}) => decide(beachId, "poster", ctx.imageMap, ctx.photoClasses, ctx.attributions)
export const atmosphere = (asset) => atmosphereSlot(asset)
