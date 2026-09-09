#!/usr/bin/env node
/**
 * media-kit.test.cjs — verrouille le socle HARD ASSET REQUIREMENT (2026-09-07).
 *
 * - Naming déterministe beach-{id}-{kind}.{ext}
 * - unlockedRows() : AUCUNE fabrication (jours verrouillés/_ph/_loading exclus)
 * - mediaParams() : jamais de PII (pas d'email/nom/téléphone)
 * - Front : allowlist Sargasses_PROD.jsx porte les 7 events requis,
 *   BeachDayReport lazy-wiré dans BeachSheetComic avec rollback ?report=0,
 *   print + share câblés, zéro Math.sin / placeholder.
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.join(__dirname, "..", "..")
function pathToUrl(p) { return "file://" + p.replace(/\\/g, "/") }
let failures = 0
const ok = (cond, label) => {
  if (cond) console.log("  ✓", label)
  else { failures++; console.error("  ✗", label) }
}

;(async () => {
  console.log("\nmedia-kit")
  const lib = await import(pathToUrl(path.join(ROOT, "src/lib/mediaKit.js")))
  const { MEDIA_EVENTS, PROVENANCE, beachAssetName, unlockedRows, mediaParams } = lib

  // 1) Events canoniques §9
  for (const e of ["sg_svg_view", "sg_gif_view", "sg_pdf_preview", "sg_pdf_open", "sg_pdf_download", "sg_pdf_share", "sg_video_view"]) {
    ok(MEDIA_EVENTS.includes(e), "MEDIA_EVENTS porte " + e)
  }

  // 2) Provenance §7 — 6 classes, jamais de tiers déguisé
  for (const k of ["OWNER_GENERATED", "USER_GENERATED", "COMMUNITY", "SATELLITE", "PARTNER", "THIRD_PARTY"]) {
    ok(PROVENANCE[k] === k, "PROVENANCE." + k)
  }

  // 3) Naming déterministe §6
  ok(beachAssetName("mq027", "drift", "gif") === "beach-mq027-drift.gif", "naming drift: beach-mq027-drift.gif")
  ok(beachAssetName("Grande Anse!", "report-2026-09-07", "pdf") === "beach-grande-anse-report-2026-09-07.pdf", "naming slugifié déterministe")
  ok(beachAssetName("mq027", "drift", "gif") === beachAssetName("mq027", "drift", "gif"), "naming idempotent")

  // 4) Honnêteté : unlockedRows ne fabrique JAMAIS
  const fc = [
    { day: "Lun", status: "clean" },
    { day: "Mar", status: "moderate" },
    { day: "Mer", status: "avoid" },
    { day: "Jeu", status: "_loading", _ph: true },
  ]
  const free = unlockedRows(fc, false)
  ok(free.rows.length === 2, "gratuit : J0–J1 réels uniquement (" + free.rows.length + ")")
  ok(free.rows.every((d) => d.status === "clean" || d.status === "moderate"), "gratuit : que du réel")
  ok(free.gated === true, "gratuit : gated signalé")
  const prem = unlockedRows(fc, true)
  ok(prem.rows.length === 3, "premium : 3 jours réels, placeholder exclu (" + prem.rows.length + ")")
  ok(!prem.rows.some((d) => d._ph || d.status === "_loading"), "premium : aucun placeholder coloré")
  const empty = unlockedRows([], false)
  ok(empty.rows.length === 0 && empty.gated === false, "vide : 0 ligne, pas de gated mensonger")
  const loadingOnly = unlockedRows([{ status: "_loading" }], false)
  ok(loadingOnly.rows.length === 0, "_loading seul : 0 ligne (jamais de couleur inventée)")

  // 5) Pas de PII dans les params analytics
  const p = mediaParams({ beach_id: "mq027", region: "mq", email: "x@y.z", name: "Yacov", phone: "123" })
  ok(p.beach_id === "mq027" && p.region === "mq", "params utiles conservés")
  ok(!("email" in p) && !("name" in p) && !("phone" in p), "PII strippée (email/name/phone absents)")

  // 6) Front : allowlist porte les events (sinon track() les droppe)
  const prod = fs.readFileSync(path.join(ROOT, "src/Sargasses_PROD.jsx"), "utf8")
  for (const e of ["sg_svg_view", "sg_gif_view", "sg_pdf_preview", "sg_pdf_open", "sg_pdf_download", "sg_pdf_share"]) {
    ok(prod.includes('"' + e + '"'), "allowlist Sargasses_PROD.jsx : " + e)
  }

  // 7) Front : wiring lazy + rollback + print/share, sans fabrication
  ok(prod.replace(/\r\n/g, "\n").includes('const BeachDayReport=lazyWithRetry(()=>import("./components/BeachDayReport.jsx"))'), "BeachDayReport lazy (0 octet eager)")
  ok(prod.includes("Rapport du jour (PDF)"), "bouton Rapport dans BeachSheetComic")
  ok(prod.includes("report=0"), "rollback ?report=0 câblé")
  const comp = fs.readFileSync(path.join(ROOT, "src/components/BeachDayReport.jsx"), "utf8")
  ok(comp.includes("window.print"), "download = impression/PDF système")
  ok(comp.includes("navigator.share"), "share = Web Share API (+ presse-papiers)")
  ok(comp.includes("sg_pdf_download") && comp.includes("sg_pdf_share"), "events download/share émis")
  ok(comp.includes("prefersReducedMotion") || comp.includes("prefers-reduced-motion"), "reduced-motion fallback")
  ok(!comp.includes("Math.sin") && !comp.includes("Math.random"), "zéro génération procédurale (moat)")
  ok(comp.includes("indisponible"), "état honnête sans donnée")

  if (failures) { console.error("\nmedia-kit : " + failures + " échec(s)"); process.exit(1) }
  console.log("\nmedia-kit : OK")
})().catch((e) => { console.error("media-kit FATAL", e); process.exit(1) })
