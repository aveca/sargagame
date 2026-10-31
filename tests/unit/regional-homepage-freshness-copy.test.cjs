'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const REGION_IDS = ['florida', 'puntacana', 'rivieramaya', 'tulum'];

async function renderRegion(regionId) {
  process.env.VITE_REGION = regionId;
  const { loadConfigFromFile } = await import('vite');
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    path.join(ROOT, 'vite.config.js'),
  );
  assert.ok(loaded && loaded.config, regionId + ': Vite config loads');

  const flatten = (items) => items.flatMap((item) => Array.isArray(item) ? flatten(item) : [item]);
  const plugin = flatten(loaded.config.plugins || []).find((item) => item && item.name === 'region-index-html');
  assert.ok(plugin, regionId + ': region-index-html plugin exists');
  const transform = typeof plugin.transformIndexHtml === 'function'
    ? plugin.transformIndexHtml
    : plugin.transformIndexHtml && plugin.transformIndexHtml.handler;
  assert.equal(typeof transform, 'function', regionId + ': HTML transform is callable');

  const region = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', regionId + '.json'), 'utf8'));
  assert.ok(['en', 'es'].includes(region.primaryLang), regionId + ': supported primary language');
  const sourceHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const html = await transform(sourceHtml);

  assert.ok(html.includes('<html lang="' + region.primaryLang + '"'), regionId + ': primary language is emitted');
  assert.ok(html.includes('<link rel="canonical" href="https://' + region.domain + '/"'), regionId + ': regional canonical is preserved');
  assert.ok(html.includes('hreflang="' + region.primaryLang + '"'), regionId + ': primary hreflang is preserved');
  assert.ok(html.includes('hreflang="x-default"'), regionId + ': x-default is preserved');

  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = jsonLd.find((item) => item['@type'] === 'FAQPage');
  const organization = jsonLd.find((item) => item['@type'] === 'Organization');
  const webApp = jsonLd.find((item) => item['@type'] === 'WebApplication');
  const localBusiness = jsonLd.find((item) => item['@type'] === 'LocalBusiness');
  const noscript = (html.match(/<noscript>\s*<h1>[\s\S]*?<\/noscript>/) || [])[0] || '';

  assert.ok(faq && Array.isArray(faq.mainEntity), regionId + ': FAQ JSON-LD remains valid');
  assert.ok(webApp && organization && localBusiness, regionId + ': web-app, organization and local-business JSON-LD remain present');
  assert.ok(noscript, regionId + ': localized no-JavaScript SEO content remains present');

  const questionText = faq.mainEntity.map((item) => item.name || '').join(' ');
  const answerText = faq.mainEntity.map((item) => item.acceptedAnswer && item.acceptedAnswer.text || '').join(' ');
  const seoSurface = [title, description, webApp.name, questionText, answerText, organization.description, localBusiness.description, noscript].join('\n');
  const unsupportedCurrentQuestions = /\b(?:today|right now|hoy|ahora mismo)\b/i;
  assert.doesNotMatch(questionText, unsupportedCurrentQuestions, regionId + ': FAQ questions do not imply current/today conditions');
  const unsupportedClaims = /updated\s+4×\s*daily|updated\s+4\s*times\s+a\s*day|4\s*times\s+a\s*day|4\s*veces\s+al\s+d[ií]a|actualizado\s+4\s*veces|en\s+vivo|live\s+(?:beach\s+)?map|live\s+status|live\s+monitoring|real[- ]time|in\s+real\s+time|refreshed\s+four\s+times|refreshes\s+several\s+times|\bdaily\b|a\s+diario|diariamente/i;
  assert.doesNotMatch(seoSurface, unsupportedClaims, regionId + ': no unsupported live/four-times-daily promise');

  if (region.primaryLang === 'es') {
    assert.match(questionText, /última observación publicada/i, regionId + ': Spanish FAQ asks about the latest published observation');
    assert.match(questionText, /observaciones publicadas/i, regionId + ': Spanish FAQ asks about published beach observations');
    assert.match(seoSurface, /hora de la última observación satelital/i, regionId + ': observation timestamp is explained in Spanish');
    assert.match(seoSurface, /la fuente se retrasa/i, regionId + ': delayed-source limitation is explained in Spanish');
  } else {
    assert.match(questionText, /latest published sargassum observation/i, regionId + ': English FAQ asks about the latest published observation');
    assert.match(questionText, /published observations/i, regionId + ': English FAQ asks about published beach observations');
    assert.match(seoSurface, /latest available satellite observation time/i, regionId + ': observation timestamp is explained in English');
    assert.match(seoSurface, /source is delayed/i, regionId + ': delayed-source limitation is explained in English');
  }
  console.log(regionId + ': rendered regional homepage freshness copy PASS');
}

if (process.argv[2] === '--render-region') {
  renderRegion(process.argv[3]).catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
} else {
  for (const regionId of REGION_IDS) {
    const result = spawnSync(process.execPath, [__filename, '--render-region', regionId], {
      cwd: ROOT,
      env: { ...process.env, VITE_REGION: regionId },
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    assert.equal(result.status, 0, regionId + ': generated homepage copy validation failed');
  }
  console.log('REGIONAL_HOMEPAGE_FRESHNESS_COPY PASS (4 regional builds, EN/ES)');
}
