#!/usr/bin/env node
/**
 * optimize-beach-images.cjs — génère un .webp redimensionné à côté de chaque
 * photo de plage (public/beaches/*.jpg|jpeg|png). Les pages SEO les servent en
 * <picture> (WebP + fallback JPG), donc les navigateurs modernes téléchargent
 * ~10× moins. Idempotent : saute un .webp déjà à jour (mtime >= source).
 *
 * Affichage cible = 800×450 (object-fit:cover). On rend à 1000px de large max
 * (marge retina) en WebP q78. Aucune source supprimée (fallback JPG conservé).
 *
 * Usage : node scripts/optimize-beach-images.cjs
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const DIR = path.join(__dirname, '..', 'public', 'beaches')
const MAX_W = 1000
const QUALITY = 78

async function main() {
  if (!fs.existsSync(DIR)) { console.error('no dir', DIR); process.exit(1) }
  const files = fs.readdirSync(DIR).filter(f => /\.(jpe?g|png)$/i.test(f))
  let made = 0, skipped = 0, srcBytes = 0, outBytes = 0, failed = 0
  for (const f of files) {
    const src = path.join(DIR, f)
    const out = path.join(DIR, f.replace(/\.(jpe?g|png)$/i, '.webp'))
    try {
      const sst = fs.statSync(src)
      srcBytes += sst.size
      if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= sst.mtimeMs) {
        skipped++; outBytes += fs.statSync(out).size; continue
      }
      const img = sharp(src, { failOn: 'none' })
      const meta = await img.metadata()
      const pipe = img.rotate()
      if (meta.width && meta.width > MAX_W) pipe.resize({ width: MAX_W, withoutEnlargement: true })
      await pipe.webp({ quality: QUALITY }).toFile(out)
      outBytes += fs.statSync(out).size
      made++
    } catch (e) {
      failed++
      console.warn('  ! skip', f, '-', String(e.message || e).slice(0, 80))
    }
  }
  const mb = n => (n / 1048576).toFixed(1) + ' MB'
  console.log(`beaches WebP: ${made} generated, ${skipped} up-to-date, ${failed} failed`)
  console.log(`source JPG/PNG (processed set): ${mb(srcBytes)} → WebP: ${mb(outBytes)}  (−${Math.round((1 - outBytes / Math.max(1, srcBytes)) * 100)}%)`)
}
main()
