/**
 * beach-media.js — media registry « PERFECT BEACH TRIP » (2026-09-24B)
 *
 * Règle d'or : AUCune image générique faisant office de photo réelle de lieu.
 * Une plage a une photo si et seulement si `/beaches/<file>` existe et est
 * mappée par beach id dans /data/beaches-images.json (catalogue existant,
 * § ExpMedia). Sinon → null : l'UI garde la scène SVG (fallback existant).
 *
 * Intent → média : l'intent pointe TOUJOURS vers le média de la plage
 * RECOMMANDÉE réelle (jamais d'asset d'ambiance générique « sunset »).
 * data-driven, prêt à recevoir un futur catalogue HD/AVIF (srcset non
 * implémenté faute d'assets — voir note finale).
 *
 * ASSETS MANQUANTS (documentés pour le futur media pass — NE PAS improviser) :
 *  - variantes AVIF/WebP + srcset (aujourd'hui : JPG unique)
 *  - posters vidéo 9:16 systématiques (milieu : /videos/hero/manifest.json,
 *    couverture partielle)
 */
export function beachImageUrl(beachId, imageMap) {
  if (!beachId || !imageMap || typeof imageMap !== "object") return null
  const f = imageMap[beachId]
  if (!f || typeof f !== "string") return null
  return "/beaches/" + f
}

/**
 * CONTRAT v1 (2026-09-25D) — BeachMedia réel, ou null/absence documents.
 * Sources autorisées UNIQUEMENT si présentes sur disque au build :
 *   imageMap  → /data/beaches-images.json      (172 photos réelles, JPG)
 *   imageQ    → /data/beaches-images-quality.json (score qualité 0-100)
 *   heroVids  → /videos/hero/manifest.json ids  (fichiers /videos/hero/<id>.mp4
 *               existants ; variante -w.mp4 = poster web allégé)
 * Convention : « card » = hero (même asset unique pour l'instant) ; portrait /
 * gallery / sunset / activity ne sont PAS fabriqués — présents dans la clé
 * `missing` tant qu'aucun asset réel du type n'existe (documenté, pas masqué).
 */
export function beachMedia(beachId, { imageMap = null, imageQ = null, heroVids = null } = {}) {
  const missing = []
  const media = { hero: null, card: null, portrait: null, gallery: [], sunset: null, activity: [], video: null, quality: null, missing }
  if (!beachId) { missing.push("photo", "portrait", "gallery", "video"); return media }
  const photo = beachImageUrl(beachId, imageMap)
  const q = imageQ && typeof imageQ[beachId] === "number" ? imageQ[beachId] : null
  if (photo) {
    media.hero = { src: photo, type: "photo", alt: null }
    media.card = media.hero
    media.quality = q
  } else missing.push("photo")
  if (Array.isArray(heroVids) && heroVids.includes(beachId)) {
    media.video = {
      src: `/videos/hero/${beachId}.mp4`,
      poster: photo || null,
      webShadow: `/videos/hero/${beachId}-w.mp4`,
    }
  } else missing.push("video")
  missing.push("portrait", "gallery", "sunset", "activity")
  return media
}

export function mediaKeyForIntent(intentId) {
  // Clé stable pour un futur catalogue orienté activité ; aujourd'hui le média
  // reste celui de la plage recommandée (photo réelle du lieu, jamais de stock).
  return "intent:" + String(intentId || "")
}

/**
 * Classes qualité v2 (2026-09-25H) — `public/data/photo-classes.json`.
 * Format : string simple ("HERO") si affichable, objet {class, excluded:true}
 * si quarantaine lieu-douteux. Jamais de throw (données optionnelles).
 */
export function photoClass(classes, beachId) {
  try {
    const c = classes && beachId != null ? classes[beachId] : null
    if (!c) return { class: null, excluded: false }
    if (typeof c === "string") return { class: c, excluded: false }
    return { class: c.class || null, excluded: !!c.excluded }
  } catch (_) { return { class: null, excluded: false } }
}

const CLASS_RANK = { REJECT: 0, THUMB: 1, CARD: 2, HERO: 3 }

/**
 * La photo peut-elle occuper un slot donné ? Slots HERO (plein-bleed,
 * today 16/9) exigent HERO/CARD ; slots CARD (≤160px) acceptent THUMB.
 * Exclu ou inconnu (pas de classes chargées) → règle sûre : les grands
 * slots exigent une classe connue, les petits restent permissifs.
 */
export function photoAllowed(classes, beachId, slot = "CARD") {
  try {
    const { class: c, excluded } = photoClass(classes, beachId)
    if (excluded) return false
    if (!c) return slot !== "HERO"
    return (CLASS_RANK[c] || 0) >= (slot === "HERO" ? 2 : 1)
  } catch (_) { return slot !== "HERO" }
}
