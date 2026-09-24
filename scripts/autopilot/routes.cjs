/**
 * routes.cjs — manifest des routes production à observer.
 *
 * Sources de vérité :
 *  - regions/index.cjs (domaines live)
 *  - public/sitemap*.xml (pages SEO réelles, deep links)
 * Routes "app" (experience/tomorrow/backup/trip/share/premium/checkout) :
 *  états in-app sans URL propre → atteints par INTERACTION dans observe.cjs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// Régions live (barbados = préparé, NON live — exclu)
const LIVE = {
  mq: { domain: 'sargasses-martinique.com', sitemap: 'sitemap-martinique.xml' },
  gp: { domain: 'sargasses-guadeloupe.com', sitemap: 'sitemap-guadeloupe.xml' },
  florida: { domain: 'sargassummiami.com', sitemap: 'sitemap-miami.xml' },
  rivieramaya: { domain: 'sargassumcancun.com', sitemap: 'sitemap-cancun.xml' },
  tulum: { domain: 'sargazotulum.com', sitemap: null },
  puntacana: { domain: 'sargassumpuntacana.com', sitemap: 'sitemap-puntacana.xml' },
};

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

function sitemapUrls(file) {
  try {
    const xml = fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  } catch (_) { return []; }
}

/** Routes par domaine. full = toutes les pages SEO du sitemap ; sinon échantillon priorisé. */
function routesFor(region, { full = false } = {}) {
  const base = `https://${region.domain}`;
  const sm = region.sitemap ? sitemapUrls(region.sitemap) : [];
  const paths = sm.map(u => { try { return new URL(u).pathname; } catch (_) { return null; } }).filter(Boolean);

  // Priorité : previsions/forecast, carte/map, plages-sans/best-beaches, saison/season, /en/
  const pri = [/previsions|forecast|pronostico/i, /carte|map|mapa/i, /sans-sargasses|no-sargassum|sin-sargazo/i, /saison|season|temporada/i, /^\/en\//i];
  const picked = [];
  for (const re of pri) {
    const hit = paths.find(p => !picked.includes(p) && re.test(p));
    if (hit) picked.push(hit);
  }
  const seo = full ? paths : picked.slice(0, 5);

  return [
    { name: 'home', url: base + '/', kind: 'app' },
    { name: 'premium', url: base + '/?paywall=1', kind: 'app' },        // paywall + checkout entry
    { name: 'b2b', url: base + '/?pro=1', kind: 'app' },                // entrée B2B
    ...seo.map(p => ({ name: 'seo:' + p, url: base + p, kind: 'seo' })),
  ];
}

function manifest({ domains, full } = {}) {
  const keys = domains && domains.length
    ? domains.map(d => d.trim()).filter(d => LIVE[d])
    : Object.keys(LIVE);
  return keys.map(k => ({ region: k, domain: LIVE[k].domain, routes: routesFor(LIVE[k], { full }) }));
}

module.exports = { manifest, routesFor, VIEWPORTS, LIVE };

if (require.main === module) {
  const full = process.argv.includes('--full');
  const m = manifest({ full });
  for (const d of m) {
    console.log(`\n${d.region} (${d.domain})`);
    for (const r of d.routes) console.log('  ' + r.kind.padEnd(4), r.name.padEnd(40), r.url);
  }
}
