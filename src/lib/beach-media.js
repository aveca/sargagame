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

export function mediaKeyForIntent(intentId) {
  // Clé stable pour un futur catalogue orienté activité ; aujourd'hui le média
  // reste celui de la plage recommandée (photo réelle du lieu, jamais de stock).
  return "intent:" + String(intentId || "")
}
