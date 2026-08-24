#!/usr/bin/env node
/**
 * pass-money-contract.test.cjs — verrouille le contrat prix B2C pass one-time.
 *
 * Contexte (2026-08-23) : le front envoyait cents EUR (1499) avec cur="usd" →
 * rejet serveur « Prix invalide » sur TOUTES les régions USD (allowlist US = 1199).
 * Ce test lie le front (src/lib/pass-price.js) à l'allowlist serveur
 * (public/api/mollie.php) et à la surcharge saisonnière USD (+15 % juin→nov).
 *
 * Échoue si : montant diverge, surcharge désynchronisée, helper front absente.
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..") // tests/unit → racine repo
let failures = 0
const ok = (cond, label) => {
  if (cond) console.log("  ✓", label)
  else { failures++; console.error("  ✗", label) }
}

;(async () => {
  console.log("\npass-money-contract")

  // 1) Source de vérité front
  const lib = await import(pathToUrl(path.join(ROOT, "src/lib/pass-price.js")))
  const { PASS_CENTS, seasonalCents } = lib
  ok(PASS_CENTS && PASS_CENTS.eur === 1499, "PASS_CENTS.eur = 1499 (14,99 €)")
  ok(PASS_CENTS && PASS_CENTS.usd === 1199, "PASS_CENTS.usd = 1199 (11,99 $)")

  // 2) Surcharge saisonnière USD — miroir de mollie.php (+15 %, mois 6→11, hors trip7)
  ok(seasonalCents(1199, "usd", 7) === 1379, "surcharge juillet : 1199 → 1379")
  ok(seasonalCents(1199, "usd", 1) === 1199, "hors saison (janvier) : 1199 inchangé")
  ok(seasonalCents(1199, "usd", 6) === 1379, "juin (borne basse) : surcharge active")
  ok(seasonalCents(1199, "usd", 11) === 1379, "novembre (borne haute) : surcharge active")
  ok(seasonalCents(1199, "usd", 12) === 1199, "décembre : inchangé")
  ok(seasonalCents(1499, "eur", 8) === 1499, "EUR jamais surchargé (août inclus)")

  // 3) Contrat serveur : l'allowlist mollie.php porte les MÊMES montants
  const php = fs.readFileSync(path.join(ROOT, "public/api/mollie.php"), "utf8")
  ok(/'p30'\s*=>\s*\['EUR'\s*=>\s*14\.99,\s*'USD'\s*=>\s*11\.99\]/.test(php),
    "mollie.php allowlist p30 = EUR 14.99 / USD 11.99")
  ok(/round\(\(float\)\$amount\['value'\] \* 1\.15, 2\)/.test(php),
    "mollie.php surcharge USD ×1.15 présente")
  ok(/\$month >= 6 && \$month <= 11/.test(php), "mollie.php fenêtre juin→nov présente")

  // 4) Le front n'envoie JAMAIS le prix surchargé au serveur (validation allowlist)
  const passOffer = fs.readFileSync(path.join(ROOT, "src/PassOffer.jsx"), "utf8")
  ok(/onBuy\(\{c:cents,/.test(passOffer), "PassOffer onBuy envoie cents de BASE (pas displayCents)")
  ok(!/onBuy\(\{c:displayCents/.test(passOffer), "PassOffer n'envoie pas le prix surchargé")

  if (failures) { console.error(`\n${failures} échec(s) contrat prix\n`); process.exit(1) }
  console.log("\n✅ contrat prix front↔serveur verrouillé\n")
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })

function pathToUrl(p) { return "file://" + p.replace(/\\/g, "/") }
