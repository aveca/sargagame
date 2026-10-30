const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

async function main() {
  const { isLocalAnalyticsHost, shouldSendRemoteAnalytics } = await import("../../src/lib/remote-analytics.mjs")

  for (const host of ["localhost", "localhost.", "preview.localhost", "127.0.0.1", "127.2.3.4", "::1", "[::1]", "0.0.0.0", ""]) {
    assert.equal(isLocalAnalyticsHost(host), true, host + " must be local")
    assert.equal(shouldSendRemoteAnalytics(host), false, host + " must not send remote analytics")
  }
  for (const host of ["sargasses-martinique.com", "sargazotulum.com", "example.org"]) {
    assert.equal(isLocalAnalyticsHost(host), false, host + " must be production-like")
    assert.equal(shouldSendRemoteAnalytics(host), true, host + " must keep remote analytics")
  }
  assert.equal(shouldSendRemoteAnalytics("localhost", true), true, "explicit local opt-in remains possible")

  const root = path.resolve(__dirname, "../..")
  const supabase = fs.readFileSync(path.join(root, "src/supabasePhotos.js"), "utf8")
  const app = fs.readFileSync(path.join(root, "src/Sargasses_PROD.jsx"), "utf8")
  const frustration = fs.readFileSync(path.join(root, "src/useFrustrationDetection.js"), "utf8")

  assert.match(supabase, /export function isRemoteAnalyticsEnabled\(\)/)
  assert.match(supabase, /!isRemoteAnalyticsEnabled\(\).*supabaseConfigured/)
  assert.match(app, /const remoteEnabled=isRemoteAnalyticsEnabled\(\)/)
  assert.match(app, /if\(remoteEnabled\)try\{window\.gtag/)
  assert.doesNotMatch(app, /api_secret|mp.collect/i, "browser source must not contain a client-side Measurement Protocol credential")
  assert.match(app, /if\(remoteEnabled&&critical\)\{/)
  assert.match(app, /if\(!isRemoteAnalyticsEnabled\(\)\|\|!window\.gtag\)return/)
  assert.match(frustration, /if \(!isRemoteAnalyticsEnabled\(\)\) return/)

  console.log("PASS: loopback/local preview never sends remote analytics; production hosts remain enabled")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
