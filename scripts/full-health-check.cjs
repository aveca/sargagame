#!/usr/bin/env node
const https = require("https")

const SITES = [
  { name: "Martinique", domain: "sargasses-martinique.com" },
  { name: "Guadeloupe", domain: "sargasses-guadeloupe.com" },
  { name: "Miami", domain: "sargassummiami.com" },
  { name: "Cancun", domain: "sargassumcancun.com" },
  { name: "Punta Cana", domain: "sargassumpuntacana.com" },
]

const PAGES = ["/", "/plages/", "/previsions/", "/carte-sargasses/", "/?paywall=1"]

function fetch(url, timeout = 10000) {
  return new Promise((resolve) => {
    const start = Date.now()
    const req = https.get(url, { timeout }, (res) => {
      let d = ""
      res.on("data", (c) => (d += c.slice(0, 2000)))
      res.on("end", () => {
        const ms = Date.now() - start
        resolve({ status: res.statusCode, time: ms, size: d.length, body: d, headers: res.headers })
      })
    })
    req.on("error", (e) => resolve({ status: 0, error: e.code, time: Date.now() - start }))
    req.on("timeout", function () { this.destroy(); resolve({ status: 0, error: "TIMEOUT", time: Date.now() - start }) })
  })
}

async function checkSite(site) {
  console.log(`\n=== ${site.name} (${site.domain}) ===`)

  // 1. Homepage
  const home = await fetch(`https://${site.domain}/`)
  const jsRef = home.body.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
  const versionMatch = home.body.match(/sargasses-v(\d+)-([a-z0-9]+)/)
  console.log(`  Homepage: ${home.status} | ${home.time}ms | ${home.size}B`)
  console.log(`  JS ref: ${jsRef ? jsRef[0] : "NONE"}`)
  console.log(`  SW version: ${versionMatch ? versionMatch[0] : "none"}`)
  console.log(`  Server: ${home.headers.server || "?"}`)

  // 2. JS bundle
  if (jsRef) {
    const jsUrl = `https://${site.domain}${jsRef[0]}`
    const js = await fetch(jsUrl)
    console.log(`  JS bundle: ${js.status} ${js.headers["content-type"] || ""} | ${js.time}ms | ${js.size}B`)
  }

  // 3. version.json
  const ver = await fetch(`https://${site.domain}/version.json`)
  console.log(`  version.json: ${ver.status} | ${ver.body.slice(0, 100)}`)

  // 4. Key pages
  for (const page of PAGES.slice(1)) {
    const p = await fetch(`https://${site.domain}${page}`)
    const label = page === "/?paywall=1" ? "paywall" : page.replace(/\//g, "").replace(/-/g, " ")
    console.log(`  ${label}: ${p.status} | ${p.time}ms`)
  }

  // 5. Data API
  const api = await fetch(`https://${site.domain}/api/copernicus/sargassum.json`)
  let apiAge = "?"
  try {
    const d = JSON.parse(api.body)
    const h = (Date.now() - new Date(d.updatedAt)) / 3.6e6
    apiAge = h.toFixed(1) + "h"
  } catch {}
  console.log(`  Data API: ${api.status} | age: ${apiAge}`)
}

async function main() {
  console.log("=== SARGAGAME FULL HEALTH CHECK ===")
  console.log("Time:", new Date().toISOString())
  for (const site of SITES) {
    await checkSite(site)
  }
  console.log("\n=== DONE ===")
}
main()
