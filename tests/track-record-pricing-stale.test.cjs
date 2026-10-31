#!/usr/bin/env node
"use strict";
// Behavioral regression test for the public B2B reliability proof.
// Runs the inline pricing-page script with the shared freshness contract and a tiny DOM/fetch sandbox.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const helperSource = fs.readFileSync(path.join(__dirname, "../public/b2b-data-freshness.js"), "utf8");

const html = fs.readFileSync(path.join(__dirname, "../public/pro/pricing/index.html"), "utf8");
const match = html.match(/<script>\s*\(function\(\)\{\s*\/\/ A public rate is shown only for a fresh record that explicitly covers MQ\.[\s\S]*?<\/script>/);
assert.ok(match, "pricing page contains the shared-helper track-record script");
const script = match[0].replace(/^<script>\s*/, "").replace(/<\/script>\s*$/, "");

const NOW = Date.parse("2026-10-23T16:00:00.000Z");
class FixedDate extends Date {
  static now() { return NOW; }
}

function record(overrides = {}) {
  return {
    generatedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    freshness: { stale: false },
    regions: ["mq", "gp"],
    window: { from: "2026-10-01", to: "2026-10-23" },
    sampleSize: 1323,
    overall: { statusHitRatePct: 96 },
    ...overrides
  };
}

async function render(payload, failFetch = false) {
  const classes = new Set();
  const nodes = {
    "tr-clean": { textContent: "—" },
    "tr-line": { textContent: "Taux global du palmarès public, affiché uniquement si le record est frais et couvre la région." },
  };
  const proof = {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
  };
  const fetch = () => failFetch
    ? Promise.reject(new Error("offline"))
    : Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });

  const sandbox = {
    fetch,
    Date: FixedDate,
    window: {},
    document: {
      getElementById(id) { return nodes[id] || null; },
      querySelector(selector) { return selector === ".proofline" ? proof : null; },
    },
  };
  // Load the browser helper in the same realm so its Date.now() uses FixedDate.
  vm.runInNewContext(helperSource, sandbox);
  assert.ok(sandbox.window.SargagameB2BFreshness && typeof sandbox.window.SargagameB2BFreshness.getTrackRecordState === "function", "browser helper must expose its public contract");
  vm.runInNewContext(script, sandbox);
  await new Promise(resolve => setImmediate(resolve));
  return { value: nodes["tr-clean"].textContent, line: nodes["tr-line"].textContent, stale: classes.has("is-stale") };
}

(async () => {
  const freshOverall = await render(record());
  assert.equal(freshOverall.value, "96%");
  assert.match(freshOverall.line, /périmètre MQ \+ GP/);
  assert.match(freshOverall.line, /comparaisons datées/);
  assert.equal(freshOverall.stale, false);

  const explicitStale = await render(record({ freshness: { stale: true } }));
  assert.equal(explicitStale.value, "—", "explicitly stale percentages must be hidden");
  assert.match(explicitStale.line, /périmé/);
  assert.equal(explicitStale.stale, true);

  const oldButMislabelledFresh = await render(record({ generatedAt: new Date(NOW - 79 * 24 * 60 * 60 * 1000).toISOString() }));
  assert.equal(oldButMislabelledFresh.value, "—", "an old timestamp must override a false stale flag");
  assert.match(oldButMislabelledFresh.line, /périmé/);
  assert.equal(oldButMislabelledFresh.stale, true);

  const outOfScope = await render(record({ regions: ["gp"] }));
  assert.equal(outOfScope.value, "—", "a record that does not cover MQ must not be shown on the MQ page");
  assert.match(outOfScope.line, /ne couvre pas la région/);
  assert.equal(outOfScope.stale, true);

  const cleanOnlyFallback = await render(record({
    overall: { statusHitRatePct: null },
    byRegime: { calm: { cleanReliabilityPct: 100, cleanSamples: 1050 } },
  }));
  assert.equal(cleanOnlyFallback.value, "100%");
  assert.match(cleanOnlyFallback.line, /mer propre/);
  assert.match(cleanOnlyFallback.line, /saison calme/);

  const unavailable = await render(null, true);
  assert.equal(unavailable.value, "—");
  assert.match(unavailable.line, /indisponible/);
  assert.equal(unavailable.stale, true);

  const impossibleHigh = await render(record({
    overall: { statusHitRatePct: 101 },
    byRegime: { calm: { cleanReliabilityPct: 101, cleanSamples: 1050 } },
  }));
  assert.equal(impossibleHigh.value, "—", "percentages above 100 must never be published");
  assert.match(impossibleHigh.line, /sans métrique exploitable/);
  assert.equal(impossibleHigh.stale, true);

  const impossibleNegative = await render(record({
    overall: { statusHitRatePct: -1 },
    byRegime: { calm: { cleanReliabilityPct: -1, cleanSamples: 1050 } },
  }));
  assert.equal(impossibleNegative.value, "—", "negative percentages must never be published");
  assert.match(impossibleNegative.line, /sans métrique exploitable/);
  assert.equal(impossibleNegative.stale, true);

  console.log("OK — fresh, stale, expired, out-of-scope, regime fallback, fetch failure and invalid percentage cases");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
