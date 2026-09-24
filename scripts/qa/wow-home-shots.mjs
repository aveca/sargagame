// wow-home-shots.mjs — captures HOME WOW (390 / 834 / 1440) pour vérif visuelle.
import { chromium } from 'playwright';
const BASE = process.env.PREVIEW_URL || 'http://localhost:4173';
const b = await chromium.launch();
for (const [name, vp] of [['390', { width: 390, height: 844 }], ['834', { width: 834, height: 1112 }], ['1440', { width: 1440, height: 900 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 900, hasTouch: vp.width < 900 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-testid="xp-home"]', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: process.env.TEMP + `/wow-home-${name}-top.png` });
  await p.evaluate(() => { const el = document.querySelector('[data-testid="xp-home"]')?.parentElement; if (el) el.scrollTop = 700; });
  await p.waitForTimeout(500);
  await p.screenshot({ path: process.env.TEMP + `/wow-home-${name}-mid.png` });
  // drag de la ligne (geste réel) → preuve interaction
  const rail = p.locator('[data-testid="wow-rail"]');
  if (await rail.count()) {
    const box = await rail.boundingBox();
    if (box) {
      await p.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
      await p.mouse.down();
      await p.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 12 });
      await p.mouse.up();
      await p.waitForTimeout(900);
      await p.screenshot({ path: process.env.TEMP + `/wow-home-${name}-dragged.png` });
    }
  }
  console.log(name, 'errors:', JSON.stringify(errs.slice(0, 5)));
  await ctx.close();
}
await b.close();
console.log('SHOTS_DONE');
