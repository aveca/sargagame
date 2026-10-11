const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  // Mobile : home ? fiche (clic maplabel) ? paywall (deep link ?paywall=1)
  const m = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const page = await m.newPage();
  await page.goto("https://sargasses-guadeloupe.com/", { waitUntil:"load", timeout:45000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const l=[...document.querySelectorAll(".sg-maplabel")].find(e=>getComputedStyle(e).visibility!=="hidden"); if(l) l.click(); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path:"diagnostic/2026-10-10/screenshots/prod-gp-fiche-mobile.png" });
  await page.goto("https://sargasses-guadeloupe.com/?paywall=1", { waitUntil:"load", timeout:45000 });
  await page.waitForTimeout(3500);
  const dlg = await page.locator('[role="dialog"], .sg-modal-panel').first().isVisible().catch(()=>false);
  await page.screenshot({ path:"diagnostic/2026-10-10/screenshots/prod-gp-paywall-mobile.png" });
  console.log("PROD_PAYWALL_VISIBLE=" + dlg);
  // Desktop home MQ
  const d = await browser.newContext({ viewport:{width:1440,height:900} });
  const dp = await d.newPage();
  await dp.goto("https://sargasses-martinique.com/", { waitUntil:"load", timeout:45000 });
  await dp.waitForTimeout(3500);
  await dp.screenshot({ path:"diagnostic/2026-10-10/screenshots/prod-mq-home-desktop.png" });
  await browser.close();
})().catch(e => { console.error("PROBE_FAIL", e.message); process.exit(1); });
