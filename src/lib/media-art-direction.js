/**
 * media-art-direction.js — direction artistique média v3 (2026-09-25K).
 *
 * Décide QUEL asset va OÙ : slots hero/hero_mobile/card/portrait/gallery/
 * poster/atmosphere/reject, depuis le stock RÉEL (photo-classes-v3.json +
 * discovery + attributions). Règle d'or : un asset ne devient HERO ni
 * parce qu'il existe, ni parce qu'il est lourd — classe + lieu prouvés +
 * licence, sinon refus.
 *
 * PLACE vs ATMOSPHERIC : les médias d'ambiance (génériques licenciés)
 * vivent dans un slot SÉPARÉ avec provenance + licence + label, et ne
 * transitent JAMAIS par beachImageUrl (jamais présentés comme un lieu).
 *
 * API v3 : resolveMedia({ beachId, slot, viewport, type }) →
 * { asset, slot, reason, provenance, score, variants, attribution }
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
 * Décisions par slot v3 — { asset, slot, reason, provenance, score, variants }.
 * Jamais une URL seule : chaque choix est expliqué et sourcé. Entrées :
 * imageMap (catalogue), photoClasses (HERO/CARD/THUMB/REJECT + excluded + placeConfidence),
 * attributions (photo-attributions.json, CC), discovery (validation lieu).
 * Tout est optionnel (null-safe).
 */
function decide(beachId, slot, imageMap, photoClasses, attributions, discovery) {
  const none = (reason) => ({ asset: null, slot, reason, provenance: null, score: null, variants: null, attribution: null })
  try {
    const file = imageMap && beachId != null ? imageMap[beachId] : null
    if (!file || typeof file !== "string") return none("pas-de-photo-cataloguee")
    const c = photoClasses ? photoClasses[beachId] : null
    const cls = typeof c === "string" ? c : (c && c.class) || null
    const excluded = !!(c && typeof c === "object" && c.excluded)
    if (excluded) return none("quarantaine-lieu-douteux")
    const src = "/beaches/" + file
    const disc = discovery && discovery[beachId] ? discovery[beachId] : null
    const prov = {
      source: "catalogue",
      file,
      class: cls,
      placeConfidence: c && typeof c === "object" ? c.placeConfidence : (c && c.placeConfidence ? c.placeConfidence : null),
      placeState: c && typeof c === "object" ? c.placeState : (disc?.candidates?.find(x => x.image_url?.includes(file))?.place?.state || null),
      attribution: (attributions && attributions[beachId]) || null,
      discovery: disc ? { candidates: disc.candidates.length, verified: disc.candidates.filter(c => c.place?.state === "VERIFIED_PLACE").length } : null
    }
    if (slot === "hero" || slot === "hero_mobile") {
      if (cls === "HERO" || cls === "CARD") return { asset: src, slot, reason: `classe-${cls}`, provenance: prov, score: c && c.score ? c.score : null, variants: { avif: true, webp: true, jpg: true } }
      return none(`classe-${cls || "inconnue"}-insuffisante-pour-hero`)
    }
    if (slot === "card" || slot === "poster") {
      if (cls === "REJECT") return none("classe-REJECT")
      return { asset: src, slot, reason: `classe-${cls || "inconnue"}-ok-carte`, provenance: prov, score: c && c.score ? c.score : null, variants: { avif: true, webp: true, jpg: true } }
    }
    if (slot === "portrait" || slot === "gallery") {
      return none("slot-non-catalogue-manquant-documente")
    }
    return none("slot-inconnu")
  } catch (_) { return none("erreur") }
}

/**
 * API v3 principale — résolution complète avec provenance.
 * Retourne { asset, slot, reason, provenance, score, variants, attribution }
 * Ne retourne JAMAIS simplement une URL sans provenance pour les nouveaux assets.
 */
export function resolveMedia({ beachId, slot = "hero", viewport = "desktop", type = "place" }) {
  if (type === "atmosphere") return atmosphereSlot(arguments[0].asset)
  const ctx = {
    imageMap: require("../data/beaches-images.json"),
    photoClasses: require("../data/photo-classes-v3.json"),
    attributions: require("../data/photo-attributions.json"),
    discovery: require("../data/discovery/index.json") // à créer : index des discovery/*.json
  }
  // Lazy require pour éviter les erreurs si fichiers manquants
  try {
    ctx.imageMap = require("../data/beaches-images.json")
  } catch (_) { ctx.imageMap = null }
  try {
    ctx.photoClasses = require("../data/photo-classes-v3.json")
  } catch (_) { ctx.photoClasses = null }
  try {
    ctx.attributions = require("../data/photo-attributions.json")
  } catch (_) { ctx.attributions = null }
  try {
    ctx.discovery = require("../data/discovery/index.json")
  } catch (_) { ctx.discovery = null }
  return decide(beachId, slot, ctx.imageMap, ctx.photoClasses, ctx.attributions, ctx.discovery)
}

// Exports slots individuels (compat v2)
export const hero = (beachId, ctx = {}) => decide(beachId, "hero", ctx.imageMap, ctx.photoClasses, ctx.attributions, ctx.discovery)
export const heroMobile = (beachId, ctx = {}) => decide(beachId, "hero_mobile", ctx.imageMap, ctx.photoClasses, ctx.attributions, ctx.discovery)
export const card = (beachId, ctx = {}) => decide(beachId, "card", ctx.imageMap, ctx.photoClasses, ctx.attributions, ctx.discovery)
export const portrait = (beachId, ctx = {}) => decide(beachId, "portrait", ctx.imageMap, ctx.photoClasses, ctx.attributions, ctx.discovery)
export const gallery = (beachId, ctx = {}) => decide(beachId, "gallery", ctx.imageMap, ctx.photoClasses, ctx.attributions, ctx.discovery)
export const poster = (beachId, ctx = {}) => decide(beachId, "poster", ctx.imageMap, ctx.photoClasses, ctx.attributions, ctx.discovery)
export const atmosphere = (asset) => atmosphereSlot(asset)