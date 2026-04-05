/**
 * Central configuration for SEO automation.
 * Domains, GA4 property IDs, beach slug mappings, known URLs.
 *
 * BEACHES are loaded dynamically from beaches-list.json (single source of truth).
 * Slugs are generated with the same function as vite.config.js.
 */

const { readFileSync } = require('fs')
const { resolve } = require('path')

const SITES = {
  mq: {
    domain: 'sargasses-martinique.com',
    siteUrl: 'sc-domain:sargasses-martinique.com',
    ga4PropertyId: process.env.GA4_PROPERTY_ID_MQ || '',
    clarityId: 'w4o6w9aenv',
  },
  gp: {
    domain: 'sargasses-guadeloupe.com',
    siteUrl: 'sc-domain:sargasses-guadeloupe.com',
    ga4PropertyId: process.env.GA4_PROPERTY_ID_GP || '',
    clarityId: 'w4oect7ph3',
  },
}

// Slugify — must match vite.config.js exactly
const slugify = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Load beaches dynamically from beaches-list.json (single source of truth)
let BEACHES = []
try {
  const raw = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'public', 'data', 'beaches-list.json'), 'utf-8'))
  BEACHES = raw.map(b => ({
    id: b.id,
    island: b.island,
    name: b.name,
    commune: b.commune,
    slug: slugify(b.name),
  }))
} catch (e) {
  console.warn('config.cjs: Could not load beaches-list.json:', e.message)
  console.warn('config.cjs: BEACHES array will be empty — slug lookups will fail gracefully.')
}

// All known URLs per site (for indexation checks)
function getKnownUrls(siteKey) {
  const domain = SITES[siteKey].domain
  const base = `https://${domain}`
  const urls = [
    `${base}/`,
    `${base}/carte-sargasses/`,
    `${base}/previsions/`,
    `${base}/alertes/`,
    `${base}/en/`,
    `${base}/mentions-legales.html`,
    `${base}/confidentialite.html`,
  ]
  for (const b of BEACHES) {
    // All beaches appear on both sites (same /plages/ structure)
    urls.push(`${base}/plages/${b.slug}/`)
  }
  return urls
}

// Slug lookup: normalize a path fragment to a known beach slug
function findBeachBySlug(fragment) {
  const normalized = fragment.replace(/^\/|\/$/g, '').toLowerCase()
  return BEACHES.find(b => b.slug === normalized || b.id === normalized)
}

module.exports = { SITES, BEACHES, getKnownUrls, findBeachBySlug }
