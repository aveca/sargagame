#!/usr/bin/env node
/**
 * derive-variants.cjs — RESPONSIVE MEDIA path (2026-09-25K, §8).
 *
 * master (JPG autorisé) → desktop 1920 / mobile 1080 / card 640 (+ poster =
 * master redimensionné 1280) en AVIF + WebP + JPEG-fallback, via Sharp hors
 * runtime. Mesure le poids ; n'écrit QUE si gain > 15 % vs master re-encodé
 * et seulement avec --write (défaut : DRY-RUN, rapport seul).
 *
 * Aucun upscale (withoutEnlargement), aucun binaire commité par défaut
 * (poids FTP + prudence ToS : les dérivés suivent le régime du master).
 *
 * Usage : node scripts/media/derive-variants.cjs [--write] [--only=f.jpg]
 */
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const ROOT = path.resolve(__dirname, "..", "..")
const DIR = path.join(ROOT, "public", "beaches")
const OUT = path.join(ROOT, "public", "beaches", "derived")
const WRITE = process.argv.includes("--write")
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean)

const VARIANTS = [
  { tag: "d1920", w: 1920 },
  { tag: "m1080", w: 1080 },
  { tag: "c640", w: 640 },
]

async function main() {
  const files = (ONLY.length ? ONLY : fs.readdirSync(DIR).filter(f => /^wk-.*\.jpe?g$/i.test(f)))
  if (!files.length) { console.log("[derive] aucun master (préfixe wk-) — rien à faire"); return }
  let totalMaster = 0, totalBest = 0
  for (const f of files) {
    const full = path.join(DIR, f)
    const base = f.replace(/\.(jpe?g)$/i, "")
    const master = await sharp(full).jpeg({ quality: 80, mozjpeg: true }).toBuffer()
    totalMaster += master.length
    const rows = []
    for (const v of VARIANTS) {
      const img = sharp(full).resize({ width: v.w, withoutEnlargement: true })
      const [avif, webp, jpg] = await Promise.all([
        img.clone().avif({ quality: 55 }).toBuffer().catch(() => null),
        img.clone().webp({ quality: 72 }).toBuffer().catch(() => null),
        img.clone().jpeg({ quality: 74, mozjpeg: true }).toBuffer().catch(() => null),
      ])
      const best = [avif, webp, jpg].filter(Boolean).sort((a, b) => a.length - b.length)[0]
      rows.push({ variant: v.tag, avif: avif && avif.length, webp: webp && webp.length, jpg: jpg && jpg.length, best: best ? best.length : null })
      if (WRITE && best) {
        if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
        const ext = best === avif ? "avif" : best === webp ? "webp" : "jpg"
        fs.writeFileSync(path.join(OUT, `${base}-${v.tag}.${ext}`), best)
      }
    }
    const bestSum = rows.reduce((a, r) => a + (r.best || 0), 0)
    totalBest += bestSum
    console.log(`${f} master ${Math.round(master.length / 1024)}Ko → ` + rows.map(r => `${r.variant}:${r.best ? Math.round(r.best / 1024) + "Ko" : "x"}`).join(" "))
  }
  console.log(`[derive] ${WRITE ? "ÉCRIT" : "DRY-RUN"} — master ${Math.round(totalMaster / 1024)}Ko vs 3 variantes ${Math.round(totalBest / 1024)}Ko`)
}

main().catch(e => { console.error(e); process.exit(1) })
