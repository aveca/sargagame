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

// 11. Comportement runtime resolveOffer / montants (import réel du module).
//    Cas exigés mission §12 : default, trip7, season, unknown, empty,
//    malformed, case handling, aucune mutation du default.
async function behavioral() {
  const mod = await import("../../src/lib/offers.js")
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const t = (desc, cond) => ok("[runtime] " + desc, !!cond)

  // 1. default : absent → p30
  t("default : search vide → p30", eq(mod.resolveOffer(""), { key: "p30", requested: null }))
  t("default : sans ?offer= → p30", eq(mod.resolveOffer("?paywall=1"), { key: "p30", requested: null }))
  t("default : search non-string → p30", eq(mod.resolveOffer(null), { key: "p30", requested: null }))

  // 2-3. trip7 / season
  t("trip7 résolu", eq(mod.resolveOffer("?offer=trip7"), { key: "trip7", requested: "trip7" }))
  t("season résolu", eq(mod.resolveOffer("?offer=season"), { key: "season", requested: "season" }))
  t("trip7 avec autres params (?a=1&offer=trip7&b=2)",
    mod.resolveOffer("?a=1&offer=trip7&b=2").key === "trip7")
  t("p30 explicite accepté", mod.resolveOffer("?offer=p30").key === "p30")

  // 4-6. unknown / empty / malformed → fallback sûr p30
  t("unknown ?offer=foo → p30 (requested conservé pour mesure)",
    eq(mod.resolveOffer("?offer=foo"), { key: "p30", requested: "foo" }))
  t("empty ?offer= → p30", mod.resolveOffer("?offer=").key === "p30")
  t("malformed ?offer=% → p30 (decodeURIComponent throw)",
    mod.resolveOffer("?offer=%").key === "p30")
  t("malformed ?offer=<script> → p30", mod.resolveOffer("?offer=<script>alert(1)</script>").key === "p30")
  t("trop long (100 chars) → p30", mod.resolveOffer("?offer=" + "x".repeat(100)).key === "p30")

  // 7. case handling : trim + lowercase déterministes
  t("case ?offer=Trip7 → trip7", mod.resolveOffer("?offer=Trip7").key === "trip7")
  t("case ?offer= SEASON  → season", mod.resolveOffer("?offer=%20SEASON%20").key === "season")

  // 8. aucune mutation du default / du catalogue
  const before = JSON.stringify(mod.OFFERS)
  const beforeP30 = JSON.stringify(mod.OFFERS.p30)
  ;["", "?offer=trip7", "?offer=foo", "?offer=%", "?offer=watch_monthly", "?offer=trip7&offerlab=0"].forEach((q) => mod.resolveOffer(q))
  t("aucune mutation OFFERS après résolutions", JSON.stringify(mod.OFFERS) === before)
  t("p30 intact après résolutions", JSON.stringify(mod.OFFERS.p30) === beforeP30)

  // Clés non exposables → p30 (p7 fantôme, saison FR, planned, free)
  t("p7 (métadonnée morte) → p30", mod.resolveOffer("?offer=p7").key === "p30")
  t("saison (FR) → p30 (canonique = season)", mod.resolveOffer("?offer=saison").key === "p30")
  t("watch_monthly (planned) → p30", mod.resolveOffer("?offer=watch_monthly").key === "p30")
  t("mon_stay (planned) → p30", mod.resolveOffer("?offer=mon_stay").key === "p30")
  t("free → p30 (jamais exposé comme offre payante)", mod.resolveOffer("?offer=free").key === "p30")

  // Kill-switch ?offerlab=0
  t("?offerlab=0 tue même ?offer=trip7 valide",
    mod.resolveOffer("?offer=trip7&offerlab=0").key === "p30")
  t("offerLabOff('?offerlab=0') === true", mod.offerLabOff("?offerlab=0") === true)
  t("offerLabOff('?offer=trip7') === false", mod.offerLabOff("?offer=trip7") === false)

  // Montants de base (cents int, jamais inventés : miroir serveur/front)
  t("base trip7/eur = 499", mod.offerBaseCents("trip7", "eur") === 499)
  t("base trip7/usd = 599", mod.offerBaseCents("trip7", "usd") === 599)
  t("base p30/eur = 1499", mod.offerBaseCents("p30", "eur") === 1499)
  t("base p30/usd = 1199", mod.offerBaseCents("p30", "usd") === 1199)
  t("base season/eur = 1999", mod.offerBaseCents("season", "eur") === 1999)
  t("base season/usd = 1999", mod.offerBaseCents("season", "usd") === 1999)
  t("base unknown → null", mod.offerBaseCents("foo", "eur") === null)
  t("base free → null", mod.offerBaseCents("free", "eur") === null)
  t("base planned → null", mod.offerBaseCents("watch_monthly", "eur") === null)

  // Affichage = miroir serveur EXACT (mois injecté, pas de dépendance date)
  t("display p30/eur = 1499 (jamais de surcharge EUR)", mod.offerDisplayCents("p30", "eur", 7) === 1499)
  t("display p30/usd juillet = 1379 (+15 %)", mod.offerDisplayCents("p30", "usd", 7) === 1379)
  t("display p30/usd janvier = 1199 (hors saison)", mod.offerDisplayCents("p30", "usd", 1) === 1199)
  t("display trip7/usd juillet = 599 (SANS surcharge — règle serveur)",
    mod.offerDisplayCents("trip7", "usd", 7) === 599)
  t("display season/usd juillet = 2299 (+15 %)", mod.offerDisplayCents("season", "usd", 7) === 2299)
  t("display season/usd janvier = 1999", mod.offerDisplayCents("season", "usd", 1) === 1999)
  t("display trip7/eur = 499", mod.offerDisplayCents("trip7", "eur", 7) === 499)

  // isChargeable : garde anti-checkout planned
  t("isChargeable trip7/season/p30", mod.isChargeable("trip7") && mod.isChargeable("season") && mod.isChargeable("p30"))
  t("!isChargeable watch/mon_stay/free/foo",
    !mod.isChargeable("watch_monthly") && !mod.isChargeable("watch_annual")
    && !mod.isChargeable("mon_stay") && !mod.isChargeable("free") && !mod.isChargeable("foo"))
}

behavioral().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
  console.log("✅ OFFERS-CONTRACT — ALL GUARDS PASS")
}).catch((e) => {
  console.error("behavioral section crashed:", e && e.message)
  process.exit(1)
})
