#!/usr/bin/env node
/**
 * Manual FTP deploy — emergency path when GH Actions quota is exhausted.
 *
 * Reads creds from env vars (never hardcoded). Uploads chaque <region.ftpDir>/
 * (cibles dérivées du moteur regions/) via basic-ftp with secure FTPS.
 *
 * Shared host drops the FTPS control socket after ~660 STOR commands. To work
 * around it, we upload in chunks: one fresh FTP session per top-level entry
 * (root files as one chunk, then each top-level subdir as its own chunk).
 * The biggest subdir (beaches/) is ~420 files, well under the reset threshold.
 *
 * Required env vars (aliases GitHub Actions acceptés) — <ID> = id de région en
 * MAJUSCULES depuis regions/<id>.json (MQ, GP, PUNTACANA, …) :
 *   FTP_HOST_<ID> | FTP_SERVER_<ID>, FTP_USER_<ID> | FTP_USERNAME_<ID>,
 *   FTP_PASS_<ID> | FTP_PASSWORD_<ID>
 *   Host commun : FTP_HOST | FTP_SERVER, utilisé si la région n'a que user/pass.
 * Optional:
 *   FTP_REMOTE_<ID> (default "/")
 *   ONLY=<id> (ne déployer que cette région)
 *   SKIP_UNTIL=<name>  (resume: skip chunks alphabetically before this)
 * Une région sans creds env (ou sans dossier <ftpDir>/) = skip avec warning ;
 * échec seulement si rien n'est déployé ou si la région ONLY demandée échoue.
 *
 * Le fichier .env à la racine du dépôt est chargé automatiquement (mêmes clés
 * que les secrets GitHub : FTP_SERVER_MQ, FTP_USERNAME_MQ, FTP_PASSWORD_MQ, …).
 * Publication locale sans GitHub : npm run martinique && npm run ftp-deploy
 */
const { Client } = require("basic-ftp")
const path = require("path")
const fs = require("fs")
const { loadProjectEnv } = require("./lib/load-project-env.cjs")
const { getAllRegions } = require("../regions/index.cjs")

loadProjectEnv()

const env = (k) => process.env[k]

// Cibles dérivées du moteur regions/ : une région = un dossier <ftpDir>/ → un
// compte FTP. Conventions env rétro-compatibles MQ/GP (FTP_SERVER_MQ, …) ;
// nouvelles régions : FTP_HOST_<ID>/FTP_USER_<ID>/FTP_PASS_<ID>, avec fallback
// sur un host commun (FTP_HOST | FTP_SERVER) si seuls user/pass sont fournis.
const targets = getAllRegions().map((r) => {
  const ID = r.id.toUpperCase()
  const user = env(`FTP_USER_${ID}`) || env(`FTP_USERNAME_${ID}`)
  const pass = env(`FTP_PASS_${ID}`) || env(`FTP_PASSWORD_${ID}`)
  const host =
    env(`FTP_HOST_${ID}`) ||
    env(`FTP_SERVER_${ID}`) ||
    (user && pass ? env("FTP_HOST") || env("FTP_SERVER") : undefined)
  return {
    key: r.id,
    label: r.name,
    host,
    user,
    pass,
    remote: env(`FTP_REMOTE_${ID}`) || "/",
    local: path.join(__dirname, "..", r.ftpDir),
  }
})

async function connect(t) {
  const client = new Client(undefined, 120000)
  client.ftp.verbose = false
  await client.access({
    host: t.host,
    user: t.user,
    password: t.pass,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  })
  if (client.ftp.socket && client.ftp.socket.setKeepAlive) {
    client.ftp.socket.setKeepAlive(true, 10000)
  }
  return client
}

async function uploadChunk(t, chunkName, localPath, remotePath, isFile) {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const client = await connect(t)
    let count = 0
    client.trackProgress(info => {
      if (info.type === "upload") count++
    })
    try {
      if (remotePath && remotePath !== "/") await client.ensureDir(remotePath)
      if (isFile) {
        await client.uploadFrom(localPath, path.basename(localPath))
      } else {
        await client.uploadFromDir(localPath)
      }
      client.trackProgress()
      client.close()
      console.log(`  [${t.label}] ${chunkName} ✓ (${count} files)`)
      return
    } catch (err) {
      client.trackProgress()
      try { client.close() } catch {}
      if (attempt === MAX_ATTEMPTS) throw err
      console.log(`  [${t.label}] ${chunkName} reset @ ${count}, retry ${attempt + 1}/${MAX_ATTEMPTS}…`)
    }
  }
}

function ftpHelpLines() {
  return [
    "Définis dans .env (racine du repo) les mêmes noms que les secrets GitHub :",
    "  FTP_SERVER_<ID>, FTP_USERNAME_<ID>, FTP_PASSWORD_<ID>",
    "  (<ID> = id de région en MAJUSCULES : MQ, GP, PUNTACANA, …)",
    "(aliases acceptés : FTP_HOST_*, FTP_USER_*, FTP_PASS_* ; host commun : FTP_HOST.)",
  ].join("\n")
}

async function deployOne(t) {
  if (!t.host || !t.user || !t.pass) {
    const ID = t.key.toUpperCase()
    console.warn(`[${t.key}] Identifiants FTP manquants (FTP_HOST_${ID}/FTP_USER_${ID}/FTP_PASS_${ID}) — région ignorée.`)
    return "skipped"
  }
  if (!fs.existsSync(t.local)) {
    console.warn(`[${t.key}] ${t.local} absent — région ignorée (run scripts/prepare-ftp.cjs first)`)
    return "skipped"
  }
  console.log(`\n[${t.label}] deploying ${t.local} → ${t.host}`)
  const t0 = Date.now()

  const entries = fs.readdirSync(t.local).sort()
  const skipUntil = process.env.SKIP_UNTIL || ""
  const exclude = new Set((process.env.EXCLUDE || "").split(",").map(s => s.trim()).filter(Boolean))

  // Generic retry wrapper: fresh Client per attempt. Retries only on
  // ECONNRESET/timeout; other errors bubble up.
  async function withFreshClient(label, work) {
    const MAX = 5
    for (let attempt = 1; attempt <= MAX; attempt++) {
      const client = await connect(t)
      let count = 0
      client.trackProgress(info => { if (info.type === "upload") count++ })
      try {
        await work(client)
        client.trackProgress()
        client.close()
        return count
      } catch (err) {
        client.trackProgress()
        try { client.close() } catch {}
        if (attempt === MAX || !/ECONNRESET|timeout|ETIMEDOUT|control socket/i.test(err.message)) throw err
        console.log(`  [${t.label}] ${label} reset @ ${count}, retry ${attempt + 1}/${MAX}…`)
      }
    }
  }

  // Ordre anti fenêtre-cassée (2026-06-10) : assets/ EN PREMIER (bundles
  // hashés = additifs, inoffensifs tant que rien ne les référence), puis les
  // autres dossiers, et la racine (index.html, sw.js) en DERNIER — le flip
  // vers le nouveau bundle est atomique une fois tout le contenu en place.
  // Avant : racine d'abord → index.html pointait 10-25 min vers un bundle
  // 404 pendant l'upload (site blanc, chargement infini).
  const rootFiles = entries.filter(e => fs.statSync(path.join(t.local, e)).isFile())

  // Chunks 1..N: each top-level subdir in its own fresh session.
  // When a subdir exceeds BATCH_SIZE flat files, split into sub-chunks with a
  // fresh session per batch — the shared host resets the control socket past
  // ~660 cumulative STORs (beaches/ alone is now 422 files, so a single retry
  // after a mid-upload reset cumulates past the threshold).
  const BATCH_SIZE = 100
  const subdirs = entries.filter(e => {
    if (skipUntil && e < skipUntil) return false
    if (exclude.has(e)) return false
    return fs.statSync(path.join(t.local, e)).isDirectory()
  }).sort((a, b) => (a === 'assets' ? -1 : b === 'assets' ? 1 : a < b ? -1 : 1))
  for (const d of subdirs) {
    const localDir = path.join(t.local, d)
    const dirEntries = fs.readdirSync(localDir)
    const flatFiles = dirEntries.filter(e => fs.statSync(path.join(localDir, e)).isFile()).sort()
    const nestedDirs = dirEntries.filter(e => fs.statSync(path.join(localDir, e)).isDirectory()).sort()

    if (flatFiles.length <= BATCH_SIZE && nestedDirs.length === 0) {
      const n = await withFreshClient(`${d}/`, async client => {
        await client.ensureDir(`/${d}`)
        await client.uploadFromDir(localDir)
      })
      console.log(`  [${t.label}] ${d}/ ✓ (${n} files)`)
      continue
    }

    for (let i = 0; i < flatFiles.length; i += BATCH_SIZE) {
      const batch = flatFiles.slice(i, i + BATCH_SIZE)
      const label = `${d}/ [${i + 1}-${i + batch.length}/${flatFiles.length}]`
      const n = await withFreshClient(label, async client => {
        await client.ensureDir(`/${d}`)
        for (const f of batch) {
          await client.uploadFrom(path.join(localDir, f), f)
        }
      })
      console.log(`  [${t.label}] ${label} ✓ (${n} files)`)
    }
    for (const sd of nestedDirs) {
      function collectFiles(dir, prefix) {
        let results = []
        for (const e of fs.readdirSync(dir)) {
          const fp = path.join(dir, e)
          const rp = prefix ? `${prefix}/${e}` : e
          if (fs.statSync(fp).isDirectory()) {
            results = results.concat(collectFiles(fp, rp))
          } else {
            results.push({ local: fp, remote: rp })
          }
        }
        return results
      }
      const sdPath = path.join(localDir, sd)
      const allNestedFiles = collectFiles(sdPath, "")
      
      if (allNestedFiles.length <= BATCH_SIZE) {
        const n = await withFreshClient(`${d}/${sd}/`, async client => {
          await client.ensureDir(`/${d}/${sd}`)
          await client.uploadFromDir(sdPath)
        })
        console.log(`  [${t.label}] ${d}/${sd}/ ✓ (${n} files)`)
      } else {
        for (let i = 0; i < allNestedFiles.length; i += BATCH_SIZE) {
          const batch = allNestedFiles.slice(i, i + BATCH_SIZE)
          const label = `${d}/${sd}/ [${i + 1}-${i + batch.length}/${allNestedFiles.length}]`
          const n = await withFreshClient(label, async client => {
            await client.ensureDir(`/${d}/${sd}`)
            for (const f of batch) {
              const remoteDir = path.dirname(`/${d}/${sd}/${f.remote}`).replace(/\\/g, '/')
              await client.ensureDir(remoteDir)
              await client.uploadFrom(f.local, `/${d}/${sd}/${f.remote}`.replace(/\\/g, '/'))
            }
          })
          console.log(`  [${t.label}] ${label} ✓ (${n} files)`)
        }
      }
    }
  }

  // Racine en dernier (voir commentaire ordre anti fenêtre-cassée ci-dessus)
  if (rootFiles.length && !skipUntil) {
    const n = await withFreshClient("<root>", async client => {
      for (const f of rootFiles) {
        await client.uploadFrom(path.join(t.local, f), f)
      }
    })
    console.log(`  [${t.label}] <root> ✓ (${rootFiles.length} files, tracked ${n})`)
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[${t.label}] ✓ all chunks deployed in ${dt}s`)
  return true
}

async function main() {
  const only = process.env.ONLY
  const picked = only ? targets.filter(t => t.key === only) : targets
  if (!picked.length) {
    console.error("No target matched ONLY=" + only + " (régions: " + targets.map(t => t.key).join(", ") + ")")
    process.exit(1)
  }
  let ok = true
  let deployed = 0
  for (const t of picked) {
    try {
      const r = await deployOne(t)
      if (r === true) deployed++
      else if (r === "skipped") { if (only) ok = false } // skip toléré sauf région demandée explicitement
      else ok = false
    } catch (err) {
      console.error(`[${t.label}] FATAL:`, err.message)
      ok = false
    }
  }
  if (!deployed && ok) {
    console.error(`Aucune région déployée — aucuns identifiants FTP trouvés.\n${ftpHelpLines()}`)
    ok = false
  }
  process.exit(ok ? 0 : 1)
}

if (require.main === module) main()

// Export pour outillage/tests : mapping env → cibles sans déclencher d'upload.
module.exports = { targets, deployOne }
