#!/usr/bin/env node
'use strict';

const dns = require('dns');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const DOMAINS = [
  { domain: 'sargasses-martinique.com', region: 'Martinique', code: 'MQ', live: true, currency: 'EUR', ga4: 'G-V8JGMDZZ2Y' },
  { domain: 'sargasses-guadeloupe.com', region: 'Guadeloupe', code: 'GP', live: true, currency: 'EUR', ga4: 'G-Q31VV3LLM9' },
  { domain: 'sargassummiami.com', region: 'Florida', code: 'FL', live: false, currency: 'USD', ga4: null },
  { domain: 'sargassumpuntacana.com', region: 'Punta Cana', code: 'PC', live: false, currency: 'USD', ga4: null },
  { domain: 'sargassumcancun.com', region: 'Riviera Maya', code: 'RM', live: false, currency: 'USD', ga4: null },
  { domain: 'sargassumbarbados.com', region: 'Barbados', code: 'BB', live: false, currency: 'USD', ga4: null },
  { domain: 'sargazotulum.com', region: 'Tulum', code: 'TU', live: false, currency: 'USD', ga4: null },
];

const CF_PREFIXES = ['104.', '172.64.', '172.65.', '172.66.', '172.67.', '173.246.', '103.21.', '103.22.', '103.31.', '141.101.'];
const TIMEOUT = 10000;

function resolveDNS(domain) {
  return new Promise((resolve) => {
    const start = Date.now();
    // Use dns.lookup (OS-level resolver) instead of dns.resolve4
    // which can fail with ECONNREFUSED on some local DNS setups
    dns.lookup(domain, { family: 4, all: true }, (err, addresses) => {
      const elapsed = Date.now() - start;
      if (err) return resolve({ ok: false, error: err.message, ips: [], elapsed });
      const ips = addresses.map(a => a.address);
      resolve({ ok: true, ips, elapsed });
    });
  });
}

function fetchUrl(url, opts = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { timeout: TIMEOUT, headers: { 'User-Agent': 'Sargagame-Audit/1.0' }, ...opts }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const elapsed = Date.now() - start;
        resolve({ ok: true, status: res.statusCode, headers: res.headers, body, elapsed });
      });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message, elapsed: Date.now() - start });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT', elapsed: Date.now() - start });
    });
  });
}

function checkTLS(domain) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = tls.connect({ host: domain, port: 443, servername: domain, timeout: TIMEOUT }, () => {
      const cert = socket.getPeerCertificate();
      const elapsed = Date.now() - start;
      socket.destroy();
      const issuer = cert.issuer ? cert.issuer.O || cert.issuer.CN || 'unknown' : 'unknown';
      const validFrom = cert.valid_from;
      const validTo = cert.valid_to;
      const now = new Date();
      const expired = now > new Date(validTo);
      resolve({ ok: true, issuer, validFrom, validTo, expired, elapsed });
    });
    socket.on('error', (err) => {
      resolve({ ok: false, error: err.message, elapsed: Date.now() - start });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'TIMEOUT', elapsed: Date.now() - start });
    });
  });
}

function isCloudflareIP(ips) {
  return ips.some(ip => CF_PREFIXES.some(p => ip.startsWith(p)));
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractGA4(html) {
  const m = html.match(/G-[A-Z0-9]{8,12}/i);
  return m ? m[0] : null;
}

function extractSitemap(html) {
  const m = html.match(/Sitemap:\s*(https?:\/\/[^\s<]+)/i);
  return m ? m[1] : null;
}

async function auditDomain(entry) {
  const { domain, region, code, live, currency, ga4 } = entry;
  const result = {
    domain, region, code, live, currency,
    dns: {}, https: {}, cloudflare: {}, content: {}, api: {}, mollie: {}, robots: {}, sw: {},
    errors: [],
  };

  // 1. DNS
  const dnsResult = resolveDNS(domain);
  // 2. TLS
  const tlsResult = checkTLS(domain);

  const [dnsRes, tlsRes] = await Promise.all([dnsResult, tlsResult]);
  result.dns = { resolved: dnsRes.ok, ips: dnsRes.ips, latencyMs: dnsRes.elapsed, error: dnsRes.error };
  result.https = { ok: tlsRes.ok, issuer: tlsRes.issuer, validFrom: tlsRes.validFrom, validTo: tlsRes.validTo, expired: tlsRes.expired, latencyMs: tlsRes.elapsed, error: tlsRes.error };

  if (!dnsRes.ok) {
    result.errors.push(`DNS failed: ${dnsRes.error}`);
    return result;
  }

  const cfIP = isCloudflareIP(dnsRes.ips);
  result.cloudflare = { behindCloudflare: cfIP };

  // 3. Homepage fetch
  const homeRes = await fetchUrl(`https://${domain}/`);
  if (homeRes.ok) {
    result.cloudflare.cfRay = homeRes.headers['cf-ray'] || null;
    result.cloudflare.server = homeRes.headers['server'] || null;
    result.cloudflare.cfCacheStatus = homeRes.headers['cf-cache-status'] || null;

    result.content.reactRoot = /<div\s+id="root"/.test(homeRes.body);
    result.content.title = extractTitle(homeRes.body);
    result.content.regionFound = homeRes.body.includes(region);
    result.content.bodyLength = homeRes.body.length;
    result.content.ga4Found = extractGA4(homeRes.body);
    result.content.indexFound = /index\.html/i.test(homeRes.body);
    result.content.reducedMotion = /reduced-motion|reducedMotion/i.test(homeRes.body);
    result.homeStatus = homeRes.status;
    result.homeLatencyMs = homeRes.elapsed;
  } else {
    result.errors.push(`Homepage fetch failed: ${homeRes.error || homeRes.status}`);
    result.homeStatus = homeRes.status || 'error';
    result.homeLatencyMs = homeRes.elapsed;
  }

  // 4. API endpoint
  const apiRes = await fetchUrl(`https://${domain}/api/copernicus/sargassum.json`);
  if (apiRes.ok && apiRes.status === 200) {
    try {
      const json = JSON.parse(apiRes.body);
      result.api.validJson = true;
      result.api.updatedAt = json.updatedAt || null;
      result.api.stale = json.stale ?? null;
      result.api.region = json.region || null;
      result.api.hasForecast = !!json.forecast;
      result.api.hasConfidence = !!json.confidence;
      if (json.updatedAt) {
        const age = Date.now() - new Date(json.updatedAt).getTime();
        result.api.ageHours = Math.round(age / 3600000 * 10) / 10;
        result.api.isFresh = age < 86400000;
      }
    } catch {
      result.api.validJson = false;
      result.api.preview = apiRes.body.substring(0, 200);
    }
    result.api.status = apiRes.status;
  } else {
    result.api.status = apiRes.status || 'error';
    result.api.error = apiRes.error || `HTTP ${apiRes.status}`;
  }

  // 5. Mollie endpoint
  const mollieRes = await fetchUrl(`https://${domain}/api/mollie.php`);
  result.mollie.status = mollieRes.status || mollieRes.error || 'unknown';
  result.mollie.reachable = mollieRes.ok;

  // 6. robots.txt
  const robotsRes = await fetchUrl(`https://${domain}/robots.txt`);
  if (robotsRes.ok && robotsRes.status === 200) {
    result.robots.found = true;
    result.robots.sitemap = extractSitemap(robotsRes.body);
    result.robots.bodyLength = robotsRes.body.length;
  } else {
    result.robots.found = false;
    result.robots.status = robotsRes.status || 'error';
  }

  // 7. Service worker
  const swRes = await fetchUrl(`https://${domain}/sw.js`);
  result.sw.accessible = swRes.ok && swRes.status === 200;
  result.sw.status = swRes.status || 'error';
  result.sw.size = swRes.ok ? swRes.body.length : null;

  return result;
}

function formatLine(label, ok, detail) {
  const icon = ok ? '✅' : '❌';
  return `  ${label}: ${icon} ${detail}`;
}

function printResult(r) {
  const lines = [];
  lines.push(`\nDOMAIN: ${r.domain} (${r.region}, ${r.code}, ${r.live ? 'LIVE' : 'NOT LIVE'}, ${r.currency})`);
  lines.push(formatLine('DNS', r.dns.resolved, r.dns.resolved ? `[${r.dns.ips.join(', ')}] ${r.dns.latencyMs}ms` : r.dns.error));
  lines.push(formatLine('HTTPS', r.https.ok, r.https.ok ? `issuer: ${r.https.issuer}, expires: ${r.https.validTo}` : r.https.error));
  lines.push(formatLine('Cloudflare', r.cloudflare.behindCloudflare, r.cloudflare.behindCloudflare ? `cf-ray: ${r.cloudflare.cfRay || 'N/A'}, server: ${r.cloudflare.server || 'N/A'}, cache: ${r.cloudflare.cfCacheStatus || 'N/A'}` : `IPs not CF range`));
  lines.push(formatLine('Content', r.content.reactRoot, r.content.reactRoot ? `title: "${r.content.title || 'N/A'}"` : 'no <div id="root">'));
  lines.push(formatLine('Region', r.content.regionFound, r.content.regionFound ? `"${r.region}" found in HTML` : `"${r.region}" NOT found`));
  if (r.ga4) {
    lines.push(formatLine('GA4', r.content.ga4Found === r.ga4, r.content.ga4Found ? `${r.content.ga4Found} (expected: ${r.ga4})` : 'no GA4 tag found'));
  } else {
    lines.push(`  GA4: ⚪ not live, no GA4 expected (found: ${r.content.ga4Found || 'none'})`);
  }
  if (r.api.validJson) {
    lines.push(formatLine('API', true, `sargassum.json valid, updatedAt: ${r.api.updatedAt}, age: ${r.api.ageHours}h, stale: ${r.api.stale}`));
  } else {
    lines.push(formatLine('API', false, `status: ${r.api.status}, error: ${r.api.error || 'invalid JSON'}`));
  }
  lines.push(formatLine('Mollie', r.mollie.reachable, `status: ${r.mollie.status}`));
  lines.push(formatLine('robots.txt', r.robots.found, r.robots.found ? `sitemap: ${r.robots.sitemap || 'none'}` : `status: ${r.robots.status}`));
  lines.push(formatLine('SW', r.sw.accessible, r.sw.accessible ? `sw.js ${r.sw.size} bytes` : `status: ${r.sw.status}`));
  if (r.errors.length) {
    lines.push(`  ⚠ Errors: ${r.errors.join('; ')}`);
  }
  return lines.join('\n');
}

async function main() {
  console.log('=== SARGAGAME PRODUCTION TOPOLOGY AUDIT ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Domains: ${DOMAINS.length}\n`);

  const results = [];
  for (const entry of DOMAINS) {
    console.log(`Auditing ${entry.domain}...`);
    try {
      const r = await auditDomain(entry);
      results.push(r);
      console.log(printResult(r));
    } catch (err) {
      console.log(`  ⚠ FATAL ERROR: ${err.message}`);
      results.push({ domain: entry.domain, error: err.message });
    }
  }

  // Summary
  console.log('\n\n=== SUMMARY ===');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.domain}: ⚠ FATAL - ${r.error}`);
      continue;
    }
    const issues = [];
    if (!r.dns.resolved) issues.push('DNS');
    if (!r.https.ok) issues.push('HTTPS');
    if (!r.cloudflare.behindCloudflare) issues.push('NOT_CF');
    if (!r.content.reactRoot) issues.push('NO_ROOT');
    if (!r.content.regionFound) issues.push('NO_REGION');
    if (r.api.validJson && !r.api.isFresh) issues.push('STALE_DATA');
    if (!r.api.validJson) issues.push('API_FAIL');
    if (r.errors.length) issues.push(...r.errors);
    const status = issues.length === 0 ? '✅ ALL OK' : `⚠ ISSUES: ${issues.join(', ')}`;
    console.log(`${r.domain}: ${status}`);
  }

  // Write results
  const auditDir = path.join(__dirname, '..', 'audit');
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
  const outPath = path.join(auditDir, 'topology-audit.json');
  const output = {
    timestamp: new Date().toISOString(),
    domains: results,
    summary: results.map(r => ({
      domain: r.domain,
      ok: !r.error && r.dns.resolved && r.https.ok && r.cloudflare.behindCloudflare && r.content.reactRoot && r.api.validJson,
    })),
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
