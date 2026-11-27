const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/region-seo-pages.cjs'),
  'utf8'
)
const briefBlock = source.slice(
  source.indexOf('const _BRIEF_T = {'),
  source.indexOf('\nfunction buildResortBrief')
)
assert.notEqual(briefBlock, source, 'resort brief copy block must exist')

const footers = [...briefBlock.matchAll(/foot:\s*'([^']+)'/g)].map(match => match[1])
assert.equal(footers.length, 2, 'English and Spanish resort brief footers must both be present')
assert.deepEqual(footers, [
  'Satellite observations are intermittent; check observation time and confidence before advising guests',
  'Las observaciones satelitales no son continuas; revisa la hora y la confianza antes de orientar a tus huéspedes',
])
assert.doesNotMatch(footers.join(' '), /4\s*[×x]\s*(?:a\s*)?(?:day|día)|4 veces al día|four times a day|refreshed/i)
console.log('PASS: resort brief footers do not promise an unsupported satellite refresh cadence (EN/ES)')
