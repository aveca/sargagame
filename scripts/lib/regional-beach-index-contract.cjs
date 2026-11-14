'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { emittedLangs, normLang, langPrefix } = require('./region-langs.cjs')
const { getCanonicalSlug } = require('./slug-resolver.cjs')

function expectedBeachIndexRoutes(region) {
  if (!region || !region.id || !region.domain) {
    throw new Error('A complete region config (id/domain) is required')
  }

  if (region.id === 'mq' || region.id === 'gp') {
    return [{ lang: 'fr', prefix: '', directory: 'plages', route: '/plages/' }]
  }

  return emittedLangs(region).map(lang => {
    const prefix = langPrefix(region, lang)
    const directory = normLang(lang) === 'es' ? 'playas' : 'beaches'
    return {
      lang: normLang(lang),
      prefix,
      directory,
      route: `${prefix}/${directory}/`,
    }
  })
}

function validatePreparedBeachIndexes(region, outputDir) {
  if (!outputDir || !fs.existsSync(outputDir)) {
    throw new Error(`Prepared output directory is missing: ${outputDir || '(empty)'}`)
  }

  const sitemapPath = path.join(outputDir, 'sitemap.xml')
  if (!fs.existsSync(sitemapPath)) {
    throw new Error(`Prepared sitemap.xml is missing for ${region.id}`)
  }
  const sitemap = fs.readFileSync(sitemapPath, 'utf8')
  const routes = expectedBeachIndexRoutes(region)

  if (!routes.length) {
    throw new Error(`No localized beach index route is configured for ${region.id}`)
  }

  for (const item of routes) {
    const relative = `${item.route}index.html`
    const file = path.join(outputDir, ...relative.split('/').filter(Boolean))
    if (!fs.existsSync(file)) {
      throw new Error(`${region.id}: prepared beach index missing at ${relative}`)
    }

    const html = fs.readFileSync(file, 'utf8')
    const canonical = `https://${region.domain}${item.route}`
    if (!html.includes(`<link rel="canonical" href="${canonical}"`)) {
      throw new Error(`${region.id}: ${item.route} has no self-canonical ${canonical}`)
    }
    if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
      throw new Error(`${region.id}: ${item.route} is absent from prepared sitemap.xml`)
    }

    if (region.id !== 'mq' && region.id !== 'gp') {
      if (!html.includes(`<html lang="${item.lang}"`)) {
        throw new Error(`${region.id}: ${item.route} has incorrect html lang`)
      }
      if (!html.includes(`hreflang="${item.lang}" href="${canonical}"`)) {
        throw new Error(`${region.id}: ${item.route} has no self hreflang`)
      }
      const primaryLang = normLang(region.primaryLang)
      const primaryDirectory = primaryLang === 'es' ? 'playas' : 'beaches'
      const xDefault = `https://${region.domain}/${primaryDirectory}/`
      if (!html.includes(`hreflang="x-default" href="${xDefault}"`)) {
        throw new Error(`${region.id}: ${item.route} has incorrect x-default`)
      }

      const beaches = Array.isArray(region.beaches) ? region.beaches : []
      for (const beach of beaches) {
        const slug = getCanonicalSlug(beach)
        const href = `href="${item.prefix}/${item.directory}/${slug}/"`
        if (!slug || !html.includes(href)) {
          throw new Error(`${region.id}: ${item.route} does not link beach ${beach.id || beach.name}`)
        }
      }
    }
  }

  return routes
}

module.exports = { expectedBeachIndexRoutes, validatePreparedBeachIndexes }
