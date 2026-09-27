/**
 * OFFERS-CONTRACT — B2C Offer Architecture Lab.
 *
 * Garde-fous (aucun montant débité modifié par ce lab) :
 * 1. Le catalogue `src/lib/offers.js` reflète l'allowlist serveur
 *    (`public/api/mollie.php` $passPrices) pour toute offre live one-time.
 * 2. Le catalogue reflète `src/lib/pass-price.js` (miroir front).
 * 3. Aucune clé fantôme (`p7`, `saison`) dans le catalogue.
 * 4. Aucune offre `planned` n'est chargeable ni prixée.
 * 5. Kill-switch `?offerlab=0` présent.
 *
 * Si le serveur change un prix, CE test échoue → réconcilier d'abord
 * `.ai/plans/B2C-OFFER-ARCHITECTURE.md` §1, puis mettre à jour le catalogue.
 */
const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..", "..")
const read = (p) => fs.readFileSync(path.join(root, p), "utf8")

const offers = read("src/lib/offers.js")
const passPrice = read("src/lib/pass-price.js")
const mollie = read("public/api/mollie.php")

console.log("OFFERS-CONTRACT — garde-fous catalogue B2C")
let pass = 0, fail = 0
function ok(desc, cond) {
  if (cond) { console.log("  ✓", desc); pass++ }
  else { console.log("  ✗", desc); fail++ }
}

// 1. Fichiers présents
ok("src/lib/offers.js existe", fs.existsSync(path.join(root, "src/lib/offers.js")))
ok("référence B2C-OFFER-ARCHITECTURE.md", offers.includes("B2C-OFFER-ARCHITECTURE.md"))

// 2. Miroir pass-price.js : p30 base 1499/1199
const mEur = passPrice.match(/eur:\s*(\d+)/)
const mUsd = passPrice.match(/usd:\s*(\d+)/)
ok("pass-price.js PASS_CENTS eur=1499", mEur && mEur[1] === "1499")
ok("pass-price.js PASS_CENTS usd=1199", mUsd && mUsd[1] === "1199")
ok("catalogue p30 = PASS_CENTS (miroir, pas de chiffre en dur divergent)",
  offers.includes("PASS_CENTS.eur / 100") && offers.includes("PASS_CENTS.usd / 100"))

// 3. Miroir serveur mollie.php $passPrices
function serverPrice(key, cur) {
  // matche `'p30'    => ['EUR' => 14.99, 'USD' => 11.99],`
  const re = new RegExp("'" + key + "'\\s*=>\\s*\\[\\s*'EUR'\\s*=>\\s*([\\d.]+)\\s*,\\s*'USD'\\s*=>\\s*(null|[\\d.]+)")
  const m = mollie.match(re)
  return m ? { eur: parseFloat(m[1]), usd: m[2] === "null" ? null : parseFloat(m[2]) } : null
}
const p30 = serverPrice("p30")
const trip7 = serverPrice("trip7")
const season = serverPrice("season")
ok("serveur allowlist p30 = 14.99/11.99", p30 && p30.eur === 14.99 && p30.usd === 11.99)
ok("serveur allowlist trip7 = 4.99/USD-variable", trip7 && trip7.eur === 4.99 && trip7.usd === null)
ok("serveur allowlist season = 19.99/USD-variable", season && season.eur === 19.99 && season.usd === null)
ok("catalogue SERVER_MIRROR p30 = 14.99/11.99",
  offers.includes("p30: { EUR: 14.99, USD: 11.99 }"))
ok("catalogue SERVER_MIRROR trip7 = 4.99/null",
  offers.includes("trip7: { EUR: 4.99, USD: null }"))
ok("catalogue SERVER_MIRROR season = 19.99/null",
  offers.includes("season: { EUR: 19.99, USD: null }"))

// 4. Clés fantômes interdites dans le catalogue
ok("pas de clé 'p7' dans le catalogue (métadonnée morte GA4, non chargeable)",
  !/key:\s*["']p7["']/.test(offers))
ok("pas de clé 'saison' dans le catalogue (canonique = 'season')",
  !/key:\s*["']saison["']/.test(offers))
ok("le piège 'saison' est documenté dans le catalogue", offers.includes("saison"))

// 5. Offres planned : ni prix ni charge
for (const k of ["watch_monthly", "watch_annual", "mon_stay"]) {
  ok(`offre ${k} déclarée`, offers.includes(`key: "${k}"`))
  ok(`offre ${k} status planned`, new RegExp(`key: "${k}"[\\s\\S]{0,200}status: OFFER_STATUS\\.PLANNED`).test(offers))
}
ok("planned = prix null (aucune hypothèse ne devient un débit)",
  (offers.match(/price: \{ EUR: null, USD: null \}/g) || []).length >= 3)
ok("isChargeable() exclut planned + free",
  offers.includes('o.status === OFFER_STATUS.LIVE') && offers.includes('o.kind !== "free"'))
ok("entitlement b2c_watch réservé aux planned (pas de grant existant)",
  offers.includes('entitlement: "b2c_watch"'))
ok("entitlement report réservé à mon_stay",
  offers.includes('entitlement: "report"'))

// 6. Live = exactement free + 3 one-time serveur
for (const k of ["free", "trip7", "p30", "season"]) {
  ok(`offre live ${k} déclarée`, offers.includes(`key: "${k}"`))
}
ok("seul p30 est servi par le front aujourd'hui (commentaire PassOffer)",
  offers.includes("PassOffer.jsx"))

// 7. Kill-switch ?offerlab=0
ok("offerLabOff() lit ?offerlab=0", offers.includes("offerlab=0"))
ok("regex rollback standard (pattern repo)", offers.includes("[?&]offerlab=0(?:&|$)"))

// 8. Webhook B2C recurring : le catalogue ne promet rien qui n'existe pas
ok("aucune référence webhook subscription B2C dans le catalogue (gap documenté, pas câblé)",
  !offers.includes("subscription.paid"))

// 9. USD seasonal : la symétrie affiché=débité vit dans pass-price.js + mollie.php
ok("pass-price.js expose seasonalCents (symétrie affiché=débité)",
  passPrice.includes("seasonalCents"))
ok("mollie.php applique la surcharge USD au débit (miroir serveur)",
  mollie.includes("1.15"))

// 10. Taille raisonnable (lib pure, pas de dépendance)
ok("catalogue < 15 Ko", Buffer.byteLength(offers, "utf8") < 15 * 1024)
ok("import unique autorisé : ./pass-price.js (même dossier)",
  offers.includes('from "./pass-price.js"') && !/from "\.\.\//.test(offers))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log("✅ OFFERS-CONTRACT — ALL GUARDS PASS")
