#!/usr/bin/env node
"use strict";
// Packaging invariant: a file may only be dropped from the per-region payload
// when it actually HAS a regional variant (public/api/copernicus/<region>/...).
// The regional loop after the purge re-copies only files that exist for the
// built region, so a GLOBAL artifact purged here is deleted from the domain
// (404) — which is what happened to /api/copernicus/track-record.json on
// florida / puntacana / rivieramaya / tulum (paywall without reliability
// proof) since 2bc0ddc23 classified it as a regional overlay.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const prepare = fs.readFileSync(path.join(root, "scripts/prepare-ftp.cjs"), "utf8");
const copernicusRoot = path.join(root, "public", "api", "copernicus");

// Region of prepare-ftp the purge lives in: prepareNewRegion (per-region
// payloads). The shared MQ/GP legacy path copies dist/ wholesale and is not
// affected — that is why sargasses-martinique.com still answers 200.
const newRegionStart = prepare.indexOf("function prepareNewRegion(region)");
assert.notEqual(newRegionStart, -1, "prepareNewRegion exists");
const newRegion = prepare.slice(newRegionStart);
const purgeIdx = newRegion.indexOf("const REGION_SPECIFIC_OVERLAYS = [");
assert.notEqual(purgeIdx, -1, "REGION_SPECIFIC_OVERLAYS is declared in prepareNewRegion");
const purgeLineEnd = newRegion.indexOf("]", purgeIdx);
const purgeDecl = newRegion.slice(purgeIdx, purgeLineEnd);
const purged = [...purgeDecl.matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.ok(purged.length > 0, "at least one regional overlay is declared");

const regionDirNames = fs.readdirSync(copernicusRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// 1. Every purged entry must have at least one regional variant — otherwise it
//    is a global artifact and the purge removes it from the domain forever.
for (const entry of purged) {
  const variants = regionDirNames.filter((r) => fs.existsSync(path.join(copernicusRoot, r, entry)));
  assert.ok(variants.length > 0,
    `'${entry}' is purged but has no public/api/copernicus/<region>/ variant — ` +
    `it is a GLOBAL artifact and must not be in REGION_SPECIFIC_OVERLAYS`);
}

// 2. The three artifacts that broke production must be preserved.
for (const globalArtifact of ["track-record.json", "forecast-archive.json", "forecast-accuracy.json"]) {
  assert.ok(!purged.includes(globalArtifact),
    `${globalArtifact} is a global artifact (regions: mq/gp) and must be served as-is on every domain`);
  assert.ok(fs.existsSync(path.join(copernicusRoot, globalArtifact)),
    `${globalArtifact} must exist at the global copernicus root for dist/ to ship it`);
}

// 3. The regional loop must re-copy the files it is allowed to purge.
const regionalLoop = newRegion.slice(newRegion.indexOf("for (const f of ['sargassum.json'"));
for (const entry of purged) {
  assert.ok(regionalLoop.includes(`'${entry}'`),
    `'${entry}' is purged but never re-copied by the regional loop`);
}

// 4. Fail-closed guard: the invariant is enforced in the script itself, not
//    only in this test.
assert.match(newRegion, /const hasRegionalVariant =/,
  "prepare-ftp must check that each purged entry has a regional variant");
assert.match(newRegion, /throw new Error\(`prepare-ftp: '\$\{entry\}'/,
  "a misclassified global artifact must fail the packaging instead of 404-ing in production");

console.log("OK — regional overlays purge only files that have a regional variant (globals preserved)");