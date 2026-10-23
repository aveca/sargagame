'use strict';
const assert = require('node:assert/strict');
const {
  getRegionLandingPages,
  getAllRegionLandingPages,
  withLandingPageSlugs,
} = require('./region-landing-pages.cjs');

const CASES = {
  puntacana: ['playa-punta-cana', '/en/plages/punta-cana/', '/es/playas/punta-cana/'],
  rivieramaya: ['playa-del-carmen', '/en/plages/playa-del-carmen/', '/es/playas/playa-del-carmen/'],
  tulum: ['playa-tulum', '/en/plages/playa-tulum/', '/es/playas/playa-tulum/'],
};

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (error) { console.error('✗ ' + name + ': ' + error.message); process.exitCode = 1; }
}

for (const [id, expected] of Object.entries(CASES)) {
  test(id + ': ajoute seulement le slug FR de la landing régionale', () => {
    const base = new Set(['une-plage-existante']);
    const out = withLandingPageSlugs(id, base);
    assert.ok(out.has(expected[0]));
    assert.ok(out.has('une-plage-existante'));
    assert.equal(out.size, 2);
  });
  test(id + ': décrit les trois fichiers FR/EN/ES et leurs routes', () => {
    const pages = getRegionLandingPages(id);
    assert.equal(pages.length, 3);
    assert.deepEqual(pages.map(p => p.lang), ['fr', 'en', 'es']);
    assert.ok(pages.every(p => p.file.endsWith('/index.html')));
    assert.ok(pages.some(p => p.url === expected[1]));
    assert.ok(pages.some(p => p.url === expected[2]));
    assert.ok(pages.every(p => p.regionId === id));
  });
}

test('les neuf landing pages ont des chemins uniques et des propriétaires explicites', () => {
  const all = getAllRegionLandingPages();
  assert.equal(all.length, 9);
  assert.equal(new Set(all.map(p => p.file)).size, 9);
  assert.deepEqual([...new Set(all.map(p => p.regionId))].sort(), Object.keys(CASES).sort());
});

test('une région inconnue ne reçoit aucune landing spécifique', () => {
  assert.deepEqual(getRegionLandingPages('unknown-region'), []);
  const out = withLandingPageSlugs('unknown-region', ['existing']);
  assert.deepEqual([...out], ['existing']);
});
console.log('region-landing-pages.test.cjs: ' + passed + ' tests passed');
