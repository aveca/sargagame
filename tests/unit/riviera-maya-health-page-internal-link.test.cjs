#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { generateRegionSeoPages } = require('../../scripts/lib/region-seo-pages.cjs')
const { generateHealthPages } = require('../../scripts/lib/health-page.cjs')

const ROOT = path.resolve(__dirname, '../..')
const region = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', 'rivieramaya.json'), 'utf8'))
const seo = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', 'seo-content', 'rivieramaya.json'), 'utf8'))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-riviera-health-link-'))

try {
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(root, 'index.html'))

  const now = Date.parse('2026-11-05T10:00:00Z')
  const observationTime = new Date(now - 60 * 60_000).toISOString()
  generateRegionSeoPages(region, root, {
    now,
    data: {
      source: 'erddap-live',
      updatedAt: observationTime,
      erddapTimestamp: observationTime,
      dataAgeMinutes: 60,
      stale: false,
      levels: [],
      weekly: {},
    },
  })
  generateHealthPages(region, root)

  const healthLink = /<a href="\/sargazo-salud-riesgos\/">¿A qué huele el sargazo y es peligroso\?<\/a>/
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const map = fs.readFileSync(path.join(root, seo.pages.map.slug, 'index.html'), 'utf8')
  const relatedSlug = seo.extraPages.find(page => page.slug === 'sargazo-riviera-maya')?.slug
  assert.ok(relatedSlug, 'Riviera Maya related-content hub must remain configured')
  const related = fs.readFileSync(path.join(root, relatedSlug, 'index.html'), 'utf8')
  const englishHome = fs.readFileSync(path.join(root, 'en', 'index.html'), 'utf8')
  const health = fs.readFileSync(path.join(root, 'sargazo-salud-riesgos', 'index.html'), 'utf8')
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8')

  assert.match(home, healthLink, 'Spanish homepage links to the dedicated health FAQ')
  assert.match(map, healthLink, 'Spanish map hub links to the dedicated health FAQ')
  assert.match(related, healthLink, 'Spanish Riviera Maya editorial hub links to the dedicated health FAQ')
  assert.doesNotMatch(englishHome, /sargazo-salud-riesgos/,
    'English pages must not link to a Spanish-only health route')
  assert.match(health, /<link rel="canonical" href="https:\/\/sargassumcancun\.com\/sargazo-salud-riesgos\/"\/>/,
    'The dedicated health page keeps its regional canonical')
  assert.equal(
    (sitemap.match(/<loc>https:\/\/sargassumcancun\.com\/sargazo-salud-riesgos\/<\/loc>/g) || []).length,
    1,
    'The health page remains listed exactly once in the Riviera Maya sitemap',
  )

  console.log('RIVIERA_MAYA_HEALTH_PAGE_INTERNAL_LINK PASS')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
