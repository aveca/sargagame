#!/usr/bin/env node
const https = require("https")
function fetch(u) {
  return new Promise(r => {
    https.get(u, { timeout: 8000 }, res => {
      let d = ""
      res.on("data", c => d += c.slice(0, 500))
      res.on("end", () => r({ s: res.statusCode, b: d.length }))
    }).on("error", e => r({ s: 0, e: e.code }))
      .on("timeout", function () { this.destroy(); r({ s: 0, e: "TO" }) })
  })
}
async function main() {
  const checks = [
    ["FL /beaches/", "https://sargassummiami.com/beaches/"],
    ["FL /beaches/miami-beach/", "https://sargassummiami.com/beaches/miami-beach/"],
    ["RM /playas/", "https://sargassumcancun.com/playas/"],
    ["RM /playas/playa-delfines/", "https://sargassumcancun.com/playas/playa-delfines/"],
    ["PC /beaches/", "https://sargassumpuntacana.com/beaches/"],
    ["PC /beaches/bavaro-beach/", "https://sargassumpuntacana.com/beaches/bavaro-beach/"],
    ["MQ /plages/", "https://sargasses-martinique.com/plages/"],
    ["GP /plages/", "https://sargasses-guadeloupe.com/plages/"],
    ["FL /resorts/", "https://sargassummiami.com/resorts/"],
    ["PC /resorts/", "https://sargassumpuntacana.com/resorts/"],
  ]
  for (const [name, u] of checks) {
    const r = await fetch(u)
    console.log(name.padEnd(35), r.s, r.b + (r.e ? " " + r.e : ""))
  }
}
main()
