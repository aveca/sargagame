#!/usr/bin/env node
const { Client } = require("basic-ftp")
const path = require("path")
const fs = require("fs")
const { loadProjectEnv } = require("./lib/load-project-env.cjs")
loadProjectEnv()

const region = process.argv[2] || "mq"
const ID = region.toUpperCase()
const host = process.env[`FTP_HOST_${ID}`] || process.env[`FTP_SERVER_${ID}`] || process.env.FTP_HOST
const user = process.env[`FTP_USER_${ID}`] || process.env[`FTP_USERNAME_${ID}`]
const pass = process.env[`FTP_PASS_${ID}`] || process.env[`FTP_PASSWORD_${ID}`]
const ftpDir = region === "gp" ? "guadeloupe-ftp" : "martinique-ftp"
const localRoot = path.join(__dirname, "..", ftpDir)

if (!host || !user || !pass) { console.error("Missing creds for", ID); process.exit(1) }
if (!fs.existsSync(localRoot)) { console.error("Missing", localRoot); process.exit(1) }

const files = []
for (const f of ["index.html","version.json","sw.js","manifest.json","robots.txt","404.html","favicon.ico"]) {
  const abs = path.join(localRoot, f)
  if (fs.existsSync(abs)) files.push({ local: abs, remote: "/" + f })
}
function collectDir(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const local = path.join(dir, e.name)
    const remote = rel + "/" + e.name
    if (e.isDirectory()) collectDir(local, remote)
    else files.push({ local, remote })
  }
}
const ad = path.join(localRoot, "assets")
if (fs.existsSync(ad)) collectDir(ad, "assets")

// Split into chunks of 50 to survive shared host FTP drops
const CHUNK_SIZE = 50
const chunks = []
for (let i = 0; i < files.length; i += CHUNK_SIZE) chunks.push(files.slice(i, i + CHUNK_SIZE))

console.log(`[${region}] ${files.length} files in ${chunks.length} chunks → ${host}`)

async function connect() {
  const c = new Client(120000)
  await c.access({ host, user, password: pass, secure: true, secureOptions: { rejectUnauthorized: false } })
  if (c.ftp.socket && c.ftp.socket.setKeepAlive) {
    c.ftp.socket.setKeepAlive(true, 5000)
    c.ftp.socket.setTimeout(60000)
  }
  return c
}

async function deploy() {
  let n = 0
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const c = await connect()
        for (const f of chunk) {
          await c.ensureDir(path.posix.dirname(f.remote))
          await c.uploadFrom(f.local, path.posix.basename(f.remote))
          n++
        }
        c.close()
        console.log(`  chunk ${ci+1}/${chunks.length} OK (${n}/${files.length})`)
        break
      } catch (e) {
        const delay = 3000 * Math.pow(2, attempt - 1)
        console.log(`  chunk ${ci+1} attempt ${attempt} FAIL: ${e.message} → retry ${delay/1000}s`)
        await new Promise(r => setTimeout(r, delay))
        if (attempt === 5) { console.error(`[${region}] chunk ${ci+1} FAILED after 5 attempts`); process.exit(1) }
      }
    }
  }
  console.log(`[${region}] ✓ ${n}/${files.length} files deployed to ${host}`)
}
deploy().catch(e => { console.error(`[${region}] FATAL:`, e.message); process.exit(1) })
