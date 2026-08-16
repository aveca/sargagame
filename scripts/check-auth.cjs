#!/usr/bin/env node
const { loadProjectEnv } = require("./lib/load-project-env.cjs")
loadProjectEnv()
const pass = process.env.FTP_PASS_MQ || process.env.FTP_PASSWORD_MQ || ""
console.log("PASS length:", pass.length)
console.log("PASS first char code:", pass.charCodeAt(0))
console.log("PASS has newline:", pass.includes("\n") || pass.includes("\r"))
// Test FTP connection
const { Client } = require("basic-ftp")
async function test() {
  const c = new Client()
  await c.access({
    host: process.env.FTP_HOST_MQ,
    user: process.env.FTP_USER_MQ,
    password: pass,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  })
  console.log("CONNECTED OK")
  const list = await c.list()
  console.log("ROOT entries:", list.length)
  console.log("Has index.html:", list.some(e => e.name === "index.html"))
  console.log("Has assets/:", list.some(e => e.name === "assets"))
  c.close()
}
test().catch(e => console.error("AUTH FAIL:", e.message))
