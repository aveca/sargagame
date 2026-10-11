const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })).newPage();
  await page.goto("http://localhost:4173/?frustration=0&paywall=1", { waitUntil:"load", timeout:60000 });
  const panel = page.locator('.sg-modal-panel[role="dialog"]').first();
  await panel.waitFor({ state:"visible", timeout:30000 }).catch(()=>{});
  await page.waitForTimeout(1200);
  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('.sg-modal-panel button, [role="dialog"] button')).map(b => ({ aria: b.getAttribute("aria-label"), text: (b.textContent||"").trim().slice(0,50) })).slice(0,25));
  console.log("PANEL_VISIBLE=" + await panel.isVisible().catch(()=>false));
  console.log("BUTTONS=" + JSON.stringify(buttons, null, 1));
  await page.screenshot({ path: "diagnostic/2026-10-10/screenshots/local-paywall-mobile.png" });
  await browser.close();
})().catch(e => { console.error("PROBE_FAIL", e.message); process.exit(1); });
