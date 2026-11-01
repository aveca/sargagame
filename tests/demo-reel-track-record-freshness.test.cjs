#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "DemoReel.jsx"), "utf8");
const helper = fs.readFileSync(path.join(root, "src", "lib", "track-record-freshness.js"), "utf8");
assert.match(source, /isTrackRecordFresh\(d\)/, "showcase must use shared freshness guard");
assert.match(helper, /MAX_COMPUTED_AGE_MS = 36 \* 60 \* 60 \* 1000/);
assert.match(helper, /FUTURE_COMPUTED_SKEW_MS = 5 \* 60 \* 1000/);
assert.match(helper, /MAX_WINDOW_AGE_MS = 2 \* 24 \* 60 \* 60 \* 1000/);
assert.match(helper, /FUTURE_WINDOW_SKEW_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(source, /if \(proof\) list\.push\(\{ id: "s4_registre", dur: 7 \}\)/);
assert.doesNotMatch(source, /76\s*%\s*à\s*79\s*%|76\s*%\s*to\s*79\s*%|76\s*%\s*a\s*79\s*%|76\s*-\s*79\s*%/i);
assert.match(source, /Résultats mesurés/);
assert.match(source, /Measured results/);
assert.match(source, /Resultados medidos/);
console.log("OK — showcase reliability proof uses the shared freshness guard");
