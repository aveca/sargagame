#!/usr/bin/env node
const { Client } = require("basic-ftp")
const { loadProjectEnv } = require("./lib/load-project-env.cjs")
loadProjectEnv()

async function explore() {
  const c = new Client()
  await c.access({
    host: process.env.FTP_HOST_MQ,
    user: process.env.FTP_USER_MQ,
    password: process.env.FTP_PASS_MQ,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  })
  console.log("CWD:", await c.pwd())

  // List root
  const root = await c.list("/")
  console.log("\n/ contents:", root.length, "entries")
  for (const e of root.filter(e => e.name.includes("html") || e.name.includes("public") || e.name.includes("index") || e.name.includes("assets") || e.name === "sargagame")) {
    console.log(`  ${e.type === 2 ? "DIR " : "FILE"} ${e.name} ${e.size || ""}`)
  }

  // Check if public_html exists
  const pubIdx = root.findIndex(e => e.name === "public_html")
  if (pubIdx >= 0) {
    console.log("\n/public_html/ contents:")
    const pub = await c.list("/public_html")
    for (const e of pub.filter(e => ["index.html","assets","version.json","sw.js","api"].includes(e.name))) {
      console.log(`  ${e.type === 2 ? "DIR " : "FILE"} ${e.name} ${e.size || ""}`)
    }
    // Check if public_html/index.html references BKMVGTdx or CSZLZF3t
    try {
      const tmpFile = "/tmp/check_index.html"
      await c.downloadTo(tmpFile, "/public_html/index.html")
      const fs = require("fs")
      const html = fs.readFileSync(tmpFile, "utf8")
      const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
      console.log("\npublic_html/index.html refs:", m ? m[0] : "none")
      fs.unlinkSync(tmpFile)
    } catch (e) { console.log("  download failed:", e.message) }
  }

  // Check sargagame dir if exists
  const sgIdx = root.findIndex(e => e.name === "sargagame")
  if (sgIdx >= 0) {
    console.log("\n/sargagame/ contents:")
    const sg = await c.list("/sargagame")
    for (const e of sg.filter(e => ["index.html","assets","version.json","sw.js","public_html"].includes(e.name)).slice(0,10)) {
      console.log(`  ${e.type === 2 ? "DIR " : "FILE"} ${e.name} ${e.size || ""}`)
    }
  }

  c.close()
}
explore().catch(e => { console.error("FATAL:", e.message); process.exit(1) })
