// Headless screenshots of the descent piece at key beats (no visible window).
import { chromium } from 'playwright';
import url from 'node:url';
const FILE = process.argv[2] || 'C:/Users/user/Desktop/Backup/sargagame/design/proto-ecoscene-descent.html';
const OUT = process.argv[3] || 'C:/Users/user/Desktop/Backup/sargagame/.claude/worktrees/practical-ramanujan-833ccd';
const fileUrl = url.pathToFileURL(FILE).href;
const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
const ctx = await b.newContext({ colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(fileUrl, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
// 1. intro (no presentation)
await p.screenshot({ path: OUT + '/rd-01-intro.jpeg', quality: 92, type: 'jpeg' });
// enter presentation (letterbox) and drive to beats
await p.evaluate(() => { document.body.classList.add('presenting'); });
await p.waitForTimeout(650);
// beats center at d = CP_A + cp*(CP_B-CP_A) with CP_A=0.09, CP_B=0.90
const dOf = (cp) => 0.09 + cp * 0.81;
const beat = async (cp, name) => { await p.evaluate(dd => window.__setDepth(dd), cp >= 1 ? 1 : dOf(cp)); await p.waitForTimeout(700); await p.screenshot({ path: OUT + '/' + name, quality: 92, type: 'jpeg' }); };
await beat(2 / 6, 'rd-02-surface.jpeg');
await beat(3 / 6, 'rd-03-lagon.jpeg');
await beat(4 / 6, 'rd-04-open.jpeg');
await beat(5 / 6, 'rd-05-sargasse.jpeg');
await beat(1.0, 'rd-06-payoff.jpeg');
await b.close();
console.log('shots written to', OUT);
