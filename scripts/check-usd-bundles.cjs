#!/usr/bin/env node
const https = require("https")
function fetch(url, timeout = 8000) {
  return new Promise((resolve) => {
    const start = Date.now()
    const req = https.get(url, { timeout }, (res) => {
      let d = ""
      res.on("data", (c) => (d += c))
      res.on("end", () => resolve({ status: res.statusCode, time: Date.now() - start, size: d.length, ct: res.headers["content-type"] || "" }))
    })
    req.on("error", (e) => resolve({ status: 0, error: e.code }))
    req.on("timeout", function () { this.destroy(); resolve({ status: 0, error: "TIMEOUT" }) })
  })
}
async function main() {
  const sites = [
    { name: "Miami", domain: "sargassummiami.com", js: "index-DH7fG8JA.js" },
    { name: "Cancun", domain: "sargassumcancun.com", js: "index-CEjgEaNM.js" },
    { name: "Punta Cana", domain: "sargassumpuntacana.com", js: "index-D7OuCx9a.js" },
  ]
  console.log("=== USD BUNDLE CHECK ===")
  for (const s of sites) {
    const r = await fetch(`https://${s.domain}/assets/${s.js}`)
    console.log(`${s.name.padEnd(12)} ${s.js} → ${r.status} ${r.ct} ${r.size}B ${r.time}ms ${r.error || ""}`)
  }
  console.log("\n=== MQ/GP BUNDLE CHECK ===")
  const mq = await fetch("https://sargasses-martinique.com/assets/index-CSZLZF3t.js")
  console.log(`Martinique   index-CSZLZF3t.js → ${mq.status} ${mq.ct} ${mq.size}B ${mq.time}ms`)
  const gp = await fetch("https://sargasses-guadeloupe.com/assets/index-CSZLZF3t.js")
  console.log(`Guadeloupe   index-CSZLZF3t.js → ${gp.status} ${gp.ct} ${gp.size}B ${gp.time}ms`)
}
main()
