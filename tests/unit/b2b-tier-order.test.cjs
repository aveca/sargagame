/**
 * tests/unit/b2b-tier-order.test.cjs
 * Mission 6 — Le widget B2B doit afficher le prix canonique Pro (79 €/mois)
 * AVANT le décoy Brief (29 €/mois). Issue #1024.
 *
 * Lit le source de PremiumModal.jsx et vérifie que l'id "pro" apparaît
 * avant l'id "brief" dans le tableau TIERS.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'src', 'PremiumModal.jsx'), 'utf8');

// Extraire le tableau TIERS : tout ce qui se trouve entre "const TIERS=[" et le "];" qui suit
const tiersMatch = src.match(/const TIERS=\[([\s\S]*?)\];/m);
assert.ok(tiersMatch, 'tableau TIERS non trouvé dans PremiumModal.jsx');

const tiersBlock = tiersMatch[1];

// Extraire les ids dans l'ordre d'apparition
const ids = [];
let m;
const idRe = /id:"(brief|pro|territoire)"/g;
while ((m = idRe.exec(tiersBlock))) {
  ids.push(m[1]);
}

assert.ok(ids.includes('pro'), 'id "pro" absent du tableau TIERS');
assert.ok(ids.includes('brief'), 'id "brief" absent du tableau TIERS');

const proIdx = ids.indexOf('pro');
const briefIdx = ids.indexOf('brief');

assert.ok(
  proIdx < briefIdx,
  `L'ordre des tiers B2B est incorrect : "pro" (79 €/mois) doit apparaître AVANT "brief" (29 €/mois). Ordre actuel: ${ids.join(' → ')}`
);

console.log(`✅ Ordre des tiers B2B correct : ${ids.join(' → ')} (pro=${proIdx}, brief=${briefIdx})`);
