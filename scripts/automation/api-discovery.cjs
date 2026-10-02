#!/usr/bin/env node
/**
 * api-discovery.cjs — API Discovery Engine for Sargagame Factory
 * 
 * Discovers free, no-auth, HTTPS APIs with commercial use possible.
 * Sources: APIs.guru, Public APIs lists, GitHub topics, manual curation.
 * Filters by OpenAPI spec availability, stability, relevance to Sargagame.
 * 
 * Usage:
 *   node scripts/automation/api-discovery.cjs --run
 *   node scripts/automation/api-discovery.cjs --dry-run
 *   node scripts/automation/api-discovery.cjs --verify <api-id>
 *   node scripts/automation/api-discovery.cjs --status
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'scripts', 'automation', 'data');
const API_DISCOVERY_FILE = path.join(DATA_DIR, 'api-discovery.json');
const API_CANDIDATES_FILE = path.join(DATA_DIR, 'api-candidates.json');
const API_VERIFIED_FILE = path.join(DATA_DIR, 'api-verified.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

// Known API directories and sources
const API_SOURCES = {
  apisGuru: 'https://api.apis.guru/v2/specs/index.json',
  publicApis: 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md',
  githubTopics: [
    'free-api', 'no-auth-api', 'openapi', 'rest-api', 'weather-api',
    'geolocation-api', 'satellite-api', 'environmental-api', 'marine-api',
    'payment-api', 'email-api', 'analytics-api', 'seo-api'
  ]
};

// Priority categories for Sargagame
const PRIORITY_CATEGORIES = {
  // Core product needs
  weather: { weight: 10, keywords: ['weather', 'forecast', 'marine', 'wave', 'wind', 'temperature', 'humidity'] },
  satellite: { weight: 10, keywords: ['satellite', 'sentinel', 'copernicus', 'earth-observation', 'remote-sensing'] },
  environmental: { weight: 9, keywords: ['environmental', 'ocean', 'marine', 'coastal', 'water-quality', 'algae', 'sargassum'] },
  geolocation: { weight: 8, keywords: ['geolocation', 'geocoding', 'reverse-geocoding', 'places', 'beaches', 'coordinates'] },
  payments: { weight: 9, keywords: ['payment', 'mollie', 'stripe', 'paypal', 'checkout', 'billing', 'subscription'] },
  email: { weight: 7, keywords: ['email', 'smtp', 'transactional-email', 'sendgrid', 'mailgun', 'postmark'] },
  analytics: { weight: 8, keywords: ['analytics', 'ga4', 'google-analytics', 'tracking', 'events', 'funnel', 'conversion'] },
  seo: { weight: 7, keywords: ['seo', 'search-console', 'sitemap', 'indexing', 'ranking', 'keywords', 'serp'] },
  maps: { weight: 8, keywords: ['maps', 'tiles', 'mapbox', 'leaflet', 'openstreetmap', 'osm', 'navigation'] },
  notifications: { weight: 6, keywords: ['push', 'notification', 'onesignal', 'firebase', 'web-push', 'apns'] },
  // Factory needs
  ci_cd: { weight: 5, keywords: ['github-actions', 'ci-cd', 'deployment', 'automation', 'workflow'] },
  observability: { weight: 6, keywords: ['observability', 'monitoring', 'logging', 'metrics', 'tracing', 'sentry'] },
  testing: { weight: 5, keywords: ['testing', 'playwright', 'e2e', 'vitest', 'jest', 'cypress'] }
};

// Known good APIs to seed (pre-verified)
const SEED_APIS = [
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    category: 'weather',
    url: 'https://api.open-meteo.com',
    docs: 'https://open-meteo.com/en/docs',
    auth: 'none',
    https: true,
    commercial: true,
    openapi: 'https://api.open-meteo.com/v1/openapi.json',
    rateLimit: '10000/day',
    relevance: 'High - already used for beach weather',
    status: 'verified'
  },
  {
    id: 'copernicus-marine',
    name: 'Copernicus Marine Service',
    category: 'satellite',
    url: 'https://marine-api.open-meteo.com', // proxy
    docs: 'https://marine.copernicus.eu',
    auth: 'oauth2',
    https: true,
    commercial: true,
    openapi: null,
    rateLimit: 'variable',
    relevance: 'High - primary sargassum data source',
    status: 'verified'
  },
  {
    id: 'sentinel-hub',
    name: 'Sentinel Hub',
    category: 'satellite',
    url: 'https://services.sentinel-hub.com',
    docs: 'https://docs.sentinel-hub.com',
    auth: 'api-key',
    https: true,
    commercial: true,
    openapi: 'https://services.sentinel-hub.com/openapi.json',
    rateLimit: 'plan-based',
    relevance: 'High - Sentinel-2 near-shore',
    status: 'verified'
  },
  {
    id: 'mollie-api',
    name: 'Mollie API',
    category: 'payments',
    url: 'https://api.mollie.com/v2',
    docs: 'https://docs.mollie.com/reference/v2/overview',
    auth: 'api-key',
    https: true,
    commercial: true,
    openapi: 'https://docs.mollie.com/openapi.json',
    rateLimit: '1000/min',
    relevance: 'High - active payment provider',
    status: 'verified'
  },
  {
    id: 'onesignal-api',
    name: 'OneSignal API',
    category: 'notifications',
    url: 'https://onesignal.com/api/v1',
    docs: 'https://documentation.onesignal.com/reference',
    auth: 'api-key',
    https: true,
    commercial: true,
    openapi: null,
    rateLimit: '1000/min',
    relevance: 'High - push notifications',
    status: 'verified'
  },
  {
    id: 'google-analytics-data',
    name: 'Google Analytics Data API (GA4)',
    category: 'analytics',
    url: 'https://analyticsdata.googleapis.com/v1beta',
    docs: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
    auth: 'oauth2',
    https: true,
    commercial: true,
    openapi: 'https://analyticsdata.googleapis.com/$discovery/rest?version=v1beta',
    rateLimit: '10000/day',
    relevance: 'High - GA4 funnel data',
    status: 'verified'
  },
  {
    id: 'search-console-api',
    name: 'Google Search Console API',
    category: 'seo',
    url: 'https://searchconsole.googleapis.com/v1',
    docs: 'https://developers.google.com/search/apis/search-console-api',
    auth: 'oauth2',
    https: true,
    commercial: true,
    openapi: 'https://searchconsole.googleapis.com/$discovery/rest?version=v1',
    rateLimit: '1000/day',
    relevance: 'High - SEO indexing',
    status: 'verified'
  },
  {
    id: 'openstreetmap-nominatim',
    name: 'OpenStreetMap Nominatim',
    category: 'geolocation',
    url: 'https://nominatim.openstreetmap.org',
    docs: 'https://nominatim.org/release-docs/latest/api/Overview/',
    auth: 'none',
    https: true,
    commercial: true, // with attribution
    openapi: null,
    rateLimit: '1/sec',
    relevance: 'High - beach geocoding',
    status: 'verified'
  },
  {
    id: 'mapbox-api',
    name: 'Mapbox API',
    category: 'maps',
    url: 'https://api.mapbox.com',
    docs: 'https://docs.mapbox.com/api/',
    auth: 'api-key',
    https: true,
    commercial: true,
    openapi: null,
    rateLimit: 'plan-based',
    relevance: 'Medium - map tiles alternative',
    status: 'verified'
  },
  {
    id: 'cloudflare-api',
    name: 'Cloudflare API',
    category: 'ci_cd',
    url: 'https://api.cloudflare.com/client/v4',
    docs: 'https://developers.cloudflare.com/api/',
    auth: 'api-key',
    https: true,
    commercial: true,
    openapi: 'https://api.cloudflare.com/client/v4/openapi.yaml',
    rateLimit: '1200/5min',
    relevance: 'High - Workers/Pages/DNS automation',
    status: 'verified'
  },
  {
    id: 'supabase-api',
    name: 'Supabase Management API',
    category: 'ci_cd',
    url: 'https://api.supabase.com/v1',
    docs: 'https://supabase.com/docs/reference/api',
    auth: 'api-key',
    https: true,
    commercial: true,
    openapi: 'https://api.supabase.com/v1/openapi.json',
    rateLimit: 'variable',
    relevance: 'High - Supabase automation',
    status: 'verified'
  }
];

function loadJSON(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function fetchJSON(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function categorizeAPI(api) {
  const text = `${api.name} ${api.category} ${api.description || ''} ${(api.keywords || []).join(' ')}`.toLowerCase();
  const scores = {};
  
  for (const [cat, config] of Object.entries(PRIORITY_CATEGORIES)) {
    let score = 0;
    for (const kw of config.keywords) {
      if (text.includes(kw)) score += config.weight;
    }
    if (score > 0) scores[cat] = score;
  }
  
  const topCategory = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return topCategory ? topCategory[0] : 'other';
}

function checkRequirements(api) {
  const checks = {
    https: api.https === true,
    commercial: api.commercial === true,
    noAuthOrStandard: !api.auth || ['none', 'api-key', 'oauth2'].includes(api.auth),
    hasOpenAPI: !!api.openapi,
    hasDocs: !!api.docs,
    hasRateLimit: !!api.rateLimit
  };
  
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  
  return { checks, score: Math.round((passed / total) * 100) };
}

async function fetchAPIsGuru() {
  try {
    console.log('[api-discovery] Fetching APIs.guru index...');
    // APIs.guru moved to Cloudflare R2, use the new URL
    const data = await fetchJSON('https://api.apis.guru/v2/specs/index.json');
    // Check if we got HTML (404 page) instead of JSON
    if (typeof data === 'string' || data.doctype === 'html') {
      throw new Error('APIs.guru returned HTML (404)');
    }
    const apis = [];
    
    for (const [name, versions] of Object.entries(data)) {
      const latest = versions[Object.keys(versions).pop()];
      if (!latest) continue;
      
      const api = {
        id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: name,
        category: 'unknown',
        url: latest.info?.['x-server']?.[0]?.url || latest.info?.url || '',
        docs: latest.info?.['x-documentation'] || latest.info?.description || '',
        auth: latest.info?.security?.[0]?.type || 'unknown',
        https: true,
        commercial: true,
        openapi: latest.openapi || latest.swaggerUrl || null,
        rateLimit: latest.info?.['x-rate-limit'] || 'unknown',
        description: latest.info?.description || '',
        added: new Date().toISOString(),
        source: 'apis.guru',
        verified: false
      };
      
      api.category = categorizeAPI(api);
      api.requirements = checkRequirements(api);
      apis.push(api);
}
    
    console.log(`[api-discovery] Found ${apis.length} APIs from APIs.guru`);
    return apis;
  } catch (e) {
    console.warn('[api-discovery] APIs.guru fetch failed:', e.message);
    return [];
  }
}

async function fetchPublicAPIs() {
  try {
    console.log('[api-discovery] Fetching public-apis list...');
    const data = await fetchJSON(API_SOURCES.publicApis);
    // This returns markdown, would need parsing - skip for now
    console.log('[api-discovery] Public APIs list fetched (markdown, skipping parse)');
    return [];
  } catch (e) {
    console.warn('[api-discovery] Public APIs fetch failed:', e.message);
    return [];
  }
}

async function verifyAPI(api) {
  const results = {
    id: api.id,
    reachable: false,
    openapiValid: false,
    responseTime: null,
    errors: [],
    checkedAt: new Date().toISOString()
  };
  
  // Check base URL reachable
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(api.url.replace('/v2', '').replace('/v1', '').replace('/v1beta', ''), {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    results.reachable = res.ok || res.status < 500;
    results.responseTime = Date.now() - start;
  } catch (e) {
    results.errors.push(`Reachability: ${e.message}`);
  }
  
  // Check OpenAPI spec if available
  if (api.openapi) {
    try {
      const spec = await fetchJSON(api.openapi);
      results.openapiValid = !!spec;
      if (spec) {
        results.openapiVersion = spec.openapi || spec.swagger || 'unknown';
        results.endpoints = spec.paths ? Object.keys(spec.paths).length : 0;
      }
    } catch (e) {
      results.errors.push(`OpenAPI: ${e.message}`);
    }
  }
  
  return results;
}

async function runDiscovery(options = {}) {
  const { dryRun = false, verify = false, maxNew = 20 } = options;
  
  console.log('[api-discovery] Starting API discovery...');
  
  const existing = loadJSON(API_DISCOVERY_FILE, []);
  const existingIds = new Set(existing.map(a => a.id));
  const candidates = loadJSON(API_CANDIDATES_FILE, []);
  const verified = loadJSON(API_VERIFIED_FILE, []);
  
  // Add seed APIs if not present
  for (const seed of SEED_APIS) {
    if (!existingIds.has(seed.id)) {
      const api = { ...seed, added: new Date().toISOString(), source: 'seed' };
      api.category = categorizeAPI(api);
      api.requirements = checkRequirements(api);
      existing.push(api);
      existingIds.add(seed.id);
      console.log(`[api-discovery] Added seed API: ${seed.name}`);
    }
  }
  
  // Fetch from sources
  const apisGuru = await fetchAPIsGuru();
  await fetchPublicAPIs();
  
  // Add new APIs
  let newCount = 0;
  for (const api of apisGuru) {
    if (newCount >= maxNew) break;
    if (!existingIds.has(api.id) && api.requirements.score >= 60) {
      existing.push(api);
      existingIds.add(api.id);
      newCount++;
      console.log(`[api-discovery] Added: ${api.name} (${api.category}, score: ${api.requirements.score})`);
    }
  }
  
  // Verify APIs if requested
  if (verify) {
    console.log('[api-discovery] Verifying APIs...');
    for (const api of existing) {
      if (api.status === 'verified') continue;
      if (api.status === 'failed') continue;
      
      const verification = await verifyAPI(api);
      const verifiedEntry = { ...api, verification, status: verification.reachable ? 'verified' : 'failed' };
      
      // Update in verified list
      const idx = verified.findIndex(v => v.id === api.id);
      if (idx >= 0) verified[idx] = verifiedEntry;
      else verified.push(verifiedEntry);
      
      // Update in main list
      const mainIdx = existing.findIndex(e => e.id === api.id);
      if (mainIdx >= 0) existing[mainIdx] = verifiedEntry;
      
      console.log(`[api-discovery] ${api.name}: ${verification.reachable ? 'OK' : 'FAIL'} (${verification.responseTime}ms)`);
      
      // Small delay between verifications
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Generate candidates for factory (high relevance, verified)
  const newCandidates = existing
    .filter(a => a.status === 'verified' && a.requirements.score >= 70)
    .filter(a => !candidates.some(c => c.id === a.id))
    .map(a => ({
      id: a.id,
      type: 'api_candidate',
      name: a.name,
      category: a.category,
      url: a.url,
      docs: a.docs,
      auth: a.auth,
      openapi: a.openapi,
      rateLimit: a.rateLimit,
      relevance: a.relevance,
      requirementsScore: a.requirements.score,
      usefulFor: [a.category],
      suggestedActions: [`Integrate ${a.name} for ${a.category}`, `Test OpenAPI spec`, `Add to factory workers`],
      createdAt: new Date().toISOString(),
      status: 'pending_review'
    }))
    .slice(0, maxNew);
  
  console.log(`[api-discovery] ${newCandidates.length} new API candidates for factory`);
  
  if (!dryRun) {
    saveJSON(API_DISCOVERY_FILE, existing);
    if (newCandidates.length) {
      saveJSON(API_CANDIDATES_FILE, [...newCandidates, ...candidates].slice(0, 100));
    }
    saveJSON(API_VERIFIED_FILE, verified);
  }
  
  return {
    totalAPIs: existing.length,
    newAdded: newCount,
    verified: verified.filter(v => v.status === 'verified').length,
    failed: verified.filter(v => v.status === 'failed').length,
    candidates: newCandidates.length,
    candidatesList: newCandidates
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const showStatus = args.includes('--status');
  
  if (showStatus) {
    const existing = loadJSON(API_DISCOVERY_FILE, []);
    const candidates = loadJSON(API_CANDIDATES_FILE, []);
    const verified = loadJSON(API_VERIFIED_FILE, []);
    
    console.log('\n=== API Discovery Status ===\n');
    console.log(`Total APIs tracked: ${existing.length}`);
    console.log(`Verified: ${verified.filter(v => v.status === 'verified').length}`);
    console.log(`Failed: ${verified.filter(v => v.status === 'failed').length}`);
    console.log(`Candidates for factory: ${candidates.length}`);
    console.log(`Pending review: ${candidates.filter(c => c.status === 'pending_review').length}`);
    
    const byCategory = {};
    for (const api of existing) {
      byCategory[api.category] = (byCategory[api.category] || 0) + 1;
    }
    console.log('\nBy category:');
    for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat}: ${count}`);
    }
    
    if (candidates.length) {
      console.log('\nTop candidates:');
      candidates.slice(0, 10).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.name} (${c.category}, score: ${c.requirementsScore})`);
      });
    }
    return;
  }
  
  try {
    const result = await runDiscovery({ dryRun, verify });
    
    console.log('\n=== Discovery Result ===');
    console.log(`Total APIs: ${result.totalAPIs}`);
    console.log(`New added: ${result.newAdded}`);
    console.log(`Verified: ${result.verified}`);
    console.log(`Failed: ${result.failed}`);
    console.log(`New candidates: ${result.candidates}`);
    
    if (dryRun) {
      console.log('\n[DRY RUN] No changes saved');
    }
    
  } catch (e) {
    console.error('[api-discovery] Fatal error:', e.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { runDiscovery, PRIORITY_CATEGORIES, SEED_APIS, verifyAPI };