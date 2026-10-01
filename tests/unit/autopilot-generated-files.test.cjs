#!/usr/bin/env node
/**
 * autopilot-generated-files.test.cjs — ÉTAPE 3 : GENERATED_FILES explicite,
 * centralisée (generated-files.cjs = source unique) et testée.
 *
 * Garantit que les artefacts de build — notamment
 * public/api/b2b-partners.json + src/lib/partners-catalog.json
 * (régénérés à chaque `npm run build`) — ne deviennent jamais du « faux WIP »
 * bloquant dans un worktree de réparation.
 */
'use strict';
const assert = require('assert');
const gen = require('../../scripts/autopilot/lib/generated-files.cjs');

let passed = 0;
function check(name, cond, details = '') {
  if (cond) { console.log('  ✓ ' + name); passed++; }
  else { console.log('  ✗ ' + name + (details ? ' — ' + details : '')); throw new Error('FAIL: ' + name); }
}

console.log('AUTOPILOT GENERATED-FILES TESTS\n');

// 1. Liste explicite : chaque entrée a pattern + raison + producteur documenté.
check('liste non vide', gen.GENERATED_FILES.length >= 7);
for (const g of gen.GENERATED_FILES) {
  check(`entrée documentée: ${g.pattern}`, typeof g.pattern === 'string' && g.pattern.length > 0 &&
    typeof g.reason === 'string' && g.reason.length > 0, JSON.stringify(g));
}

// 2. Les deux fichiers mission (artefacts de build connus).
check('b2b-partners.json = généré', gen.isGeneratedFile('public/api/b2b-partners.json'));
check('partners-catalog.json = généré', gen.isGeneratedFile('src/lib/partners-catalog.json'));
check('classify b2b-partners = generated', gen.classifyRepairFile('public/api/b2b-partners.json') === 'generated');
check('classify partners-catalog = generated', gen.classifyRepairFile('src/lib/partners-catalog.json') === 'generated');

// 3. Existant préservé (non-régression).
for (const f of ['public/data/media-manifest.json', 'public/api/copernicus/sargassum.json',
  'public/version.json', 'dist/index.html', 'dist/assets/x.js', 'node_modules/a/b.js']) {
  check(`généré: ${f}`, gen.isGeneratedFile(f));
}

// 4. WIP développeur : jamais classé généré → préservé.
for (const f of ['src/Sargasses_PROD.jsx', 'src/lib/offers.js', 'scripts/autopilot/lib/gitops.cjs',
  'tests/unit/x.test.cjs', 'public/api/mollie.php', '.ai/tasks.md']) {
  check(`unknown (préservé): ${f}`, gen.classifyRepairFile(f) === 'unknown');
}

// 5. Anti-faux-positif préfixe (séparateur exigé).
check('distx/ ≠ dist/', !gen.isGeneratedFile('distx/file.js'));
check('srcx/ ≠ src (unknown)', gen.classifyRepairFile('srcx/file.js') === 'unknown');
check('node_modules2/ ≠ node_modules/', !gen.isGeneratedFile('node_modules2/a.js'));

// 6. Backslashes Windows normalisés.
check('backslash normalisé', gen.isGeneratedFile('public\\api\\b2b-partners.json'));
check('classify backslash', gen.classifyRepairFile('dist\\x.js') === 'generated');

// 7. Temp autopilot distinct du généré.
check('runs/ = autopilot-temp', gen.classifyRepairFile('.ai/autopilot/runs/2026-01-01-x.md') === 'autopilot-temp');
check('queue.json = autopilot-temp', gen.classifyRepairFile('.ai/autopilot/queue.json') === 'autopilot-temp');
check('généré ≠ temp', !gen.isAutopilotTempFile('public/api/b2b-partners.json'));
check('temp ≠ généré', !gen.isGeneratedFile('.ai/autopilot/queue.json'));

// 8. Source unique : gitops.cjs ne duplique plus les listes.
{
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'autopilot', 'lib', 'gitops.cjs'), 'utf8');
  check('gitops importe generated-files', src.includes("require('./generated-files.cjs')"));
  check('gitops sans Set inline dupliqué', !src.includes('const GENERATED_FILES = new Set'));
  check('gitops sans AUTOPILOT_TEMP_FILES inline', !src.includes('const AUTOPILOT_TEMP_FILES = new Set'));
}

console.log(`\nRESULTS: ${passed} passed, 0 failed`);
