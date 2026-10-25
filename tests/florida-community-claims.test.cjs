'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const file = path.join(__dirname, '..', 'regions', 'seo-content', 'florida.json')
const content = JSON.parse(fs.readFileSync(file, 'utf8'))
const strings = []
function collect(value) {
  if (typeof value === 'string') strings.push(value)
  else if (Array.isArray(value)) value.forEach(collect)
  else if (value && typeof value === 'object') Object.values(value).forEach(collect)
}
collect(content)

// The documented production pipeline only integrates community reports for MQ/GP.
// Florida SEO copy must not claim that ground reports correct or fill satellite gaps.
const unsupportedGroundReportClaim = /(?:\b(?:beachgoer|community|ground|on-the-ground)\s+reports?\b|\breports?\s+from\s+people\s+on\s+the\s+sand\b|\bpeople\s+reporting\s+from\s+the\s+sand\b|cross-checked\s+against\s+reports\s+from\s+people\s+on\s+the\s+sand|cross-checks\s+against\s+people\s+reporting\s+from\s+the\s+sand)/i
for (const text of strings) {
  assert.equal(unsupportedGroundReportClaim.test(text), false, 'Unsupported Florida ground-report claim: ' + text)
}

const accuracyFaq = content.faq.find(item => item.q === 'How accurate is this sargassum tracker?')
assert.ok(accuracyFaq, 'Florida accuracy FAQ must remain available')
assert.match(accuracyFaq.a, /data age/i)
assert.match(accuracyFaq.a, /confidence level/i)
assert.match(content.pages.forecast.method, /satellite/i)
assert.match(content.pages.forecast.method, /confidence/i)
console.log('Florida community-report claims: OK')
