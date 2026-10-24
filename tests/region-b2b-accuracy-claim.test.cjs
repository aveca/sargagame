#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "scripts/lib/region-seo-pages.cjs"), "utf8");
const start = source.indexOf("function buildHotelLanding(");
assert(start >= 0, "B2B hotel landing generator exists");
const next = source.indexOf("\nfunction ", start + 1);
const block = source.slice(start, next < 0 ? source.length : next);

assert(!/\b76\s*%/.test(block), "no hard-coded 76% accuracy claim in regional B2B landing");
assert(!/across all regimes|todos los regímenes/i.test(block), "no unsupported global accuracy claim in regional B2B landing");
assert(block.includes("The public dated validation record currently covers Martinique and Guadeloupe"), "English copy states the published record scope");
assert(block.includes("El registro público de validación cubre actualmente Martinica y Guadalupe"), "Spanish copy states the published record scope");
assert(block.includes("does not establish an accuracy rate for ${region.name}"), "English copy avoids attributing the public rate to the target region");
assert(block.includes("no establece una tasa de acierto para ${region.name}"), "Spanish copy avoids attributing the public rate to the target region");
assert((block.match(/\baccuracyFaq\b/g) || []).length >= 3, "same scoped FAQ answer is reused in HTML and FAQ structured data");

console.log("OK — regional B2B accuracy claims are scoped to published evidence");
