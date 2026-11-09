#!/usr/bin/env node
/**
 * final-scope.test.cjs — tests déterministes du contrôle de périmètre FINAL.
 *
 * Hors-ligne, sans écriture, sans git. Couvre le défaut réel du 2026-11-09
 * (PR #1374 : artefacts `public/api/**` denylist commités alors que la mission
 * ne demandait que `.ai/autopilot/README.md`).
 *
 *   1. partition : ce qui est dans le périmètre vs ce qui doit être restauré ;
 *   2. contrôle final : hors périmètre → refus ;
 *   3. contrôle final : cible absente → refus ;
 *   4. contrôle final : fichier non validé par le gate → refus ;
 *   5. contrôle final : liste propre → OK.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const finalScope = require('./final-scope.cjs');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + ' ' + detail);
  }
}

// ── 1. Partition périmètre ───────────────────────────────────────────────────

console.log('=== 1. partition par périmètre ===');
{
  const r = finalScope.partitionByScope({
    changedFiles: ['.ai/autopilot/README.md', 'public/api/copernicus/sargassum.json', 'public/data/b2b-partners.json'],
    allowedFiles: ['.ai/autopilot/README.md'],
  });
  check('le fichier autorisé est gardé', r.keep.length === 1 && r.keep[0] === '.ai/autopilot/README.md', JSON.stringify(r));
  check('les artefacts hors périmètre sont à restaurer', r.drop.length === 2, JSON.stringify(r));
}
{
  const r = finalScope.partitionByScope({
    changedFiles: ['./src/App.jsx', 'src\\Other.jsx'],
    allowedFiles: ['src/App.jsx'],
  });
  check('normalisation ./ et \\', r.keep.length === 1 && r.drop.length === 1, JSON.stringify(r));
}

// ── 2. Contrôle final : hors périmètre ───────────────────────────────────────

console.log('=== 2. contrôle final — hors périmètre ===');
{
  const r = finalScope.finalScopeCheck({
    changedFiles: ['.ai/autopilot/README.md', 'public/api/copernicus/sargassum.json'],
    allowedFiles: ['.ai/autopilot/README.md'],
    gateFiles: ['.ai/autopilot/README.md', 'public/api/copernicus/sargassum.json'],
  });
  check('liste hors périmètre refusée', r.ok === false, JSON.stringify(r));
  check('le fichier fautif est nommé', r.outOfScope.includes('public/api/copernicus/sargassum.json'), JSON.stringify(r));
}

// ── 3. Contrôle final : cible absente ────────────────────────────────────────

console.log('=== 3. contrôle final — cible absente ===');
{
  const r = finalScope.finalScopeCheck({
    changedFiles: ['src/Other.jsx'],
    allowedFiles: ['src/App.jsx'],
    gateFiles: ['src/Other.jsx'],
  });
  check('cible non modifiée refusée', r.ok === false, JSON.stringify(r));
  check('motif explicite', r.violations.some(v => v.includes('FAIL_TARGET_UNCHANGED')), JSON.stringify(r));
}

// ── 4. Contrôle final : fichier non validé par le gate ───────────────────────

console.log('=== 4. contrôle final — non validé par le gate ===');
{
  const r = finalScope.finalScopeCheck({
    changedFiles: ['src/App.jsx', 'src/New.jsx'],
    allowedFiles: ['src/App.jsx', 'src/New.jsx'],
    gateFiles: ['src/App.jsx'],
  });
  check('fichier hors gate refusé', r.ok === false, JSON.stringify(r));
  check('le fichier non validé est nommé', r.notValidated.includes('src/New.jsx'), JSON.stringify(r));
}

// ── 5. Contrôle final : liste propre ─────────────────────────────────────────

console.log('=== 5. contrôle final — liste propre ===');
{
  const r = finalScope.finalScopeCheck({
    changedFiles: ['.ai/autopilot/README.md'],
    allowedFiles: ['.ai/autopilot/README.md'],
    gateFiles: ['.ai/autopilot/README.md'],
  });
  check('liste conforme acceptée', r.ok === true, JSON.stringify(r));
  check('aucune violation', r.violations.length === 0, JSON.stringify(r));
}

// ── 6. Classification d'un échec de scope (parquer vs relancer) ─────────────

console.log('=== 6. classification d\'échec ===');
{
  const violation = finalScope.classifyScopeFailure({
    ok: false,
    reason: 'FAIL_SCOPE: modified files outside scope',
    details: { outOfScope: ['public/api/copernicus/sargassum.json'] },
  });
  check('violation de périmètre NON relançable', violation.kind === 'scope-violation' && violation.retryable === false, JSON.stringify(violation));
  check('le fichier interdit est nommé', violation.outOfScope.length === 1, JSON.stringify(violation));
}
{
  const noChange = finalScope.classifyScopeFailure({
    ok: false,
    reason: 'FAIL_TARGET_UNCHANGED: no files modified by agent',
    details: { outOfScope: [] },
  });
  check('absence de modification RELANCABLE', noChange.kind === 'no-useful-change' && noChange.retryable === true, JSON.stringify(noChange));
}

// ── 7. Intégration : l'orchestrateur branche bien le contrôle final ─────────

console.log('=== 7. intégration orchestrateur ===');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'orchestrator.cjs'), 'utf8');
  check('restoreOutOfScope appelé avant le commit', /restoreOutOfScope\(wt, allowedScope/.test(src));
  check('diff final recalculé après le gate', /const finalDiff = gitops\.diffStats\(wt\)/.test(src));
  check('denylist revalidée sur le diff final', /policy\.evaluateFiles\(finalDiff\.files, cfg\)/.test(src));
  check('commit limité au diff final', /commitAll\(wt,[\s\S]{0,400}finalDiff\.files\)/.test(src));
  check('le module pur est importé', /require\('\.\/lib\/final-scope\.cjs'\)/.test(src));
  check('échec de périmètre → classification utilisée', /classifyScopeFailure\(scopeGuard\)/.test(src));
  check('gateFiles déclaré hors de la boucle', /let gateFiles = \[\]/.test(src));
  check('gateFiles alimenté depuis le diff validé', /gateFiles = diff\.files\.slice\(\)/.test(src));
  check('échec de périmètre → publication retrying', /publishMissionStatus\(opp\.id, 'retrying'/.test(src));
}

console.log(failures === 0 ? 'FINAL-SCOPE TESTS : OK (0 échec)' : `FINAL-SCOPE TESTS : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
