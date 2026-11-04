'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', '..', 'regions', 'seo-content', 'puntacana.es.json');
const content = JSON.parse(fs.readFileSync(file, 'utf8'));
const page = content.extraPages.find(item => item.slug === 'sargazo-bavaro-hoy');

assert.ok(page, 'Spanish Bávaro landing page remains present');
assert.equal(page.lang, 'es', 'page language remains Spanish');
assert.equal(page.daily, true, 'daily sitemap contract remains enabled');
assert.equal(page.priority, 0.7, 'SEO priority remains unchanged');

const copy = [
  page.title,
  page.desc,
  page.h1,
  page.intro,
  ...page.sections.flatMap(section => [section.h2, section.text]),
  ...page.faq.flatMap(item => [item.q, item.a]),
].join(' ');

assert.match(copy, /última observación satelital/i, 'copy identifies the latest published satellite observation');
assert.match(copy, /retrasad/i, 'copy explains delayed observations');
assert.match(copy, /suspende|no se emite/i, 'copy says current verdicts are withheld when freshness cannot be verified');
assert.match(copy, /no es una garantía|no garantiza/i, 'copy avoids guaranteed clean-beach claims');
assert.doesNotMatch(copy, /cuatro veces al día|4× al día|actualizado 4×|actualizada 4×|mapa en vivo|estado en vivo|recalculad[oa]s? cuatro veces/i, 'copy makes no unsupported live/frequency promise');

console.log('OK puntacana-bavaro-copy-freshness: 10 assertions');
