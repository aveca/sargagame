#!/usr/bin/env node
/**
 * gift-pass.cjs — Offre un accès premium CROSS-DEVICE à un email (cadeau, SANS paiement).
 *
 * Usage : node scripts/automation/gift-pass.cjs <email> [jours=30]
 *
 * Calcule sha1(strtolower(trim(email))) + un pass_end, et l'ajoute à
 * public/api/comps.php. PII-SAFE : l'email N'EST JAMAIS écrit (ni committé ni loggé en
 * clair) — SEUL le hash est persisté. Purge au passage les entrées expirées.
 *
 * Le bénéficiaire débloque ensuite dans l'app en entrant SON email via « J'ai déjà un
 * pass » / « Mon accès » — ou en cliquant le lien one-click de l'email d'accueil
 * (/?premium_email=<son email>). Marche sur n'importe quel appareil/navigateur.
 *
 * Après exécution : commit + merge sur main (déclenche le deploy FTP). L'accès est
 * actif dès que comps.php est en prod.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto")

const email = (process.argv[2] || "").trim().toLowerCase()
const days  = Math.max(1, Math.min(3650, parseInt(process.argv[3] || "30", 10) || 30))
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage : node scripts/automation/gift-pass.cjs <email> [jours=30]")
  process.exit(1)
}

const h   = crypto.createHash("sha1").update(email).digest("hex")
const now = Math.floor(Date.now() / 1000)
const end = now + days * 86400

const f = path.join(__dirname, "../../public/api/comps.php")
const src = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""

// Repart des entrées existantes NON expirées (purge auto), puis ajoute/cumule la nôtre.
const entries = {}
const re = /'([0-9a-f]{40})'\s*=>\s*(\d+)/g
let m
while ((m = re.exec(src))) { const v = parseInt(m[2], 10); if (v > now) entries[m[1]] = v }
entries[h] = Math.max(entries[h] || 0, end) // cumul : on ne raccourcit jamais un accès

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
fs.writeFileSync(f, out)

const d = new Date(end * 1000).toISOString().slice(0, 10)
console.log(`OK — accès offert ${days} j (jusqu'au ${d}).`)
console.log(`Hash ${h} ajouté à public/api/comps.php (${Object.keys(entries).length} entrée(s) active(s)).`)
console.log(`Le bénéficiaire débloque via « J'ai déjà un pass » (son email) ou le lien /?premium_email=<email>.`)
console.log(`→ Commit + merge sur main pour déployer.`)
