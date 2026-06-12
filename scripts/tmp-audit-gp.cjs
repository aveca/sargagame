/* Throwaway UI/UX audit script — sargasses-guadeloupe.com (GP, fr)
 * Screenshots mobile 390x844 + desktop 1440x900, text extraction, console errors, perf.
 * Output: scripts/tmp-audit-gp-shots/
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://sargasses-guadeloupe.com";
const OUT = path.join(__dirname, "tmp-audit-gp-shots");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const report = { pages: {}, consoleErrors: {}, perf: {} };

async function snap(page, name) {
  await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: false });
}
async function snapFull(page, name) {
  try { await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true }); }
  catch (e) { await snap(page, name); }
}
async function meta(page) {
  return page.evaluate(() => {
    const g = (s) => { const el = document.querySelector(s); return el ? (el.content || el.textContent || "").trim() : null; };
    return {
      title: document.title,
      desc: g('meta[name="description"]'),
      h1: g("h1"),
      lang: document.documentElement.lang,
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    };
  });
}
async function visibleText(page, maxLen = 6000) {
  const t = await page.evaluate(() => document.body.innerText);
  return t.replace(/\n{3,}/g, "\n\n").slice(0, maxLen);
}
async function perfMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const lcp = performance.getEntriesByType("largest-contentful-paint");
    return {
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
      transferSize: nav ? nav.transferSize : null,
      lcp: lcp.length ? Math.round(lcp[lcp.length - 1].startTime) : null,
    };
  });
}

async function auditViewport(browser, label, viewport, isMobile) {
  const ctx = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
    userAgent: isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
    locale: "fr-FR",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 300)));

  // ---------- 1. HOME / CARTE ----------
  const t0 = Date.now();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(5000); // let map + data load, survive SW reload
  report.pages[`home_${label}`] = { finalUrl: page.url() };
  try { report.perf[`home_${label}`] = { wallClockToLoadMs: Date.now() - t0, ...(await perfMetrics(page)) }; } catch (e) { report.perf[`home_${label}`] = { error: String(e).slice(0, 200) }; }
  try { Object.assign(report.pages[`home_${label}`], { meta: await meta(page), text: await visibleText(page) }); } catch (e) { report.pages[`home_${label}`].error = String(e).slice(0, 200); }
  await snap(page, `01-home-${label}`);

  // dump nav/dock buttons
  try {
    report.pages[`home_${label}`].navButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("nav button, nav a, [class*=dock] button, [class*=dock] a"))
        .map((b) => b.innerText.trim().replace(/\n/g, " ")).filter(Boolean).slice(0, 30);
    });
  } catch (e) {}

  // ---------- 2. FICHE PLAGE (clic pastille -> bottom sheet) ----------
  try {
    const markers = page.locator(".leaflet-marker-icon");
    const n = await markers.count();
    if (n > 0) {
      // pick a marker near the middle of the visible map
      let best = 0, bestD = 1e9;
      for (let i = 0; i < Math.min(n, 40); i++) {
        const bb = await markers.nth(i).boundingBox();
        if (!bb) continue;
        const d = Math.abs(bb.x + bb.width / 2 - viewport.width / 2) + Math.abs(bb.y + bb.height / 2 - viewport.height / 2);
        if (d < bestD) { bestD = d; best = i; }
      }
      await markers.nth(best).click({ force: true });
      await page.waitForTimeout(2500);
      await snap(page, `02-sheet-${label}`);
      report.pages[`sheet_${label}`] = { text: await visibleText(page, 8000) };
      // try expanding the sheet (drag handle up) on mobile
      const sheet = page.locator(".sheet").first();
      if (await sheet.count()) {
        report.pages[`sheet_${label}`].sheetText = (await sheet.innerText()).slice(0, 5000);
      }
    } else {
      report.pages[`sheet_${label}`] = { error: "no leaflet markers found" };
    }
  } catch (e) {
    report.pages[`sheet_${label}`] = { error: String(e).slice(0, 300) };
  }

  // ---------- 3. PREMIUM / PAYWALL MODAL ----------
  try {
    // close sheet first (Escape / close button)
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(800);
    const premiumBtn = page.locator("button:has-text('Premium'), a:has-text('Premium')").first();
    if (await premiumBtn.count()) {
      await premiumBtn.click({ force: true });
      await page.waitForTimeout(2500);
      await snap(page, `03-paywall-${label}`);
      report.pages[`paywall_${label}`] = { text: await visibleText(page, 8000) };
      const modal = page.locator(".sg-modal-panel").first();
      if (await modal.count()) {
        report.pages[`paywall_${label}`].modalText = (await modal.innerText()).slice(0, 5000);
      }
      // if prelude variant, click the primary CTA to reach the actual paywall
      const cta = page.locator(".sg-modal-panel button").first();
      if (await cta.count()) {
        const ctaTxt = (await cta.innerText()).trim();
        report.pages[`paywall_${label}`].firstButton = ctaTxt;
      }
    } else {
      report.pages[`paywall_${label}`] = { error: "no Premium button found" };
    }
  } catch (e) {
    report.pages[`paywall_${label}`] = { error: String(e).slice(0, 300) };
  }

  // ---------- 4-7. STATIC PAGES ----------
  const staticPages = [
    ["plages-index", "/plages/"],
    ["plage-seo", "/plages/plage-de-la-caravelle/"],
    ["conditions", "/conditions/"],
    ["previsions", "/previsions/"],
    ["saison", "/saison-sargasses-guadeloupe/"],
  ];
  for (const [name, url] of staticPages) {
    try {
      const t = Date.now();
      const resp = await page.goto(BASE + url, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(2500);
      report.perf[`${name}_${label}`] = { status: resp ? resp.status() : null, wallClockToLoadMs: Date.now() - t, ...(await perfMetrics(page)) };
      report.pages[`${name}_${label}`] = { meta: await meta(page), text: await visibleText(page) };
      await snap(page, `04-${name}-${label}`);
      if (label === "mobile") await snapFull(page, `04-${name}-${label}-full`);
    } catch (e) {
      report.pages[`${name}_${label}`] = { error: String(e).slice(0, 300) };
    }
  }

  report.consoleErrors[label] = errors.slice(0, 25);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  await auditViewport(browser, "mobile", { width: 390, height: 844 }, true);
  await auditViewport(browser, "desktop", { width: 1440, height: 900 }, false);
  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("DONE. Shots in", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
