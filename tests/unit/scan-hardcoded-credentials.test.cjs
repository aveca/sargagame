#!/usr/bin/env node
"use strict"

/**
 * Fail-closed guard for the hardcoded-credential scanner (P0.67 section 1).
 *
 * The deployed sg-payments Worker was found carrying a hardcoded bearer
 * literal with an env-var fallback. Nothing in this repository ever looked for
 * a secret written in source. scripts/scan-hardcoded-credentials.cjs does.
 *
 * These tests prove both directions:
 *   - a real credential in executable code IS reported (fail-closed);
 *   - documentation examples, test fixtures and generated-code strings are
 *     NOT reported (no false-positive noise that would train people to ignore it).
 *
 * No real credential value is ever read, printed or asserted: probes use
 * obviously synthetic strings, and every assertion is on counts and rule names.
 */

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { main, scanFile, mask, shouldScan, RULES, PLACEHOLDER, PLACEHOLDER_PREFIX, ALLOWLIST } =
  require("../../scripts/scan-hardcoded-credentials.cjs")

const ROOT = path.resolve(__dirname, "../..")
const REAL = "aB3dE6gH9jK2mN5pQ8rS1tU4vW7xY0zA3bC6dE9f" // synthetic only

function probeTo(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "credscan-" + name + "-"))
  const file = path.join(dir, "probe.js")
  fs.writeFileSync(file, text, "utf8")
  return { dir, file }
}

function rulesFound(file) {
  return scanFile(file).map((finding) => finding.rule)
}

async function main2() {
  // ------------------------------------------------- fail-closed: must report
  const positives = [
    ["bearer literal assignment", "const NAMECHEAP_BEARER = \"" + REAL + "\"\n", "bearer-secret-assignment"],
    ["token literal assignment", "const MAIL_TOKEN='" + REAL + "';\n", "bearer-secret-assignment"],
    ["authorization header literal", "headers: { Authorization: \"Bearer " + REAL + "\" }\n", "authorization-bearer-literal"],
    ["quoted bearer literal", "const h = \"Bearer " + REAL + "\"\n", "inline-bearer-literal"],
    ["stripe live secret", "const k = \"sk_live_" + REAL.slice(0, 24) + "\"\n", "stripe-live-secret"],
    ["private key block", "const key = \"-----BEGIN RSA PRIVATE KEY-----\"\n", "private-key-block"],
  ]

  for (const [name, text, expectedRule] of positives) {
    const { dir, file } = probeTo("pos", text)
    try {
      const rules = rulesFound(file)
      assert.ok(rules.includes(expectedRule), name + " must be reported by rule " + expectedRule + ", got " + JSON.stringify(rules))
      assert.equal(rules.length, 1, name + " must be reported exactly once")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  // --------------------------------------------- must NOT report (no noise)
  const negatives = [
    ["documented example inside a block comment", "/*\n * NAMECHEAP_BEARER=\"" + REAL + "\"\n */\n"],
    ["documented example on a line comment", "// const TOKEN = \"" + REAL + "\"\n"],
    ["explicit test fixture", "const options = { MOLLIE_API_KEY: \"test_owner_key\" }\n"],
    ["placeholder marker", "const TOKEN = \"<your-token-here>\"\n"],
    ["environment indirection", "const TOKEN = process.env.MOLLIE_API_KEY || \"\"\n"],
    ["generated code inside a template literal",
      "const snippet = `  if(onReady)fetch(\"https://host/mp/collect?mid=\"+mid+\"&api_secret=\"+sec,JSON.stringify({client_id:cid}));`\n"],
    ["path with a secret-looking variable name", "const url = \"https://api.example.com/v2/webhooks?api_secret=\"+sec\n"],
    ["value in a string that is never assigned", "const msg = \"set NAMECHEAP_BEARER before running\"\n"],
  ]

  for (const [name, text] of negatives) {
    const { dir, file } = probeTo("neg", text)
    try {
      assert.deepEqual(rulesFound(file), [], name + " must not be reported")
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  // ------------------------------------------- line-ending agnostic mapping
  // split() eats the optional CR, so a per-line offset computed as
  // "length + 1" drifts out of true on a CRLF worktree. A drifted index makes
  // the classifier read the wrong character, which can drop a real secret.
  {
    const secret = REAL
    for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
      const src = [
        "// note",
        "const a = 1",
        "const NAMECHEAP_BEARER = \"" + secret + "\"",
      ].join(eol) + eol
      const { dir, file } = probeTo("eol-" + label, src)
      try {
        const findings = scanFile(file)
        assert.equal(findings.length, 1, label + ": a real credential must still be reported")
        assert.equal(findings[0].rule, "bearer-secret-assignment", label + ": correct rule")
        assert.equal(findings[0].line, 3, label + ": correct line number")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
    // The same credential after comment content on the same line style must
    // NOT be reported: that is the drifted-index failure mode.
    for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
      const src = [
        "// NAMECHEAP_BEARER = \"" + secret + "\"",
        "const a = 1",
      ].join(eol) + eol
      const { dir, file } = probeTo("eol-comment-" + label, src)
      try {
        assert.deepEqual(scanFile(file), [], label + ": a documented example must stay unreported")
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  }

  // ------------------------------------------------------ redaction contract
  assert.equal(mask(""), "<empty>")
  assert.equal(mask("short"), "*****")
  const long = "a".repeat(40)
  assert.ok(!mask(long).includes("a".repeat(9)), "mask must not expose a long run of the secret")
  assert.equal(mask(long).length, 20, "mask keeps a fixed-length fingerprint")

  // ------------------------------------------------------------ repo hygiene
  assert.equal(main(), 0, "this repository currently carries no hardcoded credential")
  assert.ok(ALLOWLIST.some((entry) => entry.endsWith("scan-hardcoded-credentials.cjs")),
    "the scanner and its own test must be allowlisted")
  assert.ok(PLACEHOLDER.test("<token>"), "angle-bracket placeholders are placeholders")
  assert.ok(PLACEHOLDER_PREFIX.test("test_owner_key"), "test_* fixtures are placeholders")
  assert.ok(RULES.length >= 5, "the rule set covers assignment, bearer, provider and key material")

  // The scanner must skip dependency and build output so a full run stays fast
  // and never reports a vendored file.
  assert.equal(shouldScan(path.join(ROOT, "node_modules", "x", "index.js")), false)
  assert.equal(shouldScan(path.join(ROOT, "dist", "assets", "index.js")), false)
  assert.equal(shouldScan(path.join(ROOT, "config.example.js")), false)

  console.log("scan-hardcoded-credentials: fail-closed on real secrets, silent on fixtures")
}

main2().catch((error) => {
  console.error(error)
  process.exit(1)
})
