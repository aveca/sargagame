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
assert.match(fetchJob, /if git diff --quiet "origin\/\$BRANCH" HEAD --; then/,
  "idempotence compares the entire rebased tree so track-record-only changes are published");
assert.doesNotMatch(fetchJob, /git diff --quiet "origin\/\$BRANCH" -- public\/api\/copernicus\/sargassum\.json/,
  "idempotence must not ignore changes to secondary published artifacts");
assert.doesNotMatch(emailJob, /run: node scripts\/automation\/backtest-forecast\.cjs/,
  "backtest no longer runs only in the non-publishing email job");
assert.doesNotMatch(emailJob, /run: node scripts\/automation\/build-track-record\.cjs/,
  "track-record is no longer built only in the non-publishing email job");

const hasStashStep = fetchJob.includes("git stash --include-untracked");
assert.ok(hasStashStep, "workflow includes git stash --include-untracked before rebase");

// Invariant réel : `git fetch origin "$BRANCH"` ne fait QUE mettre à jour les
// remote-tracking refs — il ne touche JAMAIS le working tree. La seule
// opération de la boucle qui MUTE le working tree est `git rebase -X theirs`,
// lequel échoue (« untracked working tree files would be overwritten ») ou
// écrase les artefacts régénérés par le pipeline si le working tree n'est pas
// stashé. Exiger `stash` AVANT `fetch` ne protège donc rien et ne reflète pas
// l'ordre du workflow (fetch → stash → rebase). Ce qui protège : le stash est
// dans la boucle, APRÈS le fetch et AVANT le rebase.
const fetchIdx = fetchJob.indexOf('git fetch origin "$BRANCH"');
const stashIdx = fetchJob.indexOf("git stash --include-untracked");
const rebaseIdx = fetchJob.indexOf('git rebase -X theirs "origin/$BRANCH"');
assert.ok(fetchIdx >= 0, "publish loop fetches the remote branch");
assert.ok(rebaseIdx >= 0, "publish loop rebases onto the remote branch");
assert.ok(stashIdx >= 0, "publish loop stashes the working tree");
// Le vrai garde-fou : le stash est AVANT le rebase (sinon le rebase casse).
assert.ok(stashIdx < rebaseIdx,
  "the worktree must be stashed BEFORE git rebase — rebase is the operation that mutates the worktree");
// Ordre nominal de la boucle : fetch, puis stash, puis rebase (rebase sur origin/).
assert.ok(fetchIdx < stashIdx,
  "nominal loop order is fetch → stash → rebase (fetch only updates remote-tracking refs)");
// Contre-régression : aucun rebase ne doit précéder le stash.
const rebaseBeforeStash = /git rebase[\s\S]{0,400}?git stash --include-untracked/.test(fetchJob.slice(0, stashIdx));
assert.ok(!rebaseBeforeStash, "no git rebase may run on an un-stashed working tree");
// Le stash est bien bordé par deux `git stash pop` (chemins de sortie) pour
// qu'un échec de boucle ne laisse pas le working tree vidé.
assert.ok((fetchJob.match(/git stash pop/g) || []).length >= 2,
  "both loop exit paths restore the stash (concurrent-run and push-failure paths)");

console.log("OK — B2B track-record is generated or marked stale before publication");
