#!/usr/bin/env node
/**
 * mint-widget-token.cjs — Génère (et vérifie) un jeton PRO du widget hôtel.
 *
 * MIROITE EXACTEMENT l'algorithme de public/api/widget-token.php (HMAC SHA-256
 * signé, payload {h:host, exp}). Un jeton émis ici est accepté tel quel par
 * /api/widget-token.php → l'hôtel l'utilise dans /pro/widget-config/ (?k=) pour
 * la marque blanche (backlink masqué).
 *
 * Le SECRET n'est jamais dans le repo. Tu le fournis au moment de mint :
 *   - via la variable d'env SG_WEBHOOK_SECRET (= le `webhook_secret` de ton
 *     public/api/stripe-config.php sur le serveur), OU
 *   - si tu as une copie locale de stripe-config.php, le script la lit.
 *   - À défaut, fallback 'sargasses-widget' (UNIQUEMENT si ton serveur n'a pas
 *     de webhook_secret — improbable en prod).
 *
 * USAGE :
 *   SG_WEBHOOK_SECRET="ton_webhook_secret" node scripts/mint-widget-token.cjs <host> [jours]
 *   node scripts/mint-widget-token.cjs --verify <token>
 *   node scripts/mint-widget-token.cjs --selftest
 *
 * EXEMPLE :
 *   SG_WEBHOOK_SECRET="whsec_xxx" node scripts/mint-widget-token.cjs anoli-lodges.com 400
 *   → imprime le token + le lien prêt à envoyer :
 *     https://sargasses-martinique.com/pro/widget-config/?k=<token>
 */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDec = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Secret de base (= webhook_secret) : env → stripe-config.php local → fallback. */
function baseSecret() {
  if (process.env.SG_WEBHOOK_SECRET) return process.env.SG_WEBHOOK_SECRET;
  const cfg = path.join(__dirname, "..", "public", "api", "stripe-config.php");
  try {
    const txt = fs.readFileSync(cfg, "utf8");
    const m = txt.match(/['"]webhook_secret['"]\s*=>\s*['"]([^'"]+)['"]/);
    if (m && m[1]) return m[1];
  } catch (_) {}
  return "sargasses-widget"; // dernier recours (doit matcher le serveur)
}

/** = sg_widget_secret() : sha256(base . '|sgwidget-pro-v1') en hex. */
function widgetSecret() {
  return crypto.createHash("sha256").update(baseSecret() + "|sgwidget-pro-v1").digest("hex");
}

/** = sg_widget_sign() : payload {h,exp} signé. */
function sign(host, days = 400) {
  const exp = Math.floor(Date.now() / 1000) + Math.round(days) * 86400;
  const payload = b64url(JSON.stringify({ h: String(host), exp }));
  const sig = b64url(crypto.createHmac("sha256", widgetSecret()).update(payload).digest());
  return payload + "." + sig;
}

/** = sg_widget_verify() : retourne {h,exp} si valide, sinon false. */
function verify(k) {
  const parts = String(k).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const expected = b64url(crypto.createHmac("sha256", widgetSecret()).update(parts[0]).digest());
  const a = Buffer.from(parts[1]), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  let d;
  try { d = JSON.parse(b64urlDec(parts[0]).toString("utf8")); } catch (_) { return false; }
  if (!d || typeof d !== "object") return false;
  if (d.exp && Number(d.exp) < Math.floor(Date.now() / 1000)) return false;
  return d;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv[0] === "--selftest") {
  // Round-trip interne (secret de test) : prouve que mint→verify est cohérent.
  const SEC = "test_secret_123";
  process.env.SG_WEBHOOK_SECRET = SEC;
  const tok = sign("example.com", 30);
  const v = verify(tok);
  const tampered = verify(tok.slice(0, -2) + (tok.slice(-2) === "aa" ? "bb" : "aa"));
  const ok = v && v.h === "example.com" && v.exp > Math.floor(Date.now() / 1000) && tampered === false;
  console.log("token   :", tok);
  console.log("verify  :", JSON.stringify(v));
  console.log("tampered:", tampered, "(doit être false)");
  console.log(ok ? "SELFTEST OK ✓" : "SELFTEST FAIL ✗");
  process.exit(ok ? 0 : 1);
}
if (argv[0] === "--verify") {
  const v = verify(argv[1] || "");
  console.log(v ? JSON.stringify({ pro: true, ...v }) : JSON.stringify({ pro: false }));
  process.exit(v ? 0 : 1);
}
const host = argv[0];
const days = argv[1] ? parseInt(argv[1], 10) : 400;
if (!host) {
  console.error("Usage: SG_WEBHOOK_SECRET=… node scripts/mint-widget-token.cjs <host> [jours]");
  console.error("       node scripts/mint-widget-token.cjs --verify <token>");
  console.error("       node scripts/mint-widget-token.cjs --selftest");
  process.exit(2);
}
const usingFallback = !process.env.SG_WEBHOOK_SECRET &&
  !fs.existsSync(path.join(__dirname, "..", "public", "api", "stripe-config.php"));
const token = sign(host, days);
const expDate = new Date((Math.floor(Date.now() / 1000) + days * 86400) * 1000).toISOString().slice(0, 10);
console.log("");
console.log("  host    : " + host);
console.log("  expire  : " + expDate + "  (" + days + " jours)");
console.log("  token   : " + token);
console.log("");
console.log("  Lien prêt à envoyer (marque blanche pré-activée) :");
console.log("  https://sargasses-martinique.com/pro/widget-config/?k=" + token);
console.log("");
if (usingFallback) {
  console.error("  ⚠️  SG_WEBHOOK_SECRET absent ET pas de stripe-config.php local → secret de");
  console.error("      repli 'sargasses-widget'. Ce token NE SERA PAS valide si ton serveur a");
  console.error("      un webhook_secret. Fournis SG_WEBHOOK_SECRET (copié de stripe-config.php).");
}
