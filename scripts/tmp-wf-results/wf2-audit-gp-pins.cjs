/**
 * wf2-audit-gp-pins.cjs — Audit LIVE des clics pins sur sargasses-guadeloupe.com
 *
 * Teste TOUTES les plages gp- du sargassum.json live (10 ids), au zoom par
 * défaut mobile 390x844 (état cluster/declutter réel).
 *
 * Protocole (harnais éprouvés tmp-click-pins.cjs / audit-fl-local.cjs) :
 *  - 1 page FRAÎCHE par pin (l'état disambig/zoom fuit entre les clics sinon)
 *  - script.google.com BLOQUÉ (page.route abort) — zéro pollution funnel KPI
 *  - hero + onboarding skippés via storage (sg_hero_seen / sg_onb)
 *  - projection lat/lng → containerPoint via la VRAIE instance map, capturée
 *    par hook window.L (defineProperty setter → L.Map.addInitHook)
 *  - page.mouse.click sur le point projeté (jamais locator text=)
 *  - attente 2500ms par tentative (le disambig peut zoomer PUIS ouvrir)
 *  - vérif .sheet h2 = nom attendu OU voisine immédiate <800m
 *  - AUCUN clic CTA paiement — pins / carte uniquement
 */
const { chromium } = require("playwright");
const path = require("path");

const SITE = "https://sargasses-guadeloupe.com";
const VW = 390, VH = 844;
const SAFE = { x1: 24, x2: VW - 24, y1: 135, y2: 660 };
const PAN_TARGET = { x: 195, y: 400 };
const NEIGHBOR_M = 800;

// SARG_TO_BEACH (Sargasses_PROD.jsx:371) — ids sargassum.json gp- → beaches-list ids
const SARG_TO_BEACH = {
  "gp-grande-anse": "gp021", "gp-malendure": "gp031", "gp-sainte-anne": "gp010",
  "gp-pt-chateaux": "gp005", "gp-gosier": "gp012", "gp-caravelle": "gp009",
  "gp-bas-du-fort": "gp014", "gp-deshaies": "gp024", "gp-moule": "gp080",
  "gp-vieux-fort": "gp042",
};

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}
function haversine(a, b, c, d) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (c - a) * t, dLng = (d - b) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// ---------- in-page helpers ----------
const INIT_SCRIPT = () => {
  try { localStorage.setItem("sg_onb", "1"); } catch (e) {}
  try { sessionStorage.setItem("sg_hero_seen", "1"); } catch (e) {}
  // Capture map instances: leaflet UMD always does `window.L = exports` (#2364),
  // our setter installs addInitHook BEFORE any L.map() call.
  try {
    let _L;
    Object.defineProperty(window, "L", {
      configurable: true,
      get() { return _L; },
      set(v) {
        _L = v;
        try {
          if (v && v.Map && v.Map.addInitHook && !v.__sgHooked) {
            v.__sgHooked = true;
            v.Map.addInitHook(function () {
              (window.__sgMaps = window.__sgMaps || []).push(this);
            });
          }
        } catch (e) {}
      },
    });
  } catch (e) {}
};

async function mapState(page) {
  return page.evaluate(() => {
    const m = (window.__sgMaps || [])[0];
    if (!m) return null;
    let zoom = null, anim = false;
    try { zoom = m.getZoom(); } catch (e) {}
    try { anim = m.getContainer().classList.contains("leaflet-zoom-anim"); } catch (e) {}
    const markers = document.querySelectorAll(".leaflet-marker-pane .leaflet-marker-icon").length;
    const h2 = document.querySelector(".sheet h2");
    return { zoom, anim, markers, sheetName: h2 ? h2.textContent.trim() : null };
  }).catch(() => null);
}

/** Projette lat/lng → coords page via l'instance map réelle. */
async function project(page, lat, lng) {
  return page.evaluate(({ lat, lng }) => {
    const m = (window.__sgMaps || [])[0];
    if (!m) return null;
    try {
      const p = m.latLngToContainerPoint([lat, lng]);
      const r = m.getContainer().getBoundingClientRect();
      return { x: Math.round(r.left + p.x), y: Math.round(r.top + p.y), zoom: m.getZoom() };
    } catch (e) { return null; }
  }, { lat, lng }).catch(() => null);
}

/** Diagnostic au point : élément top, marker le plus proche (taille = tier), ambiguïté 18px. */
async function diagAt(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const top = el ? el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") : "null";
    const ms = Array.from(document.querySelectorAll(".leaflet-marker-pane .leaflet-marker-icon"));
    let best = null, bestD = Infinity, ambig = 0;
    for (const mk of ms) {
      const r = mk.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d <= 18) ambig++;
      if (d < bestD) {
        bestD = d;
        const inner = mk.querySelector("div>div");
        best = { d: Math.round(d), inner: inner ? Math.round(inner.getBoundingClientRect().width) : null };
      }
    }
    return { top, nearest: best, ambig, markerCount: ms.length };
  }, { x, y }).catch(() => null);
}

async function zoomAnimating(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".leaflet-container");
    return c ? c.classList.contains("leaflet-zoom-anim") : false;
  }).catch(() => false);
}

async function getMarkers(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".leaflet-marker-pane .leaflet-marker-icon")).map((el) => {
    const r = el.getBoundingClientRect();
    return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
  })).catch(() => null);
}

/** Markers présents + positions stables sur 4 polls + pas d'anim zoom. */
async function waitSettled(page, { minCount = 1, timeout = 40000 } = {}) {
  const t0 = Date.now();
  let prev = null, stable = 0;
  while (Date.now() - t0 < timeout) {
    const m = await getMarkers(page);
    if (m && m.length >= minCount && !(await zoomAnimating(page)) && prev && m.length === prev.length) {
      const moved = m.some((p, i) => Math.abs(p.cx - prev[i].cx) > 2 || Math.abs(p.cy - prev[i].cy) > 2);
      if (!moved) { stable++; if (stable >= 4) return m; } else stable = 0;
    } else stable = 0;
    prev = m || prev;
    await sleep(350);
  }
  return prev || [];
}

const inSafe = (x, y) => x >= SAFE.x1 && x <= SAFE.x2 && y >= SAFE.y1 && y <= SAFE.y2;

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
    await sleep(30);
  }
  await sleep(250);
  await page.mouse.up();
  await sleep(400);
  return true;
}

/** Amène le point projeté du beach dans la zone sûre (drag = geste utilisateur). */
async function panPointIntoView(page, lat, lng, events) {
  for (let t = 0; t < 5; t++) {
    const p = await project(page, lat, lng);
    if (!p) return null;
    if (inSafe(p.x, p.y)) return p;
    const dx = Math.max(-280, Math.min(280, PAN_TARGET.x - p.x));
    const dy = Math.max(-280, Math.min(280, PAN_TARGET.y - p.y));
    events.push(`pan(${dx},${dy}) pt@(${p.x},${p.y})`);
    const ok = await dragMap(page, dx, dy);
    if (!ok) { events.push("no drag start"); return p; }
    await waitSettled(page, { timeout: 6000 });
  }
  return project(page, lat, lng);
}

async function loadHome(page) {
  // allBeaches se met à jour jusqu'à ~8s post-load (data + overlays) — chaque
  // update peut re-render les markers. On clique APRÈS stabilisation (>=11s),
  // comme un utilisateur posé sur la carte. (Protocole tmp-click-pins.cjs.)
  const t0 = Date.now();
  await page.goto(SITE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitSettled(page);
  const remain = 11000 - (Date.now() - t0);
  if (remain > 0) await sleep(remain);
  return waitSettled(page, { timeout: 15000 });
}

async function testBeach(page, target, gpList) {
  const events = [];
  const markers = await loadHome(page);
  if (!markers.length) return { ok: false, reason: "no markers after load", events };
  const st0 = await mapState(page);
  if (!st0 || st0.zoom == null) return { ok: false, reason: "map instance not captured (hook L)", events };
  events.push(`home zoom=${st0.zoom} markers=${st0.markers}`);

  let p = await project(page, target.lat, target.lng);
  if (!p) return { ok: false, reason: "projection failed", events };
  if (!inSafe(p.x, p.y)) {
    events.push(`pt@(${p.x},${p.y}) hors zone sûre -> pan`);
    p = await panPointIntoView(page, target.lat, target.lng, events);
    if (!p) return { ok: false, reason: "point lost while panning", events };
    if (!inSafe(p.x, p.y)) return { ok: false, reason: `still outside safe zone @(${p.x},${p.y}) z${p.zoom}`, events };
  }

  const MAX_ATTEMPTS = 5; // disambig: z~9 -> 11 -> 13 -> 15 -> pick direct
  let lastDiag = null, lastZoom = p.zoom;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const diag = await diagAt(page, p.x, p.y);
    lastDiag = diag;
    lastZoom = p.zoom;
    events.push(`a${attempt} z${p.zoom} @(${p.x},${p.y}) top=${diag ? diag.top : "?"} nearest=${diag && diag.nearest ? diag.nearest.d + "px/inner" + diag.nearest.inner : "?"} ambig=${diag ? diag.ambig : "?"}`);
    await page.mouse.click(p.x, p.y);
    await sleep(2500); // anim zoom disambig + moveend + open
    let st = await mapState(page);
    if (!st || !st.sheetName) { await sleep(1500); st = await mapState(page); } // marge anim lente
    if (st && st.sheetName) {
      const opened = st.sheetName;
      if (norm(opened) === norm(target.name)) {
        return { ok: true, opened, exact: true, zoom: lastZoom, attempts: attempt, events };
      }
      // voisine immédiate <800m ?
      const cands = gpList.filter((b) => norm(b.name) === norm(opened));
      let dist = null;
      for (const c of cands) {
        const d = haversine(target.lat, target.lng, c.lat, c.lng);
        if (dist == null || d < dist) dist = d;
      }
      if (dist != null && dist <= NEIGHBOR_M) {
        return { ok: true, opened, exact: false, distM: Math.round(dist), zoom: lastZoom, attempts: attempt, events };
      }
      return {
        ok: false, opened, distM: dist == null ? null : Math.round(dist), zoom: lastZoom, attempts: attempt,
        reason: `mauvaise plage: "${opened}"${dist != null ? ` à ${(dist / 1000).toFixed(1)}km` : " (hors liste gp)"}`, events,
      };
    }
    // Pas de fiche : le disambig a probablement zoomé — re-projeter et recliquer.
    await waitSettled(page, { timeout: 8000 });
    p = await project(page, target.lat, target.lng);
    if (!p) { events.push("projection lost after click"); break; }
    if (!inSafe(p.x, p.y)) {
      p = await panPointIntoView(page, target.lat, target.lng, events);
      if (!p || !inSafe(p.x, p.y)) { events.push("point unreachable after zoom"); break; }
    }
  }
  const st = await mapState(page);
  return {
    ok: false, zoom: st ? st.zoom : lastZoom, diag: lastDiag,
    reason: `aucune fiche après ${MAX_ATTEMPTS} clics (zoom final ${st ? st.zoom : "?"}, ${lastDiag && lastDiag.nearest ? `pin le plus proche à ${lastDiag.nearest.d}px inner=${lastDiag.nearest.inner}px` : "pas de pin proche"}, ambig=${lastDiag ? lastDiag.ambig : "?"})`,
    events,
  };
}

function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`WATCHDOG ${label} ${ms}ms`)), ms))]);
}

(async () => {
  // 1) Données live
  const sarg = await fetchJson(SITE + "/api/copernicus/sargassum.json");
  const gpIds = sarg.levels.filter((l) => l.id.startsWith("gp-")).map((l) => l.id);
  log(`sargassum.json live: ${gpIds.length} ids gp- : ${gpIds.join(", ")}`);
  const bl = await fetchJson(SITE + "/data/beaches-list.json");
  const arr = Array.isArray(bl) ? bl : bl.beaches || [];
  const gpList = arr.filter((b) => b.island === "gp");
  log(`beaches-list.json live: ${gpList.length} plages gp`);
  const byId = Object.fromEntries(gpList.map((b) => [b.id, b]));

  const targets = gpIds.map((sid) => {
    const bid = SARG_TO_BEACH[sid];
    const b = bid ? byId[bid] : null;
    return b ? { sid, bid, name: b.name, lat: b.lat, lng: b.lng } : { sid, bid, missing: true };
  });

  // 2) Browser
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  await ctx.route(/script\.google\.com/, (r) => r.abort()); // ZÉRO pollution funnel
  await ctx.addInitScript(INIT_SCRIPT);

  let page = null;
  const newPage = async () => {
    if (page) await page.close().catch(() => {});
    page = await ctx.newPage();
    page.on("pageerror", (e) => log(`  PAGEERROR: ${String(e).slice(0, 160)}`));
    page.on("crash", () => log("  PAGE CRASHED"));
    return page;
  };

  const results = [];
  for (const t of targets) {
    if (t.missing) {
      results.push({ ...t, ok: false, reason: `id beaches-list ${t.bid} introuvable` });
      log(`[${t.sid}] FAIL: mapping ${t.bid} introuvable dans beaches-list live`);
      continue;
    }
    await newPage(); // 1 page fraîche par pin
    let r = null;
    for (let tries = 0; tries < 2 && !r; tries++) {
      try { r = await withTimeout(testBeach(page, t, gpList), 180000, t.sid); }
      catch (e) { log(`[${t.sid}] cycle error: ${String(e).slice(0, 140)} — recreating page`); await newPage(); }
    }
    if (!r) r = { ok: false, reason: "watchdog/exception twice", events: [] };
    r = { sid: t.sid, bid: t.bid, name: t.name, ...r };
    results.push(r);
    if (r.ok) {
      log(`[${t.sid}] OK "${r.opened}" (z${r.zoom}, ${r.attempts} clic(s)${r.exact ? "" : `, voisine ${r.distM}m`}) | ${r.events.join(" ; ")}`);
    } else {
      log(`[${t.sid}] FAIL: ${r.reason} | ${(r.events || []).join(" ; ")}`);
      await page.screenshot({ path: path.join(__dirname, `wf2-gp-fail-${t.sid}.png`) }).catch(() => {});
    }
  }
  await browser.close();

  const ok = results.filter((r) => r.ok);
  log(`\nSUMMARY tested=${results.length} pass=${ok.length} fail=${results.length - ok.length}`);
  require("fs").writeFileSync(path.join(__dirname, "wf2-gp-pins-results.json"), JSON.stringify(results, null, 2));
  log("results -> wf2-gp-pins-results.json");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
