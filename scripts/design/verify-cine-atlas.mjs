// Vérif HEADLESS de la galerie Ciné-Atlas : data-driven correct + a11y de base.
// (1) une carte par entrée du manifest ; (2) chaque carte a une <video> avec poster + <source> ;
// (3) filtres région/ratio/langue présents ; (4) cibles tap ≥ ~36px. Playwright en fond.
import { chromium } from 'playwright';
import fs from 'node:fs';
import url from 'node:url';

const GAL = url.fileURLToPath(new URL('../../design/cine-atlas/index.html', import.meta.url));
const MAN = url.fileURLToPath(new URL('../../public/cine-atlas/manifest.json', import.meta.url));
const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const fails = [];

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 900 }, forcedColors: 'none' })).newPage();
await p.goto(url.pathToFileURL(GAL).href, { waitUntil: 'load' });

const info = await p.evaluate(() => {
  const cards = document.querySelectorAll('.card').length;
  const vids = [...document.querySelectorAll('.card video')].map(v => ({ poster: !!v.getAttribute('poster'), src: !!v.querySelector('source[type="video/mp4"]') }));
  const filters = document.querySelectorAll('#fRegion button, #fRatio button, #fLang button').length;
  const small = [...document.querySelectorAll('.seg button')].filter(e => e.getBoundingClientRect().height < 36).length;
  return { cards, vids, filters, small };
});

if (info.cards !== man.length) fails.push(`cards ${info.cards} != manifest ${man.length}`);
if (!info.vids.length || info.vids.some(v => !v.poster || !v.src)) fails.push('video missing poster/source');
if (info.filters < 5) fails.push('filters missing (' + info.filters + ')');
if (info.small) fails.push('filter buttons too small: ' + info.small);

await b.close();
console.log('CINEATLAS_CARDS=' + info.cards + ' MANIFEST=' + man.length + ' FILTERS=' + info.filters);
console.log(fails.length ? ('CINEATLAS_FAIL: ' + fails.join(' ; ')) : 'CINEATLAS_ALL_GREEN');
