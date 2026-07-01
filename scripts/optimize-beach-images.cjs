#!/usr/bin/env node
/**
 * optimize-beach-images.cjs — re-encode public/beaches/*.jpg pour le poids mobile.
 *
 * POURQUOI : les photos hero (1er écran = élément LCP) étaient livrées en JPG
 * sur-encodés (jusqu'à ~1,7 Mo, 67 fichiers >400 Ko) → LCP mobile pénalisé.
 * On RÉ-ENCODE en place à qualité mozjpeg 78, borne 1280px de large (sans
 * agrandir) : gros gain d'octets, ZÉRO perte de dimension/netteté visible,
 * MÊMES noms de fichier (imageMap/OG inchangés, budget FTP inchangé).
 *
 * Idempotent-safe : re-tourner ne re-shrink quasi rien (déjà à q78). One-shot,
 * committé une fois — pas un step de build (les photos sont statiques).
 *
 * Usage : node scripts/optimize-beach-images.cjs [--dry]
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const DIR = path.join(__dirname, '..', 'public', 'beaches')
const MAX_W = 1280
const MAX_H = 1600   // borne la hauteur : les portraits très hauts (jusqu'à 2742px)
                     // pesaient encore 400-655 Ko alors que le hero les affiche en
                     // cover ~430×900 — inutile de porter plus de pixels que l'écran.
const QUALITY = 78
const DRY = process.argv.includes('--dry')

async function main() {
  const files = fs.readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f))
  let before = 0, after = 0, shrunk = 0, skipped = 0
  for (const f of files) {
    const full = path.join(DIR, f)
    const orig = fs.statSync(full).size
    before += orig
    try {
      const buf = await sharp(full)
        .resize({ width: MAX_W, height: MAX_H, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toBuffer()
      // N'écrire que si on gagne >3 % (évite de re-compresser inutilement les
      // fichiers déjà optimaux et de créer du churn binaire pour rien).
      if (buf.length < orig * 0.97) {
        if (!DRY) fs.writeFileSync(full, buf)
        after += buf.length
        shrunk++
      } else {
        after += orig
        skipped++
      }
    } catch (e) {
      after += orig
      console.warn('  ⚠ skip', f, e.message)
    }
  }
  const pct = (100 * (1 - after / before)).toFixed(1)
  console.log(`${DRY ? '[DRY] ' : ''}${files.length} images | ${shrunk} ré-encodées, ${skipped} déjà optimales`)
  console.log(`  ${(before / 1e6).toFixed(1)} Mo → ${(after / 1e6).toFixed(1)} Mo  (−${pct} %)`)
}
main()
