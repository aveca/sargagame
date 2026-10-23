#!/usr/bin/env node
"use strict";
// Guard the production data pipeline: public reliability must be rebuilt in the
// same workspace as the fresh archive/history and before the data commit.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/daily-copernicus.yml"), "utf8");
const fetchStart = workflow.indexOf("  fetch-data:");
const emailStart = workflow.indexOf("  email-automation:", fetchStart);
assert.notEqual(fetchStart, -1, "fetch-data job exists");
assert.notEqual(emailStart, -1, "email-automation job boundary exists");
const fetchJob = workflow.slice(fetchStart, emailStart);
const emailJob = workflow.slice(emailStart);

const backtest = fetchJob.indexOf("id: public_track_record_backtest");
const build = fetchJob.indexOf("id: public_track_record_build");
const stale = fetchJob.indexOf("name: Mark existing track record stale if regeneration fails");
const publish = fetchJob.indexOf("name: Commit + push des données Copernicus");
assert.ok(backtest >= 0 && build > backtest && stale > build && publish > stale,
  "backtest, build and stale fallback must run in order before publishing");
assert.match(fetchJob, /run: node scripts\/automation\/backtest-forecast\.cjs/);
assert.match(fetchJob, /run: node scripts\/automation\/build-track-record\.cjs/);
assert.match(fetchJob, /stale: true/, "failed regeneration must mark the existing artifact stale");
assert.match(fetchJob, /failureReason: 'Backtest or track-record build failed in the current publication run'/);
assert.match(fetchJob, /for f in climatology\.json forecast-archive\.json track-record\.json/,
  "track-record artifact remains in the data publication allowlist");
assert.doesNotMatch(emailJob, /run: node scripts\/automation\/backtest-forecast\.cjs/,
  "backtest no longer runs only in the non-publishing email job");
assert.doesNotMatch(emailJob, /run: node scripts\/automation\/build-track-record\.cjs/,
  "track-record is no longer built only in the non-publishing email job");

console.log("OK — B2B track-record is generated or marked stale before publication");
