// Quick Plages tab screenshot verification
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

const REAL_ROOT = 'C:\\Users\\user\\Documents\\Backup\\sargagame';
const PORT = 4185;
const SHOTS = 'C:\\Users\\user\\AppData\\Local\\Temp\\opencode\\uxp';
const logFd = (await import('fs')).openSync(path.join(REAL_ROOT, 'vite-plages.log'), 'w');
const serverProc = spawn(path.join(REAL_ROOT, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(PORT), '--host'],
  { cwd: REAL_ROOT, detached: true, stdio: ['ignore', logFd, logFd], shell: true });
serverProc.unref();
const BASE = `http://localhost:${PORT}`;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    await new Promise((resolve, reject) => {
      http.get(BASE + '/', (res) => { res.resume(); resolve(1); }).on('error', reject);
    });
    break;
  } catch (_) {}
}
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.message).slice(0, 120)));
p.on('console', (m) => { if (m.type() === 'error' && !/mollie|clarity|instrumentation/i.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 120)); });
const SHOTS_DIR = 'C:\\Users\\user\\AppData\\Local\\Temp\\opencode\\uxp';

async function acceptCookies(p) {
  const btn = p.getByRole('button', { name: /accepter/i });
  if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) await btn.click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(800);
}
async function shot(name) {
  await p.screenshot({ path: `${SHOTS_DIR}-plages-${name}.png` });
  console.log('SHOT ' + name);
}
async function measure(name) {
  const m = await p.evaluate(() => {
    const cards = document.querySelectorAll('[class*="beach-card"], [class*="BeachCard"], .bsc-fiche, [class*="beach-card"]').length;
    const empty = document.body.innerText.includes('Aucune plage') || document.body.innerText.includes('No beach') || document.body.innerText.includes('Ninguna playa');
    return { cards, empty };
  });
  console.log('M ' + name + ' ' + JSON.stringify(m));
}

await p.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(5000);
const accept = p.getByRole('button', { name: /accepter/i });
if (await accept.isVisible({ timeout: 4000 }).catch(() => false)) await accept.click().catch(() => {});
await p.waitForTimeout(800);

// Click Plages tab
await p.getByRole('button', { name: /Plages/i }).first().click({ timeout: 10000 }).catch(() => {});
await p.waitForTimeout(2500);
await shot('01-plages-tab');
await measure('plages-tab');

// Click first beach in list
await p.waitForTimeout(2000);
const hasCards = await p.locator('[class*="beach-card"], [class*="BeachCard"], .bsc-fiche, [class*="beach-card"]').first().count();
console.log('CARDS ' + hasCards);
if (hasCards > 0) {
  await p.locator('[class*="beach-card"], [class*="BeachCard"], .bsc-fiche, [class*="beach-card"]').first().click({ timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(3000);
  await shot('02-plage-fiche');
}
console.log('ERRORS ' + JSON.stringify(errs.slice(0, 6)));
await b.close();
try { process.kill(-serverProc.pid, 'SIGTERM'); } catch (_) {}
try { serverProc.kill(); } catch (_) {}
process.exit(0);