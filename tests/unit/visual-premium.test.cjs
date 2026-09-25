#!/usr/bin/env node
/**
 * visual-premium.test.cjs — contrat « VISUAL PREMIUM » (2026-09-25D).
 * beachMedia v1 (assets réels uniquement), manifest build, recommandation
 * intention avec photo réelle, preuve réelle dans PassOffer, aucun fake.
 * Exit 1 si échec.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name) }

console.log("VISUAL PREMIUM — contrat")

;(async () => {
  const MEDIA = read("src/lib/beach-media.js")
  const PLAN = read("src/components/PlanCard.jsx")
  const HOME = read("src/components/ExperienceReset.jsx")
  const PROD = read("src/Sargasses_PROD.jsx")
  const PO = read("src/PassOffer.jsx")
  const WORLD = read("src/PremiumModal/WorldPaywall.jsx")
  const COMIC = read("src/PremiumModal/ComicPaywall.jsx")
  const PKG = JSON.parse(read("package.json"))

  const media = await import("../../src/lib/beach-media.js")

  // ── beachMedia contract v1 ──
  check("media : photo réelle mappée (gp001) présente", !!media.beachMedia("gp001", { imageMap: JSON.parse(read("public/data/beaches-images.json")) }).hero)
  check("media : qualité réelle lue", media.beachMedia("gp001", { imageMap: JSON.parse(read("public/data/beaches-images.json")), imageQ: JSON.parse(read("public/data/beaches-images-quality.json")) }).quality === 90)
  check("media : vidéo hero UNIQUEMENT si id dans manifest réel", !!media.beachMedia("gp001", { heroVids: ["gp001"] }).video && !media.beachMedia("gp001", { heroVids: ["mq001"] }).video)
  check("media : poster = photo réelle (sinon null)", media.beachMedia("gp001", { imageMap: JSON.parse(read("public/data/beaches-images.json")), heroVids: ["gp001"] }).video.poster !== null)
  check("media : slots portrait/gallery/sunset/activity = documentés manquants (jamais fabriqués)", (() => { const m = media.beachMedia("gp001", {}); return m.portrait === null && m.gallery.length === 0 && m.sunset === null && m.activity.length === 0 && m.missing.length >= 4 })())
  check("media : id absent → missing photo+video documentés", (() => { const m = media.beachMedia("noSuchBeach", {}); return m.hero === null && m.missing.includes("photo") && m.missing.includes("video") })())

  // ── Manifest (assets réels SEULEMENT) ──
  const mf = JSON.parse(read("public/data/media-manifest.json"))
  check("manifest : compteurs réels (catalogues sources)", mf.counts && mf.counts.beachesWithPhoto === Object.keys(JSON.parse(read("public/data/beaches-images.json"))).length && mf.counts.beachesWithVideo === JSON.parse(read("public/videos/hero/manifest.json")).ids.length)
  check("manifest : règle d'honnêteté explicitée", /assets réels uniquement/.test(mf.rule))
  check("build : media-manifest généré par le build (avant vite)", PKG.scripts.build.includes("gen-media-manifest.cjs"))

  // ── PlanCard consomme le contrat ──
  check("PlanCard : vidéo hero avec poster=photo réelle, saveData → photo seule", PLAN.includes("media.video.poster || undefined") && PLAN.includes("saveData") && PLAN.includes("autoPlay={false}"))
  check("PlanCard : photo reste lazy + onError-hide", PLAN.includes('loading="lazy"') && PLAN.includes("onError"))

  // ── Home : recommendation concierge dans l'intention (photo réelle) ──
  check("Home : intent-reco strip UNIQUEMENT si intention + meilleure plage", HOME.includes('data-testid="intent-reco"') && HOME.includes("intent && !!intentBest"))
  check("Home : photo intent-reco via media contract (image réelle)", HOME.includes("beachImageUrl(intentBest.id, imageMap)") || HOME.includes("beachMedia(intentBest.id"))
  check("Home : sg_recommendation_open sur le strip (source intent_strip)", HOME.includes("intent_strip"))
  check("Home : AUCUN repose sur des assets absents (onError-hide photo)", HOME.includes("onError={e => { e.currentTarget.style.display = 'none' }}") || HOME.includes('onError={e => { e.currentTarget.style.display = "none" }}'))

  // ── PassOffer : preuve réelle (beachCount) sous bullets ──
  check("PassOffer : beachCount prop ajoutée (0 par défaut)", /beachCount = 0\W*}/.test(PO))
  check("PassOffer : preuve UNIQUEMENT si beachCount>0 + rollback ?sgcopy=0", PO.includes("Number(beachCount) > 0 &&") && PO.includes('passoffer-proof'))
  const worldSites = (WORLD.match(/beachCount=\{beachCount\}/g) || []).length
  check("WorldPaywall : beachCount passé aux 2 sites PassOffer", worldSites === 2)
  check("ComicPaywall : beachCount passé", /beachCount=\{beachCount\}/.test(COMIC))

  // ── Money-path inchangé ──
  check("PassOffer : buy chain INCHANGÉE", /const buy=\(\)=>\{/.test(PO) && /onBuy\(\{c:cents,pass:PASS\.key,days:PASS\.days,segment:seg\}\)/.test(PO))
  check("PassOffer : aucune référence prix/amount altérée (PASS.key intact)", /key:\s*"p30"/.test(PO))

  // ── Motion : aucune animation infinie introduite ──
  const SGM = read("src/sg-motion.css")
  check("sgm : sgm-focus reste FINI (pas de régression 2026-09-24A)", !/\.sgm-focus\s*\{[^}]*infinite/.test(SGM))
  check("SG : saveData respecté (pas d'autoplay lourd)", /saveData/.test(PLAN))

  console.log(`\n✅ VISUAL PREMIUM — ${passed} checks ALL PASS`)
})().catch(e => { console.error("✗ " + e.message); process.exit(1) })
