/**
 * Central configuration for SEO automation.
 * Domains, GA4 property IDs, beach slug mappings, known URLs.
 */

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

// All beaches with their canonical slugs (must match vite.config.js)
const BEACHES = [
  { id: 'grande-anse', island: 'mq', name: "Grande Anse d'Arlet", commune: 'Les Anses-d\'Arlet', slug: 'grande-anse-darlet' },
  { id: 'anse-mitan', island: 'mq', name: 'Anse Mitan', commune: 'Les Trois-Îlets', slug: 'anse-mitan' },
  { id: 'anse-noire', island: 'mq', name: 'Anse Noire', commune: 'Les Anses-d\'Arlet', slug: 'anse-noire' },
  { id: 'tartane', island: 'mq', name: 'Tartane', commune: 'La Trinité', slug: 'tartane' },
  { id: 'anse-madame', island: 'mq', name: 'Anse Madame', commune: 'Schoelcher', slug: 'anse-madame' },
  { id: 'diamant', island: 'mq', name: 'Le Diamant', commune: 'Le Diamant', slug: 'le-diamant' },
  { id: 'pt-marin', island: 'mq', name: 'Pointe Marin', commune: 'Sainte-Anne', slug: 'pointe-marin' },
  { id: 'sainte-anne', island: 'mq', name: 'Sainte-Anne', commune: 'Sainte-Anne', slug: 'sainte-anne' },
  { id: 'les-salines', island: 'mq', name: 'Les Salines', commune: 'Sainte-Anne', slug: 'les-salines' },
  { id: 'vauclin', island: 'mq', name: 'Le Vauclin', commune: 'Le Vauclin', slug: 'le-vauclin' },
  { id: 'gp-grande-anse', island: 'gp', name: 'Grande Anse', commune: 'Bouillante', slug: 'grande-anse-bouillante' },
  { id: 'gp-malendure', island: 'gp', name: 'Malendure', commune: 'Bouillante', slug: 'malendure' },
  { id: 'gp-sainte-anne', island: 'gp', name: 'Sainte-Anne', commune: 'Sainte-Anne', slug: 'sainte-anne-guadeloupe' },
  { id: 'gp-pt-chateaux', island: 'gp', name: 'Pointe des Châteaux', commune: 'Saint-François', slug: 'pointe-des-chateaux' },
  { id: 'gp-gosier', island: 'gp', name: 'Le Gosier', commune: 'Le Gosier', slug: 'le-gosier' },
  { id: 'gp-caravelle', island: 'gp', name: 'Plage de la Caravelle', commune: 'Saint-François', slug: 'plage-caravelle' },
  { id: 'gp-bas-du-fort', island: 'gp', name: 'Bas-du-Fort', commune: 'Pointe-à-Pitre', slug: 'bas-du-fort' },
  { id: 'gp-deshaies', island: 'gp', name: 'Grande Anse des Haies', commune: 'Deshaies', slug: 'grande-anse-deshaies' },
  { id: 'gp-moule', island: 'gp', name: 'Plage de la Souffleur', commune: 'Le Moule', slug: 'plage-souffleur' },
  { id: 'gp-vieux-fort', island: 'gp', name: 'Anse de la Gourde', commune: 'Saint-François', slug: 'anse-de-la-gourde' },
]

// All known URLs per site (for indexation checks)
function getKnownUrls(siteKey) {
  const domain = SITES[siteKey].domain
  const base = `https://${domain}`
  const urls = [
    `${base}/`,
    `${base}/carte-sargasses/`,
    `${base}/previsions/`,
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
