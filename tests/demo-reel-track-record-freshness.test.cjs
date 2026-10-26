#!/usr/bin/env node
"use strict";
// Prevent stale or unsupported reliability claims in the interactive showcase.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "DemoReel.jsx"), "utf8");

assert.match(
  source,
  /if \(!d \|\| !d\.byRegime \|\| !d\.freshness \|\| d\.freshness\.stale !== false\)/,
  "the public proof must fail closed when freshness metadata is missing or stale"
);
assert.match(
  source,
  /if \(proof\) list\.push\(\{ id: "s4_registre", dur: 7 \}\)/,
  "the public-record scene must be omitted when the proof is unavailable"
);
assert.doesNotMatch(
  source,
  /76\s*%\s*à\s*79\s*%|76\s*%\s*to\s*79\s*%|76\s*%\s*a\s*79\s*%|76\s*-\s*79\s*%/i,
  "the showcase must not hardcode a stale global accuracy range"
);
assert.match(source, /Résultats mesurés/);
assert.match(source, /Measured results/);
assert.match(source, /Resultados medidos/);

console.log("OK — demo track-record claims are freshness-gated and no longer hardcoded");
