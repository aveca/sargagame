'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const vite = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
const mapEntry = vite.match(/\{ path: 'en\/sargassum-map', title: '([^']+)', desc: '([^']+)' \}/)

assert.ok(mapEntry, 'English sargassum map page remains generated')
const title = mapEntry[1]
const desc = mapEntry[2]

assert.equal(title, 'Sargassum Map Martinique &amp; Guadeloupe — Observations')
assert.ok(title.replace(/&amp;/g, '&').length <= 60, 'map title stays within the SEO title budget')
assert.ok(desc.length <= 155, 'map description stays within the SEO description budget')
assert.match(desc, /published satellite observations/i)
assert.match(desc, /beach timestamps and confidence/i)
assert.match(desc, /forecasts appear only with validated inputs/i)
assert.doesNotMatch(
  title + ' ' + desc,
  /\b(?:real[- ]?time|live|today|daily|four times a day)\b/i,
  'English map snippet must not promise continuous or fixed-cadence data'
)

const ftp = fs.readFileSync(path.join(root, 'scripts/prepare-ftp.cjs'), 'utf8')
assert.ok(
  ftp.includes("content = content.replace(/Martinique &amp; Guadeloupe/g, '##GP_AMP_MQ##')"),
  'Guadeloupe packaging protects the shared two-island phrase before regional replacement'
)
assert.ok(
  ftp.includes("content = content.replace(/##GP_AMP_MQ##/g, 'Guadeloupe &amp; Martinique')"),
  'Guadeloupe map snippet keeps Guadeloupe first after packaging'
)

for (const [file, domain] of [
  ['public/sitemap-martinique.xml', 'sargasses-martinique.com'],
  ['public/sitemap-guadeloupe.xml', 'sargasses-guadeloupe.com'],
]) {
  const sitemap = fs.readFileSync(path.join(root, file), 'utf8')
  assert.ok(
    sitemap.includes('https://' + domain + '/en/sargassum-map/'),
    file + ' keeps the existing English map route'
  )
}

console.log('PASS: English map observation snippet, regional ordering and sitemap routes.')
