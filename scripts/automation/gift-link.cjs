#!/usr/bin/env node
/**
 * gift-link.cjs — Génère un lien cadeau SIGNÉ (MP-2) : /?gift=<token HMAC>
 *
 * Usage : GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs <pass> [jours] [ttlHeures]
 *   ex  : GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs p30
 *         GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs p7 7 24
 *
 * SÉCURITÉ :
 * - Le secret est lu depuis l'ENV LOCAL (GIFT_LINK_SECRET), jamais commité.
 *   Il doit être IDENTIQUE au secret Worker (wrangler secret put GIFT_LINK_SECRET).
 * - Jeton : single-use (consommation atomique côté serveur, table payment_grants)
 *   + expiration (défaut 30 j).
 *
 * Différence avec gift-pass.cjs : celui-ci = accès lié à un EMAIL (comps.php,
 * cross-device). gift-link.cjs = lien CLICABLE sans email requis (1 usage).
 */
const crypto = require("crypto")

const [, , passArg, daysArg, ttlArg] = process.argv
const ALLOWED = { p7: 7, p14: 14, p30: 30, trip: 7, trip7: 7, season: 210 }
const days = Math.max(1, Math.min(3650, parseInt(daysArg || "", 10) || ALLOWED[passArg] || 0))
const ttlH = Math.max(1, Math.min(24 * 400, parseInt(ttlArg || "", 10) || 24 * 30))

if (!passArg || !days) {
  console.error("Usage : GIFT_LINK_SECRET=... node scripts/automation/gift-link.cjs <pass> [jours] [ttlHeures]")
  console.error("  pass : p7 | p14 | p30 | trip | trip7 | season (ou days explicite)")
  process.exit(1)
}
const secret = process.env.GIFT_LINK_SECRET || ""
if (secret.length < 16) {
  console.error("GIFT_LINK_SECRET manquant ou trop court (min 16) — exporte-le en env, JAMAIS dans le repo.")
  process.exit(1)
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const payload = {
  v: 1,
  pass: passArg,
  days,
  exp: Math.floor(Date.now() / 1000) + ttlH * 3600,
  jti: b64url(crypto.randomBytes(12)),
}
const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"))
const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest())
const token = `${body}.${sig}`

const domains = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../../regions/mq.json"), "utf8"))
const domain = domains.domain || "sargasses-martinique.com"

console.log(`Lien cadeau généré (${passArg}, ${days} j, expire dans ${ttlH} h, single-use) :`)
console.log(`  https://${domain}/?gift=${token}`)
console.log(`\nLe bénéficiaire ouvre le lien → le Worker vérifie + consomme le jeton → accès posé.`)
console.log(`NÉCESSITE : GIFT_LINK_SECRET configuré sur le Worker (wrangler secret put GIFT_LINK_SECRET).`)
