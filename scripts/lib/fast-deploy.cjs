#!/usr/bin/env node
/**
 * fast-deploy.cjs — chemin de deploy RAPIDE : zip → 1 STOR FTP → extraction
 * serveur (public/api/_deploy.php). Remplace ~500 STOR fragmentés (l'hébergeur
 * coupe la socket tous les ~660 STOR) par 1 upload + 1 appel HTTP par région.
 *
 * Usage (depuis manual-ftp-deploy.cjs) :
 *   const { fastDeploy, pingDeploy } = require('./lib/fast-deploy.cjs')
 *   await fastDeploy(target, { token })   // throw sur toute erreur → fallback
 *
 * `target` = { label, host, user, pass, remote, local, domain }
 * Toute erreur (pas d'endpoint, pas de ZipArchive, token KO, upload coupé,
 * extraction échouée) PROPAGE une exception : l'appelant retombe sur le chemin
 * FTP fichier-par-fichier éprouvé. Le fast path n'ajoute jamais de risque net.
 *
 * Secret : jamais dans le repo. Le token vient de DEPLOY_TOKEN (.env / secret GH)
 * et doit matcher stripe-config.php['deploy_token'] côté serveur.
 */
const { Client } = require("basic-ftp")
const https = require("https")
const os = require("os")
const path = require("path")
const fs = require("fs")
const AdmZip = require("adm-zip")

// Fichiers JAMAIS embarqués dans le zip : secrets server-only que l'extraction
// ne doit pas pouvoir régresser (stripe-config.php est gitignoré et provisionné
// à part). L'extraction n'efface pas les fichiers absents du zip → ils survivent.
//
// ATTENTION — mollie-config.php est VOLONTAIREMENT EMBARQUÉ dans le zip (retiré
// de la liste d'exclusion le 2026-08-03 pour fix BUG-2026-007 : le webhook_secret
// n'était jamais déployé car le fichier était exclu → webhook Mollie 503 en prod).
// Sécurité : write-mollie-config.cjs est run AVANT le deploy en CI avec
// MOLLIE_API_KEY + MOLLIE_WEBHOOK_SECRET (GitHub secrets). Si webhook_secret
// manque, write-mollie-config.cjs exit 1 → build bloqué → pas de deploy.
// Donc le mollie-config.php embarqué dans le zip est toujours valide.
// Pour stripe-config.php à part (provisionné manuellement), on garde l'exclusion.
const ZIP_EXCLUDE = new Set(["stripe-config.php", "_deploy-secret.php", "_deploy.zip"])

function httpJson(url, timeoutMs, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs || 120000, headers: headers || {} }, (res) => {
      let body = ""
      res.on("data", (c) => (body += c))
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
        }
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error(`réponse non-JSON: ${body.slice(0, 200)}`))
        }
      })
    })
    req.on("timeout", () => req.destroy(new Error("timeout HTTP _deploy.php")))
    req.on("error", reject)
  })
}

// Le token passe par le header X-Deploy-Token (jamais la query string : elle
// finirait dans les access logs du serveur/proxy). _deploy.php lit ce header en
// priorité, avec repli GET/POST pour la transition.
function endpoint(domain, action) {
  return `https://${domain}/api/_deploy.php?action=${action}`
}
function authHeader(token) {
  return { "X-Deploy-Token": token }
}

// Vérifie que l'endpoint répond et que ZipArchive est dispo côté serveur.
async function pingDeploy(domain, token, t) {
  const isUSD = t && isUsdHost(t)
  const timeout = isUSD ? 45000 : 30000
  const r = await httpJson(endpoint(domain, "ping"), timeout, authHeader(token))
  if (!r.ok) throw new Error(`ping refusé: ${JSON.stringify(r)}`)
  if (!r.zip) throw new Error("ZipArchive absent côté serveur")
  return r
}

// Zippe localDir (récursif, chemins relatifs) en excluant les secrets. Renvoie
// le chemin d'un fichier .zip temporaire (à supprimer par l'appelant).
function buildZip(localDir) {
  const zip = new AdmZip()
  const walk = (dir, prefix) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name)
      const rel = prefix ? `${prefix}/${name}` : name
      const st = fs.statSync(abs)
      if (st.isDirectory()) {
        walk(abs, rel)
      } else if (!ZIP_EXCLUDE.has(name)) {
        zip.addFile(rel, fs.readFileSync(abs))
      }
    }
  }
  walk(localDir, "")
  const tmp = path.join(os.tmpdir(), `sarga-deploy-${path.basename(localDir)}-${process.pid}.zip`)
  zip.writeZip(tmp)
  return tmp
}

function isUsdHost(t) {
  return t.key === 'florida' || t.key === 'puntacana' || t.key === 'rivieramaya'
}

async function connect(t) {
  const isUSD = isUsdHost(t)
  const connTimeout = isUSD ? 180000 : 120000
  const xferTimeout = isUSD ? 120000 : 60000
  const keepAliveInterval = isUSD ? 5000 : 10000

  const client = new Client(undefined, connTimeout)
  client.ftp.verbose = false
  await client.access({
    host: t.host,
    user: t.user,
    password: t.pass,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  })
  if (client.ftp.socket && client.ftp.socket.setKeepAlive) {
    client.ftp.socket.setKeepAlive(true, keepAliveInterval)
    client.ftp.socket.setTimeout(xferTimeout)
  }
  return client
}

/**
 * Deploy rapide d'une région. Throw sur toute erreur (→ fallback appelant).
 * Retourne { files, ms, zipKB }.
 */
async function fastDeploy(t, opts) {
  const token = (opts && opts.token) || ""
  if (!token) throw new Error("DEPLOY_TOKEN manquant")
  if (!t.domain) throw new Error(`pas de domaine pour ${t.label}`)

  // 1. Sanity : l'endpoint existe et sait dézipper (sinon fallback direct, sans
  //    avoir uploadé un zip pour rien).
  await pingDeploy(t.domain, token, t)

  // 2. Construire le zip (hors secrets).
  const zipPath = buildZip(t.local)
  const zipKB = Math.round(fs.statSync(zipPath).size / 1024)
  try {
    // 3. Upload du zip à la racine web (1 STOR), avec retries sur reset socket.
    // USD host plus instable : plus de retries, backoff plus long.
    const isUSD = isUsdHost(t)
    const MAX = isUSD ? 6 : 3
    for (let attempt = 1; attempt <= MAX; attempt++) {
      const client = await connect(t)
      try {
        if (t.remote && t.remote !== "/") await client.ensureDir(t.remote)
        await client.uploadFrom(zipPath, "_deploy.zip")
        client.close()
        break
      } catch (err) {
        try { client.close() } catch {}
        if (attempt === MAX) throw err
        const delay = isUSD ? 3000 * attempt : 1000
        console.log(`  [${t.label}] zip upload reset, retry ${attempt + 1}/${MAX} in ${delay / 1000}s…`)
        await new Promise(r => setTimeout(r, delay))
      }
    }

    // 4. Extraction serveur + cleanup du zip distant.
    // USD host : timeout plus long pour l'extraction (plus de fichiers, serveur plus lent).
    const unzipTimeout = isUSD ? 180000 : 120000
    const r = await httpJson(endpoint(t.domain, "unzip"), unzipTimeout, authHeader(token))
    if (!r.ok) throw new Error(`unzip refusé: ${JSON.stringify(r)}`)
    return { files: r.files, ms: r.ms, zipKB }
  } finally {
    try { fs.unlinkSync(zipPath) } catch {}
  }
}

module.exports = { fastDeploy, pingDeploy, buildZip, ZIP_EXCLUDE }
