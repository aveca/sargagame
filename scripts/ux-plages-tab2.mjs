// Quick Plages tab screenshot verification v2
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

const REAL_ROOT = 'C:\\\\Users\\\\user\\\\Documents\\\\Backup\\\\sargagame';
const PORT = 4188;
const SHOTS = 'C:\\\\Users\\\\user\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\uxp';
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
await p.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(5000);
const accept = p.getByRole('button', { name: /accepter/i });
if (await accept.isVisible({ timeout: 4000 }).catch(() => false)) await accept.click().catch(() => {});
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Plages/i }).first().click({ timeout: 10000 }).catch(() => {});
await p.waitForTimeout(3000);
await p.screenshot({ path: 'C:\\\\Users\\\\user\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\uxp-plages-tab.png' });
console.log('SHOT plages-tab');
const m = await p.evaluate(() => {
  const cards = document.querySelectorAll('[class*="beach-card"], [class*="BeachCard"]').length;
  const text = document.body.innerText.slice(0, 800);
  return { cards, hasText: text.includes('Plage des Salines') };
});
console.log('M ' + JSON.stringify(m));
await p.waitForTimeout(1000);
console.log('ERRORS ' + JSON.stringify(errs.slice(0, 6)));
await b.close();
try { process.kill(-serverProc.pid, 'SIGTERM'); } catch (_) {}
try { serverProc.kill(); } catch (_) {}
process.exit(0);