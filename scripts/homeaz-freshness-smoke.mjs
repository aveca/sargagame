#!/usr/bin/env node
/**
 * HomeAZ freshness browser regression.
 * Uses the real built app/preview, but deterministically overrides only the
 * regional Copernicus JSON response so fresh/stale states are reproducible.
 * Captures 390x844 and 1440x900 screenshots and checks real CTA handlers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = path.join(ROOT, "public/api/copernicus/sargassum.json");
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:4173";
const OUT = process.env.HOME_AZ_SCREENSHOT_DIR || "/tmp/homeaz-freshness";
const URL = BASE + "/?hero=1&chasse=0&home_az=1";
const HOUR = 60 * 60 * 1000;

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile-390x844", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "desktop-1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false },
];

function payloadAtAge(ageMs, nowMs = Date.now()) {
  return {
    ...FIXTURE,
    updatedAt: new Date(nowMs).toISOString(),
    erddapTimestamp: new Date(nowMs - ageMs).toISOString(),
    // Deliberately stale publication metadata: UI must use erddapTimestamp.
    dataAgeMinutes: 1,
    stale: false,
  };
}

async function openHome(browser, viewport, ageMs) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  let apiCalls = 0;
  await page.route("**/api/copernicus/sargassum.json*", async (route) => {
    apiCalls += 1;
    const nowMs = Date.now();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify(payloadAtAge(ageMs, nowMs)),
    });
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('[role="dialog"]')]
      .some((host) => host.shadowRoot && host.shadowRoot.querySelector("#liveTxt"));
  }, null, { timeout: 30000 });

  const expected = ageMs < 12 * HOUR ? "fresh" : "stale";
  await page.waitForFunction((state) => {
    const host = [...document.querySelectorAll('[role="dialog"]')]
      .find((node) => node.shadowRoot && node.shadowRoot.querySelector("#liveTxt"));
    const badge = host && host.shadowRoot.querySelector("#liveTxt");
    const text = badge ? badge.textContent.trim() : "";
    return state === "fresh"
      ? /^(OBSERVATION RÉCENTE|RECENT OBSERVATION|OBSERVACIÓN RECIENTE)$/.test(text)
      : /SATELLITE EN RETARD|SATELLITE DELAYED|SATÉLITE ATRASADO/.test(text);
  }, expected, { timeout: 20000 });

  // The app can mount HomeAZ before its image manifest resolves. Do not test
  // a dead CTA against the component's defensive fallback beach; wait until
  // the real hero candidate has been selected from the regional beach data.
  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[role="dialog"]')]
      .find((node) => node.shadowRoot && node.shadowRoot.querySelector("#liveTxt"));
    const label = host && host.getAttribute("aria-label");
    return !!label && label !== "Sargasses";
  }, null, { timeout: 20000 });

  return { context, page, apiCalls: () => apiCalls };
}

async function shadowText(page, selector) {
  return page.evaluate((sel) => {
    const host = [...document.querySelectorAll('[role="dialog"]')]
      .find((node) => node.shadowRoot && node.shadowRoot.querySelector("#liveTxt"));
    const node = host && host.shadowRoot.querySelector(sel);
    return node ? (node.textContent || "").trim() : null;
  }, selector);
}

async function shadowDisplay(page, selector) {
  return page.evaluate((sel) => {
    const host = [...document.querySelectorAll('[role="dialog"]')]
      .find((node) => node.shadowRoot && node.shadowRoot.querySelector("#liveTxt"));
    const node = host && host.shadowRoot.querySelector(sel);
    const target = sel === "#vScore" && node ? node.parentElement : node;
    return target ? getComputedStyle(target).display : null;
  }, selector);
}

async function waitForHomeAzUnmount(page) {
  await page.waitForFunction(() => {
    return ![...document.querySelectorAll('[role="dialog"]')]
      .some((host) => host.shadowRoot && host.shadowRoot.querySelector("#liveTxt"));
  }, null, { timeout: 10000 });
}

const browser = await chromium.launch();
try {
  // Capture both source states at the requested CSS viewport dimensions.
  for (const viewport of VIEWPORTS) {
    const fresh = await openHome(browser, viewport, 1 * HOUR);
    try {
      const sourceLabel = await shadowText(fresh.page, "#eb0 .dt");
      assert.ok(sourceLabel && /UTC/.test(sourceLabel), "fresh state must show the source observation date and UTC time");
      assert.match(await shadowText(fresh.page, "#liveTxt"), /^(OBSERVATION RÉCENTE|RECENT OBSERVATION|OBSERVACIÓN RECIENTE)$/);
      const freshEyebrow = await shadowText(fresh.page, "#eb0");
      assert.doesNotMatch(freshEyebrow || "", /COPERNICUS/i,
        "fresh generic ERDDAP payload must not be mislabeled as Copernicus");
      assert.notEqual(await shadowText(fresh.page, "#vScore"), "—",
        "fresh state may show the current score");
      assert.notEqual(await shadowDisplay(fresh.page, "#vScore"), "none",
        "fresh state may show the score label and denominator");
      for (const selector of ["#ctaHero", "#mapLink", "#ctaPremium"]) {
        assert.equal(await fresh.page.locator(selector).count(), 1, "expected HomeAZ control " + selector);
      }
      await fresh.page.screenshot({
        path: path.join(OUT, "fresh-" + viewport.name + ".png"),
        animations: "disabled",
      });
      console.log("PASS fresh screenshot " + viewport.name);
    } finally {
      await fresh.context.close();
    }

    const stale = await openHome(browser, viewport, 16 * HOUR);
    try {
      const badge = await shadowText(stale.page, "#liveTxt");
      assert.match(badge, /SATELLITE EN RETARD|SATELLITE DELAYED|SATÉLITE ATRASADO/);
      assert.doesNotMatch(badge, /^(OBSERVATION RÉCENTE|RECENT OBSERVATION|OBSERVACIÓN RECIENTE)$/);
      const sourceLabel = await shadowText(stale.page, "#eb0 .dt");
      assert.ok(sourceLabel && /UTC/.test(sourceLabel), "stale state must show the actual source observation time");
      const support = await shadowText(stale.page, "#ctaHeroS");
      assert.ok(support && /pas une confirmation en direct|not live|no una confirmación en vivo/i.test(support),
        "stale state must not promise a live verdict");
      const staleVerdict = await shadowText(stale.page, "#vTxt");
      assert.match(staleVerdict || "", /Dernier statut observé|Last observed status|Último estado observado/i,
        "stale verdict must be explicitly historical");
      assert.equal(await shadowText(stale.page, "#vScore"), "—",
        "stale state must suppress the numeric hero score");
      assert.equal(await shadowDisplay(stale.page, "#vScore"), "none",
        "stale state must hide the entire score label and denominator");
      const staleTop3Score = await shadowText(stale.page, "#top3 .pf");
      if (staleTop3Score) assert.match(staleTop3Score, /score masqué|score hidden|puntaje oculto/i,
        "stale state must suppress top-three numeric scores");
      const staleEyebrow = await shadowText(stale.page, "#eb0");
      assert.doesNotMatch(staleEyebrow || "", /COPERNICUS/i,
        "generic ERDDAP payload must not be mislabeled as Copernicus");

      await stale.page.screenshot({
        path: path.join(OUT, "stale-" + viewport.name + ".png"),
        animations: "disabled",
      });
      console.log("PASS stale screenshot " + viewport.name);
    } finally {
      await stale.context.close();
    }
  }

  // Functional checks on mobile: latest-reading CTA, map CTA and Premium CTA.
  const mobile = VIEWPORTS[0];
  const latest = await openHome(browser, mobile, 1 * HOUR);
  try {
    await latest.page.locator("#ctaHero").click({ timeout: 20000 });
    await waitForHomeAzUnmount(latest.page);
    await latest.page.waitForFunction(() => {
      const text = document.body.innerText || "";
      return /BAIGNADE OK|SWIM OK|BAÑO OK/i.test(text);
    }, null, { timeout: 15000 });
    console.log("PASS latest-reading CTA opens a beach detail");
  } finally {
    await latest.context.close();
  }

  const map = await openHome(browser, mobile, 16 * HOUR);
  try {
    await map.page.locator("#mapLink").click({ timeout: 20000 });
    await waitForHomeAzUnmount(map.page);
    await map.page.waitForFunction(() => document.querySelectorAll(".sg-maplabel").length >= 3,
      null, { timeout: 15000 });
    console.log("PASS map CTA dismisses HomeAZ and returns to map");
  } finally {
    await map.context.close();
  }

  const premium = await openHome(browser, mobile, 16 * HOUR);
  try {
    const premiumCta = premium.page.locator("#ctaPremium");
    await premiumCta.scrollIntoViewIfNeeded();
    await premiumCta.click({ timeout: 20000 });
    await premium.page.waitForFunction(() => {
      const node = document.querySelector(".pww-wrap, .sg-modal-panel");
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }, null, { timeout: 20000 });
    console.log("PASS Premium CTA opens paywall");
  } finally {
    await premium.context.close();
  }

  // Prove the 12-hour transition while the page stays open and without a new fetch.
  // The response is timestamped 8 seconds before the boundary; the timer must
  // change the badge from LIVE to a dated reading on its own.
  const transition = await openHome(browser, mobile, 12 * HOUR - 8000);
  try {
    assert.match(await shadowText(transition.page, "#liveTxt"), /^(OBSERVATION RÉCENTE|RECENT OBSERVATION|OBSERVACIÓN RECIENTE)$/);
    const callsBefore = transition.apiCalls();
    await transition.page.waitForFunction(() => {
      const host = [...document.querySelectorAll('[role="dialog"]')]
        .find((node) => node.shadowRoot && node.shadowRoot.querySelector("#liveTxt"));
      const badge = host && host.shadowRoot.querySelector("#liveTxt");
      const text = badge ? badge.textContent.trim() : "";
      return /MESURE SATELLITE|SATELLITE READING|MEDICIÓN SATELITAL/.test(text);
    }, null, { timeout: 15000 });
    assert.equal(transition.apiCalls(), callsBefore, "freshness boundary must update without another network request");
    console.log("PASS 12-hour freshness transition without network refresh");
  } finally {
    await transition.context.close();
  }

  console.log("HOMEAZ_FRESHNESS=PASS");
  console.log("HOMEAZ_SCREENSHOTS=" + OUT);
  console.log("HOMEAZ_INTERACTIONS=PASS");
} finally {
  await browser.close();
}
