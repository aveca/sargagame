/**
 * Resolve a beach's existing local photo without inventing a URL.
 * The map is built from public/data/beaches-images.json and filenames stay
 * same-origin. Missing/unsafe entries deliberately return null so UI can
 * retain its illustrated fallback.
 */
const PHOTO_EXT = /\.(?:avif|webp|png|jpe?g)$/i

export function resolveBeachPhoto(beachId, imageMap) {
  if (typeof beachId !== "string" || !/^[a-z0-9_-]+$/i.test(beachId)) return null
  if (!imageMap || typeof imageMap !== "object" || Array.isArray(imageMap)) return null
  const filename = imageMap[beachId]
  if (typeof filename !== "string" || filename.length === 0 || filename.length > 240) return null
  if (filename.includes("..") || /[\\/]/.test(filename) || !PHOTO_EXT.test(filename)) return null
  return "/beaches/" + encodeURIComponent(filename)
}
