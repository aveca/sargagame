#!/usr/bin/env node
const https = require("https")
function fetch(url, timeout = 10000) {
  return new Promise((resolve) => {
    const start = Date.now()
    const req = https.get(url, { timeout }, (res) => {
      let d = ""
      res.on("data", (c) => (d += c.slice(0, 5000)))
      res.on("end", () => resolve({ status: res.statusCode, time: Date.now() - start, size: d.length, body: d, headers: res.headers }))
    })
    req.on("error", (e) => resolve({ status: 0, error: e.code }))
    req.on("timeout", function () { this.destroy(); resolve({ status: 0, error: "TIMEOUT" }) })
  })
}
async function main() {
  // Miami deep check
  console.log("=== MIAMI DEEP CHECK ===")
  const m = await fetch("https://sargassummiami.com/")
  console.log("Status:", m.status, "Size:", m.size, "Time:", m.time + "ms")
  console.log("Server:", m.headers.server)
  const jsRef = m.body.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/g)
  console.log("JS refs:", jsRef || "NONE")
  console.log("First 1500 chars:", m.body.slice(0, 1500))

  // Check if it's a redirect or skeleton page
  const hasReact = m.body.includes("root") || m.body.includes("react") || m.body.includes("sargag")
  console.log("Has React root:", hasReact)

  // Check specific USD pages
  console.log("\n=== USD PAGE CHECKS ===")
  const pages = ["/", "/plages/", "/previsions/", "/carte-sargasses/", "/?paywall=1", "/api/copernicus/sargassum.json"]
  for (const domain of ["sargassummiami.com", "sargassumcancun.com", "sargassumpuntacana.com"]) {
    console.log(`\n--- ${domain} ---`)
    for (const page of pages) {
      const r = await fetch(`https://${domain}${page}`)
      const label = page === "/?paywall=1" ? "paywall" : page === "/api/copernicus/sargassum.json" ? "api" : page.replace(/\//g, "").replace(/-/g, " ") || "home"
      let extra = ""
      if (page === "/") {
        const js = r.body.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
        extra = js ? ` | JS: ${js[0]}` : " | NO JS REF"
      }
      console.log(`  ${label.padEnd(12)} ${r.status} ${r.time}ms${extra}`)
    }
  }
}
main()
