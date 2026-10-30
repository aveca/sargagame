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
  const match = html.match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  assert.ok(match, 'expected <' + tag + '> section');
  return match[1];
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
  assert.match(head, new RegExp('<link rel="canonical" href="' + canonical.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&') + '"'));
  assert.match(head, /hreflang="fr"/);
  assert.match(head, /hreflang="en"/);
  assert.match(head, /hreflang="es"/);
  assert.match(noscript, new RegExp(count + ' plages'));
  assert.match(noscript, /dernière observation satellite disponible/i);
  assert.match(noscript, /horodatage/i);
  assert.match(noscript, /href="\\/carte-sargasses\\/"/);
}

assert.match(gpHtml, /name="geo.region" content="GP"/);
assert.match(gpHtml, /Sargasses Guadeloupe/);
assert.match(mqHtml, /Sargasses Martinique/);

const mqJsonLd = [...extract(mqHtml, 'head').matchAll(/<script type="application\\/ld\\+json">([\\s\\S]*?)<\\/script>/g)];
assert.ok(mqJsonLd.length >= 3, 'Martinique JSON-LD blocks remain present');
for (const block of mqJsonLd) assert.doesNotThrow(() => JSON.parse(block[1].trim()), 'Martinique JSON-LD remains valid');

console.log('HOMEPAGE_STATIC_FRESHNESS_COPY PASS');
