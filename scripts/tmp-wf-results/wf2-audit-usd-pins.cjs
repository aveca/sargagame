/**
 * wf2-audit-usd-pins.cjs — Audit LIVE clics pins, domaines USD (lecture seule).
 * Protocole repris de scripts/tmp-click-pins.cjs (éprouvé session 40) :
 *  - 1 page load PROPRE par pin (l'état disambig/zoom fuit sinon)
 *  - viewport mobile 390x844, hero + onboarding pré-dismissés (sessionStorage/localStorage)
 *  - marker DOM order == beaches array order (regions/<region>.json)
 *  - page.mouse.click au centre du marker (pas de locator text=)
 *  - attente .sheet h2 jusqu'à 8.5s (couvre zoom disambig + auto-open du fix)
 *  - pan dans la safe zone si pin sous le chrome
 * RÈGLES LIVE : script.google.com BLOQUÉ (zéro pollution funnel), aucun clic CTA paiement.
 * Sortie : scripts/tmp-wf-results/wf2-usd-<site>.json
 * Usage : node wf2-audit-usd-pins.cjs <puntacana|miami|cancun>
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SITES = {
  puntacana: { url: "https://sargassumpuntacana.com", region: "puntacana" },
  miami:     { url: "https://sargassummiami.com",     region: "florida" },
  cancun:    { url: "https://sargassumcancun.com",    region: "rivieramaya" },
};

const MARKER_SEL = ".leaflet-marker-pane .leaflet-marker-icon.leaflet-interactive";
const VW = 390, VH = 844;
const SAFE = { x1: 24, x2: VW - 24, y1: 135, y2: 660 };
const PAN_TARGET = { x: 195, y: 400 };
const NEIGHBOR_M = 800;

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function getMarkers(page) {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
    });
  }, MARKER_SEL).catch(() => null);
}

async function zoomAnimating(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".leaflet-container");
    return c ? c.classList.contains("leaflet-zoom-anim") : false;
  }).catch(() => false);
}

async function tileZoom(page) {
  return page.evaluate(() => {
    const zs = Array.from(document.querySelectorAll(".leaflet-tile-pane img")).map((im) => {
      const m = (im.src || "").match(/\/(\d+)\/\d+\/\d+(@2x)?\.(png|jpg|jpeg|webp)/);
      return m ? +m[1] : null;
    }).filter(Boolean);
    return zs.length ? Math.max(...zs) : null;
  }).catch(() => null);
}

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
    const els = document.elementsFromPoint(x, y).slice(0, 3);
    return els.map((el) => {
      const cls = typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      return el.tagName.toLowerCase() + cls;
    }).join(" > ") || "null";
  }, { x, y }).catch(() => "?");
}

function inSafeZone(m) {
  return m.cx >= SAFE.x1 && m.cx <= SAFE.x2 && m.cy >= SAFE.y1 && m.cy <= SAFE.y2;
}

async function findDragStart(page) {
  const candidates = [[195, 600], [100, 600], [300, 600], [195, 250], [60, 420], [330, 420], [195, 420]];
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
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return true;
}

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
    if (!ok) { events.push("no drag start"); return m; }
  }
  const markers = await getMarkers(page);
  return markers && idx < markers.length ? markers[idx] : null;
}

async function loadHome(page, site) {
  // allBeaches se met à jour jusqu'à ~8s post-load → fitBounds re-yank la vue.
  // (community overlay Apps Script est bloqué ici, mais on garde la marge éprouvée.)
  const t0 = Date.now();
  await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitSettled(page);
  const remain = 11000 - (Date.now() - t0);
  if (remain > 0) await page.waitForTimeout(remain);
  return waitSettled(page, { timeout: 15000 });
}

/** Teste UN pin depuis un load 100% frais. */
async function testPin(page, site, idx, beaches) {
  const expected = beaches[idx];
  const events = [];
  const home = await loadHome(page, site);
  if (!home.length) return { idx, ok: false, reason: "no markers after load", events };
  if (idx >= home.length) return { idx, ok: false, reason: `marker idx ${idx} missing (count ${home.length})`, events };

  let m = home[idx];
  if (!inSafeZone(m)) {
    events.push(`pin@(${m.cx},${m.cy}) hors safe zone -> pan`);
    m = await panIntoView(page, idx, events);
    if (!m) return { idx, ok: false, reason: "pin perdu pendant le pan", events };
    if (!inSafeZone(m)) return { idx, ok: false, reason: `toujours hors safe zone après pan @(${m.cx},${m.cy})`, events };
  }

  const z0 = await tileZoom(page);
  const topEl = await whatIsAt(page, m.cx, m.cy);
  events.push(`zoom=${z0} click@(${m.cx},${m.cy}) topEl=${topEl}`);

  // ── CLIC UNIQUE (le fix « ouvre toujours après le zoom » doit suffire) ──
  await page.mouse.click(m.cx, m.cy);
  let name = null;
  try {
    await page.waitForSelector(".sheet h2", { timeout: 8500 });
    name = await readSheetName(page);
  } catch (e) { /* pas de fiche au 1er clic */ }

  if (name) {
    const exact = name.toLowerCase() === expected.name.toLowerCase();
    if (exact) return { idx, ok: true, name, expected: expected.name, route: "exact", events };
    const openedBeach = beaches.find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (openedBeach) {
      const dist = Math.round(haversine(expected.lat, expected.lng, openedBeach.lat, openedBeach.lng));
      if (dist < NEIGHBOR_M) return { idx, ok: true, name, expected: expected.name, route: `neighbor ${dist}m`, events };
      return { idx, ok: false, name, expected: expected.name, reason: `misroute: ouvre "${name}" à ${dist}m de "${expected.name}"`, events };
    }
    return { idx, ok: false, name, expected: expected.name, reason: `misroute: ouvre "${name}" (inconnue de la région)`, events };
  }

  // ── Pas de fiche : diagnostic ──
  const z1 = await tileZoom(page);
  const anim = await zoomAnimating(page);
  const markersNow = await getMarkers(page);
  events.push(`NO SHEET après 8.5s | zoom ${z0}→${z1} anim=${anim} markers=${markersNow ? markersNow.length : "?"}`);

  // 2e clic = diagnostic seulement (si ça ouvre, le fix auto-open a raté = FAILURE quand même)
  await waitSettled(page, { timeout: 8000 });
  const markers = await getMarkers(page);
  if (markers && idx < markers.length) {
    let m2 = markers[idx];
    if (!inSafeZone(m2)) m2 = await panIntoView(page, idx, events);
    if (m2 && inSafeZone(m2)) {
      const top2 = await whatIsAt(page, m2.cx, m2.cy);
      events.push(`retry-diag click@(${m2.cx},${m2.cy}) zoom=${await tileZoom(page)} topEl=${top2}`);
      await page.mouse.click(m2.cx, m2.cy);
      try {
        await page.waitForSelector(".sheet h2", { timeout: 6000 });
        const n2 = await readSheetName(page);
        return { idx, ok: false, expected: expected.name, secondClickOpened: n2, reason: `fix KO: 1er clic muet (zoom ${z0}→${z1}), fiche "${n2}" seulement au 2e clic`, events };
      } catch (e) { /* toujours rien */ }
    }
  }
  return { idx, ok: false, expected: expected.name, reason: `clic mort: aucune fiche après 2 clics (zoom ${z0}→${z1})`, events };
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`WATCHDOG ${label} after ${ms}ms`)), ms)),
  ]);
}

(async () => {
  const key = process.argv[2];
  const site = SITES[key];
  if (!site) { console.error("usage: node wf2-audit-usd-pins.cjs <puntacana|miami|cancun>"); process.exit(2); }

  const beaches = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "regions", site.region + ".json"), "utf8")).beaches;
  log(`[${key}] ${site.url} — ${beaches.length} plages (${site.region}.json)`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  // LIVE : zéro pollution funnel — tout script.google.com est avorté.
  await ctx.route("**://script.google.com/**", (route) => route.abort());
  await ctx.route("**://script.googleusercontent.com/**", (route) => route.abort());
  // Hero + onboarding pré-vus (déterministe, et on ne teste que les pins)
  await ctx.addInitScript(() => {
    try { localStorage.setItem("sg_onb", "1"); sessionStorage.setItem("sg_hero_seen", "1"); } catch (e) {}
  });

  let page;
  const newPage = async () => {
    if (page) await page.close().catch(() => {});
    page = await ctx.newPage();
    page.on("pageerror", (e) => log(`[${key}] PAGEERROR: ${String(e).slice(0, 180)}`));
    page.on("crash", () => log(`[${key}] PAGE CRASHED`));
    return page;
  };
  await newPage();

  // Sanity : nb pins au home == nb beaches
  const home = await loadHome(page, site);
  log(`[${key}] pins au home: ${home.length} (attendu ${beaches.length})`);

  const results = [];
  for (let idx = 0; idx < beaches.length; idx++) {
    let r = null;
    for (let tries = 0; tries < 2 && !r; tries++) {
      try {
        r = await withTimeout(testPin(page, site, idx, beaches), 150000, `pin ${idx}`);
      } catch (e) {
        log(`[${key}] pin ${idx} cycle error: ${String(e).slice(0, 140)} — page recréée`);
        await newPage();
      }
    }
    if (!r) r = { idx, ok: false, expected: beaches[idx].name, reason: "watchdog/exception twice", events: [] };
    r.id = beaches[idx].id;
    results.push(r);
    if (r.ok) log(`[${key}] pin ${String(idx).padStart(2)} ${r.id} OK "${r.name}" (${r.route})`);
    else {
      log(`[${key}] pin ${String(idx).padStart(2)} ${r.id} FAIL: ${r.reason} | ${r.events.join(" ; ")}`);
      await page.screenshot({ path: path.join(__dirname, `wf2-${key}-fail-${idx}.png`) }).catch(() => {});
    }
  }
  await browser.close();

  const ok = results.filter((r) => r.ok).length;
  const out = { site: key, url: site.url, region: site.region, tested: results.length, pass: ok, results };
  fs.writeFileSync(path.join(__dirname, `wf2-usd-${key}.json`), JSON.stringify(out, null, 1));
  log(`[${key}] SUMMARY tested=${results.length} pass=${ok} fail=${results.length - ok}`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
