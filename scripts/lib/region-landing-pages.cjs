'use strict';

/**
 * Pages de destination régionales qui ne correspondent pas nécessairement au
 * nom d'une plage de beaches-list.json. Elles doivent survivre au packaging
 * régional pour que les URLs canoniques présentes dans les pages et sitemaps
 * ne renvoient pas 404.
 */
const LANDING_PAGES = Object.freeze({
  puntacana: Object.freeze([
    Object.freeze({ lang: 'fr', file: 'plages/playa-punta-cana/index.html', url: '/plages/playa-punta-cana/' }),
    Object.freeze({ lang: 'en', file: 'en/plages/punta-cana/index.html', url: '/en/plages/punta-cana/' }),
    Object.freeze({ lang: 'es', file: 'es/playas/punta-cana/index.html', url: '/es/playas/punta-cana/' }),
  ]),
  rivieramaya: Object.freeze([
    Object.freeze({ lang: 'fr', file: 'plages/playa-del-carmen/index.html', url: '/plages/playa-del-carmen/' }),
    Object.freeze({ lang: 'en', file: 'en/plages/playa-del-carmen/index.html', url: '/en/plages/playa-del-carmen/' }),
    Object.freeze({ lang: 'es', file: 'es/playas/playa-del-carmen/index.html', url: '/es/playas/playa-del-carmen/' }),
  ]),
  tulum: Object.freeze([
    Object.freeze({ lang: 'fr', file: 'plages/playa-tulum/index.html', url: '/plages/playa-tulum/' }),
    Object.freeze({ lang: 'en', file: 'en/plages/playa-tulum/index.html', url: '/en/plages/playa-tulum/' }),
    Object.freeze({ lang: 'es', file: 'es/playas/playa-tulum/index.html', url: '/es/playas/playa-tulum/' }),
  ]),
});

function getRegionLandingPages(regionId) {
  return (LANDING_PAGES[regionId] || []).map(page => ({ ...page }));
}

function withLandingPageSlugs(regionId, existingSlugs) {
  const slugs = new Set(existingSlugs || []);
  for (const page of LANDING_PAGES[regionId] || []) {
    const match = page.file.match(/^plages\/([^/]+)\/index\.html$/);
    if (match) slugs.add(match[1]);
  }
  return slugs;
}

module.exports = { getRegionLandingPages, withLandingPageSlugs };
