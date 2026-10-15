#!/usr/bin/env node
/**
 * gift-link.cjs — Génère un lien cadeau SIGNÉ (MP-2) : /?gift=<token HMAC>
 *
 * Usage : GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs <pass> [ttlHeures]
 *   ex  : GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs p30
 *         GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs p7 24
 *
 * SÉCURITÉ :
 * - Le secret est lu depuis l'ENV LOCAL (GIFT_LINK_SECRET), jamais commité.
 *   Il doit être IDENTIQUE au secret Worker (wrangler secret put GIFT_LINK_SECRET).
 * - Jeton : single-use (consommation atomique côté serveur, table payment_grants)
 *   + expiration (défaut 30 j).
 * - La signature utilise la lib partagée workers/sargagame/gift-token.js
 *   (mêmes règles que le Worker : allowlist pass + days cohérents).
 *
 * Différence avec gift-pass.cjs : celui-ci = accès lié à un EMAIL (comps.php,
 * cross-device). gift-link.cjs = lien CLICABLE sans email requis (1 usage).
 */

const [, , passArg, ttlArg] = process.argv
const ttlH = Math.max(1, Math.min(24 * 400, parseInt(ttlArg || "", 10) || 24 * 30))

if (!passArg) {
  console.error("Usage : GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs <pass> [ttlHeures]")
  console.error("  pass : p7 | p14 | p30 | trip | trip7 | season (days fixés par allowlist Worker)")
  process.exit(1)
}
const secret = process.env.GIFT_LINK_SECRET || ""
if (secret.length < 16) {
  console.error("GIFT_LINK_SECRET manquant ou trop court (min 16) — exporte-le en env, JAMAIS dans le repo.")
  process.exit(1)
}

async function main() {
  const { signGiftToken } = await import("../../workers/sargagame/gift-token.js")
  let token
  try {
    token = await signGiftToken({ pass: passArg, ttlHours: ttlH }, secret)
  } catch (e) {
    console.error("REFUSÉ : " + e.message)
    process.exit(1)
  }
  const fs = require("fs"), path = require("path")
  const region = JSON.parse(fs.readFileSync(path.join(__dirname, "../../regions/mq.json"), "utf8"))
  const domain = region.domain || "sargasses-martinique.com"
  console.log(`Lien cadeau généré (${passArg}, expire dans ${ttlH} h, single-use) :`)
  console.log(`  https://${domain}/?gift=${token}`)
  console.log(`\nLe bénéficiaire ouvre le lien → le Worker vérifie + consomme → accès posé.`)
  console.log(`NÉCESSITE : GIFT_LINK_SECRET provisionné sur le Worker (wrangler secret put).`)
}
main().catch(e => { console.error("FAIL", e.message); process.exit(1) })
