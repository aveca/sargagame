#!/usr/bin/env node
/**
 * perfect-trip.test.cjs — contrat « PERFECT BEACH TRIP » (2026-09-24B).
 * Vérifie : intents adossés à des données réelles, PlanCard (faits réels,
 * rollbacks, tracking), câblage Home, 7 events allowlistés, money-path intact.
 * Les fonctions PURES sont importées et exercées (pas de simple string-match
 * là où un test fonctionnel est possible). Exit 1 si échec.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name) }

console.log("PERFECT BEACH TRIP — contrat")

;(async () => {
  // ── Intents : logique fonctionnelle, jamais d'invention ──
  const intents = await import("../../src/lib/intents.js")
  const BS = [
    { id: "w1", island: "mq", lng: -61.20, lat: 14.7, status: "clean", score: 84, snorkel: true, kids: true, parking: true, drive: 30 },
    { id: "w2", island: "mq", lng: -61.15, lat: 14.6, status: "clean", score: 70, snorkel: false, kids: false, parking: false },
    { id: "e1", island: "mq", lng: -60.80, lat: 14.8, status: "avoid", score: 30, snorkel: true, kids: false, parking: true },
    { id: "e2", island: "mq", lng: -60.90, lat: 14.5, status: "moderate", score: 55, snorkel: true, kids: true, parking: true },
  ]
  check("intents.js : 5 intentions SEULEMENT (aucune sans donnée source)", intents.INTENTS.length === 5)
  check("top = clean uniquement", intents.intentBeaches("top", BS).map(b => b.id).join() === "w1,w2")
  check("snorkel = flag réel (tri clean d'abord)", intents.intentBeaches("snorkel", BS).map(b => b.id).join() === "w1,e2,e1")
  check("family = flag kids réel (tri clean d'abord)", intents.intentBeaches("family", BS).map(b => b.id).join() === "w1,e2")
  check("sunset MQ = côte sous le vent (lng < -61.1) — w1+w2 seulement", intents.intentBeaches("sunset", BS, { islandBeaches: BS }).map(b => b.id).join() === "w1,w2")
  check("sunset tri clean d'abord", intents.intentBeaches("sunset", BS, { islandBeaches: BS })[0].status === "clean")
  check("easy = flag parking réel", intents.intentBeaches("easy", BS).map(b => b.id).join() === "w1,e2,e1")
  check("intent inconnu → [] (jamais de résultat fabriqué)", intents.intentBeaches("romance", BS).length === 0)
  check("aucune entrée → []", intents.intentBeaches("top", []).length === 0)
  check("sans coords → sunset jamais vrai", intents.isLeeward({ island: "mq" }, BS) === false)
  check("coastSentence MQ ouest/est factuelle", /sous le vent/.test(intents.coastSentence({ island: "mq", lng: -61.2 }, "fr")) && /au vent/.test(intents.coastSentence({ island: "mq", lng: -60.8 }, "fr")))
  check("coastSentence i18n EN", /Leeward/.test(intents.coastSentence({ island: "mq", lng: -61.2 }, "en")))
  const OTHER = Array.from({ length: 8 }, (_, i) => ({ id: "rm" + i, island: "rm", lng: -87.5 + i * 0.2, status: "clean", score: 10 }))
  check("hors MQ/GP : sunset = quartile ouest (2/8 les plus à l'ouest)", intents.intentBeaches("sunset", OTHER, { islandBeaches: OTHER }).length === 2)

  // ── Chargement source ──
  const INTENT = read("src/lib/intents.js")
  const PLAN = read("src/components/PlanCard.jsx")
  const HOME = read("src/components/ExperienceReset.jsx")
  const PROD = read("src/Sargasses_PROD.jsx")
  const PO = read("src/PassOffer.jsx")
  const MEDIA = read("src/lib/beach-media.js")
  const TRIP = read("src/TripPlanner.jsx")

  // ── Media registry ──
  const media = await import("../../src/lib/beach-media.js")
  check("media : photo réseau UNIQUEMENT si mappée par id", media.beachImageUrl("gp001", { gp001: "X.jpg" }) === "/beaches/X.jpg")
  check("media : id absent → null (jamais de générique)", media.beachImageUrl("nope", { gp001: "X.jpg" }) === null)
  check("media : header documente les assets manquants (media pass futur)", /ASSETS MANQUANTS/.test(MEDIA))

  // ── PlanCard : données réelles + rollbacks + tracking ──
  check("PlanCard : rollback ?sgplan=0", /sgplan=0/.test(PLAN))
  check("PlanCard : AUCUN import ExperienceReset (anti-cycle)", !/from ["']\.\/ExperienceReset/.test(PLAN))
  check("PlanCard : facts ≤ 3", /facts\.length > 3\)\s*facts\.length = 3/.test(PLAN))
  check("PlanCard : alternative via journey.backup (jamais inventée)", PLAN.includes("journey.backup"))
  const PLAN_UI = PLAN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "")
  check("PlanCard : jamais « parfait » garanti dans les strings UI (honnêteté)", !/parfait|garant/i.test(PLAN_UI))
  check("PlanCard : sg_plan_generate au mount (1×/plage)", PLAN.includes('track?.("sg_plan_generate"') && PLAN.includes("fired.current"))
  check("PlanCard : sg_alternative_open au tap alt", PLAN.includes('"sg_alternative_open"'))
  check("PlanCard : testids plan-card / plan-open / plan-alt", PLAN.includes('data-testid="plan-card"') && PLAN.includes('data-testid="plan-open"') && PLAN.includes('data-testid="plan-alt"'))
  check("PlanCard : image lazy + onError fallback (zéro 404 visuel)", PLAN.includes('loading="lazy"') && PLAN.includes("onError"))

  // ── Câblage Home ──
  check("HomeWow : chips intention data-testid intent-<id>", HOME.includes('data-testid={`intent-${it.id}`}'))
  check("HomeWow : rollback ?sgintent=0", HOME.includes("sgintent=0"))
  check("HomeWow : rail filtré via intentList", HOME.includes("intentBeaches(intent, data.list"))
  check("HomeWow : PlanCard montée sur intentBest + planJourney (journeyFor partagé)", HOME.includes("<PlanCard lang={lang} beach={intentBest} journey={planJourney}") && HOME.includes("journeyFor({ beach: intentBest"))
  check("HomeWow : sg_intent_select au tap", HOME.includes("'sg_intent_select'"))
  check("HomeWow : sg_plan_add quand plan visible + trip", HOME.includes("sg_plan_add"))
  check("HomeWow : sg_perfect_trip_paywall_open sur la carte Pass", HOME.includes("sg_perfect_trip_paywall_open"))
  check("HomeWow : armure chips sous thème (wow-intent doublé-classe)", HOME.includes(".wow-intent.wow-intent{"))
  check("WOW Home : zéro animation infinie sur CTA (sgm-focus fini conservé)", read("src/sg-motion.css").match(/\.sgm-focus\s*\{[^}]*}/)[0].includes("infinite") === false)

  // ── Tracking allowlist ──
  for (const ev of ["sg_intent_select", "sg_recommendation_open", "sg_plan_generate", "sg_plan_add", "sg_alternative_open", "sg_perfect_trip_paywall_open", "sg_perfect_trip_cta"]) {
    check(`event ${ev} allowlisté SG_FUNNEL_EVENTS`, PROD.includes(`"${ev}"`))
  }
  check("TripPlanner : sg_perfect_trip_cta sur CTA séjour", TRIP.includes('"sg_perfect_trip_cta"'))

  // ── Paywall : premium vend le séjour, rollback copy ?sgcopy=0 ──
  check("PassOffer : nouveau headline « séjour idéal »", PO.includes("commence ici"))
  check("PassOffer : rollback ?sgcopy=0 pose l'ancien copy", PO.includes("sgcopy=0") && PO.includes("commence ici") && PO.includes("demain"))
  check("PassOffer : CTA hero BYTES inchangés (contrat existant)", PO.includes("Voir la prévision 7 jours →") && PO.includes("aria-label={_t(lang, \"Commencer maintenant\""))
  check("PassOffer : chaîne buy intacte (zéro touch money-path)", /const buy=\(\)=>\{/.test(PO) && /onBuy\(\{c:cents,pass:PASS\.key,days:PASS\.days,segment:seg\}\)/.test(PO))

  // ── Money-path côté app ──
  check("PROD : forecastById/imageMap/isPremium passés à la home", PROD.includes("forecastById={tripForecastById}") && PROD.includes("imageMap={imageMap}") && PROD.includes("isPremium={isPremium}"))

  console.log(`\n✅ PERFECT TRIP — ${passed} checks ALL PASS`)
})().catch(e => { console.error("✗ " + e.message); process.exit(1) })
