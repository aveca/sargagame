const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })).newPage();
  await page.goto("https://sargazotulum.com/", { waitUntil:"load", timeout:45000 });
  await page.waitForTimeout(4000);
  const labels = await page.locator(".sg-maplabel").count();
  await page.screenshot({ path:"diagnostic/2026-10-10/screenshots/prod-tulum-after-fix-mobile.png" });
  console.log("TULUM_MAPLABELS_AFTER=" + labels);
  // anti-replay présent dans le bundle prod ?
  const html = await page.content();
  const m = html.match(/src="(\/assets\/[^"]+index[^"]+\.js)"/);
  if (m) {
    const js = await page.evaluate(async (u) => { const r = await fetch(u); return r.text(); }, m[1]);
    console.log("ANTIREPLAY_IN_PROD_BUNDLE=" + js.includes("sg_mollie_done_"));
  }
  await browser.close();
})().catch(e => { console.error("PROBE_FAIL", e.message); process.exit(1); });
