#!/usr/bin/env node
/**
 * online-qa.cjs — ONLINE QA AGAINST PREVIEW URL
 *
 * Exécute les mêmes tests que le gate local mais contre l'URL preview déployée.
 * Inclut : visual QA, funnel QA, perf QA, SEO QA, accessibility.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./lib/common.cjs');

const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';

function log(msg) {
  if (LIVE) console.log(`[${new Date().toISOString().slice(11, 19)}] ONLINE-QA ${msg}`);
  else console.log(`[ONLINE-QA] ${msg}`);
}

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, name: '390' },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, name: '1440' },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true, name: '768' },
};

const PRIORITY_ROUTES = [
  { route: 'home', path: '/', weight: 50, checks: ['funnel'] },
  { route: 'map', path: '/carte-sargasses/', weight: 45, checks: ['navigation', 'visual'] },
  { route: 'beach', path: '/plages/', weight: 40, checks: ['navigation', 'visual'] },
  { route: 'decision', path: '/?exp=', weight: 35, checks: ['funnel', 'visual'] },
  { route: 'trip-planner', path: '/?trip=1', weight: 30, checks: ['funnel', 'visual'] },
  { route: 'protect', path: '/alertes/', weight: 25, checks: ['navigation'] },
  { route: 'paywall', path: '/?paywall=1', weight: 50, checks: ['funnel', 'visual'] },
  { route: 'checkout-entry', path: '/?paywall=1', weight: 45, checks: ['funnel', 'visual'] },
  { route: 'b2b', path: '/sargasses-pour-hotels/', weight: 20, checks: ['navigation'] },
];

/**
 * Exécute la QA complète en ligne contre une URL preview
 */
async function runOnlineQA(previewUrl, routes = PRIORITY_ROUTES, viewports = ['mobile', 'desktop']) {
  log(`starting online QA for ${previewUrl}`);
  
  const results = {
    previewUrl,
    timestamp: new Date().toISOString(),
    routes: [],
    visual: [],
    funnel: [],
    perf: [],
    seo: [],
    a11y: [],
    errors: [],
    summary: { passed: 0, failed: 0, total: 0 },
  };
  
  for (const viewportName of viewports) {
    const vp = VIEWPORTS[viewportName];
    log(`online QA: viewport ${viewportName} (${vp.width}x${vp.height})`);
    
    for (const { route, path, weight, checks } of routes) {
      const fullUrl = `${previewUrl}${path}`;
      try {
        const routeResult = await probeRouteOnline(fullUrl, route, path, vp, checks);
        results.routes.push(routeResult);
        results.errors.push(...routeResult.errors);
        results.visual.push(...routeResult.visual);
        results.funnel.push(...routeResult.funnel);
        results.perf.push(...routeResult.perf);
        results.seo.push(...routeResult.seo);
        results.a11y.push(...routeResult.a11y);
      } catch (e) {
        results.errors.push({ route, viewport: viewportName, error: e.message, severity: 'high' });
      }
    }
  }
  
  // Calculer summary
  results.summary.total = results.routes.length;
  results.summary.passed = results.routes.filter(r => r.passed).length;
  results.summary.failed = results.summary.total - results.summary.passed;
  
  // Générer rapport
  const reportPath = await generateOnlineQAReport(results);
  results.reportPath = reportPath;
  
  log(`online QA complete: ${results.summary.passed}/${results.summary.total} routes passed`);
  return results;
}

/**
 * Sonde une route sur l'URL preview
 */
async function probeRouteOnline(url, routeName, path, viewport, checks) {
  const result = {
    route: routeName,
    path,
    url,
    viewport: viewport.name,
    checks: [],
    visual: [],
    funnel: [],
    perf: [],
    seo: [],
    a11y: [],
    errors: [],
    passed: true,
  };
  
  // Build Playwright script for online QA
  const script = buildOnlineQAScript(url, routeName, path, viewport, checks);
  const scriptPath = path.join(C.ROOT, '.ai', 'autopilot', 'tmp', `online-qa-${routeName}-${viewport.name}-${Date.now()}.cjs`);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, script);
  
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const pw = spawn(isWin ? 'npx.cmd' : 'npx', ['--no-install', 'playwright', 'run', scriptPath], {
      cwd: C.ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: isWin,
    });
    
    let out = '', err = '';
    pw.stdout.on('data', d => { out += d; });
    pw.stderr.on('data', d => { err += d; });
    
    const timeout = setTimeout(() => { pw.kill('SIGKILL'); reject(new Error(`online-qa timeout ${routeName}@${viewport.name}`)); }, 90000);
    
    pw.on('exit', code => {
      clearTimeout(timeout);
      try { fs.unlinkSync(scriptPath); } catch (_) {}
      if (code !== 0) {
        result.errors.push({ type: 'probe-exit', code, stderr: err.slice(-1000) });
        result.passed = false;
      }
      try {
        const probeResult = JSON.parse(out.trim());
        Object.assign(result, probeResult);
      } catch (_) {
        result.errors.push({ type: 'probe-parse-error', output: out.slice(-500) });
        result.passed = false;
      }
      resolve(result);
    });
  });
}

function buildOnlineQAScript(url, routeName, path, viewport, checks) {
  const headed = false; // CI mode = headless
  
  return `
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: ${viewport.width}, height: ${viewport.height} },
    deviceScaleFactor: ${viewport.deviceScaleFactor},
    isMobile: ${viewport.isMobile},
    hasTouch: ${viewport.hasTouch},
  });
  const page = await context.newPage();

  const checks = [];
  const visual = [];
  const funnel = [];
  const perf = [];
  const seo = [];
  const a11y = [];
  const errors = [];

  // Console errors
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      errors.push({ type: 'console-error', text: msg.text(), route: '${routeName}' });
    }
  });

  // Page errors
  page.on('pageerror', err => {
    errors.push({ type: 'pageerror', text: err.message, route: '${routeName}' });
  });

  // Network
  page.on('requestfailed', req => {
    errors.push({ type: 'request-failed', url: req.url(), error: req.failure()?.errorText, route: '${routeName}' });
  });

  // Response timing
  const timings = [];
  page.on('response', res => {
    timings.push({ url: res.url(), status: res.status(), timing: res.timing() });
  });

  try {
    // Navigate
    const navStart = Date.now();
    await page.goto('${url}', { waitUntil: 'networkidle', timeout: 30000 });
    const navTime = Date.now() - navStart;
    
    perf.push({ metric: 'navigation', value: navTime, unit: 'ms', route: '${routeName}' });

    // Wait for React mount
    await page.waitForSelector('#root', { timeout: 15000 }).catch(() => {});

    // Screenshot for visual QA
    const shotDir = path.join('${C.paths.observations}', 'screenshots', 'online-qa', new Date().toISOString().slice(0, 10));
    fs.mkdirSync(shotDir, { recursive: true });
    const shotPath = path.join(shotDir, '${routeName}-${viewport.name}-${Date.now()}.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    visual.push({ type: 'screenshot', path: shotPath, route: '${routeName}', viewport: '${viewport.name}' });

    // SEO checks
    if (checks.includes('seo') || checks.includes('navigation')) {
      // Title
      const title = await page.title();
      seo.push({ metric: 'title', value: title, route: '${routeName}' });
      
      // Meta tags
      const metas = await page.evaluate(() => {
        const m = {};
        document.querySelectorAll('meta').forEach(el => {
          const name = el.getAttribute('name') || el.getAttribute('property');
          if (name) m[name] = el.getAttribute('content');
        });
        return m;
      });
      seo.push({ metric: 'meta', value: metas, route: '${routeName}' });
      
      // Canonical
      const canonical = await page.evaluate(() => {
        const link = document.querySelector('link[rel="canonical"]');
        return link ? link.href : null;
      });
      seo.push({ metric: 'canonical', value: canonical, route: '${routeName}' });
      
      // Hreflang
      const hreflangs = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => {
          links.push({ hreflang: el.getAttribute('hreflang'), href: el.href });
        });
        return links;
      });
      seo.push({ metric: 'hreflang', value: hreflangs, route: '${routeName}' });
    }

    // Funnel checks
    if (checks.includes('funnel')) {
      const funnelChecks = getFunnelChecks('${routeName}');
      for (const check of funnelChecks) {
        try {
          if (check.selector) {
            await page.waitForSelector(check.selector, { timeout: 5000 });
            funnel.push({ action: 'verify', selector: check.selector, ok: true, route: '${routeName}' });
          } else if (check.test) {
            await check.test(page);
            funnel.push({ action: check.name, ok: true, route: '${routeName}' });
          }
        } catch (e) {
          funnel.push({ action: check.name || 'verify', ok: false, error: e.message, route: '${routeName}' });
          errors.push({ type: 'funnel-missing', selector: check.selector, route: '${routeName}', severity: check.severity });
        }
      }
    }

    // Visual stability (z-index, overlaps)
    if (checks.includes('visual')) {
      const overlaps = await page.evaluate(() => {
        const fixed = document.querySelectorAll('[style*="position:fixed"], [style*="position: absolute"]');
        const overlaps = [];
        for (let i = 0; i < fixed.length; i++) {
          for (let j = i + 1; j < fixed.length; j++) {
            const a = fixed[i], b = fixed[j];
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const za = parseInt(getComputedStyle(a).zIndex) || 0;
            const zb = parseInt(getComputedStyle(b).zIndex) || 0;
            if (ra.width > 0 && ra.height > 0 && rb.width > 0 && rb.height > 0 &&
                !(ra.right < rb.left || ra.left > rb.right || ra.bottom < rb.top || ra.top > rb.bottom)) {
              overlaps.push({
                a: { tag: a.tagName, class: a.className, z: za, rect: ra },
                b: { tag: b.tagName, class: b.className, z: zb, rect: rb }
              });
            }
          }
        }
        return overlaps;
      });
      for (const ov of overlaps) {
        visual.push({ type: 'z-index-overlap', a: ov.a, b: ov.b, route: '${routeName}' });
        errors.push({ type: 'z-index-overlap', a: ov.a, b: ov.b, severity: 'medium' });
      }
      
      // Dead clicks
      const deadClicks = await page.evaluate(() => {
        const clickable = document.querySelectorAll('a, button, [role="button"], [onclick], [data-click], .gbtn, .sg-click');
        const dead = [];
        for (const el of clickable) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const style = getComputedStyle(el);
            if (style.pointerEvents !== 'none' && style.display !== 'none' && style.visibility !== 'hidden') {
              const hasHandler = el.onclick || el.getAttribute('onclick') || el.getAttribute('data-click') ||
                el.closest('a[href]') || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
              if (!hasHandler) {
                dead.push({
                  tag: el.tagName, class: el.className, id: el.id,
                  text: el.innerText?.slice(0, 50),
                  rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
                });
              }
            }
          }
        }
        return dead;
      });
      for (const dc of deadClicks) {
        visual.push({ type: 'dead-click', ...dc, route: '${routeName}' });
        errors.push({ type: 'dead-click', ...dc, severity: 'medium' });
      }
    }

    // Performance
    perf.push({ metric: 'page-load', value: navTime, unit: 'ms', route: '${routeName}' });
    const pageTiming = await page.evaluate(() => performance.timing);
    perf.push({ metric: 'dom-content-loaded', value: pageTiming.domContentLoadedEventEnd - pageTiming.navigationStart, unit: 'ms', route: '${routeName}' });
    perf.push({ metric: 'load', value: pageTiming.loadEventEnd - pageTiming.navigationStart, unit: 'ms', route: '${routeName}' });

    // Accessibility
    if (checks.includes('a11y')) {
      // Focus order, aria labels, etc.
      const focusable = await page.evaluate(() => {
        const els = document.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        return Array.from(els).map(el => ({
          tag: el.tagName, id: el.id, class: el.className,
          ariaLabel: el.getAttribute('aria-label'), role: el.getAttribute('role'),
          tabIndex: el.tabIndex
        }));
      });
      a11y.push({ metric: 'focusable-elements', value: focusable.length, route: '${routeName}' });
    }

  } catch (e) {
    errors.push({ type: 'probe-error', error: e.message, route: '${routeName}', severity: 'high' });
  } finally {
    await browser.close();
  }

  // Determine passed
  const passed = errors.filter(e => e.severity === 'high' || e.severity === 'critical').length === 0;
  
  console.log(JSON.stringify({ 
    route: '${routeName}', 
    path: '${path}', 
    url: '${url}', 
    viewport: '${viewport.name}', 
    checks: passed ? ['PASSED'] : ['FAILED'],
    visual, funnel, perf, seo, a11y, errors, passed 
  }));
})();

function getFunnelChecks(route) {
  const checks = {
    home: [
      { selector: '#root', severity: 'critical' },
      { selector: '[data-testid="xp-home"]', severity: 'high' },
      { selector: '[data-testid="xp-best-open"]', severity: 'high' },
    ],
    map: [
      { selector: '[data-testid="xp-map"]', severity: 'high' },
      { selector: '.leaflet-container', severity: 'high' },
    ],
    beach: [
      { selector: '[data-testid="xp-beach"]', severity: 'high' },
      { selector: '[data-testid="xp-beach-card"]', severity: 'high' },
    ],
    decision: [
      { selector: '[data-testid="xp-open"]', severity: 'high' },
      { selector: '.bx-verdict', severity: 'high' },
    ],
    'trip-planner': [
      { selector: '[data-testid="tp-day-1"]', severity: 'high' },
    ],
    protect: [
      { selector: '[data-testid="sg-bell"]', severity: 'high' },
    ],
    paywall: [
      { selector: '[data-testid="paywall"]', severity: 'critical' },
      { selector: '[data-testid="pass-cta"]', severity: 'critical' },
    ],
    'checkout-entry': [
      { selector: '[data-testid="onsite-checkout"]', severity: 'critical' },
      { selector: 'iframe[title*="Mollie"]', severity: 'high' },
    ],
    b2b: [
      { selector: '[data-testid="b2b-trial"]', severity: 'high' },
    ],
  };
  return checks[route] || [{ selector: '#root', severity: 'medium' }];
}
`;
}

async function generateOnlineQAReport(results) {
  const reportDir = path.join(C.paths.observations, 'online-qa');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `online-qa-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  
  // Also generate HTML report
  const htmlPath = reportPath.replace('.json', '.html');
  const html = generateHTMLReport(results);
  fs.writeFileSync(htmlPath, html, 'utf8');
  
  return reportPath;
}

function generateHTMLReport(results) {
  return `
<!DOCTYPE html>
<html><head><title>Online QA Report</title>
<style>
body { font-family: system-ui; margin: 20px; background: #0d1117; color: #e6edf3; }
h1 { color: #E8A800; }
.summary { display: flex; gap: 20px; margin-bottom: 20px; }
.stat { background: #161b22; padding: 16px; border-radius: 8px; min-width: 120px; }
.stat.passed { border-left: 4px solid #22C55E; }
.stat.failed { border-left: 4px solid #E8522A; }
.route { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.route.passed { border-color: #22C55E; }
.route.failed { border-color: #E8522A; }
.error { color: #E8522A; margin: 4px 0; }
pre { background: #0d1117; padding: 12px; border-radius: 4px; overflow: auto; }
</style></head><body>
<h1>Online QA Report</h1>
<p>Preview URL: <a href="${results.previewUrl}" target="_blank" style="color: #E8A800;">${results.previewUrl}</a></p>
<p>Timestamp: ${results.timestamp}</p>
<div class="summary">
  <div class="stat passed">Passed: ${results.summary.passed}</div>
  <div class="stat failed">Failed: ${results.summary.failed}</div>
  <div class="stat">Total: ${results.summary.total}</div>
</div>
${results.routes.map(r => `
  <div class="route ${r.passed ? 'passed' : 'failed'}">
    <h3>${r.route} (${r.viewport}) <span style="color: ${r.passed ? '#22C55E' : '#E8522A'};">${r.passed ? 'PASSED' : 'FAILED'}</span></h3>
    <p>URL: <a href="${r.url}" target="_blank">${r.url}</a></p>
    ${r.errors.length ? `<div class="error">Errors: ${r.errors.map(e => e.type).join(', ')}</div>` : ''}
    ${r.visual.length ? `<p>Visual checks: ${r.visual.length}</p>` : ''}
    ${r.funnel.length ? `<p>Funnel checks: ${r.funnel.filter(f => f.ok).length}/${r.funnel.length} passed</p>` : ''}
    ${r.perf.length ? `<p>Perf: ${r.perf.map(p => p.metric + '=' + p.value + p.unit).join(', ')}</p>` : ''}
    ${r.seo.length ? `<p>SEO checks: ${r.seo.length}</p>` : ''}
    ${r.a11y.length ? `<p>A11Y checks: ${r.a11y.length}</p>` : ''}
  </div>
`).join('')}
</body></html>
  `;
}

module.exports = {
  runOnlineQA,
  probeRouteOnline,
  VIEWPORTS,
  PRIORITY_ROUTES,
};