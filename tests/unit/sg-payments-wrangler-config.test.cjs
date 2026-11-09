#!/usr/bin/env node
/**
 * Garde-fou — configuration de deploiement de la Worker `sg-payments`.
 *
 * Pourquoi ce test : le deplooiement de `sg-payments` est manuel (aucun
 * workflow ne le deploie) et il remplace le script qui sert les 6 domaines
 * publics sur `/api/*`. Une erreur dans `workers/sg-payments/wrangler.jsonc`
 * peut :
 *   - eCRASER les domaines personnalises (routes declarees dans la config) ;
 *   - EFFACER les variables posees au dashboard (`SUPABASE_URL`) ;
 *   - exposer un secret dans le depot.
 *
 * Ce test verrouille donc l'absence de `routes`, de `vars` et de secrets, et
 * la presence du binding KV du live. Il est 100 % hors-ligne : il ne lit que
 * des fichiers du depot, aucun appel reseau, aucun credential.
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..", "..")
const CONFIG_PATH = path.join(ROOT, "workers", "sg-payments", "wrangler.jsonc")
const RUNBOOK_PATH = path.join(ROOT, ".ai", "runbooks", "sg-payments-deploy.md")

let failures = 0
function t(cond, msg) {
  if (cond) console.log("  ok   " + msg)
  else { failures++; console.error("  FAIL " + msg) }
}

// ── 1. la config existe et est du JSONC valide (commentaires // tolérés) ────
t(fs.existsSync(CONFIG_PATH), "workers/sg-payments/wrangler.jsonc existe")
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("\n" + failures + " echec(s)")
  process.exit(1)
}
const raw = fs.readFileSync(CONFIG_PATH, "utf8")
const json = raw.replace(/^\s*\/\/.*$/gm, "")            // commentaires de ligne
const cfg = JSON.parse(json)                              // parse dur = gate fail-closed

t(cfg.name === "sg-payments", "name = sg-payments")
t(cfg.main === "index.js", "main = index.js (relatif au dossier workers/sg-payments)")
t(cfg.compatibility_date === "2026-08-19", "compatibility_date = 2026-08-19 (identique au runtime live)")
t(cfg.workers_dev === true, "workers_dev conserve (le live l'expose)")

// ── 2. AUCUNE route : les 6 domaines sont poses a la main dans le dashboard ─
t(!Object.prototype.hasOwnProperty.call(cfg, "routes"),
  "AUCUNE cle 'routes' (un deploy ne peut pas ecraser les domaines personnalises)")
t(!Object.prototype.hasOwnProperty.call(cfg, "route"), "AUCUNE cle 'route'")

// ── 3. AUCUN secret et AUCUNE var en dur dans la config ───────────────────
t(!Object.prototype.hasOwnProperty.call(cfg, "vars"),
  "AUCUNE cle 'vars' (les variables du dashboard sont preservees via --keep-vars)")
t(!Object.prototype.hasOwnProperty.call(cfg, "secrets"),
  "AUCUNE cle 'secrets' (les secrets vivent dans le dashboard)")
const SECRET_NAMES = ["MOLLIE_API_KEY", "MOLLIE_PROFILE_ID", "MOLLIE_WEBHOOK_SECRET",
  "RESEND_API_KEY", "SUPABASE_SERVICE_KEY", "NAMECHEAP_MAIL_TOKEN"]
const rawUpper = raw.toUpperCase()
for (const name of SECRET_NAMES) {
  const declared = name + '"' + ":" + '"' + name
  t(!rawUpper.includes(declared), "aucune valeur de secret en dur : " + name)
}

// ── 4. le binding KV du live est present et exact ─────────────────────────
t(Array.isArray(cfg.kv_namespaces) && cfg.kv_namespaces.length === 1, "1 binding KV declare")
const kv = (cfg.kv_namespaces || [])[0] || {}
t(kv.binding === "TRANSIENTS", "binding KV = TRANSIENTS")
t(kv.id === "528c05c792e046029a84e2fdb84f4ae6", "id KV = namespace live (528c05c7...)")

// ── 5. le runbook d'autorisation existe et couvre les points critiques ─────
t(fs.existsSync(RUNBOOK_PATH), "le runbook .ai/runbooks/sg-payments-deploy.md existe")
if (fs.existsSync(RUNBOOK_PATH)) {
  const rb = fs.readFileSync(RUNBOOK_PATH, "utf8")
  t(rb.includes("--keep-vars"), "runbook : impose --keep-vars")
  t(rb.includes("--dry-run"), "runbook : impose un dry-run avant deploiement")
  t(rb.includes("wrangler rollback"), "runbook : documente le rollback Cloudflare")
  t(rb.includes("001_idempotent_payment_grant.sql"), "runbook : cite la migration bloquante 001")
  t(rb.includes("002_payment_grant_search_path.sql"), "runbook : cite la migration bloquante 002")
  t(/ne jamais passer\s*`?--route`?/i.test(rb), "runbook : interdit --route")
}

console.log(failures ? "\n" + failures + " echec(s)" : "\nSG_PAYMENTS_WRANGLER_CONFIG PASS")
process.exit(failures ? 1 : 0)
