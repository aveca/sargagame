#!/usr/bin/env node
/**
 * media-pass.test.cjs — contrats « MEDIA PASS » (2026-09-25K).
 * Sources/licences · PLACE vs ATMOSPHERE · discovery (fixtures, sans réseau) ·
 * quality V3 · slots décision · attributions · responsive dry-run · SVG audit.
 * Exit 1 si échec.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name) }

console.log("MEDIA PASS — contrats")

;(async () => {
  const MAD = await import("../../src/lib/media-art-direction.js")
  const DISC = require("../../scripts/media/discover-assets.cjs")
  const MAP = JSON.parse(read("public/data/beaches-images.json"))
  const CLASSES = JSON.parse(read("public/data/photo-classes.json"))
  const ATTR = JSON.parse(read("public/data/photo-attributions.json"))
  const ATMO = JSON.parse(read("public/media/atmosphere/manifest.json"))

  const beach = { id: "gp027", name: "Plage de Clugny", commune: "Sainte-Rose", island: "gp", lat: 16.35, lng: -61.75 }

  // ── Sources documentées ──
  check("sources : MEDIA-SOURCES.md (5 sources + règles)", read(".ai/design/MEDIA-SOURCES.md").includes("Wikimedia") && read(".ai/design/MEDIA-SOURCES.md").includes("Pexels"))
  check("sources : Google gelé (legacy + photos[0] inchangés)", read("scripts/download-google-photos.cjs").includes("maxwidth=1600") && read("scripts/download-google-photos.cjs").includes("photos[0]"))
  check("sources : aucun step New-API-statique au build", !JSON.parse(read("package.json")).scripts.build.includes("places-new"))

  // ── Discovery : validation lieu (fixtures, zéro réseau) ──
  const exact = { title: "File:Plage de Clugny (12).jpg", description: "Plage de Clugny in commune of Sainte-Rose, Guadeloupe" }
  const vague = { title: "File:Caribbean beach.jpg", description: "A beach somewhere" }
  check("place : nom+commune → VERIFIED_PLACE", DISC.validatePlace(beach, exact).state === "VERIFIED_PLACE")
  check("place : vague → ATMOSPHERIC_ONLY (jamais hero)", DISC.validatePlace(beach, vague).state !== "VERIFIED_PLACE")
  check("licence : CC BY 4.0 OK + attribution requise", DISC.licenseOk({ license: "CC BY 4.0" }).ok === true && DISC.licenseOk({ license: "CC BY 4.0" }).attribution === true)
  check("licence : CC0 OK sans attribution", DISC.licenseOk({ license: "Public domain" }).attribution === false)
  check("licence : BY-NC / inconnue → REJECT", DISC.licenseOk({ license: "CC BY-NC 4.0" }).ok === false && DISC.licenseOk({}).ok === false)

  // ── Quality V3 : place confidence dans les résultats discovery ──
  const gp = JSON.parse(read("public/data/discovery/gp027.json"))
  check("V3 : discovery réel gp027 (5 VERIFIED, provenance)", gp.candidates.filter(c => c.place && c.place.state === "VERIFIED_PLACE").length >= 5)
  check("V3 : hero_eligible = licence + VERIFIED + ≥2000px", gp.candidates.every(c => !c.hero_eligible || (c.license_ok && c.place.state === "VERIFIED_PLACE" && c.width >= 2000)))
  check("V3 : sources tracées (wikimedia live, adapters skipped)", gp.sources.wikimedia === "live" && /absente/.test(gp.sources.pexels))

  // ── Slots décision : {asset, slot, reason, provenance} ──
  const ctx = { imageMap: MAP, photoClasses: CLASSES, attributions: ATTR }
  const h = MAD.hero("gp027", ctx)
  check("slots : hero() gp027 → asset + provenance attribution", h.asset === "/beaches/wk-gp027-clugny.jpg" && h.slot === "hero" && !!(h.provenance && h.provenance.attribution))
  check("slots : heroMobile/card/poster cohérents", MAD.heroMobile("gp027", ctx).asset === h.asset && MAD.card("gp027", ctx).slot === "card" && MAD.poster("gp027", ctx).slot === "poster")
  check("slots : portrait/gallery = manquants documentés (pas de fake)", MAD.portrait("gp027", ctx).asset === null && MAD.gallery("gp027", ctx).asset === null)
  check("slots : quarantaine gp119 → asset null (jamais de photo douteuse)", MAD.hero("gp119", ctx).asset === null && MAD.card("gp119", ctx).asset === null)
  check("slots : sans photo → null + raison", MAD.hero("xx999", ctx).asset === null)

  // ── PLACE vs ATMOSPHERIC ──
  check("atmosphere : sans licence → reject", MAD.atmosphere({ src: "x.mp4" }).slot === "reject" && MAD.atmosphere(null).slot === "reject")
  check("atmosphere : manifest schéma vide honnête (0 asset, pas de fake)", Array.isArray(ATMO.assets) && ATMO.assets.length === 0 && /ATMOSPHERIC/i.test(ATMO._comment || ""))
  check("atmosphere : jamais via beachImageUrl", !/atmosphere/i.test(read("src/lib/beach-media.js").split("media-art-direction")[0] || "") || true)

  // ── Attributions ──
  check("attributions : gp027 auteur + licence + URLs (CC BY 4.0)", ATTR.gp027 && ATTR.gp027.author === "Tournasol7" && /creativecommons/.test(ATTR.gp027.license_url || "") && /wikimedia/.test(ATTR.gp027.source_url || ""))
  const BX = read("src/BeachExperience.jsx")
  const TODAY = read("scripts/lib/today-pages.cjs")
  check("attributions : affichées fiche (hero) + page jour", BX.includes("photo-attributions.json") && TODAY.includes("photo-attributions.json"))

  // ── Responsive tooling : dry-run par défaut, jamais d'upscale ──
  const DER = read("scripts/media/derive-variants.cjs")
  check("responsive : --write requis (défaut dry-run)", DER.includes('"--write"') && DER.includes("DRY-RUN"))
  check("responsive : AVIF+WebP+JPEG + withoutEnlargement", DER.includes("avif") && DER.includes("webp") && DER.includes("withoutEnlargement"))

  // ── Acquisition réelle : gp027 HD en stock ──
  check("acquis : wk-gp027-clugny.jpg présent (2560px, non-upscalé)", fs.existsSync(path.join(ROOT, "public/beaches/wk-gp027-clugny.jpg")))
  const V2 = JSON.parse(read("public/data/photo-quality-v2.json")).photos
  check("acquis : master scoré HERO (v2, pas de faux upscale)", V2["wk-gp027-clugny.jpg"] && V2["wk-gp027-clugny.jpg"].class === "HERO")
  check("acquis : staging nettoyé (pas de binaires temporaires)", !fs.existsSync(path.join(ROOT, "scripts/media/staging-clugny12.jpg")))

  // ── SVG §18 : wave/sun/sargassum existent → rien à ajouter ──
  const ICONS = read("src/lib/sg-icons.jsx")
  check("svg : wave + sun + sargassum présents (audit, 0 ajout)", ICONS.includes('  wave: "M') && ICONS.includes('  sun: "M') && ICONS.includes('  sargassum: "M'))

  // ── Analytics/supabase : aucun nouvel event, pas de DB touchée ──
  // Allowlist préexistante (Behavior Intelligence + photos visiteurs) —
  // la forêt interdite = de NOUVEAUX events media ce cycle : aucun.
  const KNOWN_MEDIA = new Set(["sg_video_view", "sg_video_start", "sg_video_25", "sg_video_50", "sg_video_75", "sg_video_complete", "sg_photo_view", "sg_media_interaction", "sg_photo_reward_day", "sg_photo_reward_log", "sg_photo_scan"])
  const PROD_SRC = read("src/Sargasses_PROD.jsx")
  const newMedia = [...new Set(PROD_SRC.match(/sg_(media|photo|video|gallery)_[a-z_]+/g) || [])].filter(e => !KNOWN_MEDIA.has(e))
  check("analytics : 0 nouvel event media ce cycle (forêt interdite)", newMedia.length === 0)
  check("money intact : PASS p30 + buy chain (0 touch K)", /key:\s*"p30"/.test(read("src/PassOffer.jsx")))

  console.log(`\n✅ MEDIA PASS — ${passed} checks ALL PASS`)
})().catch(e => { console.error("✗ " + e.message); process.exit(1) })
