import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = new URL(process.env.SMOKE_BASE || 'http://localhost:4173');
const OUTPUT = '/tmp/chasse-home-freshness';
const DATA_URL = /\/api\/copernicus\/(?:[^/?]+\/)?sargassum\.json(?:\?.*)?$/;
const VIEWPORTS = [
  { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'desktop-1440x900', width: 1440, height: 900, isMobile: false, hasTouch: false },
];

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch();

async function runScenario(viewport, state) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  let intercepted = 0;

  // No external network, analytics write, email, or payment can escape this preview test.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === BASE.origin) return route.continue();
    return route.abort();
  });

  // Preserve the real regional payload, but control only the observation clock.
  await page.route(DATA_URL, async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'satellite JSON must exist in the built preview');
    const payload = await response.json();
    assert.ok(Array.isArray(payload.levels), 'regional payload must retain its real beach levels');

    const ageHours = state === 'stale' ? 48 : 1;
    const observation = new Date(Date.now() - ageHours * 60 * 60 * 1000).toISOString();
    payload.source = 'erddap-live';
    payload.stale = false;
    payload.erddapTimestamp = observation;
    payload.updatedAt = new Date().toISOString();
    payload.dataAgeMinutes = ageHours * 60;

    intercepted += 1;
    await route.fulfill({ response, json: payload });
  });

  try {
    await page.goto(new URL('/?hero=1&chasse=1', BASE).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    assert.ok(intercepted > 0, 'the Chasse home must consume the intercepted satellite payload');

    if (state === 'stale') {
      const pause = page.getByTestId('chasse-home-stale');
      await pause.waitFor({ state: 'visible', timeout: 30000 });
      const copy = await pause.innerText();
      assert.match(copy, /À VÉRIFIER/, 'French stale state must explain that no current verdict is available');
      assert.ok((await page.getByTestId('chasse-home-stale-age').innerText()).trim(),
        'the pause state must expose the real observation-age label');
      for (const selector of ['.lc-card', '.lc-pack', '.lc-gomap', '.lc-bells', '.lc-spacebtn']) {
        assert.equal(await page.locator(selector).count(), 0,
          selector + ' must not mount while the observation is stale');
      }
    } else {
      const game = page.locator('.lc-root[role="dialog"][aria-label="La Chasse"]');
      await game.waitFor({ state: 'visible', timeout: 30000 });
      await page.locator('.lc-gomap').waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await page.getByTestId('chasse-home-stale').count(), 0,
        'a sufficiently recent LIVE observation must retain the normal Chasse experience');
    }

    const screenshot = OUTPUT + '/' + state + '-' + viewport.name + '.png';
    await page.screenshot({ path: screenshot, fullPage: false });
    console.log('PASS_CHASSE_HOME_' + state.toUpperCase() + '_' + viewport.name + ' screenshot=' + screenshot);
  } finally {
    await context.close();
  }
}

try {
  for (const viewport of VIEWPORTS) {
    await runScenario(viewport, 'fresh');
    await runScenario(viewport, 'stale');
  }
  console.log('CHASSE_HOME_FRESHNESS_BROWSER_PASS (fresh/stale × 390x844/1440x900; external network blocked)');
} finally {
  await browser.close();
}
