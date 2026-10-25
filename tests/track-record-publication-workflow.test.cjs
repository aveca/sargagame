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
const publishStep = fetchJob.slice(publish);
assert.ok(backtest >= 0 && build > backtest && stale > build && publish > stale,
  "backtest, build and stale fallback must run in order before publishing");
assert.match(fetchJob, /run: node scripts\/automation\/backtest-forecast\.cjs/);
assert.match(fetchJob, /run: node scripts\/automation\/build-track-record\.cjs/);
assert.match(fetchJob, /stale: true/, "failed regeneration must mark the existing artifact stale");
assert.ok(fetchJob.includes("if: steps.src.outputs.source != 'none' && (steps.verify.outcome != 'success' || steps.public_track_record_backtest.outcome != 'success' || steps.public_track_record_build.outcome != 'success')"),
  "a failed integrity gate must also mark the public track record stale");
assert.match(fetchJob, /failureReason: 'Data integrity gate, backtest, or track-record build failed in the current publication run'/);
assert.match(fetchJob, /for f in climatology\.json forecast-archive\.json track-record\.json/,
  "track-record artifact remains in the data publication allowlist");
assert.ok(publishStep.includes("INTEGRITY_OUTCOME: ${{ steps.verify.outcome }}"),
  "publication must know whether the integrity gate passed");
const integrityFailurePublish = publishStep.split(/^\s*else\s*$/m)[0];
const integritySuccessPublish = publishStep.split(/^\s*else\s*$/m)[1] || "";
assert.ok(integrityFailurePublish.includes("git add public/api/copernicus/track-record.json"),
  "failed integrity gate may publish only the stale track-record marker");
assert.ok(!integrityFailurePublish.includes("git add public/api/copernicus/sargassum.json"),
  "failed integrity gate must not publish untrusted satellite data");
assert.ok(integritySuccessPublish.includes("git add public/api/copernicus/sargassum.json"),
  "validated data is still published normally");

// A failed integrity gate deliberately stages only track-record.json. The fetcher may
// still have written rejected generated payloads into the worktree; clean those leftovers
// after the allowlisted commit and before fetch/rebase, or Git refuses the rebase as dirty.
const commitAt = publishStep.indexOf('git commit -m "chore(data): refresh Copernicus');
const stashAt = publishStep.indexOf("git stash push --include-untracked");
const fetchAt = publishStep.indexOf('git fetch origin "$BRANCH"');
assert.ok(commitAt >= 0 && stashAt > commitAt && fetchAt > stashAt,
  "residual generated artifacts must be stashed after the allowlisted commit and before rebase");
assert.ok(publishStep.includes('if ! git diff --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then'),
  "worktree cleanup runs only when tracked or untracked residual changes exist");
assert.match(fetchJob, /if git diff --quiet "origin\/\$BRANCH" HEAD --; then/,
  "idempotence compares the entire rebased tree so track-record-only changes are published");
assert.doesNotMatch(fetchJob, /git diff --quiet "origin\/\$BRANCH" -- public\/api\/copernicus\/sargassum\.json/,
  "idempotence must not ignore changes to secondary published artifacts");
assert.doesNotMatch(emailJob, /run: node scripts\/automation\/backtest-forecast\.cjs/,
  "backtest no longer runs only in the non-publishing email job");
assert.doesNotMatch(emailJob, /run: node scripts\/automation\/build-track-record\.cjs/,
  "track-record is no longer built only in the non-publishing email job");

console.log("OK — B2B track-record is generated or marked stale before publication");
