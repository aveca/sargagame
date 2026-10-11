const { chromium } = require("playwright");
const DOMAINS = ["sargasses-martinique.com","sargasses-guadeloupe.com","sargassummiami.com","sargassumpuntacana.com","sargassumcancun.com","sargazotulum.com"];
(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const d of DOMAINS) {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on("console", m => { if (m.type()==="error") errors.push(m.text().slice(0,160)); });
    page.on("pageerror", e => errors.push("PAGEERROR: "+String(e).slice(0,160)));
    page.on("requestfailed", r => failed.push(r.url().slice(0,120)+" ["+(r.failure()&&r.failure().errorText)+"]"));
    page.on("response", r => { if (r.status()>=400) failed.push(r.status()+" "+r.url().slice(0,120)); });
    let status = null, t0 = Date.now();
    try {
      const resp = await page.goto("https://"+d+"/", { waitUntil:"load", timeout:45000 });
      status = resp.status();
      await page.waitForTimeout(4000);
      const mapLabels = await page.locator(".sg-maplabel").count();
      const title = await page.title();
      await page.screenshot({ path: `diagnostic/2026-10-10/screenshots/prod-${d}-home-mobile.png`, fullPage:false });
      // data sanity: sargassum.json
      const dataResp = await page.evaluate(async () => {
        try { const r = await fetch("/api/copernicus/sargassum.json"); const j = await r.json();
          return { status: r.status, updatedAt: j.updatedAt || j.meta?.updatedAt || null, beaches: j.beaches ? j.beaches.length : (j.data ? j.data.length : null) };
        } catch(e){ return { error: String(e) } }
      });
      report.push({ d, status, title, mapLabels, loadMs: Date.now()-t0, dataResp, consoleErrors: errors.slice(0,6), netFailed: failed.slice(0,6) });
    } catch(e) { report.push({ d, error: String(e).slice(0,200) }); }
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
})().catch(e => { console.error("PROBE_FAIL", e.message); process.exit(1); });
