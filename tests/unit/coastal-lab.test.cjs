/**
 * COASTAL LAB — unit contract tests
 * Validates: route, 5 layers, beach object, analytics events, rollback, no invented data
 */
const fs = require("fs")
const path = require("path")

function readComponent() {
  return fs.readFileSync(path.join(__dirname, "../../src/CoastalLab.jsx"), "utf8")
}

function readCSS() {
  return fs.readFileSync(path.join(__dirname, "../../src/coastal-lab.css"), "utf8")
}

function readApp() {
  return fs.readFileSync(path.join(__dirname, "../../src/Sargasses_PROD.jsx"), "utf8")
}

const comp = readComponent()
const css = readCSS()
const app = readApp()

console.log("COASTAL LAB — contrats")
let pass = 0, fail = 0

function ok(desc, cond) {
  if (cond) { console.log("  ✓", desc); pass++ }
  else { console.log("  ✗", desc); fail++ }
}

function includesAny(haystack, needles) {
  return needles.some(n => haystack.includes(n))
}

// 1. Component structure
ok("Component file exists", fs.existsSync(path.join(__dirname, "../../src/CoastalLab.jsx")))
ok("CSS file exists", fs.existsSync(path.join(__dirname, "../../src/coastal-lab.css")))

// 2. Five layers present
const layers = ["monitor", "understand", "decide", "recover", "valorize"]
layers.forEach(l => ok(`Layer ${l.toUpperCase()} component defined`, comp.includes(`function ${l.charAt(0).toUpperCase() + l.slice(1)}Layer`)))

// 3. Key sub-components
ok("LayerNav component", comp.includes("function LayerNav"))
ok("BeachObjectCard component", comp.includes("function BeachObjectCard"))
ok("HardProblem section", comp.includes("function HardProblem"))
ok("TourismConnection component", comp.includes("function TourismConnection"))
ok("EcosystemView component", comp.includes("function EcosystemView"))

// 4. Data integration — reuses existing systems
ok("Uses resolveMedia from media-art-direction", comp.includes("resolveMedia"))
ok("Uses nearestBeaches from sg-visual", comp.includes("nearestBeaches"))
ok("Uses dataAgeHours from sg-visual", comp.includes("dataAgeHours"))
ok("Uses Icon from sg-icons", comp.includes("from \"./lib/sg-icons.jsx\""))
ok("Uses _t from Sargasses_PROD", comp.includes("from \"./Sargasses_PROD.jsx\""))
ok("Uses track from Sargasses_PROD", comp.includes("track") && comp.includes("Sargasses_PROD"))

// 5. Analytics events (proposed in spec)
const events = [
  "sg_lab_open",
  "sg_lab_step_view",
  "sg_lab_beach_select",
  "sg_lab_decision_view",
  "sg_lab_cta",
]
events.forEach(e => ok(`Analytics event ${e} tracked`, comp.includes(e) || app.includes(e)))

// 6. Rollback flag
ok("Rollback ?coastallab=0 supported", comp.includes("coastallab=0") || app.includes("coastallab=0"))

// 7. Route detection in App
ok("isCoastalLabPath route detection", app.includes("isCoastalLabPath"))
ok("showCoastalLab state", app.includes("showCoastalLab"))
ok("LazyCoastalLab import", app.includes("LazyCoastalLab"))
ok("CoastalLab render in JSX", app.includes("<LazyCoastalLab"))

// 8. CSS — uses design tokens, motion, reduced-motion
ok("CSS uses --cl-accent (status-driven)", css.includes("--cl-accent"))
ok("CSS uses sg-motion classes", css.includes("sgm-"))
ok("CSS has reduced-motion media query", css.includes("prefers-reduced-motion"))
ok("CSS uses var(--sg-*) tokens", css.includes("var(--sg-"))

// 9. No invented data patterns
const inventedPatterns = [
  "chiffre inventé",
  "fake",
  "mock",
  "97%",
  "98%",
  "99%",
]
inventedPatterns.forEach(p => ok(`No invented data pattern: ${p}`, !comp.toLowerCase().includes(p.toLowerCase())))

// 10. Mobile-first, accessibility
ok("Mobile-first media queries", css.includes("@media (max-width: 480px)"))
ok("Focus-visible styles", css.includes("focus-visible"))
ok("High contrast support", css.includes("prefers-contrast"))
ok("Semantic HTML (role, aria)", comp.includes("role=") && comp.includes("aria-"))

// 11. Hard Problem constraints
const constraints = ["PREDICTION", "DATA", "WEATHER", "OCEAN", "BEACH", "TOURISM", "LOGISTICS", "COLLECTION", "STORAGE", "TREATMENT", "ENVIRONMENT", "ECONOMICS", "REGULATION"]
constraints.forEach(c => ok(`Hard constraint ${c}`, comp.includes(c)))

// 12. Tourism flow steps
const tourismSteps = ["DREAM", "CHOOSE", "PLAN", "MONITOR", "ADAPT", "ENJOY"]
tourismSteps.forEach(s => ok(`Tourism step ${s}`, comp.includes(s)))

// 13. Recovery steps
const recoverySteps = ["COLLECTE", "TRI", "TRANSPORT", "STOCKAGE", "TRAITEMENT", "SÉCURISATION"]
recoverySteps.forEach(s => ok(`Recovery step ${s}`, comp.includes(s)))

// 14. Valorization paths
const valPaths = ["MATÉRIAUX", "ÉNERGIE", "EXTRACTION", "AGRICULTURE", "AUTRES"]
valPaths.forEach(v => ok(`Valorization ${v}`, comp.includes(v)))

// 15. Decision options
const decisions = ["SURVEILLER", "INFORMER", "ADAPTER", "NETTOYER", "PROTÉGER", "ORIENTER", "SUIVRE"]
decisions.forEach(d => ok(`Decision ${d}`, comp.includes(d)))

// 16. Ecosystem dimensions
const ecoDims = ["TOURISME", "ENVIRONNEMENT", "OPÉRATIONS", "ÉCONOMIE"]
ecoDims.forEach(e => ok(`Ecosystem dim ${e}`, comp.includes(e)))

// 17. Honesty statements
ok("No magic button claim", comp.includes("REMOVE SARGASSUM") || comp.includes("bouton magique"))
ok("Collect ≠ solved claim", comp.includes("récupérer") && comp.includes("problème résolu"))
ok("When data missing: À documenter / À valider", comp.includes("À documenter") || comp.includes("À valider"))

// 18. CTA connections to existing features
ok("CTA explore beaches", comp.includes("onExplore"))
ok("CTA plan stay", comp.includes("onPlan"))
ok("CTA monitor beaches", comp.includes("onMonitor"))

// 19. Component size (lazy-loaded, not eager)
const compSize = Buffer.byteLength(comp, "utf8")
ok(`Component size reasonable (<100KB)`, compSize < 100000)

// 20. Props interface documented
ok("Component has JSDoc documentation", comp.startsWith("/**"))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log("✅ COASTAL LAB — ALL CONTRACTS PASS")