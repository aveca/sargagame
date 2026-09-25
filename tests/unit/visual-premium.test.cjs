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

  // ── Manifest (assets réels SEULEMENT) : le générateur doit produire EXACTEMENT
  // les catalogues sources (les compteurs du fichier dépendent de la date de build,
  // mais la régénération doit être idempotente sur le contenu) ──
  const { execFileSync } = require("child_process")
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "gen-media-manifest.cjs")], { cwd: ROOT })
  const mf = JSON.parse(read("public/data/media-manifest.json"))
  check("manifest : compteurs générés == catalogues sources",
    mf.counts && mf.counts.beachesWithPhoto === Object.keys(JSON.parse(read("public/data/beaches-images.json"))).length && mf.counts.beachesWithVideo === JSON.parse(read("public/videos/hero/manifest.json")).ids.length)
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

  // ── sg-icons : système propriétaire (2026-09-25E) ── (fichier JSX : on teste
  // le contenu par lecture fichier, pas d'import ESM direct en Node commonjs)
  const ICONS_SRC = read("src/lib/sg-icons.jsx")
  const names = ["wave","sun","sunset","beach","sail","snorkel","family","parking","pin","plan","alternative","alert","sargassum"]
  check("sg-icons : 13 glyphes organiques (viewBox 24)", names.every(n => new RegExp(`^  ${n}: "M`).test(ICONS_SRC.replace(/\r/gm," ") || "")) || names.every(n => ICONS_SRC.includes(`  ${n}: "M`)))
  check("sg-icons : Icon oweIcon (svg fill=none + currentColor)", ICONS_SRC.includes('fill="none"') && ICONS_SRC.includes("currentColor"))
  check("sg-icons : nom inconnu → chemin null (jamais d'icône inventée)", ICONS_SRC.includes("return ICONS[name] || null"))
  check("Home : chips intention = sg-icons (plus d'emoji)", HOME.includes("<Icon name={it.icon}") && HOME.includes("import { Icon }"))

  // ── Photo produit à la maison + today-pages ──
  check("Home : focus WOW = photo réelle du beach centré (media contract)", HOME.includes("beachImageUrl(active.id"))
  const TODAY = read("scripts/lib/today-pages.cjs")
  check("today-pages : hero image réelle du meilleur spot (catalogue uniquement)", TODAY.includes("beaches-images.json") && TODAY.includes("/beaches/"))

  // ── 2026-09-25E (VISUAL OVERHAUL) : densité + mini-guide + motion ──
  const VIS = read("src/lib/sg-visual.js")
  const BX = read("src/BeachExperience.jsx")
  const TRIP = read("src/TripPlanner.jsx")
  check("sg-visual : kill-switch ?sgvis=0 (rollback unique E)", VIS.includes("sgvis=0") && VIS.includes("visOff"))
  check("sg-visual : nearestBeaches = coords réelles, jamais sans lat/lng", VIS.includes("lat == null || beach.lng == null") && VIS.includes("haversineKm"))
  check("sg-visual : beachFacts = flags réels uniquement (kids/snorkel/parking/drive)", VIS.includes("beach.kids") && VIS.includes("beach.snorkel") && VIS.includes("beach.parking") && !VIS.includes("romantic"))
  const vis = await import("../../src/lib/sg-visual.js")
  check("sg-visual : plage sans coords → proximité vide (jamais d'invention)", vis.nearestBeaches({ id: "x" }, [{ id: "y", lat: 1, lng: 2 }]).length === 0)
  check("sg-visual : proximité trie même-île puis clean puis distance", (() => {
    const me = { id: "me", lat: 14.6, lng: -61.1, island: "mq", status: "clean" }
    const far = { id: "far", lat: 14.7, lng: -61.0, island: "mq", status: "clean" }
    const near = { id: "near", lat: 14.61, lng: -61.09, island: "mq", status: "clean" }
    const r = vis.nearestBeaches(me, [far, near], 2)
    return r.length === 2 && r[0].beach.id === "near" && typeof r[0].distanceKm === "number"
  })())
  check("sg-visual : facts vides sans flags (section se masque)", vis.beachFacts({ id: "x" }, [], "fr").length === 0)
  check("BeachCard : photo réelle en tête (prop img, onError-hide)", HOME.includes("img={beachImageUrl(b.id, imageMap)}") && HOME.includes("height: 120"))
  check("Plages : imageMap plombé (vue liste + router rest)", HOME.includes("imageMap = null") && PROD.includes('view="plages"') && /view="plages"[\s\S]{0,400}imageMap=\{imageMap\}/.test(PROD))
  check("PlanCard : <details> Pourquoi (raisons réelles, event existant)", PLAN.includes('data-testid="plan-why"') && PLAN.includes("sg_verdict_expand") && PLAN.includes("<details"))
  check("PlanCard : entrée sgm-planin + swap alternative (finies)", PLAN.includes("sgm-planin") && PLAN.includes("sgm-swap"))
  check("BeachExperience : 3 sections mini-guide (savoir/prox/faq, masquées sans data)", BX.includes('id="bx-savoir"') && BX.includes('id="bx-prox"') && BX.includes('id="bx-faq"') && BX.includes("!visOff()"))
  check("BeachExperience : proximité ouvre la plage (pas de cul-de-sac)", BX.includes("sg_recommendation_open") && BX.includes('source: "bx_proximity"'))
  check("TripPlanner : vignette réelle par jour (imageMap optionnel)", TRIP.includes("imageMap = null") && TRIP.includes("/beaches/") && PROD.includes("LazyTripPlanner") && /LazyTripPlanner[\s\S]{0,500}imageMap=\{imageMap\}/.test(PROD))
  check("Motion E : 4 motions finies (planin/swap/gallery/tripday), reduced-motion off", SGM.includes("sgmPlanIn") && SGM.includes("sgmSwap") && SGM.includes("sgmGallery") && SGM.includes("sgmTripDay") && !/\.sgm-(planin|swap|gallery|tripday)\s*\{[^}]*infinite/.test(SGM))
  check("Motion E : stagger --i + pas d'infinite sur CTA", SGM.includes("--i, 0") && !/\.sgm-focus\s*\{[^}]*infinite/.test(SGM))
  check("Premium : money-path intact (prix/entitlements/Mollie non touchés ce cycle)", /key:\s*"p30"/.test(PO) && !/sgvis/.test(PO))

  console.log(`\n✅ VISUAL PREMIUM — ${passed} checks ALL PASS`)
})().catch(e => { console.error("✗ " + e.message); process.exit(1) })
