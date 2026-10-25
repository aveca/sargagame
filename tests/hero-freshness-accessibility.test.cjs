const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src/Sargasses_PROD.jsx'), 'utf8');
const start = source.indexOf('/* Fraîcheur de l\'observation au point de décision');
assert.notEqual(start, -1, 'hero freshness badge block must exist');

const end = source.indexOf('        {sub&&<div onClick={()=>{track("sg_hero_tap",{t:"sub"})', start);
assert.ok(end > start, 'hero freshness badge block must have a clear boundary');
const block = source.slice(start, end);

assert.match(block, /<button\b[^>]*type="button"/, 'freshness control must use a native button for keyboard access');
assert.doesNotMatch(block, /<div\s+onClick=/, 'freshness control must not be a click-only div');
assert.match(block, /aria-hidden="true"/, 'decorative status dot must be hidden from assistive technology');
assert.match(block, /onClick=\{\(\)=>\{track\("sg_hero_tap",\{t:"fresh"\}\);onOpenBeach&&onOpenBeach\(beach\)\}\}/, 'activation must preserve analytics and beach-opening behavior');
assert.match(block, /outlineOffset:3/, 'keyboard focus indicator must remain separated from the control');
assert.match(block, /herofresh=0/, 'existing rollback query parameter must be preserved');
assert.match(block, /Observation satellite/);
assert.match(block, /Satellite observation/);
assert.match(block, /Observación satelital/);

console.log('Hero freshness keyboard accessibility: OK');
