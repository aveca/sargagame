#!/usr/bin/env node
/**
 * generate-contact-sheets.cjs — CONTACT SHEETS TOP30 (2026-09-25K, §13).
 *
 * Génère 3 planches HTML pour validation humaine :
 *   - TOP30_HERO : les 30 plages top visibilité (hero video + score v3)
 *   - TOP30_REJECT : rejetées après inspection (pipeline honnête)
 *   - TOP30_ATMOSPHERE : assets d'ambiance (vide aujourd'hui)
 *
 * Usage : node scripts/media/generate-contact-sheets.cjs
 */

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "beaches-images.json"), "utf8"))
const V3 = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "photo-quality-v3.json"), "utf8")).photos
const BEACHES = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "beaches-list.json"), "utf8"))
const LIST = Array.isArray(BEACHES) ? BEACHES : BEACHES.beaches
const REPORT = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "media-quality-report.json"), "utf8"))
const TOP30 = REPORT.top30 || []
const ATMOSPHERE_MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "media", "atmosphere", "manifest.json"), "utf8"))

const OUT_DIR = path.join(ROOT, "public", "data", "contact-sheets")

function card(s, extra = "") {
  const cls = s.class || (s.details?.class || "?")
  const score = s.details?.score || s.score || "?"
  const placeState = s.details?.placeState || ""
  const w = s.details?.w || s.w || "?"
  const h = s.details?.h || s.h || "?"
  const kb = s.details?.kb || s.kb || "?"
  return `<figure style="margin:0;border:2px solid #0d0b14;border-radius:12px;overflow:hidden;background:#fff;color:#0d0b14">
    <img src="../beaches/${s.file}" alt="${s.id}" loading="lazy" style="display:block;width:100%;height:220px;object-fit:cover"/>
    <figcaption style="padding:8px 10px;font:12px/1.45 system-ui"><b>${s.id}</b> · ${s.beach || ""}<br>classe <b>${cls}</b> · score ${score} · ${w}×${h} · ${kb}Ko ${placeState ? "(" + placeState + ")" : ""}${extra}</figcaption></figure>`
}

function section(title, arr) {
  return `<h2 style="font:800 20px system-ui;margin:26px 0 10px">${title} (${arr.length})</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${arr.map(card).join("")}</div>`
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const byId = {}
  for (const b of LIST) byId[b.id] = b

  // 1. TOP30_HERO
  const top30Data = TOP30.map(id => {
    const file = MAP[id]
    const beach = byId[id]?.name || id
    const v3 = file ? V3[file] : null
    return { id, file: file || "MISSING", beach, details: v3 }
  }).filter(s => s.file !== "MISSING")

  // 2. TOP30_REJECT (from media-quality-report duplicates + quarantine)
  const rejects = []
  // Duplicates perceptuels avec dHash ≤ 5 qui ne sont pas le même lieu
  for (const d of REPORT.duplicates || []) {
    const idA = Object.keys(MAP).find(k => MAP[k] === d.a)
    const idB = Object.keys(MAP).find(k => MAP[k] === d.b)
    if (idA && idB) {
      const beachA = byId[idA]?.name || idA
      const beachB = byId[idB]?.name || idB
      if (beachA !== beachB) {
        const v3a = V3[d.a] || {}
        const v3b = V3[d.b] || {}
        rejects.push({ id: `${idA}↔${idB}`, file: d.a, beach: `${beachA} / ${beachB}`, details: { ...v3a, class: "REJECT", score: v3a.score, reason: `Duplicate cross-lieu (d=${d.dist})` } })
        rejects.push({ id: `${idB}↔${idA}`, file: d.b, beach: `${beachB} / ${beachA}`, details: { ...v3b, class: "REJECT", score: v3b.score, reason: `Duplicate cross-lieu (d=${d.dist})` } })
      }
    }
  }
  // Quarantaine (même photo sur lieux distants)
  try {
    const quar = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "data", "photo-quarantine.json"), "utf8"))
    for (const [id, q] of Object.entries(quar)) {
      if (id.startsWith("_") || !q || typeof q !== "object") continue
      const file = MAP[id]
      if (file) {
        const v3 = V3[file] || {}
        rejects.push({ id, file, beach: byId[id]?.name || id, details: { ...v3, class: "REJECT", score: v3.score, reason: q.reason } })
      }
    }
  } catch (_) {}

  // 3. TOP30_ATMOSPHERE
  const atmosphere = ATMOSPHERE_MANIFEST.assets || []
  const atmosphereData = atmosphere.map(a => ({
    id: a.id, file: a.src?.replace(/.*\//, "") || a.id,
    beach: a.label || "Ambiance", details: { class: "ATMOSPHERE", score: "N/A", license: a.license, author: a.author }
  }))

  // Générer les 3 fichiers HTML
  const template = (title, content) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;padding:16px;background:#0B2230;color:#FFFDF6;font-family:system-ui">
  <h1 style="font-size:24px">${title} — ${new Date().toISOString().slice(0,19)}</h1>
  ${content}
  </body></html>`

  fs.writeFileSync(path.join(OUT_DIR, "TOP30_HERO.html"), template("TOP30 HERO — Contact Sheet", section("TOP30 HERO (visibilité + score v3)", top30Data)))
  fs.writeFileSync(path.join(OUT_DIR, "TOP30_REJECT.html"), template("TOP30 REJECT — Contact Sheet", section("REJETÉS (duplicates cross-lieu + quarantaine)", rejects)))
  fs.writeFileSync(path.join(OUT_DIR, "TOP30_ATMOSPHERE.html"), template("TOP30 ATMOSPHERE — Contact Sheet", section("ATMOSPHÈRE (assets génériques licenciés)", atmosphereData)))

  console.log(`[contact-sheets] TOP30_HERO: ${top30Data.length} | TOP30_REJECT: ${rejects.length} | TOP30_ATMOSPHERE: ${atmosphereData.length}`)
  console.log(`  → ${OUT_DIR}/TOP30_HERO.html`)
  console.log(`  → ${OUT_DIR}/TOP30_REJECT.html`)
  console.log(`  → ${OUT_DIR}/TOP30_ATMOSPHERE.html`)
}

main().catch(e => { console.error(e); process.exit(1) })