// Vérif HEADLESS de la galerie « Ciné-Atlas · Les Plages » (sujets divers).
// (1) une carte par entrée manifest ; (2) <video> poster + <source> ; (3) filtres île/durée ;
// (4) cibles tap ≥36px. Playwright en fond.
import { chromium } from 'playwright';
import fs from 'node:fs';
import url from 'node:url';

const GAL = url.fileURLToPath(new URL('../../design/scene-atlas/index.html', import.meta.url));
const MAN = url.fileURLToPath(new URL('../../public/scene-atlas/manifest.json', import.meta.url));
const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const fails = [];

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 900 }, forcedColors: 'none' })).newPage();
await p.goto(url.pathToFileURL(GAL).href, { waitUntil: 'load' });

const info = await p.evaluate(() => {
  const cards = document.querySelectorAll('.card').length;
  const vids = [...document.querySelectorAll('.card video')].map(v => ({ poster: !!v.getAttribute('poster'), src: !!v.querySelector('source[type="video/mp4"]') }));
  const filters = document.querySelectorAll('#fIsland button, #fDur button').length;
  const small = [...document.querySelectorAll('.seg button')].filter(e => e.getBoundingClientRect().height < 36).length;
  const names = [...document.querySelectorAll('.card .nm')].filter(e => e.textContent.trim()).length;
  return { cards, vids, filters, small, names };
});

if (info.cards !== man.length) fails.push(`cards ${info.cards} != manifest ${man.length}`);
if (!info.vids.length || info.vids.some(v => !v.poster || !v.src)) fails.push('video missing poster/source');
if (info.filters < 4) fails.push('filters missing (' + info.filters + ')');
if (info.small) fails.push('filter buttons too small: ' + info.small);
if (info.names !== info.cards) fails.push('cards without subject name: ' + (info.cards - info.names));

await b.close();
console.log('SCENEATLAS_CARDS=' + info.cards + ' MANIFEST=' + man.length + ' FILTERS=' + info.filters + ' NAMED=' + info.names);
console.log(fails.length ? ('SCENEATLAS_FAIL: ' + fails.join(' ; ')) : 'SCENEATLAS_ALL_GREEN');
