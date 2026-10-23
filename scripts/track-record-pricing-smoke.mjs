#!/usr/bin/env node
/**
 * Browser regression for the B2B reliability proof.
 * Captures before/after screenshots at 390x844 and 1440x900. The "before"
 * capture uses the current public page with a controlled stale-but-mislabeled
 * API response; the "after" capture uses the PR preview with the same response.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PREVIEW = process.env.SMOKE_BASE || 'http://127.0.0.1:4173';
const LIVE = 'https://sargasses-martinique.com/pro/pricing/';
const OUT = process.env.TRACK_RECORD_SCREENSHOT_DIR || '/tmp/track-record-pricing';
fs.mkdirSync(OUT, { recursive: true });

const staleButMislabeled = {
  generatedAt: '2026-08-05T02:37:06.845Z',
  window: { from: '2026-07-27', to: '2026-08-05' },
  freshness: { stale: false },
  overall: { statusHitRatePct: 96 },
  sampleSize: 819,
  byRegime: { calm: { cleanReliabilityPct: 100, cleanSamples: 780 } },
};
const freshPayload = {
  generatedAt: new Date().toISOString(),
  window: { from: '2026-10-08', to: '2026-10-21' },
  freshness: { stale: false },
  overall: { statusHitRatePct: 98 },
  sampleSize: 1323,
  byRegime: { calm: { cleanReliabilityPct: 100, cleanSamples: 1050 } },
};

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
    let payload = staleButMislabeled;
    await page.route('**/api/copernicus/track-record.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
      headers: { 'cache-control': 'no-store' },
    }));

    // BEFORE: live markup/JS, with a deterministic stale response. This is
    // best-effort because public hosting may block CI; after-preview is required.
    try {
      await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, 'before-' + viewport.name + '.png'), fullPage: true });
      const beforeValue = (await page.locator('#tr-clean').textContent().catch(() => 'unavailable') || '').trim();
      console.log('BEFORE_' + viewport.name + '=' + beforeValue);
    } catch (error) {
      console.warn('BEFORE_SCREENSHOT_UNAVAILABLE_' + viewport.name + '=' + String(error.message || error).slice(0, 180));
    }

    // AFTER: PR preview must hide the old percentage even when API says stale=false.
    await page.goto(PREVIEW + '/pro/pricing/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => /périmé/i.test(document.querySelector('#tr-line')?.textContent || ''), null, { timeout: 10000 });
    assert.equal((await page.locator('#tr-clean').textContent()).trim(), '—');
    assert.equal(await page.locator('.proofline.is-stale').count(), 1);
    assert.ok((await page.locator('#tr-line').textContent()).toLowerCase().includes('taux masqué'));
    assert.ok(await page.locator('a[href="/pro/espace/"]').count() >= 1, 'B2B trial CTA remains present');
    await page.screenshot({ path: path.join(OUT, 'after-stale-' + viewport.name + '.png'), fullPage: true });

    // Fresh data must still render, with a label that matches the metric's scope.
    payload = freshPayload;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#tr-clean')?.textContent.trim() === '98%', null, { timeout: 10000 });
    const line = await page.locator('#tr-line').textContent();
    assert.match(line, /tous régimes confondus/);
    assert.equal(await page.locator('.proofline.is-stale').count(), 0);
    await page.screenshot({ path: path.join(OUT, 'after-fresh-' + viewport.name + '.png'), fullPage: true });

    console.log('PASS_' + viewport.name + '=stale hidden; fresh overall shown; CTA preserved');
    await context.close();
  }
} finally {
  await browser.close();
}
