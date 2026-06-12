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

// ── Sites USD (multi-region scaling 2026-06) ─────────────────
// Différences structurelles vs MQ/GP — `regionConfig: true` permet aux
// consommateurs de SITES de skipper proprement les chemins spécifiques MQ/GP :
//  - GSC : propriétés URL-PREFIX `https://<domain>/` (créées par provision-gsc.cjs),
//    pas sc-domain:
//  - GA4 : property id numérique stocké nulle part (pas de secret GA4_PROPERTY_ID_*) —
//    seo-audit.cjs le résout au runtime via l'Admin API à partir de ga4MeasurementId
//    (= regions/<id>.json .ga4Id)
//  - plages : regions/<id>.json .beaches, routes /beaches|playas/<slug>/ —
//    PAS beaches-list.json ni /plages/, PAS de slugs éditoriaux FR
const REGION_CONFIGS = {} // siteKey -> regions/<id>.json parsé (sites USD uniquement)
for (const id of ['florida', 'puntacana', 'rivieramaya']) {
  try {
    const r = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'regions', `${id}.json`), 'utf-8'))
    REGION_CONFIGS[id] = r
    SITES[id] = {
      domain: r.domain,
      siteUrl: `https://${r.domain}/`,
      ga4PropertyId: '', // résolu au runtime par seo-audit.cjs (Admin API)
      ga4MeasurementId: r.ga4Id || '',
      clarityId: r.clarityProjectId || '',
      regionConfig: true,
    }
  } catch (e) {
    console.warn(`config.cjs: Could not load regions/${id}.json — site "${id}" skipped:`, e.message)
  }
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

// Editorial long-tail pages (priority for indexation — these target the year-round
// SEO strategy and Google was not crawling them as of session 35 audit).
const EDITORIAL_SLUGS = [
  'comprendre-sargasses',
  'danger-sargasses-h2s',
  'detection-satellite-sargasses',
  'previsions-methode',
  'nettoyer-sargasses',
  'sargasses-record-2026',
  'bilan-sargasses-2025',
  'saison-sargasses-martinique',
  'saison-sargasses-guadeloupe',
  'meilleures-plages-martinique-sargasses',
  'plages-sans-sargasses',
  'methode-carte',
  'faq',
  'lexique',
]

// All known URLs per site (for indexation checks).
// Order matters: GSC URL Inspection is rate-limited (200/day/site) and the audit
// caps the sample (URL_INSPECT_LIMIT). Front-load high-value pages so they're
// always inspected.
function getKnownUrls(siteKey) {
  const domain = SITES[siteKey].domain
  const base = `https://${domain}`
  // Sites USD : URLs connues = home + hubs (routes.*) + plages
  // /beaches|playas/<slug>/ (même slugify que region-seo-pages.cjs).
  // Les slugs éditoriaux FR et beaches-list.json ne s'appliquent pas ici.
  if (SITES[siteKey].regionConfig) {
    const urls = [`${base}/`]
    const region = REGION_CONFIGS[siteKey]
    if (region) {
      for (const route of Object.values(region.routes || {})) urls.push(`${base}/${route}/`)
      const beachesDir = region.primaryLang === 'es' ? 'playas' : 'beaches'
      for (const b of region.beaches || []) urls.push(`${base}/${beachesDir}/${slugify(b.name)}/`)
    }
    return urls
  }
  const urls = [
    `${base}/`,
    `${base}/carte-sargasses/`,
    `${base}/previsions/`,
    `${base}/alertes/`,
    `${base}/en/`,
  ]
  for (const slug of EDITORIAL_SLUGS) urls.push(`${base}/${slug}/`)
  // Filter beaches by island. Before session 35 both sites mirrored all beaches
  // (cross-domain duplicate content). Now /plages/<wrong-island>/ returns 404,
  // so feeding those URLs to GSC inspection / Indexing API would waste quota
  // and send Google bad signals about non-existent pages.
  for (const b of BEACHES) {
    if (b.island === siteKey) urls.push(`${base}/plages/${b.slug}/`)
  }
  urls.push(`${base}/mentions-legales.html`, `${base}/confidentialite.html`)
  return urls
}

// Slug lookup: normalize a path fragment to a known beach slug
function findBeachBySlug(fragment) {
  const normalized = fragment.replace(/^\/|\/$/g, '').toLowerCase()
  return BEACHES.find(b => b.slug === normalized || b.id === normalized)
}

module.exports = { SITES, BEACHES, getKnownUrls, findBeachBySlug }
