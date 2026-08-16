#!/usr/bin/env node
const https = require("https")
function check(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 8000 }, (res) => {
      const h = res.headers
      console.log(url.replace("https://sargasses-martinique.com", ""))
      console.log("  status:", res.statusCode)
      console.log("  cache-control:", h["cache-control"] || "(none)")
      console.log("  cf-cache-status:", h["cf-cache-status"] || "(none)")
      console.log("  etag:", h["etag"] || "(none)")
      console.log("  last-modified:", h["last-modified"] || "(none)")
      console.log("  server:", h["server"] || "(none)")
      console.log("  x-powered-by:", h["x-powered-by"] || "(none)")
      console.log("  age:", h["age"] || "(none)")
      res.resume()
      resolve()
    }).on("error", (e) => { console.log(url, "ERR:", e.code); resolve() })
  })
}
async function main() {
  await check("https://sargasses-martinique.com/")
  await check("https://sargasses-martinique.com/version.json")
  await check("https://sargasses-martinique.com/assets/index-BKMVGTdx.js")
}
main()
