#!/usr/bin/env node
"use strict";

// SEO fallback regression: generated beach pages must never substitute the
// deterministic sine/cosine forecast for missing satellite-pipeline data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../vite.config.js"), "utf8");

const heroStart = source.indexOf("const heroForecastLine = (b) =>");
const heroEnd = source.indexOf("// lv live (score/afai/status réels)", heroStart);
assert.notEqual(heroStart, -1, "SEO hero forecast resolver exists");
assert.notEqual(heroEnd, -1, "SEO hero forecast resolver has a clear boundary");
const heroResolver = source.slice(heroStart, heroEnd);
assert.match(heroResolver, /_heroLive\.weeklyBySlug\[sargId\]/, "hero resolver uses the live weekly map");
assert.doesNotMatch(heroResolver, /_heroWeekly|buildWeeklyBatch|SARGASSUM_REF/, "hero resolver has no synthetic forecast fallback");

const diveStart = source.indexOf("const _fd_wk =");
const diveEnd = source.indexOf("const _fd_forecast =", diveStart);
assert.notEqual(diveStart, -1, "scene forecast resolver exists");
assert.notEqual(diveEnd, -1, "scene forecast resolver has a clear boundary");
const diveResolver = source.slice(diveStart, diveEnd);
assert.match(diveResolver, /_heroLive\.weeklyBySlug/, "scene resolver uses the live weekly map");
assert.doesNotMatch(diveResolver, /_heroWeekly|buildWeeklyBatch/, "scene resolver does not invent a replacement forecast");

console.log("OK — SEO and scene forecasts require real weekly data; missing data remains missing");
