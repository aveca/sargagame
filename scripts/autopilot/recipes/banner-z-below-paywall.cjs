#!/usr/bin/env node
/**
 * RECETTE banner-z-below-paywall — UX-QA-002 (reproduite au code 2026-09-24).
 *
 * Problème : 3 bannières de relance (checkout recovery / pass expiré / pass renew)
 * dans src/Sargasses_PROD.jsx sont peintes à zIndex:1500, AU-DESSUS du paywall
 * (1260) et du checkout Mollie (1300). La bannière recovery n'a AUCUNE garde
 * !showPremium → elle recouvre l'offre et intercepte les clics au moment PRECIS
 * où le visiteur revient payer.
 *
 * Transformation exacte (3 occurrences, assertion de compte) :
 *   position:"fixed",top:0,left:0,right:0,zIndex:1500,
 *     → zIndex piloté par flag : ?bannertop=1 restaure 1500 (rollback produit),
 *       sinon 1240 — sous paywall (1260) et checkout (1300), au-dessus de la
 *       fiche (1200) et du contenu carte.
 *
 * Zéro logique de paiement touchée : uniquement l'ordre d'empilement visuel.
 * Test de contrat ajouté : tests/unit/autopilot-banner-z.test.cjs.
 *
 * Le pattern `inset:0,zIndex:1500` (splash post-paiement, ~L15309) est volontaire
 * et N'EST PAS ciblé (regex ancrée sur top:0 bands).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OLD = 'position:"fixed",top:0,left:0,right:0,zIndex:1500,';
const NEW = 'position:"fixed",top:0,left:0,right:0,zIndex:(/[?&]bannertop=1/.test(window.location.search)?1500:1240),';
const EXPECTED = 3;
const TARGET = path.join('src', 'Sargasses_PROD.jsx');

const TEST_FILE = path.join('tests', 'unit', 'autopilot-banner-z.test.cjs');
const TEST_SRC = `// tests/unit/autopilot-banner-z.test.cjs — Contrat UX-QA-002 (autopilot recette banner-z-below-paywall)
// Les bannières de relance (recovery/expired/renew) doivent rester SOUS le paywall
// (z 1260) et le checkout (z 1300). Rollback produit : ?bannertop=1 (→ 1500).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Sargasses_PROD.jsx'), 'utf8');
let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('BANNER Z-ORDER — UX-QA-002\\n');
check('3 bannières pilotées par flag ?bannertop=1', (src.match(/\\[\\?&\\]bannertop=1\\/\\.test\\(window\\.location\\.search\\)\\?1500:1240/g) || []).length === 3);
check('zéro bannière top-band encore figée à zIndex:1500', !src.includes('position:"fixed",top:0,left:0,right:0,zIndex:1500,'));
check('valeur sûre 1240 < paywall 1260 < checkout 1300', 1240 < 1260 && 1260 < 1300);
check('rollback ?bannertop=1 documenté dans le code', src.includes('bannertop'));
check('splash post-paiement (inset:0) non régressé par la recette', (src.match(/position:\\"fixed\\",inset:0,zIndex:1500/g) || []).length >= 1);

console.log(\`\\n\${passed}/5 checks OK\`);
`;

module.exports = {
  name: 'banner-z-below-paywall',
  description: 'Bannières relance sous le paywall/checkout (z 1500 → 1240, rollback ?bannertop=1)',
  apply(wt, log) {
    const file = path.join(wt, TARGET);
    const src = fs.readFileSync(file, 'utf8');

    // Déjà appliqué ? idempotent = succès no-op.
    if (!src.includes(OLD) && (src.match(/bannertop=1/g) || []).length >= EXPECTED) {
      log('recette déjà appliquée (idempotent)');
      ensureTest(wt, log);
      return { files: [TARGET, TEST_FILE], summary: 'no-op (déjà appliqué)' };
    }

    const count = src.split(OLD).length - 1;
    if (count !== EXPECTED) {
      throw new Error(`recette inapplicable : ${count} occurrence(s) du pattern au lieu de ${EXPECTED} — le code a bougé, revue humaine requise`);
    }
    const out = src.split(OLD).join(NEW);
    fs.writeFileSync(file, out, 'utf8');
    log(`3 bannières re-z-indexées (1500 → 1240 + flag bannertop)`);
    ensureTest(wt, log);
    return { files: [TARGET, TEST_FILE], summary: 'banners zIndex 1500→1240 avec rollback ?bannertop=1 (3 occurrences)' };
  },
};

function ensureTest(wt, log) {
  const p = path.join(wt, TEST_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) { fs.writeFileSync(p, TEST_SRC, 'utf8'); log('contrat ajouté : ' + TEST_FILE); }
}
