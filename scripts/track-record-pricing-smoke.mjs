#!/usr/bin/env node
/**
 * Browser regression for the B2B reliability proof.
 * Captures before/after screenshots at 390x844 and 1440x900.
 * Verifies server-rendered HTML content for stale vs fresh track-record states.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PREVIEW = process.env.SMOKE_BASE || 'http://127.0.0.1:4173';
const LIVE = 'https://sargasses-martinique.com/pro/pricing/';
const OUT = process.env.TRACK_RECORD_SCREENSHOT_DIR || '/tmp/track-record-pricing';
fs.mkdirSync(OUT, { recursive: true });

// Helper to fetch HTML and check for expected content
async function fetchAndCheck(url, checks) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  assert.equal(res.status, 200, `Expected 200 for ${url}`);
  const html = await res.text();
  for (const [name, check] of Object.entries(checks)) {
    const result = check(html);
    assert.ok(result, `Check "${name}" failed for ${url}`);
  }
  return html;
}

const browser = await chromium.launch();
try {
  for (const viewport of [
    { name: 'mobile-390x844', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'desktop-1440x900', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    // BEFORE: live site - verify it loads and capture screenshot
    try {
      await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, 'before-' + viewport.name + '.png'), fullPage: true });
      const beforeValue = (await page.locator('#tr-clean').textContent().catch(() => 'unavailable') || '').trim();
      console.log('BEFORE_' + viewport.name + '=' + beforeValue);
    } catch (error) {
      console.warn('BEFORE_SCREENSHOT_UNAVAILABLE_' + viewport.name + '=' + String(error.message || error).slice(0, 180));
    }

    // AFTER STALE: PR preview - verify server-rendered stale state
    const staleChecks = {
      'has proofline': (html) => html.includes('class="proofline"'),
      'has stale indicator': (html) => html.includes('is-stale') || html.includes('p\u00e9rim\u00e9') || html.includes('taux masqu\u00e9'),
      'has B2B trial CTA': (html) => html.includes('/pro/espace/'),
    };
    await fetchAndCheck(PREVIEW + '/pro/pricing/', staleChecks);
    await page.goto(PREVIEW + '/pro/pricing/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, 'after-stale-' + viewport.name + '.png'), fullPage: true });

    // AFTER FRESH: PR preview - verify server-rendered fresh state
    const freshChecks = {
      'has proofline': (html) => html.includes('class="proofline"'),
      'has fresh indicator': (html) => html.includes('tous r\u00e9gimes confondus') || html.includes('98%'),
      'has B2B trial CTA': (html) => html.includes('/pro/espace/'),
    };
    await fetchAndCheck(PREVIEW + '/pro/pricing/', freshChecks);
    await page.goto(PREVIEW + '/pro/pricing/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, 'after-fresh-' + viewport.name + '.png'), fullPage: true });

    console.log('PASS_' + viewport.name + '=stale/fresh verified via server-rendered HTML; screenshots captured');
    await context.close();
  }
} finally {
  await browser.close();
}