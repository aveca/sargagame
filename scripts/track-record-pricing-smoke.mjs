#!/usr/bin/env node
/**
 * Browser regression for the B2B reliability proof.
 * Captures before/after screenshots at 390x844 and 1440x900.
 * Verifies the browser-rendered stale and fresh track-record states with deterministic API fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PREVIEW = process.env.SMOKE_BASE || 'http://127.0.0.1:4173';
const LIVE = 'https://sargasses-martinique.com/pro/pricing/';
const LIVE_HOTELS = 'https://sargasses-martinique.com/pro/hotels/';
const LIVE_HUBS = [
  { locale: 'fr', preview: '/pro/', live: 'https://sargasses-martinique.com/pro/', staleToken: 'périmé' },
  { locale: 'en', preview: '/pro/en/', live: 'https://sargasses-martinique.com/pro/en/', staleToken: 'stale' },
  { locale: 'es', preview: '/pro/es/', live: 'https://sargasses-martinique.com/pro/es/', staleToken: 'desactualizado' },
];
const OUT = process.env.TRACK_RECORD_SCREENSHOT_DIR || '/tmp/track-record-pricing';
fs.mkdirSync(OUT, { recursive: true });

// Helper to fetch static page structure; freshness values are asserted in the browser below.
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

    // BEFORE: live site - verify it loads and capture screenshot.
    try {
      await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, 'before-' + viewport.name + '.png'), fullPage: true });
      const beforeValue = (await page.locator('#tr-clean').textContent().catch(() => 'unavailable') || '').trim();
      console.log('BEFORE_' + viewport.name + '=' + beforeValue);
    } catch (error) {
      console.warn('BEFORE_SCREENSHOT_UNAVAILABLE_' + viewport.name + '=' + String(error.message || error).slice(0, 180));
    }

    const staticChecks = {
      'has proofline': (html) => html.includes('class="proofline"'),
      'has dynamic metric targets': (html) => html.includes('id="tr-clean"') && html.includes('id="tr-line"'),
      'loads shared freshness contract': (html) => html.includes('src="/b2b-data-freshness.js"'),
      'has B2B trial CTA': (html) => html.includes('/pro/espace/'),
    };
    await fetchAndCheck(PREVIEW + '/pro/pricing/', staticChecks);

    // The pricing page computes its proof asynchronously. Serve deterministic fixtures
    // so the test validates the actual DOM after the shared freshness helper runs,
    // rather than searching the initial HTML for a percentage that must not be hardcoded.
    // BEFORE: capture the three public Pro hubs at the same viewport before stubbing the record API.
    for (const hub of LIVE_HUBS) {
      try {
        await page.goto(hub.live, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, 'hub-' + hub.locale + '-before-' + viewport.name + '.png'), fullPage: true });
        console.log('BEFORE_HUB_' + hub.locale + '_' + viewport.name + '=' + ((await page.locator('#tr-clean').textContent().catch(() => 'unavailable')) || '').trim());
      } catch (error) {
        console.warn('BEFORE_HUB_SCREENSHOT_UNAVAILABLE_' + hub.locale + '_' + viewport.name + '=' + String(error.message || error).slice(0, 180));
      }
    }

    let pricingRecordFixture = {
      generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      freshness: { stale: true },
      regions: ['mq', 'gp'],
      window: { from: '2026-10-01', to: '2026-10-30' },
      sampleSize: 123,
      overall: { statusHitRatePct: 98 },
    };
    await page.route('**/api/copernicus/track-record.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pricingRecordFixture),
    }));

    // AFTER STALE: a fresh generation timestamp must not override freshness.stale=true.
    await page.goto(PREVIEW + '/pro/pricing/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      const line = document.querySelector('#tr-line')?.textContent || '';
      return document.querySelector('#tr-clean')?.textContent?.trim() === '—' && line.includes('périmé');
    });
    assert.equal((await page.locator('#tr-clean').textContent() || '').trim(), '—', 'stale track record must hide its percentage');
    assert.match((await page.locator('#tr-line').textContent()) || '', /périmé/i, 'stale state must explain why the rate is hidden');
    assert.ok(await page.locator('.proofline').evaluate(el => el.classList.contains('is-stale')), 'stale proofline must receive its stale visual state');
    await page.screenshot({ path: path.join(OUT, 'after-stale-' + viewport.name + '.png'), fullPage: true });

    // AFTER FRESH: same page, valid regional scope and a fresh public record.
    pricingRecordFixture = {
      generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      freshness: { stale: false },
      regions: ['mq', 'gp'],
      window: { from: '2026-10-01', to: '2026-10-30' },
      sampleSize: 123,
      overall: { statusHitRatePct: 98 },
    };
    await page.goto(PREVIEW + '/pro/pricing/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#tr-clean')?.textContent?.trim() === '98%');
    assert.equal((await page.locator('#tr-clean').textContent() || '').trim(), '98%', 'fresh in-scope record should render its validated percentage');
    const freshLine = (await page.locator('#tr-line').textContent()) || '';
    assert.match(freshLine, /MQ \+ GP/, 'fresh proof must display the declared regional scope');
    assert.match(freshLine, /2026-10-01 → 2026-10-30/, 'fresh proof must display its validation window');
    assert.doesNotMatch(freshLine, /tous régimes confondus/i, 'fresh proof must not claim an unscoped all-regimes result');
    assert.equal(await page.locator('.proofline').evaluate(el => el.classList.contains('is-stale')), false, 'fresh proofline must clear the stale visual state');
    await page.screenshot({ path: path.join(OUT, 'after-fresh-' + viewport.name + '.png'), fullPage: true });

    // Pro acquisition hubs: no global accuracy percentage may render until the
    // shared helper confirms freshness and the MQ+GP scope.
    for (const hub of LIVE_HUBS) {
      pricingRecordFixture = {
        generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        freshness: { stale: true },
        regions: ['mq', 'gp'],
        window: { from: '2026-10-01', to: '2026-10-30' },
        sampleSize: 123,
        overall: { statusHitRatePct: 98 },
      };
      await page.goto(PREVIEW + hub.preview, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction((token) => {
        const line = (document.querySelector('#tr-line')?.textContent || '').toLowerCase();
        return document.querySelector('#tr-clean')?.textContent?.trim() === '—' && line.includes(token);
      }, hub.staleToken);
      assert.equal((await page.locator('#tr-clean').textContent() || '').trim(), '—', hub.locale + ' stale record must hide its percentage');
      const staleLine = (await page.locator('#tr-line').textContent()) || '';
      assert.doesNotMatch(staleLine, /98%/, hub.locale + ' stale record must not leak the fixture percentage');
      await page.screenshot({ path: path.join(OUT, 'hub-' + hub.locale + '-after-stale-' + viewport.name + '.png'), fullPage: true });

      pricingRecordFixture = {
        generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        freshness: { stale: false },
        regions: ['mq', 'gp'],
        window: { from: '2026-10-01', to: '2026-10-30' },
        sampleSize: 123,
        overall: { statusHitRatePct: 98 },
      };
      await page.goto(PREVIEW + hub.preview, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('#tr-clean')?.textContent?.trim() === '98%');
      assert.equal((await page.locator('#tr-clean').textContent() || '').trim(), '98%', hub.locale + ' fresh in-scope record should render its validated percentage');
      const hubFreshLine = (await page.locator('#tr-line').textContent()) || '';
      assert.match(hubFreshLine, /MQ \\+ GP/, hub.locale + ' fresh proof must display its regional scope');
      assert.match(hubFreshLine, /2026-10-01 → 2026-10-30/, hub.locale + ' fresh proof must display its validation window');
      await page.screenshot({ path: path.join(OUT, 'hub-' + hub.locale + '-after-fresh-' + viewport.name + '.png'), fullPage: true });
      console.log('PASS_HUB_' + hub.locale + '_' + viewport.name + '=stale/fresh scoped track record verified; before/after screenshots captured');
    }

    // B2B hotel landing: compare the public page with the PR preview at the same viewport.
    const hotelPage = await context.newPage();
    try {
      await hotelPage.goto(LIVE_HOTELS, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await hotelPage.locator('#demo').scrollIntoViewIfNeeded().catch(() => {});
      await hotelPage.screenshot({ path: path.join(OUT, 'hotel-before-' + viewport.name + '.png'), fullPage: false });
      console.log('HOTEL_BEFORE_' + viewport.name + '=' + ((await hotelPage.locator('#d-fresh').textContent().catch(() => 'unavailable')) || '').trim());
    } catch (error) {
      console.warn('HOTEL_BEFORE_SCREENSHOT_UNAVAILABLE_' + viewport.name + '=' + String(error.message || error).slice(0, 180));
    }

    const staleSourceTime = '2026-10-27T12:00:00Z';
    const recentPublishTime = '2026-10-28T17:29:52.717Z';
    let hotelFixture = {
      source: 'erddap-live',
      updatedAt: recentPublishTime,
      erddapTimestamp: staleSourceTime,
      dataAgeMinutes: 1772,
      stale: false,
      levels: [{ id: 'les-salines', status: 'clean', confidence: 60, score: 98, label: 'EXCEPTIONNEL' }]
    };
    await hotelPage.route('**/api/copernicus/sargassum.json', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(hotelFixture)
    }));
    await hotelPage.route('**/api/copernicus/track-record.json', route => route.abort());

    await hotelPage.goto(PREVIEW + '/pro/hotels/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await hotelPage.waitForFunction(() => (document.querySelector('#d-fresh')?.textContent || '').includes('Observation satellite'));
    assert.equal((await hotelPage.locator('#d-verdict').textContent() || '').trim(), 'À VÉRIFIER', 'stale source must not show a clean verdict');
    assert.equal((await hotelPage.locator('#d-score').textContent() || '').trim(), '', 'stale source score must be hidden');
    assert.match((await hotelPage.locator('#d-fresh').textContent()) || '', /Observation satellite ancienne/, 'source observation age must be explicit');
    await hotelPage.locator('#demo').scrollIntoViewIfNeeded();
    await hotelPage.screenshot({ path: path.join(OUT, 'hotel-after-stale-' + viewport.name + '.png'), fullPage: false });

    hotelFixture = {
      source: 'erddap-live',
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      erddapTimestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      dataAgeMinutes: 120,
      stale: false,
      levels: [{ id: 'les-salines', status: 'clean', confidence: 60, score: 82, label: 'EXCEPTIONNEL' }]
    };
    await hotelPage.goto(PREVIEW + '/pro/hotels/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await hotelPage.waitForFunction(() => (document.querySelector('#d-fresh')?.textContent || '').includes('Observation satellite'));
    assert.equal((await hotelPage.locator('#d-verdict').textContent() || '').trim(), 'PROPRE', 'fresh source should show its beach verdict');
    assert.equal((await hotelPage.locator('#d-score').textContent() || '').trim(), 'score 82/100', 'fresh source score should remain visible');
    assert.match((await hotelPage.locator('#d-fresh').textContent()) || '', /Observation satellite ·/, 'fresh source timestamp must be shown');
    await hotelPage.locator('#demo').scrollIntoViewIfNeeded();
    await hotelPage.screenshot({ path: path.join(OUT, 'hotel-after-fresh-' + viewport.name + '.png'), fullPage: false });
    console.log('PASS_HOTEL_' + viewport.name + '=source timestamp freshness, stale masking and fresh verdict verified; before/after screenshots captured');
    await hotelPage.close();

    console.log('PASS_' + viewport.name + '=stale/fresh pricing proof and hotel freshness verified; screenshots captured');
    await context.close();
  }
} finally {
  await browser.close();
}
