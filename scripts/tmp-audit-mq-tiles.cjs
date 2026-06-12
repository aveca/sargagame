/* Throwaway probe: tile loading behavior on first load (cold cache). */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  const tiles = [];
  page.on("response", (r) => {
    const u = r.url();
    if (/arcgis|tile|openstreetmap|basemap/i.test(u)) tiles.push({ t: Date.now(), status: r.status(), url: u.slice(0, 110) });
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/arcgis|tile|openstreetmap|basemap/i.test(u)) tiles.push({ t: Date.now(), status: "FAILED:" + (r.failure() || {}).errorText, url: u.slice(0, 110) });
  });
  const t0 = Date.now();
  await page.goto("https://sargasses-martinique.com/", { waitUntil: "domcontentloaded" });
  for (const s of [3000, 8000, 15000, 25000]) {
    await page.waitForTimeout(s === 3000 ? 3000 : 5000 + (s === 25000 ? 5000 : 0));
    console.log(`@${Date.now() - t0}ms tiles seen:`, tiles.length, "ok:", tiles.filter(x => x.status === 200).length, "failed:", tiles.filter(x => String(x.status).startsWith("FAILED")).length);
  }
  console.log(JSON.stringify(tiles.slice(0, 16), null, 1));
  await page.screenshot({ path: "audit-mq-screens/tiles-probe-final.png", timeout: 8000 }).catch(e => console.log("shot fail", e.message));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
