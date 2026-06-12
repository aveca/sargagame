/**
 * tmp-click-pins.cjs — TEMP VERIFICATION SCRIPT v2 (safe to delete)
 *
 * Proves, pin by pin, that every beach marker on the LIVE sites is clickable
 * and opens the beach bottom sheet (.sheet with the beach name in h2).
 *
 * v2 fixes over v1:
 *  - fresh page load per pin (no cross-pin view-state corruption)
 *  - retry clicks target the SAME marker index (DOM order inside
 *    .leaflet-marker-pane == beaches array order, stable across re-renders),
 *    never a "nearest center" guess
 *  - expected beach name fetched from <site>/data/beaches-list.json and
 *    asserted against the sheet title (catches misrouted clicks)
 *  - pins outside the safe viewport zone are panned into view by dragging
 *    the map (what a real user does)
 *  - watchdog per pin + page recreation on crash/hang
 *
 * Usage: node scripts/tmp-click-pins.cjs <siteKey...> [--sample N]
 *   siteKeys: puntacana guadeloupe miami cancun martinique
 */
const { chromium } = require("playwright");

const SITES = {
  puntacana:  { url: "https://sargassumpuntacana.com", regionFile: "regions/puntacana.json" },
  guadeloupe: { url: "https://sargasses-guadeloupe.com", island: "gp" },
  miami:      { url: "https://sargassummiami.com", regionFile: "regions/florida.json" },
  cancun:     { url: "https://sargassumcancun.com", regionFile: "regions/rivieramaya.json" },
  martinique: { url: "https://sargasses-martinique.com", island: "mq" },
};

const MARKER_SEL = ".leaflet-marker-pane .leaflet-marker-icon.leaflet-interactive";
const VW = 390, VH = 844;
// Safe zone: clear of top header+radar chrome and bottom search+nav chrome
const SAFE = { x1: 24, x2: VW - 24, y1: 135, y2: 660 };
const PAN_TARGET = { x: 195, y: 400 };

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getMarkers(page) {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
    });
  }, MARKER_SEL).catch(() => null); // null = evaluate failed (crash/navigation)
}

async function zoomAnimating(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".leaflet-container");
    return c ? c.classList.contains("leaflet-zoom-anim") : false;
  }).catch(() => false);
}

/** Wait until markers exist, no zoom animation, positions stable across 4 polls. */
async function waitSettled(page, { minCount = 1, timeout = 40000 } = {}) {
  const t0 = Date.now();
  let prev = null, stable = 0;
  while (Date.now() - t0 < timeout) {
    const m = await getMarkers(page);
    if (m && m.length >= minCount && !(await zoomAnimating(page)) && prev && m.length === prev.length) {
      const moved = m.some((p, i) => Math.abs(p.cx - prev[i].cx) > 2 || Math.abs(p.cy - prev[i].cy) > 2);
      if (!moved) { stable++; if (stable >= 4) return m; }
      else stable = 0;
    } else stable = 0;
    prev = m || prev;
    await page.waitForTimeout(350);
  }
  return prev || [];
}

async function readSheetName(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".sheet h2");
    return el ? el.textContent.trim() : null;
  }).catch(() => null);
}

async function whatIsAt(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return "null";
    const cls = typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + cls;
  }, { x, y }).catch(() => "?");
}

function inSafeZone(m) {
  return m.cx >= SAFE.x1 && m.cx <= SAFE.x2 && m.cy >= SAFE.y1 && m.cy <= SAFE.y2;
}

/** Find a drag start point on bare map (no pin/button under it). */
async function findDragStart(page) {
  const candidates = [
    [195, 600], [100, 600], [300, 600], [195, 250], [60, 420], [330, 420], [195, 420],
  ];
  for (const [x, y] of candidates) {
    const ok = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      if (!el.closest(".leaflet-container")) return false;
      if (el.closest(".leaflet-marker-icon") || el.closest("button") || el.closest("input")) return false;
      return true;
    }, { x, y }).catch(() => false);
    if (ok) return { x, y };
  }
  return null;
}

/** Drag the map so content shifts by (dx, dy) px. Slow release to avoid inertia. */
async function dragMap(page, dx, dy) {
  const start = await findDragStart(page);
  if (!start) return false;
  const steps = 8;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let s = 1; s <= steps; s++) {
    await page.mouse.move(start.x + (dx * s) / steps, start.y + (dy * s) / steps);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(250); // settle finger -> no inertia fling
  await page.mouse.up();
  await page.waitForTimeout(400);
  return true;
}

/** Pan map until marker idx is inside the safe zone. Returns marker or null. */
async function panIntoView(page, idx, events) {
  for (let t = 0; t < 5; t++) {
    const markers = await getMarkers(page);
    if (!markers || idx >= markers.length) return null;
    const m = markers[idx];
    if (inSafeZone(m)) return m;
    const dx = Math.max(-280, Math.min(280, PAN_TARGET.x - m.cx));
    const dy = Math.max(-280, Math.min(280, PAN_TARGET.y - m.cy));
    events.push(`pan(${dx},${dy}) pin@(${m.cx},${m.cy})`);
    const ok = await dragMap(page, dx, dy);
    if (!ok) { events.push("no drag start found"); return m; }
  }
  const markers = await getMarkers(page);
  return markers && idx < markers.length ? markers[idx] : null;
}

async function loadHome(page, site) {
  // The app updates allBeaches up to ~8s after load (main data ~+2-4s, community
  // overlay via Apps Script ~+5-8s). Each update re-runs MapView's fitBounds effect,
  // which yanks the view back to the island fit and cancels any in-flight
  // disambiguation zoom. Click only AFTER everything settles (>=10s + networkidle),
  // like a user who has been on the map for a moment.
  const t0 = Date.now();
  await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Depuis le landing scrollable (session 40+), le hero couvre la carte au
  // premier chargement — un vrai user le ferme via « toutes les plages ».
  try {
    await page.click("text=/Toutes les plages|Todas las playas|All beaches|Toda la isla|Toute l.île/i", { timeout: 8000 });
    await page.waitForTimeout(1500);
  } catch (e) { /* pas de hero (déjà sur la carte) */ }
  await waitSettled(page);
  const remain = 11000 - (Date.now() - t0);
  if (remain > 0) await page.waitForTimeout(remain);
  return waitSettled(page, { timeout: 15000 });
}

/** Test one pin from a FRESH page load. */
async function testPin(page, site, idx, expectedName) {
  const events = [];
  const home = await loadHome(page, site);
  if (!home.length) return { idx, ok: false, pos: null, reason: "no markers after load", events };
  if (idx >= home.length) return { idx, ok: false, pos: null, reason: `marker index ${idx} missing (count ${home.length})`, events };

  let m = home[idx];
  const homePos = [m.cx, m.cy];
  if (!inSafeZone(m)) {
    events.push(`pin@(${m.cx},${m.cy}) outside safe zone -> panning`);
    m = await panIntoView(page, idx, events);
    if (!m) return { idx, ok: false, pos: homePos, reason: "pin lost while panning", events };
    if (!inSafeZone(m)) return { idx, ok: false, pos: homePos, reason: `still outside safe zone after pan @(${m.cx},${m.cy})`, events };
  }

  const MAX_ATTEMPTS = 5; // home zoom ~9 -> disambig zooms 11,13,15 -> direct pick at >=15
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const hit = await whatIsAt(page, m.cx, m.cy);
    events.push(`a${attempt}@(${m.cx},${m.cy}) topEl=${hit}`);
    await page.mouse.click(m.cx, m.cy);
    let name = null;
    try {
      await page.waitForSelector(".sheet h2", { timeout: 6000 });
      name = await readSheetName(page);
    } catch (e) { /* no sheet this attempt */ }
    if (name) {
      const match = expectedName ? name.toLowerCase() === expectedName.toLowerCase() : null;
      return { idx, ok: true, pos: homePos, name, expected: expectedName, match, attempts: attempt, events };
    }
    // No sheet — likely the disambiguation zoom fired (or the click was dead).
    // Re-locate the SAME marker index after things settle, pan if needed, retry.
    await waitSettled(page, { timeout: 8000 });
    const markers = await getMarkers(page);
    if (!markers || !markers.length) { events.push("MARKERS GONE after click"); break; }
    if (idx >= markers.length) { events.push(`marker idx ${idx} missing after click (count ${markers.length})`); break; }
    m = markers[idx];
    if (!inSafeZone(m)) {
      m = await panIntoView(page, idx, events);
      if (!m) { events.push("pin lost while panning on retry"); break; }
    }
  }
  return { idx, ok: false, pos: homePos, expected: expectedName, reason: "no sheet after " + MAX_ATTEMPTS + " attempts", events };
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`WATCHDOG ${label} after ${ms}ms`)), ms)),
  ]);
}

async function runSite(key, site, sample, range) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem("sg_onb", "1"); } catch (e) {} });

  let page;
  const newPage = async () => {
    if (page) await page.close().catch(() => {});
    page = await ctx.newPage();
    page.on("pageerror", (e) => log(`[${key}] PAGEERROR: ${String(e).slice(0, 180)}`));
    page.on("crash", () => log(`[${key}] PAGE CRASHED`));
    return page;
  };
  await newPage();

  // Discover pin count
  const home = await loadHome(page, site);
  log(`[${key}] pins found at home view: ${home.length}`);
  if (!home.length) {
    await page.screenshot({ path: `pins-${key}.png` }).catch(() => {});
    await browser.close();
    return;
  }

  // Expected names (array order == marker DOM order)
  let expected = null;
  try {
    let list = null;
    if (site.regionFile) {
      const d = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", site.regionFile), "utf8"));
      list = d.beaches || [];
    } else {
      // Use the LOCAL repo copy: live fetches can hit a stale CDN variant whose
      // order differs from what the browser bundle actually renders.
      const d = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "public", "data", "beaches-list.json"), "utf8"));
      const arr = Array.isArray(d) ? d : d.beaches || [];
      list = arr.filter((b) => b.island === site.island);
    }
    if (list && list.length === home.length) {
      expected = list.map((b) => b.name);
      log(`[${key}] expected names loaded (${list.length})`);
    } else {
      log(`[${key}] WARN: expected list length ${list ? list.length : "?"} != pins ${home.length} — name assertion off`);
    }
  } catch (e) { log(`[${key}] WARN: expected names load failed: ${String(e).slice(0, 120)}`); }

  let indices = home.map((_, i) => i);
  if (range) {
    indices = indices.filter((i) => i >= range[0] && i <= range[1]);
    log(`[${key}] range ${range[0]}-${range[1]} -> ${indices.length} pins`);
  }
  if (sample && home.length > sample) {
    const set = new Set();
    for (let i = 0; i < sample; i++) set.add(Math.round((i * (home.length - 1)) / (sample - 1)));
    indices = [...set].sort((a, b) => a - b);
    log(`[${key}] sampling ${indices.length}/${home.length} pins: ${indices.join(",")}`);
  }

  const results = [];
  for (const idx of indices) {
    let r = null;
    for (let tries = 0; tries < 2 && !r; tries++) {
      try {
        r = await withTimeout(testPin(page, site, idx, expected ? expected[idx] : null), 150000, `pin ${idx}`);
      } catch (e) {
        log(`[${key}] pin ${idx} attempt-cycle error: ${String(e).slice(0, 140)} — recreating page`);
        await newPage();
      }
    }
    if (!r) r = { idx, ok: false, pos: null, reason: "watchdog/exception twice", events: [] };
    results.push(r);
    if (r.ok) {
      const tag = r.match === false ? ` MISMATCH(expected "${r.expected}")` : "";
      log(`[${key}] pin ${String(idx).padStart(2)} @(${r.pos}) OK "${r.name}" (attempt ${r.attempts})${tag}${r.events.length > 1 ? " | " + r.events.join(" ; ") : ""}`);
    } else {
      log(`[${key}] pin ${String(idx).padStart(2)} @(${r.pos}) FAIL: ${r.reason} | ${r.events.join(" ; ")}`);
      await page.screenshot({ path: `pins-${key}-fail-${idx}.png` }).catch(() => {});
    }
  }

  try { await loadHome(page, site); await page.screenshot({ path: `pins-${key}.png` }); } catch (e) {}
  await browser.close();

  const okR = results.filter((r) => r.ok);
  const misroutes = okR.filter((r) => r.match === false);
  log(`[${key}] SUMMARY total=${home.length} tested=${results.length} ok=${okR.length} fail=${results.length - okR.length} misroutes=${misroutes.length}`);
  if (misroutes.length) misroutes.forEach((r) => log(`[${key}]   misroute pin ${r.idx}: opened "${r.name}" expected "${r.expected}"`));
}

/** Forensic mode: trace one pin click frame by frame. */
async function runForensic(key, site, idx) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem("sg_onb", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`[forensic] PAGEERROR: ${String(e).slice(0, 250)}`));
  page.on("crash", () => log(`[forensic] PAGE CRASHED`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`[forensic] console.${m.type()}: ${m.text().slice(0, 200)}`); });

  const state = async () => page.evaluate((sel) => {
    const zs = Array.from(document.querySelectorAll(".leaflet-tile-pane img")).map((im) => {
      const m = (im.src || "").match(/\/(\d+)\/\d+\/\d+(@2x)?\.png/);
      return m ? +m[1] : null;
    }).filter(Boolean);
    const zoom = zs.length ? Math.max(...zs) : null;
    const sheet = document.querySelector(".sheet");
    const h2 = document.querySelector(".sheet h2");
    const markers = document.querySelectorAll(sel);
    return {
      zoom,
      sheet: !!sheet,
      h2: h2 ? h2.textContent.trim() : null,
      backdrop: !!document.querySelector(".backdrop"),
      markerCount: markers.length,
      zoomAnim: !!document.querySelector(".leaflet-container.leaflet-zoom-anim"),
    };
  }, MARKER_SEL).catch(() => ({ evalFailed: true }));

  await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const home = await waitSettled(page);
  log(`[forensic ${key}#${idx}] settled, pins=${home.length}, state=${JSON.stringify(await state())}`);
  if (idx >= home.length) { await browser.close(); return; }
  let m = home[idx];
  if (!inSafeZone(m)) { const ev = []; m = await panIntoView(page, idx, ev); log(`[forensic] panned: ${ev.join(";")}`); }
  for (let attempt = 1; attempt <= 4; attempt++) {
    const markers = await getMarkers(page);
    m = markers && idx < markers.length ? markers[idx] : null;
    if (!m) { log(`[forensic] marker ${idx} gone`); break; }
    if (!inSafeZone(m)) { const ev = []; m = await panIntoView(page, idx, ev); log(`[forensic] panned: ${ev.join(";")}`); if (!m) break; }
    log(`[forensic] CLICK attempt ${attempt} at (${m.cx},${m.cy}) topEl=${await whatIsAt(page, m.cx, m.cy)}`);
    await page.mouse.click(m.cx, m.cy);
    for (let t = 0; t < 16; t++) {
      const s = await state();
      log(`[forensic]   +${(t * 500 / 1000).toFixed(1)}s ${JSON.stringify(s)}`);
      if (s.h2) break;
      await page.waitForTimeout(500);
    }
    const s = await state();
    await page.screenshot({ path: `pins-forensic-${key}-${idx}-a${attempt}.png` }).catch(() => {});
    if (s.h2) { log(`[forensic] SHEET OPEN: "${s.h2}" on attempt ${attempt}`); break; }
  }
  await browser.close();
}

(async () => {
  const args = process.argv.slice(2);
  let sample = null, range = null;
  const si = args.indexOf("--sample");
  if (si >= 0) { sample = parseInt(args[si + 1], 10) || null; args.splice(si, 2); }
  const ri = args.indexOf("--range");
  if (ri >= 0) { const m = (args[ri + 1] || "").match(/^(\d+)-(\d+)$/); if (m) range = [+m[1], +m[2]]; args.splice(ri, 2); }
  const fi = args.indexOf("--forensic");
  if (fi >= 0) {
    const key = args[fi + 1], idx = parseInt(args[fi + 2], 10);
    if (SITES[key] && Number.isInteger(idx)) await runForensic(key, SITES[key], idx);
    else log("usage: --forensic <siteKey> <pinIndex>");
    return;
  }
  const keys = args.length ? args : Object.keys(SITES);
  for (const key of keys) {
    if (!SITES[key]) { log(`unknown site key: ${key}`); continue; }
    try { await runSite(key, SITES[key], sample, range); }
    catch (e) { log(`[${key}] SITE ERROR: ${String(e).slice(0, 300)}`); }
  }
})();
