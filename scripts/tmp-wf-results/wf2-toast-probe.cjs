/**
 * wf2-toast-probe.cjs — déclenche le toast SargaCatch (45s idle) sur MQ mobile
 * et mesure : animation d'entrée, bounding box, chevauchement avec le FAB chat.
 * Lecture seule. script.google.com bloqué.
 */
const { chromium } = require("playwright");
const path = require("path");
const OUT = path.join(__dirname, "wf2-fluid-shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.route("**script.google.com**", (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto("https://sargasses-martinique.com", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(9000);
  const dis = page.locator("div[role=dialog] button", { hasText: /carte|map|mapa/i }).last();
  if (await dis.isVisible().catch(() => false)) await dis.click().catch(() => {});
  console.log("hero dismissed, waiting 48s idle for toast...");
  // record toast appearance via rAF (poll every 300ms is enough to catch pop vs anim)
  await page.evaluate(() => {
    window.__toastRec = [];
    const tick = () => {
      const t = [...document.querySelectorAll("div")].find((d) => /30 secondes|30 seconds/i.test(d.textContent || "") && d.children.length >= 3 && d.offsetHeight > 20 && d.offsetHeight < 200);
      if (t) {
        const cs = getComputedStyle(t);
        window.__toastRec.push({ t: +performance.now().toFixed(0), op: cs.opacity, anim: cs.animationName, trans: cs.transitionDuration });
      }
      if (window.__toastRec.length < 30) setTimeout(() => requestAnimationFrame(tick), 120);
    };
    requestAnimationFrame(tick);
  });
  await sleep(50000);
  const res = await page.evaluate(() => {
    const fab = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "💬");
    const t = [...document.querySelectorAll("div")].find((d) => /30 secondes|30 seconds/i.test(d.textContent || "") && d.children.length >= 3 && d.offsetHeight > 20 && d.offsetHeight < 200);
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    let hit = null;
    if (t && fab) {
      const fr = fab.getBoundingClientRect();
      hit = document.elementsFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2).slice(0, 3).map((e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : ""));
    }
    return { toast: box(t), toastStyle: t ? { anim: getComputedStyle(t).animationName, trans: getComputedStyle(t).transitionDuration, z: getComputedStyle(t.parentElement).zIndex } : null, fab: box(fab), fabCenterHit: hit, rec: window.__toastRec ? window.__toastRec.slice(0, 5) : [] };
  });
  console.log(JSON.stringify(res, null, 1));
  await page.screenshot({ path: path.join(OUT, "wf2-mq-mobile-6-toast.png") });
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
