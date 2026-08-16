#!/usr/bin/env node
const https = require("https")
function fetch(u) {
  return new Promise(r => {
    https.get(u, { timeout: 8000 }, res => {
      let d = ""
      res.on("data", c => d += c.slice(0, 300))
      res.on("end", () => r({ s: res.statusCode, b: d.length }))
    }).on("error", e => r({ s: 0, e: e.code }))
      .on("timeout", function () { this.destroy(); r({ s: 0, e: "TO" }) })
  })
}
async function main() {
  const pages = [
    "/", "/previsions/", "/carte-sargasses/", "/?paywall=1",
    "/api/copernicus/sargassum.json", "/api/weather.json",
    "/en/", "/es/",
  ]
  const sites = [
    { name: "MQ", domain: "sargasses-martinique.com", beachPrefix: "/plages/" },
    { name: "GP", domain: "sargasses-guadeloupe.com", beachPrefix: "/plages/" },
    { name: "FL", domain: "sargassummiami.com", beachPrefix: "/beaches/" },
    { name: "RM", domain: "sargassumcancun.com", beachPrefix: "/playas/" },
    { name: "PC", domain: "sargassumpuntacana.com", beachPrefix: "/beaches/" },
  ]
  console.log("=== FULL PAGE CHECK (5 sites × 8+ pages) ===\n")
  let ok = 0, fail = 0, total = 0
  for (const site of sites) {
    console.log(`--- ${site.name} (${site.domain}) ---`)
    for (const page of pages) {
      const u = `https://${site.domain}${page}`
      const r = await fetch(u)
      total++
      const status = r.s === 200 ? "✓" : "✗"
      if (r.s === 200) ok++; else fail++
      console.log(`  ${status} ${page.padEnd(35)} ${r.s} ${(r.b + "")}B${r.e ? " " + r.e : ""}`)
    }
    // Beach index
    const bi = await fetch(`https://${site.domain}${site.beachPrefix}`)
    total++
    const bs = bi.s === 200 ? "✓" : "✗"
    if (bi.s === 200) ok++; else fail++
    console.log(`  ${bs} ${site.beachPrefix.padEnd(35)} ${bi.s} ${(bi.b + "")}B`)
    // One beach detail
    const bnames = { MQ: "plage-des-salines", GP: "plage-de-la-caravelle", FL: "miami-beach", RM: "playa-delfines", PC: "bavaro-beach" }
    const bd = await fetch(`https://${site.domain}${site.beachPrefix}${bnames[site.name]}/`)
    total++
    const ds = bd.s === 200 ? "✓" : "✗"
    if (bd.s === 200) ok++; else fail++
    console.log(`  ${ds} ${(site.beachPrefix + bnames[site.name] + "/").padEnd(35)} ${bd.s} ${(bd.b + "")}B`)
    console.log()
  }
  console.log(`\n=== RESULT: ${ok}/${total} OK, ${fail} FAIL ===`)
}
main()
