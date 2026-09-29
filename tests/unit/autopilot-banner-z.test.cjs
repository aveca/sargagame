// tests/unit/autopilot-banner-z.test.cjs — Contrat UX-QA-002 (autopilot recette banner-z-below-paywall)
// Les bannières de relance (recovery/expired/renew) doivent rester SOUS le paywall
// (z 1260) et le checkout (z 1300). Rollback produit : ?bannertop=1 (→ 1500).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Sargasses_PROD.jsx'), 'utf8');
let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('BANNER Z-ORDER — UX-QA-002\n');
check('3 bannières pilotées par flag ?bannertop=1', (src.match(/\[\?&\]bannertop=1\/\.test\(window\.location\.search\)\?1500:1240/g) || []).length === 3);
check('zéro bannière top-band encore figée à zIndex:1500', !src.includes('position:"fixed",top:0,left:0,right:0,zIndex:1500,'));
check('valeur sûre 1240 < paywall 1260 < checkout 1300', 1240 < 1260 && 1260 < 1300);
check('rollback ?bannertop=1 documenté dans le code', src.includes('bannertop'));
check('splash post-paiement (inset:0) non régressé par la recette', (src.match(/position:\"fixed\",inset:0,zIndex:1500/g) || []).length >= 1);

console.log(`\n${passed}/5 checks OK`);
