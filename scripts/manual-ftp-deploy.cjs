#!/usr/bin/env node
/**
 * Manual FTP deploy — emergency path when GH Actions quota is exhausted.
 *
 * Reads creds from env vars (never hardcoded). Uploads martinique-ftp/ then
 * guadeloupe-ftp/ via basic-ftp with secure FTPS.
 *
 * Shared host drops the FTPS control socket after ~660 STOR commands. To work
 * around it, we upload in chunks: one fresh FTP session per top-level entry
 * (root files as one chunk, then each top-level subdir as its own chunk).
 * The biggest subdir (beaches/) is ~420 files, well under the reset threshold.
 *
 * Required env vars (aliases GitHub Actions acceptés) :
 *   FTP_HOST_MQ | FTP_SERVER_MQ, FTP_USER_MQ | FTP_USERNAME_MQ, FTP_PASS_MQ | FTP_PASSWORD_MQ
 *   idem _GP
 * Optional:
 *   FTP_REMOTE_MQ (default "/"), FTP_REMOTE_GP (default "/")
 *   ONLY=mq|gp (skip the other)
 *   SKIP_UNTIL=<name>  (resume: skip chunks alphabetically before this)
 *
 * Le fichier .env à la racine du dépôt est chargé automatiquement (mêmes clés
 * que les secrets GitHub : FTP_SERVER_MQ, FTP_USERNAME_MQ, FTP_PASSWORD_MQ, …).
 */
const { Client } = require("basic-ftp")
const path = require("path")
const fs = require("fs")
const { loadProjectEnv } = require("./lib/load-project-env.cjs")

loadProjectEnv()

const targets = [
  {
    key: "mq",
    label: "Martinique",
    host: process.env.FTP_HOST_MQ || process.env.FTP_SERVER_MQ,
    user: process.env.FTP_USER_MQ || process.env.FTP_USERNAME_MQ,
    pass: process.env.FTP_PASS_MQ || process.env.FTP_PASSWORD_MQ,
    remote: process.env.FTP_REMOTE_MQ || "/",
    local: path.join(__dirname, "..", "martinique-ftp"),
  },
  {
    key: "gp",
    label: "Guadeloupe",
    host: process.env.FTP_HOST_GP || process.env.FTP_SERVER_GP,
    user: process.env.FTP_USER_GP || process.env.FTP_USERNAME_GP,
    pass: process.env.FTP_PASS_GP || process.env.FTP_PASSWORD_GP,
    remote: process.env.FTP_REMOTE_GP || "/",
    local: path.join(__dirname, "..", "guadeloupe-ftp"),
  },
]

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
    "  FTP_SERVER_MQ, FTP_USERNAME_MQ, FTP_PASSWORD_MQ",
    "  FTP_SERVER_GP, FTP_USERNAME_GP, FTP_PASSWORD_GP",
    "(aliases acceptés : FTP_HOST_*, FTP_USER_*, FTP_PASS_*.)",
  ].join("\n")
}

async function deployOne(t) {
  if (!t.host || !t.user || !t.pass) {
    console.error(`[${t.key}] Identifiants FTP manquants — ignoré.\n${ftpHelpLines()}`)
    return false
  }
  if (!fs.existsSync(t.local)) {
    console.error(`[${t.key}] ${t.local} missing — run scripts/prepare-ftp.cjs first`)
    return false
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
        if (attempt === MAX || !/ECONNRESET|timeout|ETIMEDOUT/i.test(err.message)) throw err
        console.log(`  [${t.label}] ${label} reset @ ${count}, retry ${attempt + 1}/${MAX}…`)
      }
    }
  }

  // Chunk 0: root files in a single session
  const rootFiles = entries.filter(e => fs.statSync(path.join(t.local, e)).isFile())
  if (rootFiles.length && !skipUntil) {
    const n = await withFreshClient("<root>", async client => {
      for (const f of rootFiles) {
        await client.uploadFrom(path.join(t.local, f), f)
      }
    })
    console.log(`  [${t.label}] <root> ✓ (${rootFiles.length} files, tracked ${n})`)
  }

  // Chunks 1..N: each top-level subdir in its own fresh session
  const subdirs = entries.filter(e => {
    if (skipUntil && e < skipUntil) return false
    if (exclude.has(e)) return false
    return fs.statSync(path.join(t.local, e)).isDirectory()
  })
  for (const d of subdirs) {
    const n = await withFreshClient(`${d}/`, async client => {
      await client.ensureDir(`/${d}`)
      await client.uploadFromDir(path.join(t.local, d))
    })
    console.log(`  [${t.label}] ${d}/ ✓ (${n} files)`)
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[${t.label}] ✓ all chunks deployed in ${dt}s`)
  return true
}

async function main() {
  const only = process.env.ONLY
  const picked = only ? targets.filter(t => t.key === only) : targets
  if (!picked.length) {
    console.error("No target matched ONLY=" + only)
    process.exit(1)
  }
  let ok = true
  for (const t of picked) {
    try {
      const r = await deployOne(t)
      if (!r) ok = false
    } catch (err) {
      console.error(`[${t.label}] FATAL:`, err.message)
      ok = false
    }
  }
  process.exit(ok ? 0 : 1)
}

main()
