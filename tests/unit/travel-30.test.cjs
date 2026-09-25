#!/usr/bin/env node
/**
 * travel-30.test.cjs — contrats « APP 3.0 CINEMATIC » (2026-09-25I).
 * Couche additive : tokens, hero ciné, verdict vivant, compare visuel,
 * séquence Perfect Day, carnet Trip, motion finie, SVG, analytics rail.
 * Rollback ?sgcine=0. Money-path intact. Pas de migration photo statique.
 * Exit 1 si échec.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name) }

console.log("TRAVEL 3.0 — contrats")

;(() => {
  const T3 = read("src/sg-travel-3.0.css")
  const HOME = read("src/components/ExperienceReset.jsx")
  const BX = read("src/BeachExperience.jsx")
  const PLAN = read("src/components/PlanCard.jsx")
  const TRIP = read("src/TripPlanner.jsx")
  const PROD = read("src/Sargasses_PROD.jsx")
  const SGM = read("src/sg-motion.css")
  const ICONS = read("src/lib/sg-icons.jsx")

  // ── Design system 3.0 : tokens, pas de valeurs arbitraires ──
  for (const t of ["--t3-ocean", "--t3-sea", "--t3-tropical", "--t3-sand", "--t3-sunset", "--t3-ink", "--t3-paper"])
    check(`tokens : ${t} défini`, T3.includes(t + ":"))
  check("tokens : type display/heading/body/meta/mono + radius hero/cards/pills/sheets", T3.includes("--t3-display") && T3.includes("--t3-r-hero") && T3.includes("--t3-r-sheet"))
  check("tokens : ombres douces (jamais de hard offset noir)", T3.includes("--t3-shadow-2") && !/box-shadow:\s*\d+px\s+\d+px\s+0\s+#0d0b14/.test(T3))
  check("tokens : importé eager (Sargasses_PROD)", PROD.includes('sg-travel-3.0.css'))
  check("tokens : reduced-motion calme", T3.includes("prefers-reduced-motion"))

  // ── Hero cinématique Home ──
  check("cine : testids cine-hero/cine-open/cine-plan", HOME.includes('data-testid="cine-hero"') && HOME.includes('data-testid="cine-open"') && HOME.includes('data-testid="cine-plan"'))
  check("cine : rollback ?sgcine=0 (layout D intact)", HOME.includes("sgcine=0"))
  check("cine : photo RÉELLE catalogue (jamais de stock)", HOME.includes("beachImageUrl(heroBeach.id, imageMap)") && HOME.includes("if (!heroBeach || !heroImg) return null"))
  check("cine : UNE action primaire + event existant (pas de nouvel event)", HOME.includes("sg_home_best_open") && HOME.includes("src: 'cine_hero'"))
  check("cine : copy invitation + compteurs réels", HOME.includes("Trouve ton moment") && HOME.includes("plages observées"))
  check("cine : fetchpriority hero (LCP) + onError-hide", HOME.includes('fetchpriority="high"') && HOME.includes("t3-hero-media"))
  check("cine : plein écran AHA (t3-hero-full + scroll cue finie)", HOME.includes("t3-hero-full") && T3.includes("92dvh") && /t3cue[^}]*3;/.test(T3))
  check("cine : 3 raisons réelles evidenceFor + plan B journey", HOME.includes('data-testid="cine-reasons"') && HOME.includes("evidenceFor(intent || 'top'") && HOME.includes('data-testid="cine-planb"'))
  check("cine : shared-transition WAAPI + garde-fou (jamais de piège, RM direct)", HOME.includes("animate?.(") && HOME.includes("setTimeout") && HOME.includes("400") && HOME.includes("reduceMotion"))

  // ── Verdict vivant (facteurs réels) ──
  check("facteurs : bloc bx-factors sous ?sgcine=0", BX.includes('data-testid="bx-factors"') && BX.includes("cineOff()"))
  check("facteurs : AFAI réel si présent (satellite)", BX.includes("AFAI ${beach.afai.toFixed(2)}"))
  check("facteurs : exposition coords (seuils MQ/GP, jamais d'invention)", BX.includes("beach.lng < -61.1") && BX.includes("beach.lng < -61.6"))
  check("facteurs : snorkel/accès conditionnés aux flags", BX.includes("if (beach.snorkel)") && BX.includes("beach.parking ||"))
  check("facteurs : confiance = barre % réelle", BX.includes("bar: conf"))
  check("facteurs : comparaison backup réelle (statut pire, pas de km inventés)", BX.includes("worseBackup") && BX.includes("moins intéressante"))

  // ── Compare visuel ──
  check("compare : photos réelles par colonne", HOME.includes("beachImageUrl(b.id, imageMap)") && HOME.includes("xp-compare"))
  check("compare : synthèse écart réel (testid + gap pts)", HOME.includes('data-testid="xp-compare-synth"') && HOME.includes("pts d'écart"))
  check("compare : imageMap plombé (vue compare PROD)", /view="compare"[\s\S]{0,400}imageMap=\{imageMap\}/.test(PROD))
  check("compare : dismiss non-destructif (✕ masque, Effacer vide via onClose)", HOME.includes("xp-compare-clear") && HOME.includes("setDismissed(true)") && HOME.includes("useEffect(() => { setDismissed(false) }, [beaches.length])"))
  check("compare : swipe Embla (lazy, rollback grille ?sgcine=0)", HOME.includes("useEmblaCarousel") && HOME.includes("embla-carousel-react") && HOME.includes('data-testid="xp-compare-rail"'))
  check("compare : slides 78% mobile → 1fr desktop (t3-compare-slide)", T3.includes("t3-compare-slide"))
  check("compare : hooks avant return (pas de hook conditionnel)", /const \[emblaRef\] = useEmblaCarousel[\s\S]{0,300}if \(!beaches\.length/.test(HOME))

  // ── Perfect Day séquence (sans horaires inventés) ──
  check("sequence : testid plan-sequence + rollback cine", PLAN.includes('data-testid="plan-sequence"') && PLAN.includes("sgcine=0"))
  check("sequence : étapes réelles (today/J+1/backup, jamais d'heures)", PLAN.includes("d.i === 1") && !/09:30|12:00|15:00|17:40/.test(PLAN))
  check("sequence : timeline CSS 3.0 (t3-timeline)", PLAN.includes("t3-timeline"))

  // ── Trip carnet ──
  check("trip : numéros J1..Jn réels (ordre, testid)", TRIP.includes('data-testid="tp-day-num"') && TRIP.includes("J{idx + 1}"))
  check("trip : sheet transition (sgm-sheet gaté)", TRIP.includes("sgm-sheet") && TRIP.includes("SGM_ALL"))

  // ── Motion 3.0 : finies, 180-500ms, jamais bloquantes ──
  for (const k of ["sgmSheet", "sgmZoom", "sgmFadeUp"]) check(`motion : keyframes ${k}`, SGM.includes(k))
  check("motion : classes sheet/zoom/fadeup (délais stagger, pas d'infinite)", SGM.includes(".sgm-sheet") && SGM.includes(".sgm-zoom") && SGM.includes(".sgm-fadeup") && !/\.sgm-(sheet|zoom|fadeup)\s*\{[^}]*infinite/.test(SGM))
  check("motion : durées 180-500ms (.3s/.5s/.32s)", SGM.includes(".3s") && SGM.includes(".5s") && SGM.includes(".32s"))
  check("motion : reduced-motion neutralise les 3", /prefers-reduced-motion[\s\S]*?\.sgm-sheet,\s*\.sgm-zoom,\s*\.sgm-fadeup\s*\{[^}]*animation:\s*none/.test(SGM))

  // ── SVG : 5 glyphes (style 24, 2 traits) ──
  for (const n of ["fish", "boat", "compass", "route", "satellite"]) check(`svg : glyphe ${n}`, ICONS.includes(`  ${n}: "M`))

  // ── Analytics rail : allowlist (fix livré en I, gardé ici en non-régression ;
  // preuve live = probe-rail-prod.mjs RAIL_TRACKING_OK sur prod) ──
  for (const e of ["sg_home_rail_focus", "sg_home_rail_seek", "sg_home_rail_open", "sg_home_rail_drag"])
    check(`rail : ${e} dans SG_FUNNEL_EVENTS (garde non-régression)`, PROD.includes(`"${e}"`))
  const F1 = read("scripts/automation/funnel-from-supabase.cjs")
  const F2 = read("scripts/automation/daily-stats-check.cjs")
  check("rail : FUNNEL_KEYS funnel-from-supabase", ["home_rail_focus", "home_rail_seek", "home_rail_open", "home_rail_drag"].every(k => F1.includes(`'${k}'`)))
  check("rail : FUNNEL_KEYS daily-stats-check", ["home_rail_focus", "home_rail_seek", "home_rail_open", "home_rail_drag"].every(k => F2.includes(`'${k}'`)))

  // ── Photo pipeline : PAS de migration statique (ToS, cycle H) ──
  const DL = read("scripts/download-google-photos.cjs")
  check("photos : downloader legacy inchangé (pas de bulk New-API)", DL.includes("maxwidth=1600") && DL.includes("photos[0]"))
  check("photos : aucun step 4800px/static dans le build", !JSON.parse(read("package.json")).scripts.build.includes("places-new"))

  // ── Dépendances : 1 tactile lazy, pas de forêt ──
  const PKG = JSON.parse(read("package.json"))
  check("deps : embla-carousel-react installé (pinned)", !!(PKG.dependencies || {})["embla-carousel-react"])
  check("deps : ni rive ni motion installés (décisions documentées)", !((PKG.dependencies || {}).rive || (PKG.dependencies || {})["@rive-app/canvas"] || (PKG.dependencies || {})["framer-motion"] || (PKG.dependencies || {}).motion))
  check("deps : embla dans chunk lazy uniquement (jamais eager PROD)", !/from ["']embla-carousel/.test(PROD))

  // ── Money-path intact ──
  const PO = read("src/PassOffer.jsx")
  check("money intact : PASS p30 + buy chain (0 touch I)", /key:\s*"p30"/.test(PO) && /onBuy\(\{c:cents,pass:PASS\.key/.test(PO))
  check("premium : WorldPaywall non touché ce cycle (trajectoire existante)", !/sgcine/.test(read("src/PremiumModal/WorldPaywall.jsx")))

  console.log(`\n✅ TRAVEL 3.0 — ${passed} checks ALL PASS`)
})()
