#!/usr/bin/env node
/**
 * generate-regional-sitemaps.cjs
 *
 * Génère les fichiers sitemap.xml pour les régions qui n'en ont pas
 * (florida, puntacana, rivieramaya, tulum, barbados).
 *
 * Les sitemaps MQ/GP existent déjà (public/sitemap-martinique.xml,
 * public/sitemap-guadeloupe.xml).
 *
 * Usage: node scripts/generate-regional-sitemaps.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGIONS_DIR = path.join(ROOT, 'regions');
const OUT_DIR = path.join(ROOT, 'public');

const REGIONS = [
  { id: 'florida', domain: 'sargassummiami.com', primaryLang: 'en', secondaryLangs: ['es'] },
  { id: 'puntacana', domain: 'sargassumpuntacana.com', primaryLang: 'en', secondaryLangs: ['es'] },
  { id: 'rivieramaya', domain: 'sargassumcancun.com', primaryLang: 'es', secondaryLangs: ['en'] },
  { id: 'tulum', domain: 'sargazotulum.com', primaryLang: 'es', secondaryLangs: ['en'] },
  { id: 'barbados', domain: 'sargassumbarbados.com', primaryLang: 'en', secondaryLangs: ['es'] },
];

const ISO_TODAY = new Date().toISOString().slice(0, 10);

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(n) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function loadRegionConfig(regionId) {
  const p = path.join(REGIONS_DIR, regionId + '.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadSeoContent(regionId, lang) {
  // Try primary lang file first, then fallback
  const candidates = [
    path.join(REGIONS_DIR, 'seo-content', regionId + '.' + lang + '.json'),
    path.join(REGIONS_DIR, 'seo-content', regionId + '.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return JSON.parse(fs.readFileSync(c, 'utf8'));
    }
  }
  return null;
}

function loadResorts(regionId) {
  const p = path.join(REGIONS_DIR, 'resorts', regionId + '.json');
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return [];
}

function buildSitemap(regionId, regionConfig, regionData) {
  const domain = regionConfig.domain;
  const primary = regionConfig.primaryLang;
  const langs = [primary, ...(regionConfig.secondaryLangs || [])]
    .filter((l, i, a) => a.indexOf(l) === i);

  const seoContent = {};
  for (const lang of langs) {
    seoContent[lang] = loadSeoContent(regionId, lang);
  }

  const resorts = loadResorts(regionId);
  const beaches = regionData.beaches || [];

  const sitemap = [];

  // Helper to push URL
  const pushUrl = (loc, opts = {}) => {
    sitemap.push({
      loc: loc,
      changefreq: opts.changefreq || 'weekly',
      priority: opts.priority || '0.5',
    });
  };

  // Determine page slugs from seo content or region routes
  const getSlug = (lang, key) => {
    const sc = seoContent[lang];
    if (sc && sc.pages && sc.pages[key] && sc.pages[key].slug) {
      return sc.pages[key].slug;
    }
    // Fallback to region routes
    const routes = regionData.routes || {};
    if (routes[key]) return routes[key];
    return null;
  };

  const beachesDir = (lang) => {
    const sc = seoContent[lang];
    if (sc && sc.pages && sc.pages.beaches && sc.pages.beaches.dir) {
      return sc.pages.beaches.dir;
    }
    return lang === 'es' ? 'playas' : 'beaches';
  };

  const resortsDir = (lang) => {
    const sc = seoContent[lang];
    if (sc && sc.pages && sc.pages.resorts && sc.pages.resorts.dir) {
      return sc.pages.resorts.dir;
    }
    return lang === 'es' ? 'hoteles' : 'resorts';
  };

  // === Home page ===
  for (const lang of langs) {
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/`, { changefreq: 'daily', priority: lang === primary ? '1.0' : '0.9' });
  }

  // === Map page ===
  for (const lang of langs) {
    const sc = seoContent[lang];
    const mapSlug = (sc && sc.pages && sc.pages.map && sc.pages.map.slug) || 'carte-sargasses';
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${mapSlug}/`, { changefreq: 'daily', priority: '0.8' });
  }

  // === Forecast page ===
  for (const lang of langs) {
    const sc = seoContent[lang];
    const fcSlug = (sc && sc.pages && sc.pages.forecast && sc.pages.forecast.slug) || 'previsions';
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${fcSlug}/`, { changefreq: 'daily', priority: '0.7' });
  }

  // === Alerts page ===
  for (const lang of langs) {
    const sc = seoContent[lang];
    const alertSlug = (sc && sc.pages && sc.pages.alerts && sc.pages.alerts.slug) || 'alertes';
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${alertSlug}/`, { changefreq: 'daily', priority: '0.6' });
  }

  // === Season page ===
  for (const lang of langs) {
    const sc = seoContent[lang];
    const seasonSlug = (sc && sc.pages && sc.pages.season && sc.pages.season.slug) || 'saison-sargasses';
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${seasonSlug}/`, { changefreq: 'weekly', priority: '0.6' });
  }

  // === Best beaches page ===
  for (const lang of langs) {
    const sc = seoContent[lang];
    const bestSlug = (sc && sc.pages && sc.pages.best && sc.pages.best.slug) ||
      (regionData.routes && regionData.routes.best) || 'meilleures-plages';
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${bestSlug}/`, { changefreq: 'daily', priority: '0.8' });
  }

  // === Weekly page ===
  for (const lang of langs) {
    const sc = seoContent[lang];
    const weeklySlug = (sc && sc.pages && sc.pages.weekly && sc.pages.weekly.slug) ||
      (regionData.routes && regionData.routes.weekly) || 'bulletin';
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${weeklySlug}/`, { changefreq: 'daily', priority: '0.7' });
  }

  // === B2B Hotels page ===
  for (const lang of langs) {
    const hotelsSlug = lang === 'es' ? 'sargazo-para-hoteles' : 'sargassum-for-hotels';
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${hotelsSlug}/`, { changefreq: 'weekly', priority: '0.6' });
  }

  // === Beach pages ===
  for (const lang of langs) {
    const bDir = beachesDir(lang);
    const prefix = lang === primary ? '' : '/' + lang;
    for (const b of beaches) {
      const slug = b.slug || slugify(b.name);
      pushUrl(`https://${domain}${prefix}/${bDir}/${slug}/`, { changefreq: 'daily', priority: '0.7' });
    }
  }

  // === Resort pages ===
  for (const lang of langs) {
    const rDir = resortsDir(lang);
    const prefix = lang === primary ? '' : '/' + lang;
    for (const r of resorts) {
      const slug = r.slug || slugify(r.name);
      pushUrl(`https://${domain}${prefix}/${rDir}/${slug}/`, { changefreq: 'weekly', priority: '0.5' });
    }
  }

  // === Resort directory ===
  for (const lang of langs) {
    const rDir = resortsDir(lang);
    const prefix = lang === primary ? '' : '/' + lang;
    pushUrl(`https://${domain}${prefix}/${rDir}/`, { changefreq: 'weekly', priority: '0.5' });
  }

  return sitemap;
}

function writeSitemap(regionId, sitemap) {
  const outPath = path.join(OUT_DIR, 'sitemap-' + regionId + '.xml');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(u => `  <url><loc>${escapeXml(u.loc)}</loc><lastmod>${ISO_TODAY}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(outPath, xml, 'utf-8');
  console.log(`Generated ${outPath} (${sitemap.length} URLs)`);
}

function main() {
  console.log('Generating regional sitemaps...\n');

  for (const region of REGIONS) {
    try {
      const regionData = loadRegionConfig(region.id);
      const sitemap = buildSitemap(region.id, region, regionData);
      writeSitemap(region.id, sitemap);
    } catch (e) {
      console.error(`Error generating sitemap for ${region.id}:`, e.message);
    }
  }

  console.log('\nDone. Now update robots.txt to reference all sitemaps.');
}

main();
