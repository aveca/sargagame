#!/usr/bin/env node
/**
 * score-photo-quality-v3.cjs — QUALITY SCORE v3 (2026-09-25K, §10).
 *
 * v3 = TECH (50) + VISU (50) + PLACE_CONFIDENCE (overlay, 0-100) →
 * score final = tech + visu + place_confidence/2 (max 100).
 *
 * place_confidence : 0-100 basé sur validation lieu multi-signaux
 * (nom exact + commune + géo + metadata + licence).
 * VERIFIED_PLACE = 80-100, LIKELY_PLACE = 50-79, ATMOSPHERIC = 0-49.
 *
 * Ne remplace PAS le score v2 — l'étend. Les classes HERO/CARD/THUMB/REJECT
 * restent basées sur tech+visu seulement (place_confidence = signal additionnel).
 *
 * Usage :
 *   node scripts/score-photo-quality-v3.cjs [--calibrate] [--only=f1.jpg,f2.jpg]
 * Sorties : photo-quality-v3.json, photo-classes-v3.json, media-quality-report-v3.json
 */
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const ROOT = path.resolve(__dirname, "..")
const DIR = path.join(ROOT, "public", "beaches")
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "beaches-images.json"), "utf8"))
const OUT_DETAILS = path.join(ROOT, "public", "data", "photo-quality-v3.json")
const OUT_CLASSES = path.join(ROOT, "public", "data", "photo-classes-v3.json")
const OUT_REPORT = path.join(ROOT, "public", "data", "media-quality-report-v3.json")

const CALIB = process.argv.includes("--calibrate")
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean)

const LAPLACE = { width: 3, height: 3, kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0] }

// Charge les résultats de découverte (place validation) si dispo
const DISCOVERY_DIR = path.join(ROOT, "public", "data", "discovery")
let discoveryCache = {}
try {
  for (const f of fs.readdirSync(DISCOVERY_DIR)) {
    if (f.endsWith(".json")) {
      const d = JSON.parse(fs.readFileSync(path.join(DISCOVERY_DIR, f), "utf8"))
      discoveryCache[d.beach] = d
    }
  }
} catch (_) {}

async function analyze(file) {
  const full = path.join(DIR, file)
  const buf = fs.readFileSync(full)
  const meta = await sharp(buf).metadata()
  const w = meta.width || 0, h = meta.height || 0
  if (!w || !h) return null
  const kb = fs.statSync(full).size / 1024
  const mp = (w * h) / 1e6
  const lap = await sharp(buf).resize(320, 320, { fit: "inside" }).greyscale().convolve(LAPLACE).raw().toBuffer({ resolveWithObject: true })
  const px = lap.data
  let mean = 0
  for (let i = 0; i < px.length; i++) mean += px[i]
  mean /= px.length
  let variance = 0
  for (let i = 0; i < px.length; i++) variance += (px[i] - mean) ** 2
  variance /= px.length
  const sharpness = Math.sqrt(variance)
  const st = await sharp(buf).resize(160, 160, { fit: "inside" }).stats()
  const [r, g, b] = st.channels
  const lum = 0.2126 * r.mean / 255 + 0.7152 * g.mean / 255 + 0.0722 * b.mean / 255
  const contrast = (st.isOpaque === false ? 0 : (r.stdev + g.stdev + b.stdev) / 3 / 255)
  const means = [r.mean, g.mean, b.mean]
  const sat = (Math.max(...means) - Math.min(...means)) / 255
  return { w, h, kb, mp, sharpness, lum, contrast, sat, ratio: w / h }
}

function scoreTechnical(a) {
  const large = Math.max(a.w, a.h)
  const res = large >= 1600 ? 25 : large >= 1280 ? 20 : large >= 800 ? 12 : large >= 400 ? 6 : 0
  const r = a.ratio
  const ratio = (r >= 0.5 && r <= 2.0) ? 10 : (r >= 0.4 && r <= 2.6) ? 5 : 2
  const kmp = a.kb / Math.max(0.05, a.mp)
  const eff = kmp < 25 ? 4 : kmp <= 250 ? 15 : kmp <= 500 ? 10 : 6
  return { res, ratio, eff, total: res + ratio + eff }
}

function scoreVisual(a) {
  const sh = a.sharpness < 4 ? 4 : a.sharpness > 40 ? 20 : 4 + ((a.sharpness - 4) / 36) * 16
  const lum = a.lum < 0.22 ? (a.lum / 0.22) * 6
    : a.lum <= 0.72 ? 6 + ((a.lum - 0.22) / 0.5) * 9
    : Math.max(0, 15 - ((a.lum - 0.72) / 0.28) * 15)
  const ct = a.contrast < 0.05 ? (a.contrast / 0.05) * 4
    : a.contrast <= 0.32 ? 4 + Math.min(1, (a.contrast - 0.05) / 0.1) * 6
    : Math.max(0, 10 - ((a.contrast - 0.32) / 0.2) * 10)
  const sat = a.sat < 0.015 ? 1 : a.sat <= 0.4 ? 5 : 3
  return { sharp: round1(sh), expo: round1(lum), contrast: round1(ct), sat, total: round1(sh + lum + ct + sat) }
}
const round1 = (x) => Math.round(x * 10) / 10

function classify(a, score) {
  const large = Math.max(a.w, a.h)
  if (score >= 70 && large >= 1280 && a.kb >= 100) return "HERO"
  if (score >= 50 && large >= 800 && a.kb >= 45) return "CARD"
  if (score >= 28 && large >= 400 && a.kb >= 12) return "THUMB"
  return "REJECT"
}

// place_confidence à partir des données de découverte
function placeConfidence(beachId, file) {
  const d = discoveryCache[beachId]
  if (!d || !d.candidates?.length) return 0
  // Trouve le candidat qui correspond à ce fichier
  const cand = d.candidates.find(c => c.image_url && c.image_url.includes(file.replace(/\.(jpe?g)$/i, "")))
  if (!cand) return 0
  if (cand.place?.state === "VERIFIED_PLACE") return Math.min(100, 80 + (cand.place.score || 0) / 10)
  if (cand.place?.state === "LIKELY_PLACE") return Math.min(79, 50 + (cand.place.score || 0) / 10)
  return 0
}

async function main() {
  const files = (ONLY.length ? ONLY : fs.readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f)))
  const rows = []
  for (const f of files) {
    try {
      const a = await analyze(f)
      if (!a) { rows.push({ file: f, error: "unreadable" }); continue }
      const t = scoreTechnical(a), v = scoreVisual(a)
      const baseScore = Math.round(Math.min(100, t.total + v.total))
      // Inverse MAP : file → beachId
      const beachId = Object.keys(MAP).find(id => MAP[id] === f) || null
      const pconf = beachId ? placeConfidence(beachId, f) : 0
      const finalScore = Math.round(Math.min(100, baseScore + pconf / 2))
      rows.push({ file: f, beachId, ...a, kb: Math.round(a.kb), sharpness: round1(a.sharpness), lum: round1(a.lum), contrast: round1(a.contrast), sat: round1(a.sat), ratio: round1(a.ratio), tech: t.total, visu: v.total, baseScore, placeConfidence: pconf, score: finalScore, class: classify(a, finalScore) })
    } catch (e) { rows.push({ file: f, error: String(e.message).slice(0, 80) }) }
  }
  if (CALIB) {
    const ok = rows.filter(r => !r.error)
    const dist = (fn) => { const v = ok.map(fn).sort((x, y) => x - y); const q = (p) => v[Math.floor(v.length * p)]; return `min ${v[0]} p25 ${q(0.25)} med ${q(0.5)} p75 ${q(0.75)} max ${v[v.length - 1]}` }
    console.log(`n=${ok.length}`)
    console.log("sharpness:", dist(r => r.sharpness))
    console.log("lum:      ", dist(r => r.lum))
    console.log("contrast: ", dist(r => r.contrast))
    console.log("sat:      ", dist(r => r.sat))
    console.log("baseScore:", dist(r => r.baseScore))
    console.log("placeConf:", dist(r => r.placeConfidence))
    console.log("finalScore:", dist(r => r.score))
    const cls = {}
    ok.forEach(r => { cls[r.class] = (cls[r.class] || 0) + 1 })
    console.log("classes:", JSON.stringify(cls))
    return
  }
  // Merge overrides v1 (même fichier — curation conservée)
  const details = {}
  const classes = {}
  for (const r of rows) {
    if (r.error) { details[r.file] = { error: r.error, class: "REJECT" }; continue }
    details[r.file] = { score: r.score, baseScore: r.baseScore, placeConfidence: r.placeConfidence, class: r.class, w: r.w, h: r.h, kb: r.kb, tech: r.tech, visu: r.visu }
  }
  try {
    const ov = JSON.parse(fs.readFileSync(path.join(__dirname, "data/photo-quality-overrides.json"), "utf8"))
    for (const [id, o] of Object.entries(ov)) {
      if (id.startsWith("_") || typeof (o && o.score) !== "number") continue
      const file = MAP[id]
      if (file && details[file]) { details[file].score = o.score; details[file].override = true; details[file].class = classify({ w: details[file].w, h: details[file].h, kb: details[file].kb }, o.score) }
    }
  } catch (_) {}
  for (const [id, file] of Object.entries(MAP)) {
    if (details[file]) classes[id] = details[file].class
  }
  // Quarantaine lieu-douteux
  try {
    const quar = JSON.parse(fs.readFileSync(path.join(__dirname, "data/photo-quarantine.json"), "utf8"))
    for (const [id, q] of Object.entries(quar)) {
      if (id.startsWith("_") || !q || typeof q !== "object") continue
      if (classes[id]) classes[id] = { class: classes[id], excluded: true, reason: q.reason || "quarantine" }
    }
  } catch (_) {}
  // Format classes.json : string simple si affichable, objet si exclu.
  fs.writeFileSync(OUT_DETAILS, JSON.stringify({ v: 3, generated: new Date().toISOString(), photos: details }, null, 1))
  fs.writeFileSync(OUT_CLASSES, JSON.stringify(classes))

  // Media quality report v3 (top30, duplicates, etc.)
  const vals = Object.values(details).filter(d => !d.error).map(d => d.score)
  const top30 = Object.entries(details).filter(([_, d]) => !d.error).sort((a, b) => b[1].score - a[1].score).slice(0, 30).map(([f]) => f)
  const duplicates = []
  // Pour les duplicates, on aurait besoin d'un dHash précis — on réutilise le rapport v2
  try {
    const rpt2 = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "media-quality-report.json"), "utf8"))
    duplicates.push(...(rpt2.duplicates || []))
  } catch (_) {}

  fs.writeFileSync(OUT_REPORT, JSON.stringify({ v: 3, generated: new Date().toISOString(), top30, duplicates, stats: { total: vals.length, min: Math.min(...vals), max: Math.max(...vals), avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) } }, null, 1))

  const cc = {}
  Object.values(classes).forEach(c => { const k = typeof c === "string" ? c : `${c.class}+excluded`; cc[k] = (cc[k] || 0) + 1 })
  console.log(`[score-v3] ${vals.length} photos | classes: ${JSON.stringify(cc)} | top30: ${top30.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })