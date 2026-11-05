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
  assert.match(tulum.html, /<title>¿El sargazo es peligroso\? Salud y seguridad en la playa — Tulum<\/title>/,
    'Tulum keeps the shared Spanish health title')
  assert.match(tulum.html, /<link rel="canonical" href="https:\/\/sargazotulum\.com\/sargazo-salud-riesgos\/"\/>/,
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
  assert.match(riviera.html, /<title>¿A qué huele el sargazo y es peligroso\? Riviera Maya<\/title>/,
    'Riviera Maya title matches the observed odor and danger search intent')
  assert.match(riviera.html, /<meta name="description" content="¿A qué huele el sargazo y cuándo conviene alejarse\? Olor a huevo podrido, posibles molestias y precauciones generales en Riviera Maya\. No es consejo médico\."\/>/,
    'Riviera Maya description stays conservative and matches the page content')
  const title = riviera.html.match(/<title>(.*?)<\/title>/)?.[1] || ''
  const description = riviera.html.match(/<meta name="description" content="(.*?)"\/>/)?.[1] || ''
  assert.ok(title.length <= 60, 'Riviera Maya title remains within 60 characters')
  assert.ok(description.length <= 158, 'Riviera Maya description remains within 158 characters')
  assert.match(riviera.html, /<link rel="canonical" href="https:\/\/sargassumcancun\.com\/sargazo-salud-riesgos\/"\/>/,
    'Riviera Maya canonical remains unchanged')
  assert.ok(riviera.sitemap.includes('https://sargassumcancun.com/sargazo-salud-riesgos/'),
    'Riviera Maya health page remains in the regional sitemap')

  const florida = render({
    id: 'florida',
    name: 'Florida',
    domain: 'sargassummiami.com',
    primaryLang: 'en',
  })
  assert.match(florida.html, /the Florida Department of Health/,
    'Florida keeps its own authority mapping')
  assert.match(florida.html, /<title>Is Sargassum Dangerous\? Beach Health &amp; Safety FAQ — Florida<\/title>/,
    'Florida keeps its existing English health title')

  console.log('TULUM_HEALTH_AUTHORITY_REGIONAL_COPY PASS')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
