#!/usr/bin/env node
"use strict";
// Behavioral regression test for the public B2B reliability proof.
// Runs the inline pricing-page script in a tiny DOM/fetch sandbox (no network).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../public/pro/pricing/index.html"), "utf8");
const match = html.match(/<script>\s*\(function\(\)\{\s*\/\/ The data pipeline runs every 6 hours[\s\S]*?<\/script>/);
assert.ok(match, "pricing page contains the tested track-record script");
const script = match[0].replace(/^<script>\s*/, "").replace(/<\/script>\s*$/, "");

const NOW = Date.parse("2026-10-23T16:00:00.000Z");
class FixedDate extends Date {
  static now() { return NOW; }
}

async function render(payload, failFetch = false) {
  const classes = new Set();
  const nodes = {
    "tr-clean": { textContent: "—" },
    "tr-line": { textContent: "de nos verdicts se vérifient, tous régimes confondus." },
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

  vm.runInNewContext(script, {
    fetch,
    Date: FixedDate,
    document: {
      getElementById(id) { return nodes[id] || null; },
      querySelector(selector) { return selector === ".proofline" ? proof : null; },
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { value: nodes["tr-clean"].textContent, line: nodes["tr-line"].textContent, stale: classes.has("is-stale") };
}

const recent = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
const staleAge = new Date(NOW - 79 * 24 * 60 * 60 * 1000).toISOString();

(async () => {
  const freshOverall = await render({
    generatedAt: recent,
    freshness: { stale: false },
    overall: { statusHitRatePct: 96 },
    sampleSize: 1323,
    byRegime: { calm: { cleanReliabilityPct: 100, cleanSamples: 1050 } },
  });
  assert.equal(freshOverall.value, "96%");
  assert.match(freshOverall.line, /tous régimes confondus/);
  assert.match(freshOverall.line, /comparaisons/);
  assert.equal(freshOverall.stale, false);

  const explicitStale = await render({
    generatedAt: recent,
    freshness: { stale: true },
    overall: { statusHitRatePct: 96 },
    sampleSize: 819,
  });
  assert.equal(explicitStale.value, "—", "explicitly stale percentages must be hidden");
  assert.match(explicitStale.line, /périmé/);
  assert.equal(explicitStale.stale, true);

  const oldButMislabelledFresh = await render({
    generatedAt: staleAge,
    freshness: { stale: false },
    overall: { statusHitRatePct: 96 },
    sampleSize: 819,
  });
  assert.equal(oldButMislabelledFresh.value, "—", "an old timestamp must override a false stale flag");
  assert.match(oldButMislabelledFresh.line, /périmé/);
  assert.equal(oldButMislabelledFresh.stale, true);

  const cleanOnlyFallback = await render({
    generatedAt: recent,
    freshness: { stale: false },
    overall: { statusHitRatePct: null },
    sampleSize: null,
    byRegime: { calm: { cleanReliabilityPct: 100, cleanSamples: 1050 } },
  });
  assert.equal(cleanOnlyFallback.value, "100%");
  assert.match(cleanOnlyFallback.line, /mer propre/);
  assert.match(cleanOnlyFallback.line, /saison calme/);
  assert.doesNotMatch(cleanOnlyFallback.line, /tous régimes confondus/);

  const unavailable = await render(null, true);
  assert.equal(unavailable.value, "—");
  assert.match(unavailable.line, /indisponible/);
  assert.equal(unavailable.stale, true);

  console.log("OK — fresh metric, explicit stale, stale timestamp, honest regime label, and fetch failure");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
