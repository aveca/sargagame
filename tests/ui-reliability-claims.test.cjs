#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const paths = ["src/DemoReel.jsx", "src/WelcomePoste.jsx", "src/WeekHub.jsx", "src/PremiumModal.jsx"];
const sources = Object.fromEntries(paths.map(file => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const staticAccuracyRange = /76\s*(?:à|-|–|to)\s*79\s*%/i;
for (const [file, source] of Object.entries(sources)) assert.doesNotMatch(source, staticAccuracyRange, file + " must not hardcode a global 76–79% accuracy range");
assert.match(sources["src/WelcomePoste.jsx"], /la fiabilité varie selon le régime et l’horizon/);
assert.match(sources["src/WeekHub.jsx"], /\$\{calmProof\.pct\}%/);
assert.match(sources["src/WeekHub.jsx"], /\$\{calmProof\.from\} au \$\{calmProof\.to\}/);
assert.match(sources["src/PremiumModal.jsx"], /isTrackRecordFresh\(d\)/);
assert.match(sources["src/PremiumModal.jsx"], /du \$\{from\} au \$\{to\}/);
console.log("OK — no static global accuracy range across B2C proof surfaces");
