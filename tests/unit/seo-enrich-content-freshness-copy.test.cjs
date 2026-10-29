'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'scripts/automation/seo-enrich-content.cjs'), 'utf8');
const generated = JSON.parse(fs.readFileSync(path.join(root, 'scripts/automation/data/enrichments.json'), 'utf8'));

const forbidden = [
  /en temps réel/i,
  /en direct/i,
  /toutes les 3 heures/i,
  /surveillance satellite continue/i,
  /observations continues/i,
  /mises à jour quotidiennement/i,
  /mis à jour quotidiennement/i,
  /actualisé chaque jour/i,
  /actualisée chaque jour/i,
  /prévisions 7 jours en temps réel/i,
  /surveillance 365 jours par an/i,
  /updated 4 times a day/i,
  /updated 4× a day/i,
  /four times a day/i,
];

assert.ok(Object.keys(generated).length >= 100, 'generated beach enrichment data remains populated');
assert.ok(source.includes('dernière observation satellite disponible'), 'generator uses source-observation wording');
assert.ok(source.includes("La fréquence des observations n'est pas continue."), 'generator discloses non-continuous satellite sampling');

for (const [slug, item] of Object.entries(generated)) {
  const faq = JSON.parse(item.faq);
  const copy = [
    item.metaTitle || '',
    item.metaDesc || '',
    item.noscript || '',
    ...faq.mainEntity.map(question => question.acceptedAnswer?.text || ''),
  ].join('\n');

  for (const pattern of forbidden) {
    assert.equal(pattern.test(copy), false, `Unsupported freshness claim in generated copy for ${slug}: ${pattern}`);
  }
}

for (const pattern of forbidden) {
  assert.equal(pattern.test(source), false, `Unsupported freshness template remains in generator: ${pattern}`);
}

console.log(`PASS: freshness-honest SEO copy across ${Object.keys(generated).length} generated beach entries.`);
