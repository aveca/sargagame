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

// All 50 beaches with their canonical slugs (must match vite.config.js)
// Slugs auto-generated from beach names: lowercase, accents removed, apostrophes removed, spaces→hyphens
const BEACHES = [
  // === Martinique (30 beaches) ===
  { id: 'mq001', island: 'mq', name: 'Plage des Salines', commune: 'Sainte-Anne', slug: 'plage-des-salines' },
  { id: 'mq002', island: 'mq', name: 'Anse Caritan', commune: 'Sainte-Anne', slug: 'anse-caritan' },
  { id: 'mq003', island: 'mq', name: 'Anse Meunier', commune: 'Sainte-Anne', slug: 'anse-meunier' },
  { id: 'mq004', island: 'mq', name: 'Plage du Bourg (Sainte-Anne)', commune: 'Sainte-Anne', slug: 'plage-du-bourg-sainte-anne' },
  { id: 'mq005', island: 'mq', name: 'Anse Trabaud', commune: 'Sainte-Anne', slug: 'anse-trabaud' },
  { id: 'mq006', island: 'mq', name: 'Anse Macabou', commune: 'Sainte-Anne', slug: 'anse-macabou' },
  { id: 'mq007', island: 'mq', name: 'Anse Michel', commune: 'Sainte-Anne', slug: 'anse-michel' },
  { id: 'mq008', island: 'mq', name: 'Plage du Marin', commune: 'Le Marin', slug: 'plage-du-marin' },
  { id: 'mq009', island: 'mq', name: 'Anse Figuier', commune: 'Rivière-Pilote', slug: 'anse-figuier' },
  { id: 'mq010', island: 'mq', name: 'Anse à l\'Âne', commune: 'Les Trois-Îlets', slug: 'anse-a-lane' },
  { id: 'mq011', island: 'mq', name: 'Anse Mitan', commune: 'Les Trois-Îlets', slug: 'anse-mitan' },
  { id: 'mq012', island: 'mq', name: 'Anse Noire', commune: 'Les Anses-d\'Arlet', slug: 'anse-noire' },
  { id: 'mq013', island: 'mq', name: 'Anse Dufour', commune: 'Les Anses-d\'Arlet', slug: 'anse-dufour' },
  { id: 'mq014', island: 'mq', name: 'Grande Anse d\'Arlet', commune: 'Les Anses-d\'Arlet', slug: 'grande-anse-darlet' },
  { id: 'mq015', island: 'mq', name: 'Petite Anse d\'Arlet', commune: 'Les Anses-d\'Arlet', slug: 'petite-anse-darlet' },
  { id: 'mq016', island: 'mq', name: 'Plage du Diamant', commune: 'Le Diamant', slug: 'plage-du-diamant' },
  { id: 'mq017', island: 'mq', name: 'Anse Cafard', commune: 'Le Diamant', slug: 'anse-cafard' },
  { id: 'mq018', island: 'mq', name: 'Petite Anse du Diamant', commune: 'Le Diamant', slug: 'petite-anse-du-diamant' },
  { id: 'mq019', island: 'mq', name: 'Anse Gros Raisins', commune: 'Sainte-Luce', slug: 'anse-gros-raisins' },
  { id: 'mq020', island: 'mq', name: 'Plage de Sainte-Luce', commune: 'Sainte-Luce', slug: 'plage-de-sainte-luce' },
  { id: 'mq021', island: 'mq', name: 'Anse Corps de Garde', commune: 'Sainte-Luce', slug: 'anse-corps-de-garde' },
  { id: 'mq022', island: 'mq', name: 'Pointe Borgnesse', commune: 'Rivière-Pilote', slug: 'pointe-borgnesse' },
  { id: 'mq023', island: 'mq', name: 'Plage de la Française', commune: 'Fort-de-France', slug: 'plage-de-la-francaise' },
  { id: 'mq024', island: 'mq', name: 'Anse Madame', commune: 'Schoelcher', slug: 'anse-madame' },
  { id: 'mq025', island: 'mq', name: 'Plage de Schœlcher', commune: 'Schœlcher', slug: 'plage-de-schoelcher' },
  { id: 'mq026', island: 'mq', name: 'Anse Collat', commune: 'Schœlcher', slug: 'anse-collat' },
  { id: 'mq027', island: 'mq', name: 'Grande Anse du Carbet', commune: 'Le Carbet', slug: 'grande-anse-du-carbet' },
  { id: 'mq028', island: 'mq', name: 'Anse Turin', commune: 'Le Carbet', slug: 'anse-turin' },
  { id: 'mq029', island: 'mq', name: 'Plage de Saint-Pierre', commune: 'Saint-Pierre', slug: 'plage-de-saint-pierre' },
  { id: 'mq030', island: 'mq', name: 'Anse Belleville', commune: 'Le Prêcheur', slug: 'anse-belleville' },
  // === Guadeloupe (20 beaches) ===
  { id: 'gp001', island: 'gp', name: 'Plage de Saint-François', commune: 'Saint-François', slug: 'plage-de-saint-francois' },
  { id: 'gp002', island: 'gp', name: 'Plage des Raisins Clairs', commune: 'Saint-François', slug: 'plage-des-raisins-clairs' },
  { id: 'gp003', island: 'gp', name: 'La Datcha', commune: 'Le Gosier', slug: 'la-datcha' },
  { id: 'gp004', island: 'gp', name: 'Anse à la Gourde', commune: 'Saint-François', slug: 'anse-a-la-gourde' },
  { id: 'gp005', island: 'gp', name: 'Pointe des Châteaux', commune: 'Saint-François', slug: 'pointe-des-chateaux' },
  { id: 'gp006', island: 'gp', name: 'Anse Tarare', commune: 'Saint-François', slug: 'anse-tarare' },
  { id: 'gp008', island: 'gp', name: 'Plage Bois Jolan', commune: 'Sainte-Anne', slug: 'plage-bois-jolan' },
  { id: 'gp009', island: 'gp', name: 'Plage de la Caravelle', commune: 'Sainte-Anne', slug: 'plage-de-la-caravelle' },
  { id: 'gp010', island: 'gp', name: 'Plage de Sainte-Anne', commune: 'Sainte-Anne', slug: 'plage-de-sainte-anne' },
  { id: 'gp012', island: 'gp', name: 'Plage du Gosier', commune: 'Le Gosier', slug: 'plage-du-gosier' },
  { id: 'gp014', island: 'gp', name: 'Plage de Bas-du-Fort', commune: 'Pointe-à-Pitre', slug: 'plage-de-bas-du-fort' },
  { id: 'gp015', island: 'gp', name: 'Porte d\'Enfer', commune: 'Anse-Bertrand', slug: 'porte-denfer' },
  { id: 'gp017', island: 'gp', name: 'Plage du Souffleur', commune: 'Le Moule', slug: 'plage-du-souffleur' },
  { id: 'gp021', island: 'gp', name: 'Plage de Grande Anse', commune: 'Trois-Rivières', slug: 'plage-de-grande-anse' },
  { id: 'gp024', island: 'gp', name: 'Plage de Deshaies', commune: 'Deshaies', slug: 'plage-de-deshaies' },
  { id: 'gp025', island: 'gp', name: 'La Grande Anse (Deshaies)', commune: 'Deshaies', slug: 'la-grande-anse-deshaies' },
  { id: 'gp031', island: 'gp', name: 'Plage de Malendure', commune: 'Bouillante', slug: 'plage-de-malendure' },
  { id: 'gp033', island: 'gp', name: 'Petite Plage Malendure', commune: 'Bouillante', slug: 'petite-plage-malendure' },
  { id: 'gp044', island: 'gp', name: 'Plage de Pompierre', commune: 'Terre-de-Haut (Les Saintes)', slug: 'plage-de-pompierre' },
  { id: 'gp045', island: 'gp', name: 'Plage Pain de Sucre', commune: 'Terre-de-Haut (Les Saintes)', slug: 'plage-pain-de-sucre' },
]

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
