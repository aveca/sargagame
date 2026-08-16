#!/usr/bin/env node
const { Client } = require("basic-ftp")
const path = require("path")
const fs = require("fs")
const { loadProjectEnv } = require("./lib/load-project-env.cjs")
loadProjectEnv()

const region = process.argv[2] || "mq"
const ID = region.toUpperCase()
const host = process.env[`FTP_HOST_${ID}`] || process.env.FTP_HOST
const user = process.env[`FTP_USER_${ID}`] || process.env[`FTP_USERNAME_${ID}`]
const pass = process.env[`FTP_PASS_${ID}`] || process.env[`FTP_PASSWORD_${ID}`]
const ftpDir = region === "gp" ? "guadeloupe-ftp" : "martinique-ftp"
const localRoot = path.join(__dirname, "..", ftpDir)

async function test() {
  const c = new Client()
  await c.access({ host, user, password: pass, secure: true, secureOptions: { rejectUnauthorized: false } })
  console.log("Connected")

  // List root
  const list = await c.list("/")
  const idx = list.find(e => e.name === "index.html")
  console.log("index.html on server:", idx ? `size=${idx.size} modified=${idx.modifiedAt}` : "NOT FOUND")

  // Try to read size of our local file
  const localIdx = path.join(localRoot, "index.html")
  const localSize = fs.statSync(localIdx).size
  console.log("local index.html size:", localSize)

  // Try to remove + reupload
  try {
    await c.remove("/index.html")
    console.log("Removed old index.html")
  } catch (e) {
    console.log("remove failed:", e.message)
  }

  await c.uploadFrom(localIdx, "index.html")
  console.log("Uploaded new index.html")

  // Verify
  const list2 = await c.list("/")
  const idx2 = list2.find(e => e.name === "index.html")
  console.log("After upload:", idx2 ? `size=${idx2.size}` : "NOT FOUND")

  // Also upload version.json
  const localVer = path.join(localRoot, "version.json")
  if (fs.existsSync(localVer)) {
    try { await c.remove("/version.json") } catch {}
    await c.uploadFrom(localVer, "version.json")
    console.log("Uploaded version.json:", fs.readFileSync(localVer, "utf8").trim())
  }

  // Also upload sw.js
  const localSw = path.join(localRoot, "sw.js")
  if (fs.existsSync(localSw)) {
    try { await c.remove("/sw.js") } catch {}
    await c.uploadFrom(localSw, "sw.js")
    console.log("Uploaded sw.js")
  }

  c.close()
}
test().catch(e => { console.error("FATAL:", e.message); process.exit(1) })
