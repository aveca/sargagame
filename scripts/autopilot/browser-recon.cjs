#!/usr/bin/env node
/**
 * browser-recon.cjs — BROWSER RECONNAISSANCE & VISUAL QA
 *
 * Lance un navigateur réel (headed si demandé) pour :
 * - Navigation, click, keyboard, scroll, focus
 * - Détection dead clicks, éléments invisibles, z-index, overlap
 * - Screenshots BEFORE/AFTER pour changements visuels
 * - Interaction testing (modal open/close, back/forward, deep links)
 *
 * Modes :
 * - headless (défaut, CI)
 * - headed (--headed, mode live local)
 * - visual-qa (screenshots comparatifs)
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./lib/common.cjs');

const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';
const HEADED = process.env.SARGA_AUTOPILOT_HEADED === '1' || LIVE;

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, name: '390' },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, name: '1440' },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, name: '768' },
};

const PRIORITY_ROUTES = [
  { route: 'home', url: '/', weight: 50 },
  { route: 'map', url: '/carte-sargasses/', weight: 45 },
  { route: 'beach', url: '/plages/', weight: 40 },
  { route: 'decision', url: '/?exp=', weight: 35 },
  { route: 'trip-planner', url: '/?trip=1', weight: 30 },
  { route: 'protect', url: '/alertes/', weight: 25 },
  { route: 'paywall', url: '/?paywall=1', weight: 50 },
  { route: 'checkout-entry', url: '/?paywall=1&checkout=1', weight: 45 },
  { route: 'b2b', url: '/sargasses-pour-hotels/', weight: 20 },
];

function log(msg) {
  if (LIVE) console.log(`[${new Date().toISOString().slice(11, 19)}] BROWSER   ${msg}`);
  else console.log(`[BROWSER] ${msg}`);
}

/**
 * Lance une reconnaissance navigateur complète
 */
async function runBrowserRecon(cfg, domains = [cfg.health.requiredDomains[0]]) {
  const results = {
    timestamp: new Date().toISOString(),
    viewports: [],
    routes: [],
    issues: [],
    screenshots: [],
  };

  const viewportList = HEADED ? ['mobile', 'desktop'] : ['mobile'];

  for (const vpName of viewportList) {
    const vp = VIEWPORTS[vpName];
    log(`recon: starting ${vpName} (${vp.width}x${vp.height}) ${HEADED ? 'HEADED' : 'HEADLESS'}`);

    for (const domain of domains) {
      for (const { route, url, weight } of PRIORITY_ROUTES) {
        const fullUrl = `https://${domain}${url}`;
        try {
          const routeResult = await probeRoute(fullUrl, route, vp, domain);
          results.routes.push(routeResult);
          results.issues.push(...routeResult.issues);
        } catch (e) {
          results.issues.push({
            type: 'probe-error',
            route,
            domain,
            viewport: vpName,
            error: e.message,
            severity: 'medium',
          });
        }
      }
    }
    results.viewports.push(vpName);
  }

  // Save screenshots metadata
  const screenshotsDir = path.join(C.paths.observations, 'screenshots', new Date().toISOString().slice(0, 10));
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.writeFileSync(
    path.join(screenshotsDir, `recon-${Date.now()}.json`),
    JSON.stringify(results, null, 2)
  );

  return results;
}

/**
 * Sonde une route spécifique
 */
async function probeRoute(url, routeName, viewport, domain) {
  const result = {
    route: routeName,
    url,
    domain,
    viewport: viewport.name,
    issues: [],
    screenshots: [],
    interactions: [],
  };

  // Build Playwright script
  const script = buildProbeScript(url, routeName, viewport);

  const scriptPath = path.join(C.ROOT, '.ai', 'autopilot', 'tmp', `probe-${routeName}-${viewport.name}-${Date.now()}.cjs`);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, script);

  return new Promise((resolve, reject) => {
    const pw = spawn(process.execPath, ['scripts/autopilot/playwright-runner.cjs', scriptPath], {
      cwd: C.ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, SARGA_AUTOPILOT_PROBE: '1' },
    });

    let out = '', err = '';
    pw.stdout.on('data', d => { out += d; });
    pw.stderr.on('data', d => { err += d; });

    const timeout = setTimeout(() => {
      pw.kill('SIGKILL');
      reject(new Error(`probe timeout ${routeName}@${viewport.name}`));
    }, 60000);

    pw.on('exit', code => {
      clearTimeout(timeout);
      try { fs.unlinkSync(scriptPath); } catch (_) {}
      if (code !== 0) {
        result.issues.push({ type: 'probe-exit', code, stderr: err.slice(-1000) });
      }
      try {
        const probeResult = JSON.parse(out.trim());
        Object.assign(result, probeResult);
      } catch (_) {
        result.issues.push({ type: 'probe-parse-error', output: out.slice(-500) });
      }
      resolve(result);
    });
  });
}

/**
 * Génère le script Playwright pour la sonde
 */
function buildProbeScript(url, routeName, viewport) {
  const headed = HEADED ? 'headless: false' : 'headless: true';
  const slowMo = HEADED ? 100 : 0;

  // Use a function to avoid template literal issues with backticks
  const scriptParts = [];
  scriptParts.push("const { chromium } = require('playwright');");
  scriptParts.push("const fs = require('fs');");
  scriptParts.push("const path = require('path');");
  scriptParts.push("");
  scriptParts.push("(async () => {");
  scriptParts.push(`  const browser = await chromium.launch({ ${headed}, slowMo: ${slowMo} });`);
  scriptParts.push("  const context = await browser.newContext({");
  scriptParts.push(`    viewport: { width: ${viewport.width}, height: ${viewport.height} },`);
  scriptParts.push(`    deviceScaleFactor: ${viewport.deviceScaleFactor},`);
  scriptParts.push(`    isMobile: ${viewport.isMobile},`);
  scriptParts.push(`    hasTouch: ${viewport.isMobile},`);
  scriptParts.push("  });");
  scriptParts.push("  const page = await context.newPage();");
  scriptParts.push("");
  scriptParts.push("  const issues = [];");
  scriptParts.push("  const screenshots = [];");
  scriptParts.push("  const interactions = [];");
  scriptParts.push("");
  scriptParts.push("  // Console errors");
  scriptParts.push("  page.on('console', msg => {");
  scriptParts.push("    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {");
  scriptParts.push(`      issues.push({ type: 'console-error', text: msg.text(), route: '${routeName}' });`);
  scriptParts.push("    }");
  scriptParts.push("  });");
  scriptParts.push("");
  scriptParts.push("  // Page errors");
  scriptParts.push("  page.on('pageerror', err => {");
  scriptParts.push(`    issues.push({ type: 'pageerror', text: err.message, route: '${routeName}' });`);
  scriptParts.push("  });");
  scriptParts.push("");
  scriptParts.push("  // Failed requests");
  scriptParts.push("  page.on('requestfailed', req => {");
  scriptParts.push(`    issues.push({ type: 'request-failed', url: req.url(), error: req.failure()?.errorText, route: '${routeName}' });`);
  scriptParts.push("  });");
  scriptParts.push("");
  scriptParts.push("  try {");
  scriptParts.push("    // Navigate");
  scriptParts.push(`    await page.goto('${url}', { waitUntil: 'networkidle', timeout: 30000 });`);
  scriptParts.push("");
  scriptParts.push("    // Screenshot initial");
  scriptParts.push(`    const shotDir = path.join('${C.paths.observations}', 'screenshots', new Date().toISOString().slice(0, 10));`);
  scriptParts.push("    fs.mkdirSync(shotDir, { recursive: true });");
  scriptParts.push(`    const beforeShot = path.join(shotDir, 'before-${routeName}-${viewport.name}-${Date.now()}.png');`);
  scriptParts.push("    await page.screenshot({ path: beforeShot, fullPage: true });");
  scriptParts.push("    screenshots.push({ type: 'before', path: beforeShot });");
  scriptParts.push("");
  scriptParts.push("    // Wait for React mount");
  scriptParts.push("    await page.waitForSelector('#root', { timeout: 10000 }).catch(() => {});");
  scriptParts.push("");
  scriptParts.push("    // Check key elements based on route");
  scriptParts.push("    const routeChecks = getRouteChecks('${routeName}');");
  scriptParts.push("    for (const check of routeChecks) {");
  scriptParts.push("      try {");
  scriptParts.push("        await page.waitForSelector(check.selector, { timeout: 5000 });");
  scriptParts.push("        interactions.push({ action: 'verify', selector: check.selector, ok: true });");
  scriptParts.push("      } catch (e) {");
  scriptParts.push("        interactions.push({ action: 'verify', selector: check.selector, ok: false, error: e.message });");
  scriptParts.push(`        issues.push({ type: 'missing-element', selector: check.selector, route: '${routeName}', severity: check.severity });`);
  scriptParts.push("      }");
  scriptParts.push("    }");
  scriptParts.push("");
  scriptParts.push("    // Interaction tests");
  scriptParts.push("    for (const interaction of routeChecks) {");
  scriptParts.push("      if (interaction.test) {");
  scriptParts.push("        try {");
  scriptParts.push("          await interaction.test(page);");
  scriptParts.push("          interactions.push({ action: interaction.name, ok: true });");
  scriptParts.push("        } catch (e) {");
  scriptParts.push("          interactions.push({ action: interaction.name, ok: false, error: e.message });");
  scriptParts.push("          issues.push({ type: 'interaction-failed', action: interaction.name, error: e.message, severity: 'medium' });");
  scriptParts.push("        }");
  scriptParts.push("      }");
  scriptParts.push("    }");
  scriptParts.push("");
  scriptParts.push("    // Dead click detection (elements that look clickable but do nothing)");
  scriptParts.push("    const deadClicks = await page.evaluate(() => {");
  scriptParts.push("      const clickable = document.querySelectorAll('a, button, [role=\"button\"], [onclick], [data-click], .gbtn, .sg-click');");
  scriptParts.push("      const dead = [];");
  scriptParts.push("      for (const el of clickable) {");
  scriptParts.push("        const rect = el.getBoundingClientRect();");
  scriptParts.push("        if (rect.width > 0 && rect.height > 0) {");
  scriptParts.push("          const style = getComputedStyle(el);");
  scriptParts.push("          if (style.pointerEvents !== 'none' && style.display !== 'none' && style.visibility !== 'hidden') {");
  scriptParts.push("            // Check if it has actual handler");
  scriptParts.push("            const hasHandler = el.onclick || el.getAttribute('onclick') || el.getAttribute('data-click') ||");
  scriptParts.push("              el.closest('a[href]') || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';");
  scriptParts.push("            if (!hasHandler) {");
  scriptParts.push("              dead.push({");
  scriptParts.push("                tag: el.tagName,");
  scriptParts.push("                class: el.className,");
  scriptParts.push("                id: el.id,");
  scriptParts.push("                text: el.innerText?.slice(0, 50),");
  scriptParts.push("                rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }");
  scriptParts.push("              });");
  scriptParts.push("            }");
  scriptParts.push("          }");
  scriptParts.push("        }");
  scriptParts.push("      }");
  scriptParts.push("      return dead;");
  scriptParts.push("    });");
  scriptParts.push("    for (const dc of deadClicks) {");
  scriptParts.push("      issues.push({ type: 'dead-click', ...dc, severity: 'medium' });");
  scriptParts.push("    }");
  scriptParts.push("");
  scriptParts.push("    // Z-index overlap check");
  scriptParts.push("    const overlaps = await page.evaluate(() => {");
  scriptParts.push("      const fixed = document.querySelectorAll('[style*=\"position:fixed\"], [style*=\"position: absolute\"]');");
  scriptParts.push("      const overlaps = [];");
  scriptParts.push("      for (let i = 0; i < fixed.length; i++) {");
  scriptParts.push("        for (let j = i + 1; j < fixed.length; j++) {");
  scriptParts.push("          const a = fixed[i], b = fixed[j];");
  scriptParts.push("          const ra = a.getBoundingClientRect();");
  scriptParts.push("          const rb = b.getBoundingClientRect();");
  scriptParts.push("          const za = parseInt(getComputedStyle(a).zIndex) || 0;");
  scriptParts.push("          const zb = parseInt(getComputedStyle(b).zIndex) || 0;");
  scriptParts.push("          if (ra.width > 0 && ra.height > 0 && rb.width > 0 && rb.height > 0 &&");
  scriptParts.push("              !(ra.right < rb.left || ra.left > rb.right || ra.bottom < rb.top || ra.top > rb.bottom)) {");
  scriptParts.push("            overlaps.push({");
  scriptParts.push("              a: { tag: a.tagName, class: a.className, z: za, rect: ra },");
  scriptParts.push("              b: { tag: b.tagName, class: b.className, z: zb, rect: rb }");
  scriptParts.push("            });");
  scriptParts.push("          }");
  scriptParts.push("        }");
  scriptParts.push("      }");
  scriptParts.push("      return overlaps;");
  scriptParts.push("    });");
  scriptParts.push("    for (const ov of overlaps) {");
  scriptParts.push("      issues.push({ type: 'z-index-overlap', a: ov.a, b: ov.b, severity: 'medium' });");
  scriptParts.push("    }");
  scriptParts.push("");
  scriptParts.push("    // Screenshot final");
  scriptParts.push(`    const afterShot = path.join(shotDir, 'after-${routeName}-${viewport.name}-${Date.now()}.png');`);
  scriptParts.push("    await page.screenshot({ path: afterShot, fullPage: true });");
  scriptParts.push("    screenshots.push({ type: 'after', path: afterShot });");
  scriptParts.push("");
  scriptParts.push("  } catch (e) {");
  scriptParts.push(`    issues.push({ type: 'probe-error', error: e.message, route: '${routeName}', severity: 'high' });`);
  scriptParts.push("  } finally {");
  scriptParts.push("    await browser.close();");
  scriptParts.push("  }");
  scriptParts.push("");
  scriptParts.push(`  console.log(JSON.stringify({ route: '${routeName}', url: '${url}', issues, screenshots, interactions }));`);
  scriptParts.push("})();");
  scriptParts.push("");
  scriptParts.push("function getRouteChecks(route) {");
  scriptParts.push("  const checks = {");
  scriptParts.push("    home: [");
  scriptParts.push("      { selector: '#root', severity: 'critical' },");
  scriptParts.push("      { selector: '[data-testid=\"xp-home\"]', severity: 'high' },");
  scriptParts.push("      { selector: '[data-testid=\"xp-best-open\"]', severity: 'high' },");
  scriptParts.push("      { test: async (page) => { await page.keyboard.press('ArrowRight'); }, name: 'keyboard-arrow' },");
  scriptParts.push("      { test: async (page) => { await page.mouse.wheel(0, 100); }, name: 'scroll' },");
  scriptParts.push("    ],");
  scriptParts.push("    map: [");
  scriptParts.push("      { selector: '[data-testid=\"xp-map\"]', severity: 'high' },");
  scriptParts.push("      { selector: '.leaflet-container', severity: 'high' },");
  scriptParts.push("    ],");
  scriptParts.push("    beach: [");
  scriptParts.push("      { selector: '[data-testid=\"xp-beach\"]', severity: 'high' },");
  scriptParts.push("      { selector: '[data-testid=\"xp-beach-card\"]', severity: 'high' },");
  scriptParts.push("    ],");
  scriptParts.push("    decision: [");
  scriptParts.push("      { selector: '[data-testid=\"xp-open\"]', severity: 'high' },");
  scriptParts.push("      { selector: '.bx-verdict', severity: 'high' },");
  scriptParts.push("      { test: async (page) => { await page.click('[data-testid=\"xp-back\"]'); }, name: 'back-button' },");
  scriptParts.push("    ],");
  scriptParts.push("    'trip-planner': [");
  scriptParts.push("      { selector: '[data-testid=\"tp-day-1\"]', severity: 'high' },");
  scriptParts.push("      { test: async (page) => { await page.click('[data-testid=\"trip-premium-cta\"]'); }, name: 'premium-cta' },");
  scriptParts.push("    ],");
  scriptParts.push("    protect: [");
  scriptParts.push("      { selector: '[data-testid=\"sg-bell\"]', severity: 'high' },");
  scriptParts.push("    ],");
  scriptParts.push("    paywall: [");
  scriptParts.push("      { selector: '[data-testid=\"paywall\"]', severity: 'critical' },");
  scriptParts.push("      { selector: '[data-testid=\"pass-cta\"]', severity: 'critical' },");
  scriptParts.push("      { test: async (page) => {");
  scriptParts.push("        await page.fill('input[type=\"email\"]', 'test@example.com');");
  scriptParts.push("        await page.click('[data-testid=\"pass-cta\"]');");
  scriptParts.push("      }, name: 'email-submit' },");
  scriptParts.push("    ],");
  scriptParts.push("    'checkout-entry': [");
  scriptParts.push("      { selector: '[data-testid=\"onsite-checkout\"]', severity: 'critical' },");
  scriptParts.push("      { selector: 'iframe[title*=\"Mollie\"]', severity: 'high' },");
  scriptParts.push("    ],");
  scriptParts.push("    b2b: [");
  scriptParts.push("      { selector: '[data-testid=\"b2b-trial\"]', severity: 'high' },");
  scriptParts.push("    ],");
  scriptParts.push("  };");
  scriptParts.push("  return checks[route] || [{ selector: '#root', severity: 'medium' }];");
  scriptParts.push("}");

  return scriptParts.join('\n');
}

module.exports = { runBrowserRecon, PRIORITY_ROUTES, VIEWPORTS };