#!/usr/bin/env node
"use strict";
// Regression: the instant boot shell is shared by all six domains and must be
// visual-only. Regional copy belongs in the region-aware noscript generator,
// never in this pre-hydration placeholder.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const start = html.indexOf('<div id="sg-boot"');
const end = html.indexOf("<!-- Révélé par JS uniquement", start);

assert.notEqual(start, -1, "boot shell exists");
assert.notEqual(end, -1, "boot shell has a clear boundary before the SEO fallback");
const boot = html.slice(start, end);
const markup = boot.replace(/<style>[\\s\\S]*?<\\/style>/, "");

assert.match(boot, /aria-hidden="true"/, "boot placeholder is hidden from assistive technology");
assert.match(boot, /sg-boot-skeleton-title/, "neutral title skeleton is present");
assert.match(boot, /sg-boot-skeleton-cta/, "neutral CTA-shaped skeleton is present");
assert.doesNotMatch(boot, /<a\\b/i, "boot placeholder contains no navigational links");
assert.doesNotMatch(markup, />[^<\\s][^<]*</, "boot placeholder contains no text nodes");
assert.doesNotMatch(boot, /Martinique|Guadeloupe|Punta Cana|Florida|Canc[uú]n|Tulum|Sargassum|Sargazo|plages|beaches|playas|\\b53\\b/i,
  "boot placeholder contains no region, language, or hard-coded beach-count copy");
assert.match(html, /<noscript>\\s*<h1>/, "SEO fallback remains present for region-aware build transformation");

console.log("OK — shared boot shell is neutral and the SEO fallback is preserved");
