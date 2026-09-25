#!/usr/bin/env node
/**
 * media-audit.cjs — `npm run media:audit` (2026-09-25H, §7).
 *
 * Produit :
 *   public/data/media-quality-report.json — TOP50 HERO, WORST, DUPLICATES,
 *     LOW, MISSING, place-check (paires proches), top30-visibilité.
 *   public/data/contact-sheet.html — planche locale (grandes images) pour
 *     validation humaine : id + beach + classe + score + résolution.
 *
 * 100 % local (sharp), déterministe, zéro appel réseau.
 * Les images restent servies depuis public/beaches (chemins relatifs).
 *
 * Usage : npm run media:audit [--top30-only]
 */
const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const ROOT = path.resolve(__dirname, "..")
const DIR = path.join(ROOT, "public", "beaches")
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/beaches-images.json"), "utf8"))
const V2 = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/photo-quality-v2.json"), "utf8")).photos
const BEACHES = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/beaches-list.json"), "utf8"))
const LIST = Array.isArray(BEACHES) ? BEACHES : BEACHES.beaches
const HERO_IDS = (JSON.parse(fs.readFileSync(path.join(ROOT, "public/videos/hero/manifest.json"), "utf8")).ids || [])

const OUT_JSON = path.join(ROOT, "public", "data", "media-quality-report.json")
const OUT_HTML = path.join(ROOT, "public", "data", "contact-sheet.html")

async function dhash(file) {
  const { data } = await sharp(path.join(DIR, file)).resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true })
  let bits = ""
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? "1" : "0"
  return bits
}
const ham = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d }

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_.+|-]+/g, " ").replace(/\s+/g, " ").trim()

async function main() {
  const byId = {}
  for (const b of LIST) byId[b.id] = b
  const files = fs.readdirSync(DIR).filter(f => /\.jpe?g$/i.test(f))

  // 1. Scores + classes (v2) pour le catalogue mappé.
  const scored = Object.entries(MAP).map(([id, file]) => ({ id, file, beach: (byId[id] || {}).name || id, ...(V2[file] || { error: "no-v2" }) }))
  const ok = scored.filter(s => !s.error)
  const top50 = [...ok].sort((a, b) => b.score - a.score).slice(0, 50)
  const worst = [...ok].sort((a, b) => a.score - b.score).slice(0, 20)
  const low = ok.filter(s => ["THUMB", "REJECT"].includes(s.class))

  // 2. Duplicates perceptuels (dHash, Hamming ≤ 5).
  const hashes = {}
  for (const f of files) { try { hashes[f] = await dhash(f) } catch (_) {} }
  const keys = Object.keys(hashes)
  const duplicates = []
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const d = ham(hashes[keys[i]], hashes[keys[j]])
    if (d <= 5) duplicates.push({ a: keys[i], b: keys[j], dist: d })
  }

  // 3. Place-check : paires proches (≤1,5 km) partageant le MÊME fichier = suspect.
  const used = {}
  for (const [id, file] of Object.entries(MAP)) used[file] = used[file] || [], used[file].push(id)
  const sharedFile = Object.entries(used).filter(([, ids]) => ids.length > 1)
  const hav = (a, b) => {
    const R = 6371, t = (d) => d * Math.PI / 180
    const h = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lng - a.lng) / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
  }
  const closePairs = []
  for (let i = 0; i < LIST.length; i++) for (let j = i + 1; j < LIST.length; j++) {
    const a = LIST[i], b = LIST[j]
    if (a.lat == null || a.island !== b.island) continue
    const d = hav(a, b)
    if (d <= 1.5) closePairs.push({ a: a.id, b: b.id, km: Math.round(d * 10) / 10, sameFile: (MAP[a.id] || null) === (MAP[b.id] || null) ? MAP[a.id] : null })
  }
  const trio = ["mq024", "mq025", "mq026"].map(id => ({ id, file: MAP[id] || null }))

  // 4. MISSING + upgrades même-lieu (candidats STRICTS, décision humaine —
  // jamais auto : le nom normalisé complet de la plage doit apparaître dans
  // le nom du fichier. L'heuristique commune a été retirée (trop de bruit :
  // elle matchait des lieux différents de la même commune — interdit §15).
  const mappedIds = new Set(Object.keys(MAP))
  const missing = LIST.filter(b => !mappedIds.has(b.id)).map(b => b.id)
  const mappedFiles = new Set(Object.values(MAP))
  const unmapped = files.filter(f => !mappedFiles.has(f))
  const candidates = []
  for (const b of LIST) {
    const nb = norm(b.name)
    if (nb.length < 6) continue
    for (const f of unmapped) {
      const nf = norm(f.replace(/\.(jpe?g)$/i, ""))
      if (nf === nb || nf.includes(nb)) {
        const cur = MAP[b.id] ? (V2[MAP[b.id]] || {}) : null
        candidates.push({ beach: b.id, name: b.name, current: MAP[b.id] || null, currentClass: cur.class || null, candidate: f, candidateClass: (V2[f] || {}).class || null })
      }
    }
  }

  // 5. Top-30 visibilité : vidéo hero (curatelle) puis score v2. AUCUN THUMB/REJECT.
  const vis = [...ok].sort((a, b) =>
    ((HERO_IDS.includes(b.id) ? 1 : 0) - (HERO_IDS.includes(a.id) ? 1 : 0)) || (b.score - a.score)).slice(0, 30)
  const visBad = vis.filter(s => ["THUMB", "REJECT"].includes(s.class))

  const report = {
    v: 1, generated: new Date().toISOString().slice(0, 19) + "Z",
    files: files.length, mapped: Object.keys(MAP).length,
    top50: top50.map(s => ({ id: s.id, file: s.file, score: s.score, class: s.class })),
    worst20: worst.map(s => ({ id: s.id, file: s.file, score: s.score, class: s.class })),
    low: low.map(s => ({ id: s.id, file: s.file, score: s.score, class: s.class })),
    duplicates,
    sharedFile: sharedFile.map(([f, ids]) => ({ file: f, ids })),
    closePairsSameFile: closePairs.filter(p => p.sameFile),
    closePairsChecked: closePairs.length,
    trio,
    missing,
    mappingCandidates: candidates.slice(0, 40),
    top30: vis.map(s => s.id),
    top30bad: visBad.map(s => s.id),
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 1))

  // 6. Contact sheet HTML (chemins relatifs ../beaches — ouvrir depuis public/data/).
  const card = (s) => `<figure style="margin:0;border:2px solid #0d0b14;border-radius:12px;overflow:hidden;background:#fff;color:#0d0b14">
    <img src="../beaches/${s.file}" alt="${s.id}" loading="lazy" style="display:block;width:100%;height:220px;object-fit:cover"/>
    <figcaption style="padding:8px 10px;font:12px/1.45 system-ui"><b>${s.id}</b> · ${s.beach || ""}<br>classe <b>${s.class}</b> · score ${s.score} · ${s.w || "?"}×${s.h || "?"}</figcaption></figure>`
  const sec = (t, arr) => `<h2 style="font:800 20px system-ui;margin:26px 0 10px">${t} (${arr.length})</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${arr.map(card).join("")}</div>`
  // Paires duplicates : côte à côte pour validation humaine (même lieu ou
  // confusion ? — quarantaine uniquement avec ground truth, jamais auto).
  const dupCards = duplicates.slice(0, 30).map(d => {
    const info = (f) => { const id = Object.entries(MAP).find(([, v]) => v === f)?.[0] || "—"; const v = V2[f] || {}; return { file: f, id, beach: id !== "—" ? (LIST.find(b => b.id === id) || {}).name || "" : "(non mappée)", class: v.class || "?", score: v.score ?? "?", w: v.w, h: v.h } }
    const a = info(d.a), b = info(d.b)
    return `<div style="border:2px solid #E8512A;border-radius:12px;padding:10px;background:#fff;color:#0d0b14;margin-bottom:12px"><b>d=${d.dist}</b> · ${a.id} (${a.beach}) ↔ ${b.id} (${b.beach})<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">${[a, b].map(s => `<figure style="margin:0"><img src="../beaches/${s.file}" alt="${s.file}" loading="lazy" style="display:block;width:100%;height:300px;object-fit:cover;border-radius:8px"/><figcaption style="font:12px system-ui;padding:4px">${s.file}<br>${s.id} · ${s.class} · ${s.score}</figcaption></figure>`).join("")}</div></div>`
  }).join("")
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contact sheet — ${report.generated}</title></head>
  <body style="margin:0;padding:16px;background:#0B2230;color:#FFFDF6;font-family:system-ui">
  <h1 style="font-size:24px">Contact sheet photo (généré ${report.generated})</h1>
  <p>Duplicates perceptuels : ${duplicates.length} · Fichiers partagés : ${sharedFile.length} · Paires proches même fichier : ${report.closePairsSameFile.length} · MISSING : ${missing.length} · Candidats même-lieu : ${candidates.length}</p>
  ${sec("TOP 50 HERO", top50)}${sec("WORST 20", worst)}${sec("LOW (THUMB/REJECT mappés)", low)}
  <h2 style="font:800 20px system-ui;margin:26px 0 10px">DUPLICATES (validation humaine — même lieu ou confusion ?)</h2>${dupCards || "<p>Aucun.</p>"}
  </body></html>`
  fs.writeFileSync(OUT_HTML, html)
  console.log(`[media:audit] ${files.length} fichiers · top50/worst20/low${low.length} · duplicates ${duplicates.length} · shared ${sharedFile.length} · close-same-file ${report.closePairsSameFile.length} · missing ${missing.length} · candidats ${candidates.length} · top30bad ${visBad.length}`)
  console.log("  trio mq024/25/26 :", trio.map(t => `${t.id}=${t.file}`).join(" "))
  if (visBad.length) console.log("  ⚠ TOP30 non-HERO :", visBad.join(","))
}

main().catch(e => { console.error(e); process.exit(1) })
