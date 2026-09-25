#!/usr/bin/env node
/**
 * acquisition-plan.test.cjs — contrat GOOGLE → DÉCISION → PLAN (2026-09-25C).
 * - pages /aujourdhui/ /today/ /hoy/ : CTA « plan » + deep-links réels, i18n,
 *   aucune donnée inventée, anti-doublon conservé.
 * - app : ?trip=1 ouvre le TripPlanner au boot (dataReady + ?tripplan=0 respectés).
 * - PlanCard : semaine forecast réelle (points) + verrous premium honnêtes.
 * - Money-path : non régressé par la copie « séjour ».
 * Exit 1 si échec.
 */
const assert = require("assert")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name) }

console.log("ACQUISITION PLAN — contrat")

;(async () => {
  const TODAY = read("scripts/lib/today-pages.cjs")
  const PLAN = read("src/components/PlanCard.jsx")
  const HOME = read("src/components/ExperienceReset.jsx")
  const PROD = read("src/Sargasses_PROD.jsx")
  const TRIP = read("src/TripPlanner.jsx")
  const PO = read("src/PassOffer.jsx")

  // ── Pages aujourd'hui : tunnel DÉCISION → PLAN ──
  check("today-pages : CTA « Voir mon meilleur plan » → deep-link /?trip=1 (app)",
    TODAY.includes('href="/?trip=1"') && TODAY.includes('Voir mon meilleur plan'))
  check("today-pages : deep-link /?exp=<best.id> réel (jamais d'id inventé)",
    TODAY.includes('href="/?exp=${encodeURIComponent(best.beach.id)}"') && TODAY.includes("best.beach.id"))
  check("today-pages : i18n FR (plan) + EN + ES présents",
    TODAY.includes('planCta: "Voir mon meilleur plan →"'.replace(/"/g, "'")) || TODAY.includes("Voir mon meilleur plan →") && TODAY.includes("See my best plan →") && TODAY.includes("Ver mi mejor plan →"))
  check("today-pages : sous-texte honnête (« plan gratuit » dans les 3 langues)",
    TODAY.includes("planCtaSub") && /gratuit|free|gratis/i.test(TODAY))
  check("today-pages : décision apparaît juste APRÈS bestCard (tunnel lisible)",
    TODAY.includes("${staleBanner}${bestCard}${decisionBlock}"))
  check("today-pages : AUCUNE alt CTA lorsque best absent (logique honnête conservée)",
    TODAY.includes("decisionBlock = best ?") && TODAY.includes('/?exp='))

  // ── App : deep-link trip (dataReady + kill switch) ──
  check("PROD : ?trip=1 → setShowTrip(true) au boot (1×)", PROD.includes('sg_trip_deeplink') && /tripDeepRef/.test(PROD) && /setShowTrip\(true\)/.test(PROD))
  check("PROD : trip deep-link respecte ?tripplan=0", PROD.includes('tripplan=0'))
  check("PROD : sg_trip_deeplink allowlisté SG_FUNNEL_EVENTS", /"sg_trip_deeplink"/.test(PROD))

  // ── PlanCard : semaine réelle + verrous honnêtes ──
  check("PlanCard : strip semaine UNIQUEMENT si forecast réel (days)", PLAN.includes("!!days.length &&") && PLAN.includes('data-testid="plan-week"'))
  check("PlanCard : statuts = mêmes couleurs réelles que plan (DOT)", /DOT = \{/.test(PLAN) && PLAN.includes("clean: \"#22C55E\""))
  check("PlanCard : verrous premium = champ locked existant (journeyFor), isPremium arrive", PLAN.includes("d.locked && !isPremium"))
  check("PlanCard : conf % titré avec le vrai chiffre, pas de promesse", PLAN.includes("${d.confidence}%"))

  // ── Paywall : les bullets vendent le séjour, rollback ?sgcopy=0 ──
  check("PassOffer : bullets « séjour » présentes (copyOn) + anciennes gardées (?sgcopy=0)", PO.includes("Tes meilleures plages") && PO.includes("LA plage propre") && PO.includes("sgcopy=0"))
  check("PassOffer : CTA hero bytes inchangés (contrat achat)", PO.includes("Voir la prévision 7 jours →") && PO.includes("onBuy({c:cents"))

  // ── Tunnel nominal : E2E / probes fournissent la preuve d'exécution ──
  const PT = read("tests/e2e/perfect-trip.spec.ts")
  check("E2E perfect-trip : couvre intent → plan-card → expérience → paywall (réel)",
    PT.includes('data-testid="intent-snorkel"') && PT.includes('data-testid="plan-card"') && PT.includes('data-testid="plan-open"') && PT.includes("sg-modal-panel"))

  console.log(`\n✅ ACQUISITION PLAN — ${passed} checks ALL PASS`)
})().catch(e => { console.error("✗ " + e.message); process.exit(1) })
