#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { generateHealthPages } = require('../../scripts/lib/health-page.cjs')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-health-authority-'))

function render(region) {
  const dist = path.join(root, region.id)
  fs.mkdirSync(dist, { recursive: true })
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>', 'utf8')
  generateHealthPages(region, dist)
  const slug = region.primaryLang === 'es' ? 'sargazo-salud-riesgos' : 'sargassum-health-risks'
  return {
    html: fs.readFileSync(path.join(dist, slug, 'index.html'), 'utf8'),
    sitemap: fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8'),
    slug,
  }
}

try {
  const tulum = render({
    id: 'tulum',
    name: 'Tulum',
    domain: 'sargazotulum.com',
    primaryLang: 'es',
  })
  assert.match(tulum.html, /las autoridades de salud de Quintana Roo/,
    'Tulum health guidance must name the local Quintana Roo health authorities')
  assert.doesNotMatch(tulum.html, /Departamento de Salud de Florida/,
    'Tulum must never inherit Florida health authority copy')
  assert.match(tulum.html, /<link rel="canonical" href="https:\/\/sargazotulum\.com\/sargazo-salud-riesgos\/">/,
    'Tulum canonical remains on its regional domain')
  assert.ok(tulum.sitemap.includes('https://sargazotulum.com/sargazo-salud-riesgos/'),
    'Tulum health page remains in the regional sitemap')

  const riviera = render({
    id: 'rivieramaya',
    name: 'Riviera Maya',
    domain: 'sargassumcancun.com',
    primaryLang: 'es',
  })
  assert.match(riviera.html, /las autoridades de salud de Quintana Roo/,
    'Riviera Maya authority wording remains unchanged')

  const florida = render({
    id: 'florida',
    name: 'Florida',
    domain: 'sargassummiami.com',
    primaryLang: 'en',
  })
  assert.match(florida.html, /the Florida Department of Health/,
    'Florida keeps its own authority mapping')

  console.log('TULUM_HEALTH_AUTHORITY_REGIONAL_COPY PASS')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
