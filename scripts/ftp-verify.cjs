#!/usr/bin/env node
const { Client } = require("basic-ftp")
const fs = require("fs")
const path = require("path")
const { loadProjectEnv } = require("./lib/load-project-env.cjs")
loadProjectEnv()

async function verify() {
  const c = new Client()
  await c.access({
    host: process.env.FTP_HOST_MQ,
    user: process.env.FTP_USER_MQ,
    password: process.env.FTP_PASS_MQ,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  })

  // Download index.html from FTP
  const tmpFtp = path.join(__dirname, "..", "_ftp_index.html")
  await c.downloadTo(tmpFtp, "/index.html")
  const ftpContent = fs.readFileSync(tmpFtp, "utf8")

  // Read local index.html
  const localContent = fs.readFileSync(path.join(__dirname, "..", "martinique-ftp", "index.html"), "utf8")

  console.log("FTP size:", ftpContent.length)
  console.log("Local size:", localContent.length)
  console.log("Same?", ftpContent === localContent)

  const ftpRef = ftpContent.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
  const localRef = localContent.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
  console.log("FTP refs:", ftpRef ? ftpRef[0] : "none")
  console.log("Local refs:", localRef ? localRef[0] : "none")

  // Show first difference
  if (ftpContent !== localContent) {
    for (let i = 0; i < Math.max(ftpContent.length, localContent.length); i++) {
      if (ftpContent[i] !== localContent[i]) {
        console.log(`\nFirst diff at char ${i}:`)
        console.log("  FTP:", JSON.stringify(ftpContent.slice(Math.max(0,i-30), i+30)))
        console.log("  LOC:", JSON.stringify(localContent.slice(Math.max(0,i-30), i+30)))
        break
      }
    }
  }

  // Also check version.json
  const tmpVer = path.join(__dirname, "..", "_ftp_version.json")
  await c.downloadTo(tmpVer, "/version.json")
  console.log("\nFTP version.json:", fs.readFileSync(tmpVer, "utf8").trim())
  console.log("Local version.json:", fs.readFileSync(path.join(__dirname, "..", "martinique-ftp", "version.json"), "utf8").trim())

  // Check if _deploy.php exists and is executable
  const list = await c.list("/")
  const deploy = list.find(e => e.name === "_deploy.php")
  console.log("\n_deploy.php:", deploy ? `size=${deploy.size}` : "NOT FOUND")

  c.close()
  try { fs.unlinkSync(tmpFtp) } catch {}
  try { fs.unlinkSync(tmpVer) } catch {}
}
verify().catch(e => { console.error("FATAL:", e.message); process.exit(1) })
