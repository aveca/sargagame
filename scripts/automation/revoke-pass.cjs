#!/usr/bin/env node
/**
 * revoke-pass.cjs — RÉVOQUE l'accès premium d'un email (remboursement/chargeback).
 * Miroir inverse de gift-pass.cjs. Déclenché par l'alerte refund de mollie-webhook.php.
 *
 * Usage : node scripts/automation/revoke-pass.cjs <email> [--island=mq|gp|florida|puntacana|rivieramaya|all]
 *         node scripts/automation/revoke-pass.cjs --hash=<sha1(email)> [--island=…]
 *         (défaut : all — tente chaque région dont les creds FTP sont présents)
 *
 * Mode --hash : pour l'exécution EN CI (workflow revoke-pass.yml, dispatch manuel) —
 * les inputs workflow_dispatch d'un repo PUBLIC sont visibles, donc on ne passe
 * JAMAIS l'email en clair : hash sha1 calculé en local (node -e "console.log(
 * require('crypto').createHash('sha1').update('<email>'.trim().toLowerCase())
 * .digest('hex'))"), le CI n'a que le hash. Même effet (comps + mol_store).
 *
 * Ce qu'il fait (les 4 couches d'accès) :
 *   1. comps.php (repo)         → retire l'entrée sha1(email) si présente (cadeau/comp).
 *                                 ⚠️ Nécessite ensuite commit + merge (deploy FTP).
 *   2. mol_store (serveur)      → supprime api/data/mollie-subs/<sha1(email)>.json via
 *                                 FTPS (creds .env : FTP_SERVER_MQ/FTP_USERNAME_MQ/… ,
 *                                 mêmes clés que manual-ftp-deploy.cjs). GARDE : un
 *                                 record d'ABONNEMENT (champ `customer`) n'est JAMAIS
 *                                 supprimé — annuler l'abo dans le dashboard Mollie.
 *   3. self-heal (serveur)      → déjà neutralisé côté PHP (2026-07-02) : un paiement
 *                                 remboursé intégralement / chargeback ne restaure plus
 *                                 l'accès (garde amountRefunded dans mollie.php +
 *                                 mollie-lib.php). Rien à faire ici.
 *   4. localStorage (appareil)  → HORS DE PORTÉE : l'appareil qui a payé garde son flag
 *                                 local jusqu'à son pass_end. La révocation coupe la
 *                                 restauration cross-device (?premium_email=, « Mon
 *                                 accès ») — c'est le maximum atteignable côté serveur.
 *
 * PII-SAFE : l'email n'est jamais persisté ni loggé en clair côté repo (hash seulement).
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto")
const { Writable } = require("stream")

const islandArg = ((process.argv.find(a => a.startsWith("--island=")) || "").split("=")[1] || "all").toLowerCase()
const hashArg = ((process.argv.find(a => a.startsWith("--hash=")) || "").split("=")[1] || "").toLowerCase()
const email = (process.argv[2] || "").startsWith("--") ? "" : (process.argv[2] || "").trim().toLowerCase()

let h
if (hashArg) {
  if (!/^[0-9a-f]{40}$/.test(hashArg)) { console.error("--hash invalide (attendu : sha1 hex 40 chars)"); process.exit(1) }
  h = hashArg
} else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  h = crypto.createHash("sha1").update(email).digest("hex")
} else {
  console.error("Usage : node scripts/automation/revoke-pass.cjs <email> [--island=mq|gp|...|all]")
  console.error("        node scripts/automation/revoke-pass.cjs --hash=<sha1(email)> [--island=…]")
  process.exit(1)
}
const now = Math.floor(Date.now() / 1000)

// ── 1. comps.php : retire l'entrée (même format/purge que gift-pass.cjs) ────────
const compsPath = path.join(__dirname, "../../public/api/comps.php")
let compRemoved = false
if (fs.existsSync(compsPath)) {
  const src = fs.readFileSync(compsPath, "utf8")
  const entries = {}
  for (const m of src.matchAll(/'([0-9a-f]{40})'\s*=>\s*(\d+)/g)) {
    const v = parseInt(m[2], 10)
    if (m[1] === h) { compRemoved = v > now; continue } // cible retirée (même expirée)
    if (v > now) entries[m[1]] = v                       // purge auto des expirées
  }
  const lines = Object.entries(entries)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `    '${k}' => ${v},`)
    .join("\n")
  const out = `<?php
// ── Accès OFFERTS (cadeaux manuels) — cross-device, SANS paiement ─────────────
// FORMAT : sha1(strtolower(trim(email))) => pass_end (timestamp UNIX, secondes).
// PII-SAFE : QUE des hash, JAMAIS d'email en clair (repo public — voir CLAUDE.md
// « gitignore la PII »). Fichier .php → même servi en HTTP il n'expose aucune donnée.
//
// Offrir un accès :  node scripts/automation/gift-pass.cjs <email> [jours=30]
//   (l'email est hashé EN LOCAL ; seul le hash est committé → zéro PII).
// Révoquer un accès : node scripts/automation/revoke-pass.cjs <email>
//   (remboursement/chargeback — retire l'entrée + le record serveur mol_store).
// Restauration côté app : le bénéficiaire entre SON email dans « J'ai déjà un pass »
//   (ou « Mon accès ») → verify_subscription/mol_comp_lookup le débloque sur
//   N'IMPORTE QUEL appareil/navigateur (≠ lien ?pass= local à un navigateur).
//
// Une entrée expirée (valeur < maintenant) est ignorée ; gift-pass.cjs purge
// automatiquement les entrées expirées à chaque ajout.
return [
${lines}
];
`
  fs.writeFileSync(compsPath, out)
  console.log(compRemoved
    ? `comps.php : entrée ${h.slice(0, 8)}… RETIRÉE (→ commit + merge pour déployer).`
    : `comps.php : aucune entrée active pour cet email (rien à retirer).`)
} else {
  console.log("comps.php absent — étape comp sautée.")
}

// ── 2. mol_store serveur : supprime api/data/mollie-subs/<sha1>.json via FTPS ───
async function revokeServerRecords() {
  const { Client } = require("basic-ftp")
  const { loadProjectEnv } = require("../lib/load-project-env.cjs")
  const { getAllRegions } = require("../../regions/index.cjs")
  loadProjectEnv()
  const env = k => process.env[k]
  const regions = getAllRegions().filter(r => islandArg === "all" || r.id === islandArg)
  if (!regions.length) { console.error(`Région inconnue : ${islandArg}`); process.exit(1) }
  let touched = 0, skippedNoCreds = 0
  for (const r of regions) {
    const ID = r.id.toUpperCase()
    const user = env(`FTP_USER_${ID}`) || env(`FTP_USERNAME_${ID}`)
    const pass = env(`FTP_PASS_${ID}`) || env(`FTP_PASSWORD_${ID}`)
    const host = env(`FTP_HOST_${ID}`) || env(`FTP_SERVER_${ID}`) || (user && pass ? env("FTP_HOST") || env("FTP_SERVER") : undefined)
    if (!host || !user || !pass) { skippedNoCreds++; console.log(`  - ${r.id}: creds FTP absents, sauté`); continue }
    const client = new Client(undefined, 60000)
    try {
      await client.access({ host, user, password: pass, secure: true, secureOptions: { rejectUnauthorized: false } })
      const remote = `/api/data/mollie-subs/${h}.json`
      // GARDE : ne JAMAIS supprimer un record d'ABONNEMENT (champ `customer`) — la
      // révocation d'un abo = annulation de la Subscription (dashboard Mollie), pas
      // une suppression de cache (qui serait recréée et masquerait l'abo au verify).
      let raw = ""
      const sink = new Writable({ write(chunk, _enc, cb) { raw += chunk.toString("utf8"); cb() } })
      // 550 = fichier absent (rien à révoquer) ; TOUTE autre erreur FTP = révocation
      // NON confirmée — ne jamais la maquiller en « rien à faire » (panel 2026-07-02).
      try { await client.downloadTo(sink, remote) } catch (e) {
        if (e && e.code === 550) { console.log(`  - ${r.id}: pas de record serveur (rien à révoquer)`) }
        else { console.log(`  x ${r.id}: erreur FTP (${e.message}) — révocation NON confirmée, à rejouer`) }
        client.close(); continue
      }
      let rec = null
      try { rec = JSON.parse(raw) } catch {}
      if (rec && rec.customer) {
        console.log(`  ! ${r.id}: record ABONNEMENT (customer ${String(rec.customer).slice(0, 8)}…) — NON supprimé. Annuler l'abo côté dashboard Mollie.`)
        client.close(); continue
      }
      await client.remove(remote)
      try { await client.remove(remote + ".lock") } catch {} // verrou d'écriture éventuel
      touched++
      console.log(`  ✓ ${r.id}: record pass serveur supprimé (${h.slice(0, 8)}…)`)
      client.close()
    } catch (e) {
      console.log(`  x ${r.id}: ${e.message}`)
      try { client.close() } catch {}
    }
  }
  console.log(`\nRévocation : ${touched} record(s) serveur supprimé(s)` +
    (compRemoved ? " + entrée comps.php retirée (COMMIT + MERGE REQUIS pour déployer comps.php)." : ".") +
    (skippedNoCreds ? ` (${skippedNoCreds} région(s) sans creds FTP.)` : ""))
  console.log("Rappel : l'appareil payeur garde son flag localStorage jusqu'à expiration ; le self-heal serveur ignore désormais les paiements remboursés intégralement.")
}
revokeServerRecords().catch(e => { console.error(e); process.exit(1) })
