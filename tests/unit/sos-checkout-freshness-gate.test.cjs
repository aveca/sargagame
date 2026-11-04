#!/usr/bin/env node
"use strict"

/**
 * SOS Plage payment freshness gate (mission P0.67 section 5).
 *
 * Contract under test (src/SOSPlage.jsx handleBuy):
 *   - the freshness guard runs BEFORE window.__sosHandleBuyCalled,
 *     BEFORE analytics tracking and BEFORE POST /api/mollie;
 *   - stale / unknown / non-live observation => zero tracking, zero POST;
 *   - fresh observation => existing mocked checkout behavior preserved.
 *
 * The guard is exercised for real: handleBuy is extracted from the component
 * source and executed against stubbed globals, with beach objects produced by
 * the real enrichSosBeaches() contract (src/lib/sos-observation-state.mjs).
 * No network, no real payment, no secret involved.
 */

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const NOW = Date.parse("2026-11-03T11:22:00Z")

function freshPayload() {
  return {
    source: "erddap-live",
    stale: false,
    erddapTimestamp: "2026-11-03T10:00:00Z",
    updatedAt: "2026-11-03T11:22:00Z",
    levels: [{
      id: "mq001",
      status: "clean",
      confidence: 0,
      afai: 0,
      forecast: [{ status: "moderate" }],
    }],
  }
}

/**
 * Extract the real handleBuy from src/SOSPlage.jsx and return an executable
 * function with the same behaviour.
 *
 * The capture is `async () => {` ... `}` where the closing `}` is the literal
 * one inside the `\n  }, [deps]` terminator, so the captured group is EXACTLY
 * the arrow body content. It must be wrapped back in `{ ... }` and nothing
 * else: stripping a trailing brace from the capture deletes the inner block's
 * own closer (the `finally` block), which only ever produced valid code when a
 * trailing CR accidentally blocked the strip.
 *
 * Line endings are normalised first so the extraction is identical on the LF
 * blob CI checks out and on a CRLF Windows worktree.
 */
function extractHandleBuy(sosSource) {
  const normalised = sosSource.replace(/\r\n/g, "\n")
  const match = normalised.match(/const handleBuy = useCallback\(async \(\) => \{([\s\S]*?)\n {2}\}, \[/)
  if (!match) {
    throw new Error("handleBuy extraction failed: source shape changed")
  }
  const body = match[1]
  const source = "return (async () => {" + body + "})()"
  let factory
  try {
    factory = new Function(
      "selectedBeach", "checkoutLoading", "lang", "setCheckoutLoading", "setCheckoutBlocked",
      "track", "window", "alert", "_t", "fetch",
      source
    )
  } catch (error) {
    throw new Error(
      "handleBuy extraction produced uncompilable source (" + error.message + "): " +
      "the closing brace of an inner block was dropped. Keep the capture whole."
    )
  }
  if (typeof factory !== "function") {
    throw new Error("handleBuy extraction produced no function: source shape changed")
  }
  return factory
}

function runHandleBuy(factory, beach, lang) {
  const calls = { tracks: [], fetches: [], alerts: [], blocked: [] }
  const windowStub = { location: { origin: "https://sargasses-martinique.com", href: "" } }
  const trackStub = (name, params) => calls.tracks.push({ name, params })
  const fetchStub = (url, init) => {
    calls.fetches.push({ url, method: init && init.method, body: init && init.body })
    return Promise.resolve({
      ok: true,
      json: async () => ({ checkoutUrl: "https://www.mollie.com/pay/redirect", paymentId: "tr_TEST" }),
    })
  }
  const pending = factory(
    beach, false, lang || "fr",
    () => {},
    (value) => calls.blocked.push(value),
    trackStub, windowStub,
    (message) => calls.alerts.push(message),
    (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr),
    fetchStub
  )
  return Promise.resolve(pending).then(() => ({ calls, windowStub }))
}

async function main() {
  const root = path.resolve(__dirname, "../..")
  const sosSource = fs.readFileSync(path.join(root, "src", "SOSPlage.jsx"), "utf8")
  const { enrichSosBeaches } = await import("../../src/lib/sos-observation-state.mjs")

  // ---------------------------------------------------------------- ordering
  // The mission requires the freshness check BEFORE each of these three.
  const factory0 = extractHandleBuy(sosSource)
  assert.equal(typeof factory0, "function", "the extracted handleBuy must be a usable function")

  // The capture is the arrow body content, so it must be brace-balanced on its
  // own. A previous version stripped the last brace of the capture, which
  // deleted the `finally` closer and only compiled by accident when a trailing
  // CR blocked the strip - a false pass on Windows, a SyntaxError on CI.
  {
    const normalised = sosSource.replace(/\r\n/g, "\n")
    const captured = normalised.match(/const handleBuy = useCallback\(async \(\) => \{([\s\S]*?)\n {2}\}, \[/)[1]
    let depth = 0
    let minimum = 0
    for (const ch of captured) {
      if (ch === "{") depth += 1
      if (ch === "}") depth -= 1
      if (depth < minimum) minimum = depth
    }
    assert.equal(depth, 0, "the captured handleBuy body must close every block it opens")
    assert.equal(minimum, 0, "the captured handleBuy body must never close a block it did not open")
  }

  const guardIndex = sosSource.indexOf("selectedBeach.observationCurrent !== true")
  const markIndex = sosSource.indexOf("window.__sosHandleBuyCalled = true")
  const trackIndex = sosSource.indexOf('track("sg_sos_checkout_start"')
  const postIndex = sosSource.indexOf('fetch("/api/mollie"')
  assert.ok(guardIndex > -1, "handleBuy must contain the observationCurrent freshness guard")
  assert.ok(markIndex > -1 && trackIndex > -1 && postIndex > -1, "handleBuy must keep the marker, the tracking and the payment POST")
  assert.ok(guardIndex < markIndex, "freshness guard must run BEFORE window.__sosHandleBuyCalled")
  assert.ok(guardIndex < trackIndex, "freshness guard must run BEFORE analytics tracking")
  assert.ok(guardIndex < postIndex, "freshness guard must run BEFORE POST /api/mollie")
  assert.ok(
    !/observationCurrent\s*&&\s*typeof window !== "undefined" && window\.__sosHandleBuyCalled/.test(sosSource),
    "the guard must be an early return, not a soft condition"
  )

  // --------------------------------------------------------------- behavior
  const factory = extractHandleBuy(sosSource)
  const beaches = [{ id: "mq001", island: "mq", name: "Grande Anse" }]

  const dataCases = [
    ["stale observation", { ...freshPayload(), stale: true }],
    ["non-live source", { ...freshPayload(), source: "cached" }],
    ["missing levels => unknown", { ...freshPayload(), levels: [] }],
    ["missing timestamp => unknown", { ...freshPayload(), erddapTimestamp: undefined }],
    ["invalid timestamp => unknown", { ...freshPayload(), erddapTimestamp: "not-a-date" }],
    ["future timestamp => unknown", { ...freshPayload(), erddapTimestamp: "2026-11-03T12:00:00Z" }],
    ["old observation => stale", { ...freshPayload(), erddapTimestamp: "2026-11-02T20:00:00Z" }],
  ]

  for (const [name, payload] of dataCases) {
    const [beach] = enrichSosBeaches(beaches, payload, "mq", NOW)
    assert.equal(beach.status, "unknown", name + ": enrich must fail closed")
    const { calls, windowStub } = await runHandleBuy(factory, beach, "fr")
    assert.equal(calls.fetches.length, 0, name + ": no POST /api/mollie must be issued")
    assert.equal(calls.tracks.length, 0, name + ": no analytics event must be emitted")
    assert.equal(windowStub.__sosHandleBuyCalled, undefined, name + ": no payment marker must be set")
    assert.equal(calls.alerts.length, 0, name + ": no payment error must be raised")
    assert.deepEqual(calls.blocked, [true], name + ": the blocked notice must be shown once")
  }

  // Fresh observation: the mocked checkout path is preserved end to end.
  for (const lang of ["fr", "en", "es"]) {
    const [beach] = enrichSosBeaches(beaches, freshPayload(), "mq", NOW)
    assert.equal(beach.observationCurrent, true, "fresh observation must be current")
    const { calls, windowStub } = await runHandleBuy(factory, beach, lang)
    assert.equal(windowStub.__sosHandleBuyCalled, true, lang + ": fresh checkout must set the marker")
    assert.equal(calls.fetches.length, 1, lang + ": exactly one POST /api/mollie")
    assert.equal(calls.fetches[0].method, "POST", lang + ": payment POST")
    assert.equal(calls.fetches[0].url, "/api/mollie", lang + ": payment endpoint")
    const body = JSON.parse(calls.fetches[0].body)
    assert.equal(body.action, "create_payment", lang + ": create_payment action preserved")
    assert.equal(body.pass, "sos", lang + ": sos pass preserved")
    assert.equal(body.cents, 100, lang + ": 1 EUR offer preserved")
    assert.equal(body.cur, "eur", lang + ": EUR preserved")
    assert.equal(body.source, "sos_plage", lang + ": source preserved")
    assert.equal(body.lang, lang, lang + ": lang preserved")
    assert.equal(body.redirectUrl, "https://sargasses-martinique.com/?sos_success=1", lang + ": redirect preserved")
    const names = calls.tracks.map((entry) => entry.name)
    assert.deepEqual(names, ["sg_sos_checkout_start", "sg_sos_redirect"], lang + ": checkout tracking preserved")
    assert.equal(windowStub.location.href, "https://www.mollie.com/pay/redirect", lang + ": redirect to checkout")
    assert.deepEqual(calls.blocked, [false], lang + ": blocked notice must be cleared")
  }

  // A blocked notice must exist in the UI so the click is never a silent no-op.
  assert.ok(
    sosSource.includes('data-testid="sos-checkout-blocked"'),
    "a blocked checkout must show an explicit notice"
  )

  console.log("sos-checkout-freshness-gate: stale/unknown/non-live blocked, fresh preserved")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
