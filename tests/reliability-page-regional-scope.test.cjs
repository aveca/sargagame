#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readBacktest } = require("../scripts/lib/reliability-page.cjs");

function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "sargagame-reliability-")); }
function writeRecord(root, record) {
  const file = path.join(root, "public", "api", "copernicus", "track-record.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record), "utf8");
}
function record(overrides = {}) {
  return {
    freshness: { stale: false },
    regions: ["tulum"],
    window: { from: "2026-10-01", to: "2026-10-20", days: 20 },
    sampleSize: 100,
    overall: { statusHitRatePct: 96, afaiMAE: 0.02 },
    byHorizon: [
      { day: 1, hitRatePct: 97, pairs: 50, avgConfidence: 80 },
      { day: 3, hitRatePct: 95, pairs: 40, avgConfidence: 60 }
    ],
    byBeach: [{ id: "tulum-playa", samples: 40, hitRatePct: 96 }],
    byRegime: { calm: { samples: 100, cleanReliabilityPct: 97, cleanSamples: 50 } },
    headline: { fr: "FR", en: "EN", es: "ES" },
    ...overrides
  };
}
const root = tempRoot();
try {
  writeRecord(root, record());
  const valid = readBacktest("tulum", root);
  assert.ok(valid, "fresh single-region record is usable");
  assert.equal(valid.scopeLabel, "TULUM");
  assert.equal(valid.overall.statusHitRate, 96);
  assert.equal(valid.byHorizon.day1.statusHitRate, 97);
  assert.equal(valid.byHorizon.day3.pairs, 40);
  assert.equal(valid.byBeach["tulum-playa"].statusHitRate, 96);
  assert.equal(valid.regimeReliability.regimes.calm.samples, 100);

  writeRecord(root, record({ freshness: { stale: true } }));
  assert.equal(readBacktest("tulum", root), null, "stale record is suppressed");

  writeRecord(root, record({ regions: ["mq", "gp"] }));
  assert.equal(readBacktest("mq", root), null, "multi-region aggregate is not presented as MQ-only accuracy");
  assert.equal(readBacktest("gp", root), null, "multi-region aggregate is not presented as GP-only accuracy");

  writeRecord(root, record({ regions: ["florida"] }));
  assert.equal(readBacktest("tulum", root), null, "out-of-scope region is suppressed");

  writeRecord(root, record({ overall: { statusHitRatePct: 101, afaiMAE: 0.02 } }));
  assert.equal(readBacktest("tulum", root), null, "invalid overall percentage is suppressed");

  writeRecord(root, record({ byHorizon: [{ day: 1, hitRatePct: 97, pairs: 50 }] }));
  assert.equal(readBacktest("tulum", root), null, "missing J+3 evidence is suppressed");

  fs.rmSync(path.join(root, "public", "api", "copernicus", "track-record.json"), { force: true });
  assert.equal(readBacktest("tulum", root), null, "missing record is suppressed");
  console.log("OK — reliability page accepts only fresh, complete, single-region public validation records");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
