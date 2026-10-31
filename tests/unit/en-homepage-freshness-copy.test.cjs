#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const html = fs.readFileSync(path.join(root, 'public/en/index.html'), 'utf8')
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap-martinique.xml'), 'utf8')
const lower = html.toLowerCase()

// The English fallback must describe published observations, not imply a live feed.
const unsupportedClaims = [
  'real-time',
  'real time',
  'in real time',
  'live map',
  'live status',
  'updated regularly',
  'updated daily',
  'four times a day',
  '4 times a day',
  '4×',
]
for (const claim of unsupportedClaims) {
  assert.equal(lower.includes(claim.toLowerCase()), false, `Unsupported freshness claim remains: ${claim}`)
}

assert.match(html, /latest published satellite observations/i)
assert.match(html, /satellite passes are intermittent/i)
assert.match(html, /do not guarantee the exact shoreline state/i)

// Preserve the English landing's indexation and language contract.
assert.ok(html.includes('<link rel="canonical" href="https://sargasses-martinique.com/en/" />'))
assert.ok(html.includes('<link rel="alternate" hreflang="fr" href="https://sargasses-martinique.com/" />'))
assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://sargasses-martinique.com/en/" />'))
assert.ok(html.includes('<link rel="alternate" hreflang="x-default" href="https://sargasses-martinique.com/" />'))
assert.ok(html.includes('<meta property="og:url" content="https://sargasses-martinique.com/en/" />'))

// The primary CTA must leave the fallback page for the real English map route.
const cta = html.match(/<a\b[^>]*class="cta"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
assert.ok(cta, 'English landing CTA must exist')
assert.equal(cta[1], '/en/sargassum-map/', 'CTA must open the English map, not loop back to /en/')
assert.ok(sitemap.includes('https://sargasses-martinique.com/en/sargassum-map/'), 'CTA destination must remain in the published sitemap')
assert.match(cta[2], /Explore the beach map/i)

console.log('PASS: English fallback freshness copy, canonical/hreflang and non-looping map CTA.')
