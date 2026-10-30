#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const mqHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const prepareFtp = fs.readFileSync(path.join(root, 'scripts/prepare-ftp.cjs'), 'utf8');

const gpStart = prepareFtp.indexOf('  const gpIndex = `');
const gpEnd = prepareFtp.indexOf("\n`\n  fs.writeFileSync(path.join(out, 'index.html'), gpIndex", gpStart);
assert.ok(gpStart >= 0 && gpEnd > gpStart, 'Guadeloupe static homepage template must remain discoverable');
const gpHtml = prepareFtp.slice(gpStart, gpEnd);

function extract(html, tag) {
  const open = html.indexOf('<' + tag);
  const start = open < 0 ? -1 : html.indexOf('>', open) + 1;
  const end = start < 0 ? -1 : html.indexOf('</' + tag + '>', start);
  assert.ok(open >= 0 && start > open && end > start, 'expected <' + tag + '> section');
  return html.slice(start, end);
}

const forbiddenFreshnessClaims = /en temps réel|temps réel|en direct|4 fois par jour|4× par jour|toutes les 3 heures|mis à jour 4 fois|mise à jour quotidienne|notées en direct|suivies en direct|updated 4 times|four times a day|updated live|in real time|real-time|en vivo|4 veces al día/i;

for (const [region, html, canonical, count] of [
  ['Martinique', mqHtml, 'https://sargasses-martinique.com/', '53'],
  ['Guadeloupe', gpHtml, 'https://sargasses-guadeloupe.com/', '83'],
]) {
  const head = extract(html, 'head');
  const noscript = extract(html, 'noscript');
  assert.doesNotMatch(head, forbiddenFreshnessClaims, region + ' head must not promise live or fixed satellite cadence');
  assert.doesNotMatch(noscript, forbiddenFreshnessClaims, region + ' no-JS SEO content must not promise live or fixed satellite cadence');
  assert.ok(head.includes('<link rel="canonical" href="' + canonical + '"'), region + ' canonical is preserved');
  for (const lang of ['fr', 'en', 'es', 'x-default']) {
    assert.ok(head.includes('hreflang="' + lang + '"'), region + ' hreflang ' + lang + ' is preserved');
  }
  assert.ok(noscript.includes(count + ' plages'), region + ' beach coverage count is preserved');
  assert.match(noscript, /dernière observation satellite disponible/i);
  assert.match(noscript, /horodatage/i);
  assert.ok(noscript.includes('href="/carte-sargasses/"'), region + ' map route is preserved');
  assert.ok(noscript.includes('href="/previsions/"'), region + ' forecast route is preserved');
  assert.ok(noscript.includes('href="/alertes/"'), region + ' alerts route is preserved');
}

assert.ok(gpHtml.includes('name="geo.region" content="GP"'), 'Guadeloupe geo identity is preserved');
assert.ok(gpHtml.includes('Sargasses Guadeloupe'), 'Guadeloupe brand is preserved');
assert.ok(mqHtml.includes('Sargasses Martinique'), 'Martinique brand is preserved');

const mqHead = extract(mqHtml, 'head');
const jsonLdBlocks = [];
let cursor = 0;
const openTag = '<script type="application/ld+json">';
const closeTag = '</script>';
while (true) {
  const open = mqHead.indexOf(openTag, cursor);
  if (open < 0) break;
  const bodyStart = open + openTag.length;
  const close = mqHead.indexOf(closeTag, bodyStart);
  assert.ok(close > bodyStart, 'Martinique JSON-LD block is closed');
  jsonLdBlocks.push(mqHead.slice(bodyStart, close).trim());
  cursor = close + closeTag.length;
}
assert.ok(jsonLdBlocks.length >= 3, 'Martinique JSON-LD blocks remain present');
for (const block of jsonLdBlocks) assert.doesNotThrow(() => JSON.parse(block), 'Martinique JSON-LD remains valid');

console.log('HOMEPAGE_STATIC_FRESHNESS_COPY PASS');
