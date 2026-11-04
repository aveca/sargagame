const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "../../src/SOSPlage.jsx"), "utf8")

assert.ok(
  source.includes('redirectUrl: origin + "/?mollie_return=1",'),
  "SOS Mollie checkout must return through the shared Mollie confirmation handler"
)
assert.ok(
  !source.includes('redirectUrl: origin + "/?sos_success=1",'),
  "SOS checkout must not use the unsupported sos_success return parameter"
)

console.log("SOS Mollie return route: OK")
