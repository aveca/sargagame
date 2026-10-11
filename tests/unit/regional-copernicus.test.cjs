#!/usr/bin/env node
/**
 * regional-copernicus.test.cjs — Mission P0 : séparation des données MQ/GP.
 *
 * Le build partagé générait UN sargassum.json (21 clés MQ+GP) copié tel quel
 * dans martinique-ftp/ ET guadeloupe-ftp/ — chaque domaine servait les plages
 * de l'autre île (post-deploy-verify FAILED côté MQ : 10 niveaux gp-*).
 *
 * Séries (fixtures synthétiques déterministes + fichiers suivis du dépôt ;
 * aucun artefact *-ftp/ requis — ces dossiers gitignorés n'existent pas en CI) :
 *   R1 JSON partagé actuel REJETÉ pour MQ et GP (négatif — prouve la détection)
 *   R2 artefacts filtrés ACCEPTÉS pour MQ et GP (positif — prouve la correction)
 *   R3 cohérence des clés : 0 inconnue ; map inline app == lib (anti-drift)
 *   R4 autres régions (schéma id) : conforme OK, intrus refusé
 *   R5 artifact_identity : sans attente => NOT_VERIFIED (jamais VERIFIED) ;
 *      concordance => VERIFIED ; écart => FAILED ; servi absent => FAILED
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const REG = require(path.join(REPO, 'scripts', 'lib', 'regional-copernicus.cjs'));
const { checkArtifactIdentity } = require(path.join(REPO, 'scripts', 'autopilot', 'post-deploy-verify.cjs'));

let failures = 0;
let count = 0;
function record(name, ok, extra) {
  count++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}
const shared = () => JSON.parse(fs.readFileSync(path.join(REPO, 'public', 'api', 'copernicus', 'sargassum.json'), 'utf8'));

console.log('regional-copernicus : séparation MQ/GP (mission P0)\n');

// ── R1 : le JSON partagé actuel est REJETÉ pour chaque site régional ─────────
{
  const mq = REG.checkCopernicusForIsland(shared(), 'mq');
  const gp = REG.checkCopernicusForIsland(shared(), 'gp');
  record('R1a partagé REJETÉ pour MQ (étrangers gp détectés sur weekly+scores+levels)',
    mq.foreign.length === 30 && mq.foreign.every((f) => f.island === 'gp'),
    `étrangers=${mq.foreign.length}`);
  record('R1b partagé REJETÉ pour GP (étrangers mq détectés sur weekly+scores+levels)',
    gp.foreign.length === 33 && gp.foreign.every((f) => f.island === 'mq'),
    `étrangers=${gp.foreign.length}`);
}

// ── R2 : les artefacts filtrés PASSENT (positif) ─────────────────────────────
for (const island of ['mq', 'gp']) {
  const before = JSON.stringify(shared());
  const res = REG.filterCopernicusForIsland(shared(), island);
  const after = REG.checkCopernicusForIsland(res.json, island);
  const topSame = JSON.stringify(Object.keys(shared()).sort()) === JSON.stringify(Object.keys(res.json).sort());
  record(`R2${island === 'mq' ? 'a' : 'b'} filtré ACCEPTÉ pour ${island.toUpperCase()} (0 étranger, 0 inconnu, schéma intact, source non mutée)`,
    after.foreign.length === 0 && after.unknown.length === 0 && topSame && JSON.stringify(shared()) === before,
    `weekly=${Object.keys(res.json.weekly).length} scores=${Object.keys(res.json.scores).length} levels=${res.json.levels.length}`);
}

// ── R3 : cohérence des clés + anti-drift de la map ───────────────────────────
{
  const s = shared();
  const keys = [...Object.keys(s.weekly || {}), ...Object.keys(s.scores || {}), ...(s.levels || []).map((l) => l && l.id)];
  const unknown = keys.filter((k) => REG.islandOfBeachKey(k) === null);
  record('R3a toutes les clés weekly/scores/levels résolues (0 inconnue)', unknown.length === 0, `clés=${keys.length}`);
  const appSrc = fs.readFileSync(path.join(REPO, 'src', 'Sargasses_PROD.jsx'), 'utf8');
  const m = appSrc.match(/SARG_TO_BEACH=(\{[^}]*\})/);
  const inline = m ? JSON.parse(m[1]) : null;
  const same = inline && JSON.stringify(Object.keys(inline).sort()) === JSON.stringify(Object.keys(REG.SARG_TO_BEACH).sort())
    && Object.keys(inline).every((k) => inline[k] === REG.SARG_TO_BEACH[k]);
  record('R3b map inline app == scripts/lib/sarg-to-beach.cjs (anti-drift)', same === true, `n=${inline ? Object.keys(inline).length : 0}`);
}

// ── R4 : autres régions (schéma id régional) ─────────────────────────────────
{
  const florida = { id: 'florida', domain: 'sargassummiami.com', ftpDir: 'florida-ftp', beaches: [{ id: 'fl001' }, { id: 'fl002' }] };
  const good = { weekly: { fl001: { forecast: [] }, fl002: { forecast: [] } }, scores: { fl001: 1, fl002: 2 }, levels: [{ id: 'fl001' }, { id: 'fl002' }] };
  const bad = { weekly: { fl001: { forecast: [] }, mq001: { forecast: [] } }, scores: { fl001: 1 }, levels: [{ id: 'fl001' }, { id: 'mq001' }] };
  const rGood = REG.checkRegionalArtifact(good, florida);
  const rBad = REG.checkRegionalArtifact(bad, florida);
  record('R4a artefact florida conforme => OK', rGood.ok === true && rGood.issues.length === 0);
  record('R4b intrus mq001 dans artefact florida => refusé',
    rBad.ok === false && rBad.issues.some((i) => i.key === 'mq001'), `issues=${rBad.issues.map((i) => i.key).join(',')}`);
}

// ── R5 : artifact_identity honnête (P0 §4) ───────────────────────────────────
{
  const a = checkArtifactIdentity({ v: 'v220', b: 'abc' }, null, null);
  record('R5a sans attente => NOT_VERIFIED (jamais VERIFIED simulé)', a.status === 'NOT_VERIFIED', a.detail.slice(0, 60));
  const b = checkArtifactIdentity({ v: 'v220', b: 'abc' }, 'v220', 'abc');
  record('R5b concordance built==servi => VERIFIED', b.status === 'VERIFIED');
  const c = checkArtifactIdentity({ v: 'v220', b: 'xxx' }, 'v220', 'abc');
  record('R5c écart => FAILED', c.status === 'FAILED');
  const d = checkArtifactIdentity(null, 'v220', 'abc');
  record('R5d servi absent => FAILED', d.status === 'FAILED');
}

console.log(`\n${count - failures}/${count} scénarios conformes`);
process.exit(failures ? 1 : 0);
