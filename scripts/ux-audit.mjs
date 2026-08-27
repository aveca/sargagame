/**
 * ux-audit.mjs — Playwright UX audit with video recording + screenshots + console capture
 * 
 * Usage:
 *   node scripts/ux-audit.mjs [--region mq] [--port 8799] [--url https://...]
 *   node scripts/ux-audit.mjs --all
 * 
 * Modes:
 *   --url <url>     Audit a live site (no Vite server)
 *   --port <port>   Start Vite dev server on port (default: 8799)
 *   --all           Audit all 5 regions sequentially
 * 
 * Output:
 *   tests/ux-recordings/<region>_<timestamp>/
 *     video.webm        — full session recording
 *     report.json       — structured issues + metrics
 *     console.json      — all console logs
 *     screenshots/      — screenshots at each step
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const _args = process.argv.slice(2);
const ARGS = {};
for (let i = 0; i < _args.length; i++) {
  if (_args[i] === '--all') { ARGS.all = true; continue; }
  if (_args[i] === '--verbose') { ARGS.verbose = true; continue; }
  if (_args[i].startsWith('--')) ARGS[_args[i].slice(2)] = _args[i + 1] || true;
}

const REGIONS = ARGS.all
  ? ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya']
  : [ARGS.region || 'mq'];
const PORT = parseInt(ARGS.port || '8799');
const LIVE_URL = ARGS.url || null;
const VERBOSE = ARGS.verbose || false;

const VIEWPORT = { width: 390, height: 844 };
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function log(msg) { console.log(`[UX-AUDIT] ${msg}`); }
function vlog(msg) { if (VERBOSE) console.log(`[UX-AUDIT]   ${msg}`); }

// ─── Screenshot helper ─────────────────────────────────────────────
async function screenshot(page, dir, name) {
  const p = join(dir, 'screenshots', `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  vlog(`Screenshot: ${name}.png`);
}

// ─── Main audit for one region ─────────────────────────────────────
async function auditRegion(region, liveUrl) {
  const baseUrl = liveUrl || `http://localhost:${PORT}`;
  const outputDir = join(process.cwd(), 'tests', 'ux-recordings', `${region}_${Date.now()}`);
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

  const consoleLogs = [];
  const networkErrors = [];
  const issues = [];
  const perfMetrics = {};

  function issue(severity, msg, details = {}) {
    issues.push({ severity, msg, details, ts: Date.now() });
    if (severity === 'CRITICAL') log(`  [CRITICAL] ${msg}`);
  }

  let server = null;

  // Start Vite server only for local mode
  if (!liveUrl) {
    try {
      const { createServer } = await import('vite');
      log(`Starting Vite dev server on port ${PORT}...`);
      server = await createServer({
        server: { port: PORT, host: '127.0.0.1' },
        logLevel: 'warn',
      });
      await server.listen();
      log(`Server ready at ${baseUrl}`);
    } catch (err) {
      log(`Failed to start Vite server: ${err.message}`);
      return;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: outputDir, size: VIEWPORT },
    ...(liveUrl ? {} : {}), // extra context options if needed
  });

  const page = await context.newPage();

  // ─── Event listeners ─────────────────────────────────────────────
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
    if (msg.type() === 'error') log(`  CONSOLE ERROR: ${msg.text().slice(0, 150)}`);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    // Filter out expected failures (GA, apple merchant, supabase analytics in headless)
    const isExpected = url.includes('google-analytics') || url.includes('apple-developer-merchantid') || url.includes('analytics_events');
    if (!isExpected) {
      networkErrors.push({ url, error: req.failure()?.errorText, ts: Date.now() });
    }
  });

  // Capture 404 response bodies
  page.on('response', res => {
    if (res.status() >= 400) {
      const url = res.url();
      const isExpected = url.includes('apple-developer-merchantid') || url.includes('analytics_events') || url.includes('google-analytics');
      if (!isExpected) {
        networkErrors.push({ url, error: `HTTP ${res.status()}`, ts: Date.now() });
      }
    }
  });

  page.on('pageerror', err => {
    issue('CRITICAL', 'Uncaught page error', { error: err.message, stack: err.stack?.slice(0, 500) });
  });

  // ─── Steps ───────────────────────────────────────────────────────
  const steps = [
    {
      name: 'homepage_load', screenshot: 'homepage',
      fn: async () => {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(liveUrl ? 4000 : 6000); // live is faster than Vite dev
      }
    },
    {
      name: 'check_clean_count',
      fn: async () => {
        const text = await page.textContent('body');
        const cleanMatch = text.match(/(\d+)\s*(plages propres|clean beaches|playas limpias)/i);
        if (cleanMatch) {
          const count = parseInt(cleanMatch[1]);
          log(`Clean beaches: ${count}`);
          if (count === 0) issue('CRITICAL', 'Clean count is 0', { text: cleanMatch[0] });
        } else {
          log('Clean count: not found (may be below fold)');
        }
      }
    },
    {
      name: 'check_data_freshness',
      fn: async () => {
        const text = await page.textContent('body');
        if (text.includes('DONNÉE EN RETARD') || text.includes('DATA DELAYED')) {
          issue('CRITICAL', 'Data is stale/delayed', {});
        } else {
          vlog('Data freshness: OK');
        }
      }
    },
    {
      name: 'check_performance', screenshot: null,
      fn: async () => {
        const metrics = await page.evaluate(() => {
          const perf = performance.getEntriesByType('navigation')[0];
          const lcp = performance.getEntriesByType('largest-contentful-object');
          return {
            domContentLoaded: perf?.domContentLoadedEventEnd,
            load: perf?.loadEventEnd,
            lcp: lcp.length > 0 ? lcp[lcp.length - 1].startTime : null,
            resourceCount: performance.getEntriesByType('resource').length,
          };
        });
        perfMetrics.domContentLoaded = metrics.domContentLoaded;
        perfMetrics.load = metrics.load;
        perfMetrics.lcp = metrics.lcp;
        perfMetrics.resourceCount = metrics.resourceCount;
        if (metrics.lcp) log(`LCP: ${Math.round(metrics.lcp)}ms`);
        if (metrics.domContentLoaded) log(`DOMContentLoaded: ${Math.round(metrics.domContentLoaded)}ms`);
      }
    },
    {
      name: 'map_pan_zoom', screenshot: 'map',
      fn: async () => {
        // Pan the map
        await page.mouse.move(195, 400);
        await page.mouse.down();
        await page.mouse.move(250, 350, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        // Zoom in
        await page.mouse.wheel(0, -200);
        await page.waitForTimeout(500);
        // Zoom back out
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(500);
      }
    },
    {
      name: 'check_beach_labels',
      fn: async () => {
        const labels = await page.$$('.sg-maplabel');
        log(`Beach labels visible: ${labels.length}`);
        if (labels.length === 0) {
          vlog('No labels — may be declutter (all clean) or data not loaded');
        }
      }
    },
    {
      name: 'click_beach_pin', screenshot: 'beach-detail',
      fn: async () => {
        // Try multiple selectors for beach pins
        const selectors = ['[data-beach]', 'svg g[data-beach]', '.sg-map-pin', 'circle[data-beach]'];
        let clicked = false;
        for (const sel of selectors) {
          const pins = await page.$$(sel);
          if (pins.length > 0) {
            await pins[0].click({ force: true });
            await page.waitForTimeout(1500);
            clicked = true;
            log(`Clicked beach pin via: ${sel}`);
            break;
          }
        }
        if (!clicked) {
          // Fallback: click on first beach pin's actual screen position (region-agnostic)
          vlog('No data-beach pins found via selectors, trying JS fallback to first beach');
          try {
            const beachPos = await page.evaluate(() => {
              const pins = document.querySelectorAll('[data-beach]');
              if (pins.length > 0) {
                const rect = pins[0].getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
              }
              // Last resort: compute from first beach in beachList if available
              const beachList = window.__SG_BEACH_LIST__ || [];
              const worldToScreen = window.__SG_WORLD_TO_SCREEN__;
              if (beachList.length > 0 && worldToScreen) {
                const b = beachList[0];
                const [sx, sy] = worldToScreen(b.vx, b.vy);
                return { x: sx, y: sy };
              }
              return null;
            });
            if (beachPos) {
              await page.mouse.click(beachPos.x, beachPos.y);
              await page.waitForTimeout(1000);
              log(`Clicked beach pin via JS fallback at (${Math.round(beachPos.x)}, ${Math.round(beachPos.y)})`);
              clicked = true;
            }
          } catch (e) {
            vlog(`JS fallback failed: ${e.message}`);
          }
          if (!clicked) {
            // Ultimate fallback: map center (should rarely trigger)
            vlog('All fallbacks failed, clicking map center');
            await page.mouse.click(195, 350);
            await page.waitForTimeout(1000);
          }
        }
      }
    },
    {
      name: 'close_beach_detail',
      fn: async () => {
        const closeBtn = await page.$('[role="dialog"] button[aria-label*="Fermer"], [role="dialog"] button[aria-label*="Close"], [role="dialog"] button[aria-label*="Cerrar"], .sg-close-btn, button:has-text("×")');
        if (closeBtn) {
          await closeBtn.click();
        } else {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(500);
      }
    },
    {
      name: 'switch_to_list_view', screenshot: 'list',
      fn: async () => {
        const selectors = [
          'button:has-text("Plages")', 'button:has-text("Beaches")', 'button:has-text("Playas")',
          'button:has-text("📋")', '[data-tab="list"]', '.sg-tab-list'
        ];
        for (const sel of selectors) {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            await page.waitForTimeout(2000); // Wait for list to render
            // Try multiple selectors for list items
            const listItems = await page.$$('[data-beach], .sg-beach-card, [role="listitem"], .sg-list-item');
            const listText = await page.textContent('body');
            const hasListContent = listText.includes('plages') || listText.includes('beaches') || listText.includes('Propres');
            log(`List view items: ${listItems.length}, has content: ${hasListContent}`);
            return;
          }
        }
        vlog('Could not find list view tab');
      }
    },
    {
      name: 'switch_back_to_map',
      fn: async () => {
        const selectors = [
          'button:has-text("Carte")', 'button:has-text("Map")', 'button:has-text("Mapa")',
          'button:has-text("🗺️")', '[data-tab="map"]', '.sg-tab-map'
        ];
        for (const sel of selectors) {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            await page.waitForTimeout(1000);
            return;
          }
        }
        vlog('Could not find map tab');
      }
    },
    {
      name: 'check_bottom_nav', screenshot: 'bottom-nav',
      fn: async () => {
        const nav = await page.$('.sg-bottom-nav');
        if (nav) {
          const box = await nav.boundingBox();
          if (box) {
            log(`Bottom nav: ${box.width}x${box.height} at y=${box.y}`);
            if (box.y + box.height > VIEWPORT.height) {
              issue('CRITICAL', 'Bottom nav clipped by viewport', { box });
            }
            // Check touch target size
            const buttons = await nav.$$('button, a');
            for (const btn of buttons) {
              const bBox = await btn.boundingBox();
              if (bBox && (bBox.width < 44 || bBox.height < 44)) {
                issue('WARN', `Bottom nav touch target too small: ${bBox.width}x${bBox.height}`, { box: bBox });
              }
            }
          }
        } else {
          issue('WARN', 'Bottom nav not found', {});
        }
      }
    },
    {
      name: 'check_cookie_banner', screenshot: 'cookie-banner',
      fn: async () => {
        const banner = await page.$('.sg-cookie-banner, .sg-v2-cookie-banner');
        if (banner) {
          const box = await banner.boundingBox();
          const nav = await page.$('.sg-bottom-nav');
          const navBox = nav ? await nav.boundingBox() : null;
          if (box && navBox) {
            log(`Cookie banner: y=${Math.round(box.y)} h=${Math.round(box.height)}, nav: y=${Math.round(navBox.y)}`);
            const overlap = box.y + box.height > navBox.y;
            if (overlap) {
              const overlapPx = Math.round(box.y + box.height - navBox.y);
              issue('MEDIUM', `Cookie banner overlaps bottom nav by ${overlapPx}px`, { banner: box, nav: navBox });
            }
          }
          // Check font size
          const fontSize = await banner.evaluate(el => getComputedStyle(el).fontSize);
          vlog(`Cookie banner font-size: ${fontSize}`);
          // Accept cookies
          const acceptBtn = await banner.$('button:has-text("Accepter"), button:has-text("Accept"), button:has-text("Aceptar")');
          if (acceptBtn) {
            await acceptBtn.click();
            await page.waitForTimeout(500);
          }
        } else {
          vlog('No cookie banner found (may have been dismissed)');
        }
      }
    },
    {
      name: 'check_paywall', screenshot: 'paywall',
      fn: async () => {
        // Look for premium CTA
        const premiumBtn = await page.$('[data-testid="premium-cta"], .sg-premium-btn, button:has-text("Premium"), button:has-text("Débloquer")');
        if (premiumBtn) {
          await premiumBtn.click({ force: true });
          await page.waitForTimeout(2000);
          // Check if paywall opened
          const paywall = await page.$('.sg-v2-paywall-panel, .sg-v2-checkout-panel, [role="dialog"]');
          if (paywall) {
            log('Paywall opened successfully');
            // Close it
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          } else {
            vlog('Premium CTA clicked but paywall not detected');
          }
        } else {
          vlog('No premium CTA found');
        }
      }
    },
    {
      name: 'check_accessibility',
      fn: async () => {
        // Check for missing alt text on images
        const images = await page.$$('img');
        let missingAlt = 0;
        for (const img of images) {
          const alt = await img.getAttribute('alt');
          if (!alt) missingAlt++;
        }
        if (missingAlt > 0) issue('WARN', `${missingAlt} images missing alt text`, {});

        // Check for missing aria-labels on interactive elements
        const buttons = await page.$$('button:not([aria-label]):not([title]):not(:has-text("*"))');
        if (buttons.length > 0) vlog(`${buttons.length} buttons without aria-label or text`);

        // Check color contrast (basic)
        const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        vlog(`Body background: ${bodyBg}`);
      }
    },
    {
      name: 'check_console_errors',
      fn: async () => {
        const errors = consoleLogs.filter(l => l.type === 'error');
        const warnings = consoleLogs.filter(l => l.type === 'warning');
        if (errors.length > 0) {
          issue('MEDIUM', `${errors.length} console errors`, { errors: errors.slice(0, 10) });
        }
        if (warnings.length > 0) {
          vlog(`${warnings.length} console warnings`);
        }
      }
    },
    {
      name: 'check_network_failures',
      fn: async () => {
        if (networkErrors.length > 0) {
          issue('MEDIUM', `${networkErrors.length} network failures (non-analytics)`, { errors: networkErrors.slice(0, 5) });
        }
      }
    },
    {
      name: 'final_screenshot', screenshot: 'final',
      fn: async () => {
        await page.waitForTimeout(500);
      }
    },
  ];

  // ─── Run all steps ───────────────────────────────────────────────
  log(`\n=== AUDIT: ${region} (${liveUrl ? 'LIVE' : 'LOCAL'}) ===`);

  for (const step of steps) {
    try {
      log(`Step: ${step.name}`);
      await step.fn();
      if (step.screenshot) {
        await screenshot(page, outputDir, step.screenshot);
      }
    } catch (err) {
      issue('ERROR', `Step "${step.name}" failed`, { error: err.message.slice(0, 300) });
      log(`  ERROR: ${err.message.slice(0, 150)}`);
    }
  }

  // ─── Build report ────────────────────────────────────────────────
  const report = {
    region,
    url: liveUrl || `http://localhost:${PORT}`,
    timestamp: new Date().toISOString(),
    viewport: VIEWPORT,
    mode: liveUrl ? 'live' : 'local',
    steps: steps.map(s => s.name),
    issues,
    performance: perfMetrics,
    consoleErrors: consoleLogs.filter(l => l.type === 'error'),
    networkErrors,
    summary: {
      total: issues.length,
      critical: issues.filter(i => i.severity === 'CRITICAL').length,
      warnings: issues.filter(i => i.severity === 'WARN').length,
      medium: issues.filter(i => i.severity === 'MEDIUM').length,
      errors: issues.filter(i => i.severity === 'ERROR').length,
    }
  };

  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(outputDir, 'console.json'), JSON.stringify(consoleLogs, null, 2));

  // ─── Print summary ───────────────────────────────────────────────
  log(`\n--- SUMMARY: ${region} ---`);
  log(`Issues: ${report.summary.critical} critical, ${report.summary.warnings} warnings, ${report.summary.medium} medium, ${report.summary.errors} errors`);
  if (perfMetrics.lcp) log(`LCP: ${Math.round(perfMetrics.lcp)}ms`);
  if (perfMetrics.domContentLoaded) log(`DOMContentLoaded: ${Math.round(perfMetrics.domContentLoaded)}ms`);
  log(`Resources loaded: ${perfMetrics.resourceCount || '?'}`);
  for (const i of issues) {
    log(`  [${i.severity}] ${i.msg}`);
  }
  log(`Output: ${outputDir}`);

  // Cleanup
  await page.close();
  await context.close();
  await browser.close();
  if (server) await server.close();

  return report;
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  const allReports = [];

  for (const region of REGIONS) {
    const liveUrl = LIVE_URL
      ? (REGIONS.length > 1 ? LIVE_URL.replace(/\/$/, '').replace(/\/$/, '') + '' : LIVE_URL)
      : null;
    const report = await auditRegion(region, liveUrl);
    if (report) allReports.push(report);
  }

  // Global summary if multiple regions
  if (allReports.length > 1) {
    const totalCritical = allReports.reduce((s, r) => s + r.summary.critical, 0);
    const totalWarnings = allReports.reduce((s, r) => s + r.summary.warnings, 0);
    const totalMedium = allReports.reduce((s, r) => s + r.summary.medium, 0);
    log(`\n=== GLOBAL SUMMARY ===`);
    log(`Regions: ${allReports.length}`);
    log(`Total issues: ${totalCritical} critical, ${totalWarnings} warnings, ${totalMedium} medium`);
    for (const r of allReports) {
      log(`  ${r.region}: ${r.summary.critical}C ${r.summary.warnings}W ${r.summary.medium}M`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
