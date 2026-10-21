#!/usr/bin/env node
/** Tests du contrat régions consommé par les builds et le workflow Cloudflare. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const R = require('./index.cjs');

let n = 0;
function test(name, fn) {
  n++;
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const DEPLOY_REGIONS = ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum'];
const validRegion = (id, domain) => ({
  id, name: `Test ${id}`, country: 'Test', domain, ftpDir: `${id}-ftp`,
  primaryLang: 'fr', currency: 'EUR', timezone: 'America/Martinique',
  bbox: [-62, 13, -59, 17], center: { lat: 15, lng: -61 },
  emails: { alerts: 'alerts@example.com', support: 'support@example.com' },
  beachFilter: { island: id },
  routes: { season: '/season/', best: '/best/', weekly: '/weekly/' },
});

function mkTmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'region-validation-'));
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return dir;
}

test('les configurations réelles de toutes les régions passent la validation stricte', () => {
  const count = R.assertAllRegionsValid();
  assert.ok(count >= 7, `attendu au moins 7 configurations, obtenu ${count}`);
});

test('les six régions de production existent et possèdent les champs obligatoires', () => {
  for (const id of DEPLOY_REGIONS) {
    const region = R.getRegion(id);
    assert.strictEqual(region.id, id);
    assert.ok(region.domain, `${id}: domain manquant`);
    assert.ok(region.ftpDir, `${id}: ftpDir manquant`);
    assert.ok(region.bbox.length === 4, `${id}: bbox invalide`);
    assert.ok(region.center && Number.isFinite(region.center.lat) && Number.isFinite(region.center.lng), `${id}: center invalide`);
    assert.ok(region.emails.alerts && region.emails.support, `${id}: emails incomplets`);
    assert.ok(region.routes.season && region.routes.best && region.routes.weekly, `${id}: routes incomplètes`);
  }
});

test('getRegion rejette un identifiant inconnu', () => {
  assert.throws(() => R.getRegion('__region_inconnue__'), /région inconnue/i);
});

test('la validation stricte rejette un champ obligatoire absent', () => {
  const mq = validRegion('mq', 'mq.example.com');
  const gp = validRegion('gp', 'gp.example.com');
  const florida = validRegion('florida', 'florida.example.com');
  delete florida.ftpDir;
  const dir = mkTmp({ 'mq.json': mq, 'gp.json': gp, 'florida.json': florida });
  try { assert.throws(() => R.assertAllRegionsValid(dir), /ftpDir/); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('la validation stricte rejette une bbox invalide', () => {
  const mq = validRegion('mq', 'mq.example.com');
  mq.bbox = [-60, 17, -62, 13];
  const dir = mkTmp({ 'mq.json': mq });
  try { assert.throws(() => R.assertAllRegionsValid(dir), /bbox/); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('une région non-core invalide est isolée sans supprimer MQ/GP valides', () => {
  const mq = validRegion('mq', 'mq.example.com');
  const gp = validRegion('gp', 'gp.example.com');
  const florida = validRegion('florida', 'florida.example.com');
  florida.bbox = [-81, 25, -80, 26];
  florida.beaches = [{ id: 'fl1', island: 'mq', lat: 25.5, lng: -80.5 }];
  const dir = mkTmp({ 'mq.json': mq, 'gp.json': gp, 'florida.json': florida });
  try {
    const loaded = R._loadFromDir(dir);
    assert.ok(loaded.mq && loaded.gp, 'MQ/GP doivent survivre');
    assert.ok(!loaded.florida, 'la région non-core cassée doit être ignorée');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('une configuration core invalide provoque une erreur immédiate', () => {
  const dir = mkTmp({ 'mq.json': '{ JSON invalide', 'gp.json': validRegion('gp', 'gp.example.com') });
  try { assert.throws(() => R._loadFromDir(dir), /CORE.*mq|JSON invalide/i); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('aucune région core chargée provoque une erreur', () => {
  const dir = mkTmp({ 'florida.json': validRegion('florida', 'florida.example.com') });
  try { assert.throws(() => R._loadFromDir(dir), /core/i); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\nregions.test.cjs : ${n} test(s)`);
