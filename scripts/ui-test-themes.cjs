#!/usr/bin/env node
/**
 * ui-test-themes.cjs — test UI visuel des thèmes via WebKit (= moteur Safari).
 * Capture chaque thème in-app (?theme=<id>) + les galeries concept, dans
 * /tmp/ui-test/. Sert de smoke-test visuel reproductible (cf. UI-TEST.md).
 *
 * Usage : BASE=https://sargasses-martinique.com node scripts/ui-test-themes.cjs
 *         (défaut BASE=http://localhost:4173 — lance `npx vite preview` avant)
 * Pré-requis : npm i -D playwright && npx playwright install webkit
 */
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE || "http://localhost:4173";
const OUT = process.env.OUT || "/tmp/ui-test";
const THEMES = ["golden", "comic", "manga", "arcade", "sticker"];
const GALLERIES = ["themes-lab/arena.html", "themes-lab/arena-v2.html", "themes-lab/neon.html"];

(async () => {
  let webkit, devices;
  try { ({ webkit, devices } = require("playwright")); }
  catch (e) { console.error("playwright manquant : npm i -D playwright && npx playwright install webkit"); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await webkit.launch();
  const report = [];

  // 1) Thèmes in-app (iPhone) — skip onboarding, capture l'écran principal
  for (const th of THEMES) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(e.message));
    try {
      await page.goto(`${BASE}/?theme=${th}`, { waitUntil: "networkidle", timeout: 40000 });
      await page.waitForTimeout(3500);
      for (let i = 0; i < 5; i++) { const e = page.locator("text=/Passer/i").first(); if (await e.count()) { await e.click({ timeout: 1200 }).catch(()=>{}); await page.waitForTimeout(700); } else break; }
      const body = await page.evaluate(() => document.body.className);
      const fab = await page.locator(".sg-theme-fab").count();
      const file = path.join(OUT, `theme-${th}.png`);
      await page.screenshot({ path: file });
      report.push({ kind: "theme", id: th, body, fab, errors: errs.slice(0,3), file, ok: errs.length === 0 });
      console.log(`theme ${th}: body="${body}" fab=${fab} errors=${errs.length}`);
    } catch (e) { report.push({ kind: "theme", id: th, error: e.message, ok: false }); console.log(`theme ${th}: ERR ${e.message}`); }
    await ctx.close();
  }

  // 2) Galeries concept (vue large, fullPage)
  for (const g of GALLERIES) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/${g}`, { waitUntil: "networkidle", timeout: 40000 });
      await page.waitForTimeout(1800);
      const n = await page.locator(".scr").count();
      const file = path.join(OUT, g.replace(/[\/]/g, "_") + ".png");
      await page.screenshot({ path: file, fullPage: true });
      report.push({ kind: "gallery", id: g, screens: n, file, ok: n > 0 });
      console.log(`gallery ${g}: ${n} screens`);
    } catch (e) { report.push({ kind: "gallery", id: g, error: e.message, ok: false }); console.log(`gallery ${g}: ERR ${e.message}`); }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const fail = report.filter(r => !r.ok);
  console.log(`\nUI-TEST: ${report.length - fail.length}/${report.length} OK → ${OUT}/report.json`);
  process.exit(fail.length ? 1 : 0);
})();
