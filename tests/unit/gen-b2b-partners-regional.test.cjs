#!/usr/bin/env node
'use strict';

/**
 * gen-b2b-partners-regional.test.cjs — Tests de génération régionale des partenaires B2B.
 *
 * Couvre les exigences P1-5 (Issue #1029) :
 *  - Génération scoped par région (mq, gp, florida, puntacana, rivieramaya, tulum)
 *  - partners=[] est valide
 *  - Aucun partenaire inventé
 *  - Les partenaires MQ ne sont JAMAIS exposés dans une région USD
 *  - Chaque région produit son propre fichier b2b-partners-<region>.json
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'public/api');
const REGIONS = ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum'];
const SCRIPT = path.join(ROOT, 'scripts/automation/gen-b2b-partners.cjs');

console.log('=== Gen-B2B-Partners Regional Tests ===\n');

// 1. Générer tous les fichiers régionaux
console.log('Test 1: Génération de tous les fichiers régionaux');
execSync(`node ${SCRIPT}`, { cwd: ROOT, stdio: 'pipe' });

for (const region of REGIONS) {
  const outPath = path.join(OUT_DIR, `b2b-partners-${region}.json`);
  assert.ok(fs.existsSync(outPath), `${region}: fichier généré`);
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.strictEqual(data.region, region, `${region}: champ region correct`);
  assert.ok(Array.isArray(data.partners), `${region}: partners est un tableau`);
  assert.ok(Array.isArray(data.preview), `${region}: preview est un tableau`);
  assert.ok(data.updatedAt, `${region}: updatedAt présent`);
  console.log(`  ✓ ${region}: partners=${data.partners.length}, preview=${data.preview.length}`);
}
console.log('  ✓ PASS\n');

// 2. partners=[] est valide pour toutes les régions
console.log('Test 2: partners=[] est valide');
for (const region of REGIONS) {
  const outPath = path.join(OUT_DIR, `b2b-partners-${region}.json`);
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.ok(Array.isArray(data.partners), `${region}: partners est un tableau`);
  // partners=[] est acceptable
}
console.log('  ✓ PASS\n');

// 3. Aucun partenaire MQ n'apparaît dans une région USD
console.log('Test 3: Isolation régionale - pas de partners MQ dans les régions USD');
const usdRegions = ['florida', 'puntacana', 'rivieramaya', 'tulum'];
for (const region of usdRegions) {
  const outPath = path.join(OUT_DIR, `b2b-partners-${region}.json`);
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  for (const p of data.partners) {
    assert.ok(!p.beachId.startsWith('mq'), `${region}: partner ${p.slug} a beachId MQ (${p.beachId}) - fuite inter-région`);
    assert.ok(!p.beachId.startsWith('gp'), `${region}: partner ${p.slug} a beachId GP (${p.beachId}) - fuite inter-région`);
  }
  for (const p of data.preview) {
    assert.ok(!p.beachId.startsWith('mq'), `${region}: preview ${p.slug} a beachId MQ (${p.beachId}) - fuite inter-région`);
    assert.ok(!p.beachId.startsWith('gp'), `${region}: preview ${p.slug} a beachId GP (${p.beachId}) - fuite inter-région`);
  }
}
console.log('  ✓ PASS\n');

// 4. Aucun partenaire inventé (tous les partners viennent du catalogue)
console.log('Test 4: Aucun partenaire inventé - tous les slugs existent dans le catalogue');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/automation/data/b2b-partner-meta.json'), 'utf8'));
const catalogSlugs = new Set((meta.partners || []).map(p => p.slug));
for (const region of REGIONS) {
  const outPath = path.join(OUT_DIR, `b2b-partners-${region}.json`);
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  for (const p of data.partners) {
    assert.ok(catalogSlugs.has(p.slug), `${region}: partner ${p.slug} n'existe pas dans le catalogue`);
  }
  for (const p of data.preview) {
    assert.ok(catalogSlugs.has(p.slug), `${region}: preview ${p.slug} n'existe pas dans le catalogue`);
  }
}
console.log('  ✓ PASS\n');

// 5. Génération par région individuelle (--region)
console.log('Test 5: Génération par région individuelle (--region)');
execSync(`node ${SCRIPT} --region mq`, { cwd: ROOT, stdio: 'pipe' });
const mqData = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'b2b-partners-mq.json'), 'utf8'));
assert.strictEqual(mqData.region, 'mq');
console.log(`  ✓ --region mq: ${mqData.partners.length} partners`);

execSync(`node ${SCRIPT} --region florida`, { cwd: ROOT, stdio: 'pipe' });
const flData = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'b2b-partners-florida.json'), 'utf8'));
assert.strictEqual(flData.region, 'florida');
console.log(`  ✓ --region florida: ${flData.partners.length} partners`);

// Région invalide doit échouer
let invalidRegionFailed = false;
try {
  execSync(`node ${SCRIPT} --region invalide`, { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  invalidRegionFailed = true;
}
assert.ok(invalidRegionFailed, 'région invalide doit provoquer une erreur');
console.log('  ✓ région invalide rejetée');
console.log('  ✓ PASS\n');

// 6. Tous les fichiers ont la structure attendue
console.log('Test 6: Structure des fichiers de sortie');
for (const region of REGIONS) {
  const outPath = path.join(OUT_DIR, `b2b-partners-${region}.json`);
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.strictEqual(typeof data._note, 'string', `${region}: _note présent`);
  assert.strictEqual(typeof data.updatedAt, 'string', `${region}: updatedAt présent`);
  assert.strictEqual(typeof data.region, 'string', `${region}: region présent`);
  assert.ok(data.updatedAt.match(/^\d{4}-\d{2}-\d{2}$/), `${region}: updatedAt au format YYYY-MM-DD`);
  for (const p of data.partners) {
    assert.ok(p.slug, `${region}: partner a un slug`);
    assert.ok(p.beachId, `${region}: partner a un beachId`);
    assert.ok(p.name, `${region}: partner a un name`);
  }
}
console.log('  ✓ PASS\n');

console.log('=== ALL GEN-B2B-PARTNERS REGIONAL TESTS PASSED ===');
