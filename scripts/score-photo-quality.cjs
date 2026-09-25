#!/usr/bin/env node
/**
 * score-photo-quality.cjs — QUALITY SCORE v2 (2026-09-25H).
 *
 * Pourquoi v2 : le score v1 (lum 45 % + sat 40 % + res 15 %) ne mesure ni
 * netteté, ni exposition (histogramme), ni contraste, ni composition — et ne
 * comparait jamais de candidates (photos[0] à l'acquisition).
 *
 * v2 = TECHNICAL (50) + VISUAL (50), 100 % local (sharp), déterministe,
 * zéro appel réseau :
 *   technical : résolution (25) + ratio (10) + efficience compression (15)
 *   visual    : netteté Laplacien (20) + exposition (15) + contraste (10)
 *               + saturation (5)
 * Classes : HERO (grand + bon) / CARD (standard) / THUMB (petit/faible) /
 *   REJECT (illisible ou minuscule). RÈGLE DURE : un 1600px mauvais ne
 *   devient JAMAIS HERO (le score visuel le bloque).
 *
 * Heuristique assumée (documentée, pas un jugement humain) + overrides
 * manuels mergés (scripts/data/photo-quality-overrides.json, même fichier
 * que v1 — relançable sans perdre la curation).
 *
 * Usage :
 *   node scripts/score-photo-quality.cjs [--calibrate] [--only=f1.jpg,f2.jpg]
 *  --calibrate : affiche la distribution (réglage des seuils, pas de JSON)
 */
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const ROOT = path.resolve(__dirname, "..")
const DIR = path.join(ROOT, "public", "beaches")
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "beaches-images.json"), "utf8"))
const OUT_DETAILS = path.join(ROOT, "public", "data", "photo-quality-v2.json")
const OUT_CLASSES = path.join(ROOT, "public", "data", "photo-classes.json")

const CALIB = process.argv.includes("--calibrate")
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean)

const LAPLACE = { width: 3, height: 3, kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0] }

async function analyze(file) {
  const full = path.join(DIR, file)
  const buf = fs.readFileSync(full)
  const meta = await sharp(buf).metadata()
  const w = meta.width || 0, h = meta.height || 0
  if (!w || !h) return null
  const kb = fs.statSync(full).size / 1024
  const mp = (w * h) / 1e6
  // Netteté : variance du Laplacien sur miniature grise (déterministe).
  const lap = await sharp(buf).resize(320, 320, { fit: "inside" }).greyscale().convolve(LAPLACE).raw().toBuffer({ resolveWithObject: true })
  const px = lap.data
  let mean = 0
  for (let i = 0; i < px.length; i++) mean += px[i]
  mean /= px.length
  let variance = 0
  for (let i = 0; i < px.length; i++) variance += (px[i] - mean) ** 2
  variance /= px.length
  const sharpness = Math.sqrt(variance)
  // Exposition/contraste/saturation : stats sharp (canaux RGB).
  const st = await sharp(buf).resize(160, 160, { fit: "inside" }).stats()
  const [r, g, b] = st.channels
  const lum = 0.2126 * r.mean / 255 + 0.7152 * g.mean / 255 + 0.0722 * b.mean / 255
  const contrast = (st.isOpaque === false ? 0 : (r.stdev + g.stdev + b.stdev) / 3 / 255)
  // Saturation approx : écart moyen |max-min| par pixel → via stdev inter-canaux des moyennes.
  const means = [r.mean, g.mean, b.mean]
  const sat = (Math.max(...means) - Math.min(...means)) / 255
  return { w, h, kb, mp, sharpness, lum, contrast, sat, ratio: w / h }
}

function scoreTechnical(a) {
  const large = Math.max(a.w, a.h)
  const res = large >= 1600 ? 25 : large >= 1280 ? 20 : large >= 800 ? 12 : large >= 400 ? 6 : 0
  // Ratio : 16:9↔4:3↔9:16 acceptés ; panoramas extrêmes pénalisés.
  const r = a.ratio
  const ratio = (r >= 0.5 && r <= 2.0) ? 10 : (r >= 0.4 && r <= 2.6) ? 5 : 2
  // Efficience : Ko par MP. Trop bas = sur-compressé ; trop haut = bruit/poids.
  const kmp = a.kb / Math.max(0.05, a.mp)
  const eff = kmp < 25 ? 4 : kmp <= 250 ? 15 : kmp <= 500 ? 10 : 6
  return { res, ratio, eff, total: res + ratio + eff }
}

function scoreVisual(a) {
  // Netteté : seuils calibrés sur le corpus (voir --calibrate).
  const sh = a.sharpness < 4 ? 4 : a.sharpness > 40 ? 20 : 4 + ((a.sharpness - 4) / 36) * 16
  // Exposition : optimum 0.38–0.72.
  const lum = a.lum < 0.22 ? (a.lum / 0.22) * 6
    : a.lum <= 0.72 ? 6 + ((a.lum - 0.22) / 0.5) * 9
    : Math.max(0, 15 - ((a.lum - 0.72) / 0.28) * 15)
  // Contraste : stdev moyenne 0.10–0.30 idéal.
  const ct = a.contrast < 0.05 ? (a.contrast / 0.05) * 4
    : a.contrast <= 0.32 ? 4 + Math.min(1, (a.contrast - 0.05) / 0.1) * 6
    : Math.max(0, 10 - ((a.contrast - 0.32) / 0.2) * 10)
  // Saturation : un peu de couleur (0.03–0.35), sans excès.
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

async function main() {
  const files = (ONLY.length ? ONLY : fs.readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f)))
  const rows = []
  for (const f of files) {
    try {
      const a = await analyze(f)
      if (!a) { rows.push({ file: f, error: "unreadable" }); continue }
      const t = scoreTechnical(a), v = scoreVisual(a)
      const score = Math.round(Math.min(100, t.total + v.total))
      rows.push({ file: f, ...a, kb: Math.round(a.kb), sharpness: round1(a.sharpness), lum: round1(a.lum), contrast: round1(a.contrast), sat: round1(a.sat), ratio: round1(a.ratio), tech: t.total, visu: v.total, score, class: classify(a, score) })
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
    console.log("score:    ", dist(r => r.score))
    const cls = {}
    ok.forEach(r => { cls[r.class] = (cls[r.class] || 0) + 1 })
    console.log("classes:", JSON.stringify(cls))
    for (const f of ["gplace-mq028.jpg", "gplace-gp083.jpg", "gplace-gp027.jpg", "Gosier_plage.jpg", "Îlet_du_Gosier.jpg"]) {
      const r = ok.find(x => x.file === f)
      console.log(" ", f, r ? `${r.score} ${r.class} ${r.w}x${r.h} ${r.kb}Ko sharp=${r.sharpness} lum=${r.lum} ct=${r.contrast}` : "absent/erreur")
    }
    return
  }
  // Merge overrides v1 (même fichier — curation conservée, appliquée au score).
  const details = {}
  const classes = {}
  for (const r of rows) {
    if (r.error) { details[r.file] = { error: r.error, class: "REJECT" }; continue }
    details[r.file] = { score: r.score, class: r.class, w: r.w, h: r.h, kb: r.kb, tech: r.tech, visu: r.visu }
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
  // Quarantaine lieu-douteux (même-photo sur lieux distants) : la classe
  // qualité reste informative, mais `excluded:true` bannit tout affichage
  // (scène SVG honnête à la place). Fichier : scripts/data/photo-quarantine.json.
  try {
    const quar = JSON.parse(fs.readFileSync(path.join(__dirname, "data/photo-quarantine.json"), "utf8"))
    for (const [id, q] of Object.entries(quar)) {
      if (id.startsWith("_") || !q || typeof q !== "object") continue
      if (classes[id]) classes[id] = { class: classes[id], excluded: true, reason: q.reason || "quarantine" }
    }
  } catch (_) {}
  // Format classes.json : string simple si affichable, objet si exclu.
  fs.writeFileSync(OUT_DETAILS, JSON.stringify({ v: 2, generated: new Date().toISOString(), photos: details }, null, 1))
  fs.writeFileSync(OUT_CLASSES, JSON.stringify(classes))
  const vals = Object.values(details).filter(d => !d.error).map(d => d.score)
  const cc = {}
  Object.values(classes).forEach(c => { const k = typeof c === "string" ? c : `${c.class}+excluded`; cc[k] = (cc[k] || 0) + 1 })
  console.log(`[score-v2] ${vals.length} photos | classes: ${JSON.stringify(cc)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
