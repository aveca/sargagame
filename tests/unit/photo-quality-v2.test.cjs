#!/usr/bin/env node
/**
 * photo-quality-v2.test.cjs — contrats « GOOGLE PHOTO QUALITY V2 » (2026-09-25H).
 * score technique+visuel · classes HERO/CARD/THUMB/REJECT · quarantaine ·
 * anti-collision · pas de migration statique · money intact.
 * Exit 1 si échec.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name) }

console.log("PHOTO QUALITY V2 — contrats")

;(async () => {
  const BM_ESM = await import("../../src/lib/beach-media.js")
  const MAP = JSON.parse(read("public/data/beaches-images.json"))
  const V2 = JSON.parse(read("public/data/photo-quality-v2.json")).photos
  const CLASSES = JSON.parse(read("public/data/photo-classes.json"))
  const QUAR = JSON.parse(read("scripts/data/photo-quarantine.json"))
  const RPT = JSON.parse(read("public/data/media-quality-report.json"))
  const BX = read("src/BeachExperience.jsx")
  const BM = read("src/lib/beach-media.js")
  const PROD = read("src/Sargasses_PROD.jsx")
  const TODAY = read("scripts/lib/today-pages.cjs")
  const DL = read("scripts/download-google-photos.cjs")
  const PKG = JSON.parse(read("package.json"))

  // ── Scorer : technique + visuel séparés, déterministe ──
  const files = Object.keys(V2).filter(f => !V2[f].error)
  check("v2 : 400+ photos scorées avec tech+visu", files.length >= 400 && files.every(f => V2[f].tech != null && V2[f].visu != null))
  check("v2 : score = tech + visu (borné 0-100)", files.every(f => V2[f].score >= 0 && V2[f].score <= 100))
  const heroBad = files.filter(f => V2[f].class === "HERO" && (V2[f].visu < 20 || V2[f].w < 1280 && V2[f].h < 1280))
  check("v2 : aucun HERO au visuel faible ou petit (1600px mauvaise ≠ HERO)", heroBad.length === 0)
  check("v2 : 1600px mauvaise reste bloquée (gp083 THUMB, pas HERO)", V2["gplace-gp083.jpg"].class === "THUMB")

  // ── Classes : top30 sans THUMB/REJECT ──
  check("classes : top30 visibilité sans THUMB/REJECT", RPT.top30bad.length === 0 && RPT.top30.length === 30)
  check("classes : gp027 remappée HERO (Wikimedia upgrade même-lieu, 2560px CC BY 4.0)", CLASSES.gp027 === "HERO")

  // ── Quarantaine : même-photo sur lieux distants ──
  for (const id of ["gp118", "gp119"]) {
    const c = CLASSES[id]
    check(`quarantaine : ${id} exclu (raison documentée)`, c && typeof c === "object" && c.excluded === true && !!c.reason)
  }
  check("quarantaine : fichier + pair + motif (pas de devinette)", ["gp118", "gp119"].every(id => QUAR[id] && QUAR[id].pair && QUAR[id].reason))
  check("quarantaine : jumeaux conservés affichables (gp019 HERO, gp024 CARD)", CLASSES.gp019 === "HERO" && CLASSES.gp024 === "CARD")

  // ── Gating UI : grands slots exigent HERO/CARD ──
  check("ExpMedia : photo plein-bleed gatée HERO (scène sinon)", BX.includes('photoAllowed(cls, beachId, "HERO")') && BX.includes("heroOk === true"))
  check("ExpMedia : vidéo suit le même gate (pas de loop lieu-douteux)", BX.includes("[beachId, off, heroOk]"))
  check("ExpMedia : fail-open si classes indisponibles (pas de régression réseau)", BX.includes("setHeroOk(true)"))
  check("PROD : exclus filtrés d'imageMap à la source (tous les slots)", PROD.includes("photo-classes.json") && PROD.includes("Quarantaine lieu-douteux"))
  check("today-pages : hero build gaté HERO/CARD + exclu", TODAY.includes("photo-classes.json") && TODAY.includes("entry.excluded"))
  check("beach-media : photoAllowed(classes, id, slot) exporté", BM.includes("export function photoAllowed") && BM.includes("export function photoClass"))

  // ── Anti-collision : trio + paires proches ──
  const trioFiles = RPT.trio.map(t => t.file)
  check("trio mq024/25/26 : 3 fichiers distincts", new Set(trioFiles).size === 3 && trioFiles.every(Boolean))
  check("paires proches : 0 même-fichier (report)", RPT.closePairsSameFile.length === 0 && RPT.sharedFile.length === 0)

  // ── Pas de migration statique (conformité ToS §11) ──
  check("download : legacy maxwidth=1600 + photos[0] INCHANGÉS (pas de bulk silencieux)", DL.includes("maxwidth=1600") && DL.includes("photos[0]"))
  check("build : aucun step New-API-statique ajouté", !PKG.scripts.build.includes("places-new") && !PKG.scripts.build.includes("download-google"))
  check("media:audit : commande documentée (score + audit + contact sheet)", (PKG.scripts["media:audit"] || "").includes("score-photo-quality") && (PKG.scripts["media:audit"] || "").includes("media-audit"))
  check("contact sheet : TOP50 + WORST + LOW + DUPLICATES (grandes images)", read("public/data/contact-sheet.html").includes("DUPLICATES") && read("public/data/contact-sheet.html").includes("TOP 50 HERO"))

  // ── Quarantaine fonctionnelle (pas seulement déclarative) ──
  check("quarantaine : photoAllowed refuse gp118/gp119 en HERO", BM_ESM.photoAllowed(CLASSES, "gp118", "HERO") === false && BM_ESM.photoAllowed(CLASSES, "gp119", "HERO") === false)
  check("quarantaine : gp024/gp027 restent autorisés (HERO/CARD)", BM_ESM.photoAllowed(CLASSES, "gp024", "HERO") === true && BM_ESM.photoAllowed(CLASSES, "gp027", "HERO") === true)
  check("quarantaine : inconnu → HERO refusé (défaut sûr), CARD permis", BM_ESM.photoAllowed(CLASSES, "xx999", "HERO") === false && BM_ESM.photoAllowed(CLASSES, "xx999", "CARD") === true)

  // ── Money-path intact ──
  const PO = read("src/PassOffer.jsx")
  check("money intact : PASS p30 + buy chain (0 touch H)", /key:\s*"p30"/.test(PO) && /onBuy\(\{c:cents,pass:PASS\.key/.test(PO))

  console.log(`\n✅ PHOTO QUALITY V2 — ${passed} checks ALL PASS`)
})().catch(e => { console.error("✗ " + e.message); process.exit(1) })
