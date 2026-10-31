#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");

(async () => {
  const { isTrackRecordFresh } = await import("../src/lib/track-record-freshness.js");
  const now = Date.parse("2026-10-26T12:00:00Z");
  const valid = { byRegime: { calm: { cleanSamples: 42, cleanReliabilityPct: 88 } }, freshness: { stale: false, computedAt: new Date(now - 60 * 60 * 1000).toISOString() }, window: { from: "2026-10-01", to: "2026-10-25" } };
  assert.equal(isTrackRecordFresh(valid, now), true);
  assert.equal(isTrackRecordFresh({ ...valid, freshness: { ...valid.freshness, stale: true } }, now), false);
  assert.equal(isTrackRecordFresh({ ...valid, freshness: { computedAt: valid.freshness.computedAt } }, now), false);
  assert.equal(isTrackRecordFresh({ ...valid, freshness: { stale: false, computedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString() } }, now), false);
  assert.equal(isTrackRecordFresh({ ...valid, freshness: { stale: false, computedAt: new Date(now + 10 * 60 * 1000).toISOString() } }, now), false);
  assert.equal(isTrackRecordFresh({ ...valid, window: { from: "2026-10-01", to: "2026-10-20" } }, now), false);
  assert.equal(isTrackRecordFresh({ ...valid, window: { from: "2026-10-26", to: "2026-10-01" } }, now), false);
  assert.equal(isTrackRecordFresh({ ...valid, window: { from: "2026-10-01" } }, now), false);
  console.log("OK — track-record freshness guard: 8 assertions");
})().catch(error => { console.error(error); process.exitCode = 1; });
