const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type()==="error") errors.push(m.text().slice(0,200)); });
  // P0 probe: ?pass=p30 SANS session_id
  await page.goto("http://localhost:4173/?pass=p30", { waitUntil:"load", timeout:60000 });
  await page.waitForTimeout(2500);
  const grant = await page.evaluate(() => ({
    passEnd: localStorage.getItem("sg_premium_pass_end"),
    premium: localStorage.getItem("sg_premium"),
    url: location.href,
  }));
  await page.screenshot({ path: "diagnostic/2026-10-10/screenshots/local-pass-p30-no-session.png" });
  console.log("GRANT_SANS_SESSION_ID=" + JSON.stringify(grant));
  // Vérifie que le pass est bien ACTIF (effet sur l'UI)
  const grantActive = await page.evaluate(() => {
    const end = parseInt(localStorage.getItem("sg_premium_pass_end")||"0",10);
    return end > Date.now();
  });
  console.log("PASS_ACTIF=" + grantActive);
  console.log("CONSOLE_ERRORS=" + JSON.stringify(errors.slice(0,5)));
  await browser.close();
})().catch(e => { console.error("PROBE_FAIL", e.message); process.exit(1); });
