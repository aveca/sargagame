'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Regions = require('../regions/index.cjs');
const { getRegionLandingPages } = require('./lib/region-landing-pages.cjs');

const root = path.resolve(__dirname, '..');
const regionId = process.env.REGION || process.env.VITE_REGION;
if (!regionId) {
  console.error('Usage: REGION=puntacana node scripts/verify-region-landing-pages.cjs');
  process.exit(2);
}
const region = Regions.getRegion(regionId);
const pages = getRegionLandingPages(regionId);
if (pages.length !== 3) throw new Error(`Expected three localized landing pages for ${regionId}, got ${pages.length}`);

const outDir = path.join(root, region.ftpDir);
for (const rel of ['index.html', 'sitemap.xml', 'robots.txt', 'version.json', 'api/copernicus/sargassum.json']) {
  assert.ok(fs.existsSync(path.join(outDir, rel)), `missing required regional artifact: ${region.ftpDir}/${rel}`);
}
const sitemap = fs.readFileSync(path.join(outDir, 'sitemap.xml'), 'utf8');
const knownUrls = Object.fromEntries(pages.map(p => [p.lang, `https://${region.domain}${p.url}`]));

for (const page of pages) {
  const file = path.join(outDir, page.file);
  assert.ok(fs.existsSync(file), `missing localized landing page: ${region.ftpDir}/${page.file}`);
  const html = fs.readFileSync(file, 'utf8');
  const expectedCanonical = knownUrls[page.lang];
  const canonicalTag = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i);
  assert.ok(canonicalTag, `${page.file}: canonical tag missing`);
  const canonical = (canonicalTag[0].match(/\bhref=["']([^"']+)["']/i) || [])[1];
  assert.equal(canonical, expectedCanonical, `${page.file}: wrong canonical`);

  for (const lang of ['fr', 'en', 'es']) {
    const alternate = [...html.matchAll(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhreflang=["']([^"']+)["'][^>]*>/gi)]
      .find(m => m[1].toLowerCase() === lang);
    assert.ok(alternate, `${page.file}: hreflang ${lang} missing`);
    const href = (alternate[0].match(/\bhref=["']([^"']+)["']/i) || [])[1];
    assert.equal(href, knownUrls[lang], `${page.file}: hreflang ${lang} points to wrong route/domain`);
  }
  assert.ok(sitemap.includes(`<loc>${expectedCanonical}</loc>`), `sitemap missing ${expectedCanonical}`);
}

console.log(`PASS ${regionId}: 3 localized pages, canonicals/hreflang, sitemap and core artifacts verified in ${region.ftpDir}/`);
