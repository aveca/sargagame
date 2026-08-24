/**
 * p1-inp-probe.mjs — Sonde INP locale (TASK-P1-009)
 *
 * Mesure, sur le build prod (vite preview :4173), mobile 390×844 DPR2 + CPU throttle 4× :
 *  - les interactions réelles (Event Timing API : entries avec interactionId) autour d'un
 *    tap PRÉCOCE sur un pin carte (t≈1,2 s après load = fenêtre du bake forcé à ≤2 s) ;
 *  - les long tasks (>50 ms) de la première fenêtre, avec chevauchement interaction.
 *
 * Usage:
 *   node scripts/p1-inp-probe.mjs [url] [runs]
 *   défaut url = http://localhost:4173/ , runs = 5
 * Sortie JSON: { runs:[{worstInteraction, pinTapDuration, longTasksInWindow, bakeOverlap}], summary }
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const RUNS = parseInt(process.argv[3] || '5', 10);

const browser = await chromium.launch();

async function runOnce(i) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  // CPU throttle 4× (CDP) — approxime un mobile bas de gamme
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Instrumentation in-page AVANT le code app
  await page.addInitScript(() => {
    window.__sg = { events: [], longTasks: [], t0: performance.now() };
    try {
      const po = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.interactionId) {
            window.__sg.events.push({
              name: e.name, interactionId: e.interactionId, startTime: e.startTime,
              processingStart: e.processingStart, processingEnd: e.processingEnd,
              duration: e.duration,
            });
          }
        }
      });
      po.observe({ type: 'event', durationThreshold: 16, buffered: true });
    } catch (_) {}
    try {
      const lt = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__sg.longTasks.push({ startTime: e.startTime, duration: e.duration });
        }
      });
      lt.observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  });

  // Cookie banner: refuser d'entrée si présent (évite overlay)
  await page.goto(URL + '?frustration=0', { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    const b = page.locator('.sg-cookie-banner button').first();
    if (await b.isVisible({ timeout: 1200 })) await b.click({ force: true });
  } catch (_) {}

  // Attendre pins carte (data prête), puis TAP PRÉCOCE sur un pin/label — cible ~t+1,2s après load
  let tapped = false;
  try {
    await page.waitForSelector('.sg-maplabel, svg [style*="pointerEvents:auto"], svg g[data-vx]', { timeout: 8000 });
  } catch (_) {}
  // Cible : label de plage tappable sinon premier pin SVG interactif
  const target = page.locator('.sg-maplabel[role="button"]').first();
  const fallbackPin = page.locator('svg g[style*="pointer-events: auto"], svg g[style*="pointerEvents: auto"]').first();
  const useTarget = (await target.count()) > 0 ? target : fallbackPin;
  // attendre que le temps depuis navigationStart atteigne ~1200ms minimum
  const elapsed = await page.evaluate(() => performance.now());
  if (elapsed < 1100) await page.waitForTimeout(1150 - elapsed);
  try {
    await useTarget.click({ force: true, timeout: 2500 });
    tapped = true;
  } catch (_) {
    try { await useTarget.dispatchEvent('click'); tapped = true; } catch (_) {}
  }

  // Laisser l'interaction se terminer + le bake éventuel tourner
  await page.waitForTimeout(3500);
  const data = await page.evaluate(() => {
    const evs = (window.__sg && window.__sg.events) || [];
    const lts = (window.__sg && window.__sg.longTasks) || [];
    const worst = evs.reduce((m, e) => Math.max(m, e.duration || 0), 0);
    // longtasks dans la fenêtre [0 ; t0_tap+3s] — on prend tout (page jeune)
    return {
      worstInteraction: Math.round(worst),
      interactionCount: evs.length,
      longTasks: lts.map(t => ({ start: Math.round(t.startTime), dur: Math.round(t.duration) })),
      longTasksOver200: lts.filter(t => t.duration >= 200).map(t => ({ start: Math.round(t.startTime), dur: Math.round(t.duration) })),
      url: location.href,
    };
  }).catch(() => ({ worstInteraction: -1, interactionCount: 0, longTasks: [], longTasksOver200: [], url: 'eval-fail' }));
  data.tapped = tapped;
  data.run = i;
  await ctx.close();
  return data;
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await runOnce(i));
await browser.close();

const okRuns = runs.filter(r => r.tapped && r.worstInteraction >= 0);
const summary = {
  runs: RUNS,
  validRuns: okRuns.length,
  maxWorstInteraction: okRuns.length ? Math.max(...okRuns.map(r => r.worstInteraction)) : null,
  medianWorstInteraction: okRuns.length ? okRuns.map(r => r.worstInteraction).sort((a, b) => a - b)[Math.floor(okRuns.length / 2)] : null,
  runsWithLongTaskOver200DuringEarlyWindow: okRuns.filter(r => r.longTasksOver200.some(t => t.start < 4000)).length,
};
console.log(JSON.stringify({ summary, runs }, null, 2));
