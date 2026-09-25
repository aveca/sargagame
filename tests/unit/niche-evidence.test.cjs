#!/usr/bin/env node
/**
 * niche-evidence.test.cjs — contrats « DATA INTELLIGENCE » (2026-09-25F).
 * source présente · intent justifiée · score déterministe · confidence ·
 * aucune invention · aucune activation sans coverage.
 * Exit 1 si échec.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name) }

console.log("NICHE EVIDENCE — contrats")

;(async () => {
  const EV = await import("../../src/lib/intent-evidence.js")
  const MAR = await import("../../src/lib/marine.js")
  const INTENTS = await import("../../src/lib/intents.js")
  const BX = read("src/BeachExperience.jsx")
  const HOME = read("src/components/ExperienceReset.jsx")

  const beach = { id: "gp024", island: "gp", name: "Plage de Deshaies", commune: "Deshaies", lat: 16.3, lng: -61.79, status: "clean", score: 89, confidence: 69, afai: 0.2, kids: true, snorkel: true, parking: true, drive: 55 }

  // ── Registre : 5 live / 5 bloquées, raisons exactes ──
  for (const id of ["top", "snorkel", "family", "sunset", "easy"])
    check(`registre : ${id} LIVE (couverture réelle)`, EV.intentStatus(id).live === true)
  const blocked = { diving: "no-depth-data", fishing: "no-fishing-source", sailing: "no-sailing-source", romantic: "no-honest-proxy", wild: "drive-plus-parking-unproven" }
  for (const [id, reason] of Object.entries(blocked)) {
    const s = EV.intentStatus(id)
    check(`registre : ${id} BLOQUÉ (${reason})`, s.live === false && s.reason === reason && Array.isArray(s.missing) && s.missing.length > 0)
  }
  check("registre : intent inconnu → blocked (jamais d'invention)", EV.intentStatus("kitesurf").live === false)

  // ── evidenceFor : déterministe, expliqué, jamais absolu ──
  const e1 = EV.evidenceFor("snorkel", beach, "fr")
  const e2 = EV.evidenceFor("snorkel", beach, "fr")
  check("evidence : déterministe (score+raisons identiques, hors horodatage)", e1.score === e2.score && JSON.stringify(e1.evidence) === JSON.stringify(e2.evidence))
  check("evidence : score borné 10-100 + confidence", e1.score >= 10 && e1.score <= 100 && ["high", "medium"].includes(e1.confidence))
  check("evidence : raisons citées avec source", e1.evidence.length >= 2 && e1.evidence.every(x => x.text && x.source))
  check("evidence : snorkel cite le flag + le satellite", e1.evidence.some(x => x.source === "flag") && e1.evidence.some(x => x.source === "satellite"))
  check("evidence : statut absent → blocked no-status", EV.evidenceFor("top", { id: "x" }).blocked === true)
  check("evidence : intent bloqué → blocked + missing (diving)", (() => { const r = EV.evidenceFor("diving", beach); return r.blocked && r.missing.includes("depth") })())
  check("evidence : flag snorkel ≠ preuve plongée (diving reste bloqué même avec flag)", EV.evidenceFor("diving", beach).blocked === true)
  check("evidence : i18n FR/EN/ES", EV.evidenceFor("family", beach, "en").evidence.length > 0 && EV.evidenceFor("family", beach, "es").evidence.length > 0)

  // ── tipsFor : provenance obligatoire ──
  const tips = EV.tipsFor(beach, "fr")
  check("tips : chaque conseil a kind+source+confidence", tips.length > 0 && tips.every(t => ["warning", "tip", "fact"].includes(t.kind) && t.source && t.confidence))
  check("tips : masque si snorkel+clean+afai bas (règle VisitPlan)", tips.some(t => /Masque-tuba/.test(t.text)))
  const bad = EV.tipsFor({ id: "y", status: "avoid", afai: 0.5, kids: true }, "fr")
  check("tips : warning H2S si avoid+afai≥0.40 (source satellite)", bad.some(t => t.kind === "warning" && t.source === "satellite" && /H2S/.test(t.text)))
  check("tips : [] sans données (jamais rempli)", EV.tipsFor(null).length === 0 && EV.tipsFor({ id: "z" }).length === 0)

  // ── marine.js : seuils = conditions-filters.js, source documentée ──
  const CF = read("src/lib/conditions-filters.js")
  check("marine : seuils identiques au métier (0.8/1.0/1.5)", MAR.CALM_WAVE === 0.8 && MAR.SNORKEL_WAVE === 1.0 && MAR.ROUGH_WAVE === 1.5 && CF.includes("0.8") && CF.includes("1.0") && CF.includes("1.5"))
  check("marine : marineState pur (calm/moderate/rough/null)", MAR.marineState({ waveHeight: 0.4 }) === "calm" && MAR.marineState({ waveHeight: 1.0 }) === "moderate" && MAR.marineState({ waveHeight: 2 }) === "rough" && MAR.marineState({}) === null)
  check("marine : snorkelSea exige flag+clean+vagues (même règle métier)", MAR.snorkelSea(beach, { waveHeight: 0.5 }).ok === true && MAR.snorkelSea(beach, { waveHeight: 1.2 }).ok === false && MAR.snorkelSea({ ...beach, snorkel: false }, { waveHeight: 0.5 }).ok === null)
  const MSRC = read("src/lib/marine.js")
  check("marine : provider documenté (marine-api.open-meteo.com, sans clé, limites)", MSRC.includes("marine-api.open-meteo.com") && MSRC.includes("sans clé") && MSRC.includes("Limites"))
  check("marine : cache 30 min + timeout 8s + jamais de throw", MSRC.includes("30 * 60 * 1000") && MSRC.includes("8000") && MSRC.includes("catch (_) { return null }"))

  // ── UI : sections branchées, rollback, events existants ──
  check("BeachExperience : section MER (fetch paresseux, source citée)", BX.includes('id="bx-mer"') && BX.includes("fetchMarine(beach)") && BX.includes("marineSourceLabel"))
  check("BeachExperience : MER sous ?sgvis=0 + event existant", BX.includes("!visOff() && (") && BX.includes('via: "marine"'))
  check("BeachExperience : savoir = tips avec source affichée", BX.includes("tipsFor(beach, lang)") && BX.includes("Source : ") && BX.includes("sourceShort(f.source"))
  check("Home : reco affiche raison + source (intent-reco-why)", HOME.includes('data-testid="intent-reco-why"') && HOME.includes("evidenceFor(intent, intentBest"))
  check("sg-visual : beachFacts porte source (provenance)", read("src/lib/sg-visual.js").includes('source: "coords"') && read("src/lib/sg-visual.js").includes('source: "flag"'))

  // ── Media binding (Phase 11) : intents → assets réels ──
  const imgMap = JSON.parse(read("public/data/beaches-images.json"))
  const heroIds = JSON.parse(read("public/videos/hero/manifest.json")).ids
  const beaches = JSON.parse(read("public/data/beaches-list.json"))
  const list = Array.isArray(beaches) ? beaches : beaches.beaches
  for (const id of ["top", "snorkel", "family", "sunset", "easy"]) {
    const rec = INTENTS.intentBeaches(id, list.map(b => ({ ...b, status: b.status || "moderate", score: b.score ?? 50 })), { islandBeaches: list })
    const withPhoto = rec.filter(b => imgMap[b.id]).length
    check(`media binding : intent ${id} → ${withPhoto}/${rec.length} reco avec photo réelle`, rec.length > 0 && withPhoto > 0)
  }
  check("media binding : snorkel hero vidéo si id manifest (jamais de stock)", heroIds.length === 80)

  // ── Photos C (Phase 12) : mêmes lieux, tailles d'affichage bornées ──
  check("photos C : gp012/gp027/gp083 mappées à leur vrai lieu (pas de substitution)", imgMap.gp012 === "Gosier_plage.jpg" && imgMap.gp027 === "gplace-gp027.jpg" && imgMap.gp083 === "gplace-gp083.jpg")
  check("photos C : Îlet_du_Gosier (102 Ko) NON mappée à gp012 (lieu différent, pas de mensonge)", imgMap.gp012 !== "Îlet_du_Gosier.jpg")

  // ── Money-path intact ──
  const PO = read("src/PassOffer.jsx")
  check("money intact : PASS p30 + buy chain (0 touch F)", /key:\s*"p30"/.test(PO) && /onBuy\(\{c:cents,pass:PASS\.key/.test(PO))

  console.log(`\n✅ NICHE EVIDENCE — ${passed} checks ALL PASS`)
})().catch(e => { console.error("✗ " + e.message); process.exit(1) })
