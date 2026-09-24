// wow-events-probe.mjs — mesure les events HOME WOW (PHASE 1, measurement-first).
// Pour chaque viewport (mobile 390 + desktop 1440) :
//   A. load → sg_home_rail_focus NE doit PAS être émis (1er focus = positionnement, pas un geste)
//   B. drag rail (geste réel) → sg_home_rail_drag ×1 par geste, sg_home_rail_focus dédupliqué par plage
//   C. chip seek → sg_home_rail_seek ×1 + rail_focus sur un statut cohérent
//   D. clic bouée non-active → rail_focus ; re-clic même bouée (active) → sg_home_rail_open ×1
// Payload vérifié : beach_id/status/i (focus), status (seek), beach_id (open), n (drag).
// Sortie : lignes greppables PROBE_*.
import { chromium } from 'playwright';
const BASE = process.env.PREVIEW_URL || 'http://localhost:4173';

const wrapTrack = () => {
  const orig = window.track;
  window.__log = [];
  window.track = function (name, data) {
    try { window.__log.push({ name, data }); } catch (_) {}
    return orig ? orig.apply(this, arguments) : undefined;
  };
};

async function run(name, vp, mobile, page_extra) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, ...page_extra });
  const p = await ctx.newPage();
  await p.addInitScript(wrapTrack);
  p.setDefaultTimeout(30000);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-testid="wow-rail"]', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const logAt = () => p.evaluate(() => window.__log.filter(e => e.name.startsWith('sg_home_rail') || e.name === 'sg_home_best_open'));
  const count = (l, n) => l.filter(e => e.name === n);

  // A — init : aucun rail_focus (positionnement initial non tracké)
  const afterLoad = await logAt();

  // B — drag réel : un geste = 1 rail_drag, focus dédupliqués
  const rail = p.locator('[data-testid="wow-rail"]');
  const box = await rail.boundingBox();
  if (box) {
    const y = box.y + box.height / 2;
    await p.mouse.move(box.x + box.width - 25, y);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2, y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(700);
    await p.mouse.move(box.x + box.width / 2, y);
    await p.mouse.down();
    await p.mouse.move(box.x + 25, y, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(900);
  }
  const afterDrag = await logAt();
  const drags = count(afterDrag, 'sg_home_rail_drag');
  const focuses = count(afterDrag, 'sg_home_rail_focus');
  const focusIds = [...new Set(focuses.map(e => e.data && e.data.beach_id))];

  // C — seek chip
  const chip = p.locator('[data-testid="wow-seek-avoid"]').first();
  let seekOk = false, seekFocusStatus = null;
  if (await chip.count()) {
    await chip.click();
    await p.waitForTimeout(900);
    const l = await logAt();
    seekOk = count(l, 'sg_home_rail_seek').length === 1 && count(l, 'sg_home_rail_seek')[0].data.status === 'avoid';
    const lastFocus = count(l, 'sg_home_rail_focus').slice(-1)[0];
    seekFocusStatus = lastFocus && lastFocus.data.status;
  }

  // D — clic bouée non-active puis re-clic (active) → rail_open ×1
  const nonActive = p.locator('[data-testid="wow-buoy"]:not([data-on="1"])').nth(1);
  let openCount = 0, focusAfterClick = null;
  if (await nonActive.count()) {
    const id = await nonActive.getAttribute('data-beach');
    await nonActive.click();
    await p.waitForTimeout(900);
    const l1 = await logAt();
    focusAfterClick = count(l1, 'sg_home_rail_focus').slice(-1)[0]?.data?.beach_id === id;
    await p.locator(`[data-testid="wow-buoy"][data-beach="${id}"]`).click();
    await p.waitForTimeout(600);
    const l2 = await logAt();
    openCount = count(l2, 'sg_home_rail_open').length;
    await p.evaluate(() => history.back()).catch(() => {});
  }

  console.log(`PROBE name=${name}`);
  console.log('PROBE init_no_focus=' + (count(afterLoad, 'sg_home_rail_focus').length === 0));
  console.log('PROBE drag_count=' + drags.length + ' (attendu 2, 1/geste)');
  console.log('PROBE drag_payload_n=' + JSON.stringify(drags[0] && drags[0].data));
  console.log('PROBE focus_dedup=' + (focuses.length === focusIds.length) + ' n=' + focuses.length);
  console.log('PROBE focus_payload_keys=' + JSON.stringify(focuses[0] ? Object.keys(focuses[0].data) : []));
  console.log('PROBE seek_once_and_payload=' + seekOk + ' focus_status=' + seekFocusStatus);
  console.log('PROBE click_focus=' + focusAfterClick + ' open_count=' + openCount + ' (attendu 1)');
  console.log('PROBE pageerrors=' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
}

await run('mobile390', { width: 390, height: 844 }, true, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
await run('desktop1440', { width: 1440, height: 900 }, false, {});
console.log('PROBE_DONE');
