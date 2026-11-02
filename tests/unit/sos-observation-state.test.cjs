#!/usr/bin/env node
"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

async function main() {
  const { enrichSosBeaches } = await import("../../src/lib/sos-observation-state.mjs")
  const root = path.resolve(__dirname, "../..")
  const sosSource = fs.readFileSync(path.join(root, "src/SOSPlage.jsx"), "utf8")
  assert.ok(sosSource.includes("enrichSosBeaches(sourceList, sargRes, region)"), "SOS UI must use the validated observation helper")
  assert.doesNotMatch(sosSource, /lvl\?\.status\s*\|\|\s*["\x27]clean["\x27]/, "missing levels must never default to clean")
  assert.doesNotMatch(sosSource, /lvl\?\.confidence\s*\|\|\s*70/, "missing confidence must never be invented")
  assert.doesNotMatch(sosSource, /lvl\?\.afai\s*\|\|\s*0/, "missing AFAI must never be invented")
  assert.ok(sosSource.includes("data-testid=\"sos-observation-unverified\""), "unknown observations must show a visible status notice")
  assert.doesNotMatch(sosSource, /Satellite 4×\/day|Satellite 4×\/jour|Satélite 4×\/día/, "SOS copy must not promise an unsupported satellite cadence")
  
  const now = Date.parse("2026-11-02T12:00:00Z")
  const beaches = [
    { id: "mq001", island: "mq", name: "Grande Anse" },
    { id: "gp001", island: "gp", name: "Grande Anse GP" },
  ]
  const fresh = {
    source: "erddap-live",
    stale: false,
    erddapTimestamp: "2026-11-02T10:00:00Z",
    updatedAt: "2026-11-02T12:00:00Z",
    levels: [{
      id: "mq001",
      status: "clean",
      confidence: 0,
      afai: 0,
      forecast: [{ status: "moderate" }, { status: "unsupported" }],
    }],
  }

  const current = enrichSosBeaches(beaches, fresh, "mq", now)
  assert.equal(current.length, 1, "only the requested region is returned")
  assert.equal(current[0].status, "clean", "a valid current ERDDAP level keeps its real status")
  assert.equal(current[0].confidence, 0, "zero confidence is preserved, never replaced by a default")
  assert.equal(current[0].afai, 0, "zero AFAI is preserved")
  assert.deepEqual(current[0].forecast, [{ status: "moderate" }], "unsupported forecast statuses are removed")
  assert.equal(current[0].observationCurrent, true)

  const cases = [
    ["stale flag", { ...fresh, stale: true }],
    ["non-live source", { ...fresh, source: "cached" }],
    ["missing source", { ...fresh, source: undefined }],
    ["missing timestamp", { ...fresh, erddapTimestamp: undefined }],
    ["invalid timestamp", { ...fresh, erddapTimestamp: "not-a-date" }],
    ["future timestamp", { ...fresh, erddapTimestamp: "2026-11-02T13:00:00Z" }],
    ["old observation despite recent republish", { ...fresh, erddapTimestamp: "2026-11-01T20:00:00Z" }],
    ["missing levels", { ...fresh, levels: undefined }],
    ["empty levels", { ...fresh, levels: [] }],
    ["missing beach level", { ...fresh, levels: [{ id: "other", status: "clean" }] }],
    ["unsupported beach status", { ...fresh, levels: [{ id: "mq001", status: "unknown" }] }],
  ]

  for (const [name, data] of cases) {
    const [result] = enrichSosBeaches(beaches, data, "mq", now)
    assert.equal(result.status, "unknown", name + " must not become a clean verdict")
    assert.equal(result.confidence, null, name + " must not invent confidence")
    assert.equal(result.afai, null, name + " must not invent AFAI")
    assert.deepEqual(result.forecast, [], name + " must not expose a current forecast")
    assert.equal(result.observationCurrent, false)
  }

  console.log("sos-observation-state: all fail-closed cases passed")
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
