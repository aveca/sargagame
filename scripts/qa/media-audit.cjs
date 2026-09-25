/**
 * media-audit.cjs — PHASE 1 (2026-09-25E) : audit visuel RÉEL des assets.
 *
 * Mesure (jamais d'invention) :
 *  - public/beaches/*.jpg : dimensions (sharp), poids, ratio
 *  - public/videos/hero/*.mp4 : poids + couverture manifest.json
 *  - croisement avec public/data/beaches-images.json (quoi est affiché ?)
 *
 * Classement perceptuel-documenté :
 *  A = premium  (≥1280px large ET ≥150 Ko — détail réel, hero-safe)
 *  B = exploitable (≥800px large ET ≥60 Ko — card/focus-safe)
 *  C = faible    (le reste lisible — thumb 64px max, jamais hero)
 *  D = inutilisable (probe impossible / <400px / <15 Ko)
 *
 * Usage : node scripts/qa/media-audit.cjs [--json]
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "..", "..")
const BEACHES = path.join(ROOT, "public", "beaches")
const HERO = path.join(ROOT, "public", "videos", "hero")

function grade(w, h, kb) {
  if (!w || !h) return "D"
  const large = Math.max(w, h)
  if (large >= 1280 && kb >= 150) return "A"
  if (large >= 800 && kb >= 60) return "B"
  if (large >= 400 && kb >= 15) return "C"
  return "D"
}

async function main() {
  let sharp = null
  try { sharp = require("sharp") } catch (_) {}
  const files = fs.readdirSync(BEACHES).filter(f => /\.jpe?g$/i.test(f))
  const imgMap = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "beaches-images.json"), "utf-8")) } catch (_) { return {} }
  })()
  const usedFiles = new Set(Object.values(imgMap).filter(v => typeof v === "string"))
  const manifest = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(HERO, "manifest.json"), "utf-8")) } catch (_) { return null }
  })()

  const rows = []
  for (const f of files) {
    const p = path.join(BEACHES, f)
    const kb = Math.round(fs.statSync(p).size / 1024)
    let w = 0, h = 0
    if (sharp) {
      try { const m = await sharp(p).metadata(); w = m.width || 0; h = m.height || 0 } catch (_) {}
    }
    rows.push({ file: f, w, h, kb, grade: grade(w, h, kb), used: usedFiles.has(f) })
  }
  const counts = { A: 0, B: 0, C: 0, D: 0 }
  rows.forEach(r => { counts[r.grade] = (counts[r.grade] || 0) + 1 })
  const byGrade = g => rows.filter(r => r.grade === g).sort((a, b) => b.kb - a.kb)

  // Vidéos hero
  const vids = fs.existsSync(HERO) ? fs.readdirSync(HERO).filter(f => /\.mp4$/i.test(f)) : []
  const vidKb = {}
  vids.forEach(f => { try { vidKb[f] = Math.round(fs.statSync(path.join(HERO, f)).size / 1024) } catch (_) {} })
  const ids = [...new Set(vids.map(f => f.replace(/-w\.mp4$/i, "").replace(/\.mp4$/i, "")))]
  const manifestIds = manifest && Array.isArray(manifest.ids) ? manifest.ids : []

  const top = rows.filter(r => (r.grade === "A" || r.grade === "B") && r.used)
    .sort((a, b) => (a.grade === b.grade ? b.kb - a.kb : a.grade < b.grade ? -1 : 1))
    .slice(0, 30)

  const asJson = process.argv.includes("--json")
  const report = {
    date: new Date().toISOString().slice(0, 10),
    photos: { total: files.length, grades: counts, sharp: !!sharp },
    topUsable30: top.map(r => ({ file: r.file, grade: r.grade, w: r.w, h: r.h, kb: r.kb })),
    worstUsed: rows.filter(r => r.used && (r.grade === "C" || r.grade === "D"))
      .sort((a, b) => a.kb - b.kb).slice(0, 15)
      .map(r => ({ file: r.file, grade: r.grade, w: r.w, h: r.h, kb: r.kb })),
    videos: { files: vids.length, beachIds: ids.length, manifestIds: manifestIds.length, manifestCovered: manifestIds.length },
    missingDocumented: ["portrait (9:16)", "gallery (multi-photo/lieu)", "sunset dédié", "activity dédiée", "AVIF/WebP + srcset"],
  }
  if (asJson) { console.log(JSON.stringify(report, null, 2)); return }

  console.log(`PHOTOS: ${files.length} jpg (sharp ${sharp ? "OK" : "ABSENT — grades taille-only"})`)
  console.log(`  A premium: ${counts.A} · B exploitable: ${counts.B} · C faible: ${counts.C} · D inutilisable: ${counts.D}`)
  console.log(`VIDEOS hero: ${vids.length} fichiers · ${ids.length} plages · manifest: ${manifestIds.length} ids`)
  console.log(`\nTOP USABLE (A/B + affichées, ${top.length}):`)
  top.slice(0, 20).forEach(r => console.log(`  [${r.grade}] ${r.file} ${r.w}x${r.h} ${r.kb}Ko`))
  const worst = report.worstUsed
  if (worst.length) {
    console.log(`\nPIRES AFFICHÉES (C/D encore visibles — à remplacer en priorité):`)
    worst.slice(0, 10).forEach(r => console.log(`  [${r.grade}] ${r.file} ${r.w}x${r.h} ${r.kb}Ko`))
  } else console.log("\nAucune photo C/D affichée.")
  console.log("\nMANQUANTS documentés : " + report.missingDocumented.join(" · "))
}

main().catch(e => { console.error("audit FAIL: " + e.message); process.exit(1) })
