"use strict"
const fs = require("fs")
const path = require("path")

/**
 * Charge la racine du dépôt /.env dans process.env.
 * Ne remplace pas une variable déjà définie (shell, CI, node --env-file).
 * Format : KEY=value, lignes vides et # commentaires ignorées.
 */
function loadProjectEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env")
  if (!fs.existsSync(envPath)) return
  let raw
  try {
    raw = fs.readFileSync(envPath, "utf8")
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    let t = line.trim()
    if (!t || t.startsWith("#")) continue
    if (t.startsWith("export ")) t = t.slice(7).trim()
    const eq = t.indexOf("=")
    if (eq < 1) continue
    const key = t.slice(0, eq).trim()
    if (!key) continue
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

module.exports = { loadProjectEnv }
