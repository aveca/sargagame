/* Throwaway UI/UX audit script — sargasses-martinique.com (live)
 * Screenshots mobile 390x844 + desktop 1440x900, plus text dumps.
 * Output: audit-mq-screens/   — DO NOT COMMIT.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "audit-mq-screens");
fs.mkdirSync(OUT, { recursive: true });

const BASE = "https://sargasses-martinique.com";
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
];

const STATIC_PAGES = [
  { slug: "plages-index", url: "/plages/" },
  { slug: "beach-seo-salines", url: "/plages/plage-des-salines/" },
  { slug: "previsions", url: "/previsions/" },
  { slug: "conditions-index", url: "/conditions/" },
  { slug: "saison", url: "/saison-sargasses-martinique/" },
];

const log = (...a) => console.log("[audit]", ...a);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = {};

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.isMobile ? 3 : 1,
      userAgent: vp.isMobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      locale: "fr-FR",
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });

    // ---------- 1. HOME / CARTE ----------
    const t0 = Date.now();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(6000); // let map + data settle
    const loadMs = Date.now() - t0;
    await page.screenshot({ path: path.join(OUT, `${vp.name}-01-home.png`) });
    const homeText = await page.evaluate(() => document.body.innerText.slice(0, 6000));
    report[`${vp.name}-home`] = { loadMs, text: homeText };

    // ---------- 2. BEACH SHEET (click a marker) ----------
    let sheetOk = false;
    try {
      const markers = page.locator(".leaflet-marker-icon");
      const n = await markers.count();
      log(vp.name, "markers:", n);
      if (n > 0) {
        // pick a marker near map center to avoid cluster edge cases
        const center = { x: vp.width / 2, y: vp.height / 2 };
        let best = 0, bestD = 1e9;
        for (let i = 0; i < Math.min(n, 60); i++) {
          const bb = await markers.nth(i).boundingBox().catch(() => null);
          if (!bb) continue;
          const d = Math.hypot(bb.x + bb.width / 2 - center.x, bb.y + bb.height / 2 - center.y);
          if (d < bestD) { bestD = d; best = i; }
        }
        await markers.nth(best).click({ force: true });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(OUT, `${vp.name}-02-sheet.png`) });
        report[`${vp.name}-sheet`] = { text: await page.evaluate(() => document.body.innerText.slice(0, 7000)) };
        sheetOk = true;
        // scroll inside the sheet to capture forecast/premium teaser
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `${vp.name}-02b-sheet-scrolled.png`) });
      }
    } catch (e) { log("sheet fail", e.message); }

    // close sheet
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);

    // ---------- 3. PREMIUM MODAL ----------
    try {
      // dock item labelled Premium
      const prem = page.locator("text=Premium").first();
      await prem.click({ timeout: 5000, force: true });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-03-premium.png`) });
      report[`${vp.name}-premium`] = { text: await page.evaluate(() => document.body.innerText.slice(0, 7000)) };
      // scroll modal if scrollable
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `${vp.name}-03b-premium-scrolled.png`) });
    } catch (e) { log("premium fail", e.message); }

    // ---------- 4. STATIC PAGES ----------
    for (const sp of STATIC_PAGES) {
      try {
        const ts = Date.now();
        await page.goto(BASE + sp.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
        const ms = Date.now() - ts;
        await page.screenshot({ path: path.join(OUT, `${vp.name}-10-${sp.slug}.png`) });
        await page.screenshot({ path: path.join(OUT, `${vp.name}-10-${sp.slug}-full.png`), fullPage: true });
        report[`${vp.name}-${sp.slug}`] = {
          loadMs: ms,
          title: await page.title(),
          text: await page.evaluate(() => document.body.innerText.slice(0, 9000)),
        };
      } catch (e) { log(sp.slug, "fail", e.message); }
    }

    report[`${vp.name}-console-errors`] = consoleErrors.slice(0, 30);
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  log("DONE →", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
