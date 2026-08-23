/**
 * imageResize — prépare une photo visiteur AVANT envoi (privacy + poids).
 *
 * - Redimensionne à `maxDim` px sur le grand côté (≈1280) et ré-encode en JPEG :
 *   le ré-encodage canvas SUPPRIME les métadonnées EXIF (dont la GPS) → privacy.
 * - Utilise createImageBitmap({imageOrientation:'from-image'}) quand dispo pour
 *   appliquer l'orientation EXIF (sinon photos portrait tournées sur iOS/Android).
 * - Renvoie une data URL `data:image/jpeg;base64,…` prête à POSTer.
 */
export async function fileToResizedJpeg(file, { maxDim = 1280, quality = 0.8 } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error("not an image")

  let source = null
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file, { imageOrientation: "from-image" })
    }
  } catch (_) { source = null }

  if (!source) {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result); r.onerror = () => rej(new Error("read fail"))
      r.readAsDataURL(file)
    })
    source = await new Promise((res, rej) => {
      const im = new Image()
      im.onload = () => res(im); im.onerror = () => rej(new Error("decode fail"))
      im.src = dataUrl
    })
  }

  const sw = source.width, sh = source.height
  const scale = Math.min(1, maxDim / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext("2d")
  ctx.drawImage(source, 0, 0, w, h)
  if (source.close) try { source.close() } catch (_) {}
  return canvas.toDataURL("image/jpeg", quality) // ré-encode = EXIF (GPS) strippée
}
