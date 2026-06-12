/**
 * wf2-fluid-audit.cjs — Audit FLUIDITÉ + CADRAGE (lecture seule, sites LIVE).
 * Usage: node scripts/tmp-wf-results/wf2-fluid-audit.cjs <mq|miami> <mobile|desktop>
 *
 * Mesure :
 *  1. Séquence d'arrivée (hero photo→vidéo fade, timing, pops au dismiss)
 *  2. Fiche plage : transition de la bottom sheet (frames rAF translateY/opacity) + fermeture
 *  3. CLS réel (PerformanceObserver layout-shift buffered) par phase
 *  4. Cadrage : bounding boxes + chevauchements + caps desktop
 *  5. Inventaire motion (CSSOM + inline styles)
 *  6. prefers-reduced-motion
 *
 * Règles live : script.google.com BLOQUÉ ; aucun CTA paiement cliqué.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SITES = {
  mq: "https://sargasses-martinique.com",
  miami: "https://sargassummiami.com",
};
const OUT = path.join(__dirname, "wf2-fluid-shots");
fs.mkdirSync(OUT, { recursive: true });

const siteKey = process.argv[2] || "mq";
const vpKey = process.argv[3] || "mobile";
const VP = vpKey === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const TAG = `${siteKey}-${vpKey}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), `[${TAG}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLS_INIT = `
window.__cls = { total: 0, entries: [] };
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls.total += e.value;
      let srcs = [];
      try {
        srcs = (e.sources || []).map((s) => {
          const n = s.node;
          if (!n) return "?";
          const cls = n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
          return (n.tagName || "?").toLowerCase() + cls + (n.id ? "#" + n.id : "");
        });
      } catch (_) {}
      window.__cls.entries.push({ t: Math.round(e.startTime), v: +e.value.toFixed(5), srcs });
    }
  }).observe({ type: "layout-shift", buffered: true });
} catch (_) {}
`;

async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: vpKey === "mobile" ? 2 : 1,
    isMobile: vpKey === "mobile",
    hasTouch: vpKey === "mobile",
    userAgent: vpKey === "mobile"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
    ...opts,
  });
  // KPI guard: never hit the Apps Script funnel from this audit.
  await ctx.route("**script.google.com**", (r) => r.abort());
  await ctx.route("**://script.google.com/**", (r) => r.abort());
  await ctx.addInitScript(CLS_INIT);
  return ctx;
}

function rectsOverlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return { w: +x.toFixed(1), h: +y.toFixed(1), area: +(x * y).toFixed(1) };
}

// Named chrome elements + bounding boxes, evaluated in page.
const CHROME_PROBE = `(() => {
  const out = {};
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0) return null;
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), z: cs.zIndex };
  };
  const byText = (txt) => [...document.querySelectorAll("button,div,a,span")].find((e) => (e.textContent || "").trim() === txt);
  out.fab_chat = box([...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "💬"));
  const inp = document.querySelector("input[type=text],input[type=search],input[placeholder]");
  out.search_input = box(inp);
  out.search_card = inp ? box(inp.closest(".sg-map-chrome > *") || inp.parentElement) : null;
  out.bottom_nav = box(document.querySelector(".sg-bottom-nav"));
  out.header_row = box(document.querySelector(".sg-header-chrome > *") || document.querySelector(".sg-header-chrome"));
  out.carib_btn = box(document.querySelector(".sg-carib-btn"));
  const recenter = [...document.querySelectorAll("button")].find((b) => /toute l'île|whole island|toda la isla/i.test(b.textContent || ""));
  out.recenter_btn = box(recenter);
  const play = [...document.querySelectorAll("button")].find((b) => /^(▶|❚❚)$/.test((b.textContent || "").trim()));
  out.radar_bar = play ? box(play.parentElement) : null;
  const toast = [...document.querySelectorAll("div")].filter((d) => /30 secondes|30 seconds|30 segundos/i.test(d.textContent || "")).pop();
  out.game_toast = toast ? box(toast.closest("div[style*='pointer']") || toast) : null;
  out.sheet = box(document.querySelector(".sheet"));
  out.insight = null;
  const ins = [...document.querySelectorAll("div")].find((d) => d.style && /sgRadarInsightIn/.test(d.style.animation || ""));
  if (ins) out.insight = box(ins);
  out.viewport = { w: innerWidth, h: innerHeight };
  return out;
})()`;

const MOTION_INVENTORY = `(() => {
  const combos = {};
  const add = (kind, dur, ease, name, src) => {
    const k = kind + "|" + dur + "|" + ease + (name ? "|" + name : "");
    if (!combos[k]) combos[k] = { kind, duration: dur, easing: ease, name: name || "", count: 0, sample: src.slice(0, 90) };
    combos[k].count++;
  };
  for (const ss of document.styleSheets) {
    let rules;
    try { rules = ss.cssRules; } catch (_) { continue; }
    if (!rules) continue;
    const walk = (rs) => {
      for (const r of rs) {
        if (r.cssRules) { walk(r.cssRules); continue; }
        if (!r.style) continue;
        const td = r.style.transitionDuration, ad = r.style.animationDuration;
        if (td && td !== "0s") add("transition", td, r.style.transitionTimingFunction || "ease", "", r.selectorText || "");
        if (ad && ad !== "0s") add("animation", ad, r.style.animationTimingFunction || "ease", r.style.animationName, r.selectorText || "");
      }
    };
    walk(rules);
  }
  let inlineCount = 0;
  for (const el of document.querySelectorAll("[style]")) {
    const t = el.style.transition, a = el.style.animation;
    if (t) { add("inline-transition", t, "", "", el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "")); inlineCount++; }
    if (a) { add("inline-animation", a, "", "", el.tagName); }
  }
  return { combos: Object.values(combos).sort((a, b) => b.count - a.count), inlineCount };
})()`;

async function settle(page, ms) {
  const t0 = Date.now();
  try { await page.waitForLoadState("networkidle", { timeout: ms }); } catch (_) {}
  const rest = ms - (Date.now() - t0);
  if (rest > 0) await sleep(rest);
}

(async () => {
  const results = { site: siteKey, url: SITES[siteKey], viewport: VP, phases: {} };
  const browser = await chromium.launch({ headless: true });
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

  /* ───── PHASE A : ARRIVÉE ───── */
  log("Phase A — arrival");
  const t0 = Date.now();
  await page.goto(SITES[siteKey], { waitUntil: "domcontentloaded", timeout: 60000 });
  // Poll hero/video state every 250ms for 13s
  const timeline = [];
  for (let i = 0; i < 52; i++) {
    const s = await page.evaluate(() => {
      const v = document.querySelector("video");
      const hero = document.querySelector("div[role=dialog][aria-label]");
      const img = hero ? hero.querySelector("img") : null;
      return {
        hero: !!hero,
        img: img ? { loaded: img.complete && img.naturalWidth > 0 } : null,
        video: v ? { op: getComputedStyle(v).opacity, t: +v.currentTime.toFixed(2), paused: v.paused, trans: getComputedStyle(v).transitionDuration } : null,
        cls: window.__cls ? +window.__cls.total.toFixed(4) : null,
      };
    }).catch(() => null);
    if (s) timeline.push({ ms: Date.now() - t0, ...s });
    if (s && s.video && parseFloat(s.video.op) >= 1 && i > 20) break;
    await sleep(250);
  }
  const heroShown = timeline.some((s) => s.hero);
  const vidFirst = timeline.find((s) => s.video);
  const vidVisible = timeline.find((s) => s.video && parseFloat(s.video.op) > 0.05);
  const vidFull = timeline.find((s) => s.video && parseFloat(s.video.op) >= 0.99);
  results.phases.arrival = {
    heroShown,
    videoElementAt_ms: vidFirst ? vidFirst.ms : null,
    videoFadeStart_ms: vidVisible ? vidVisible.ms : null,
    videoFadeFull_ms: vidFull ? vidFull.ms : null,
    videoTransition: vidFirst ? vidFirst.video.trans : null,
    timelineSample: timeline.filter((_, i) => i % 4 === 0).slice(0, 14),
  };
  await page.screenshot({ path: path.join(OUT, `wf2-${TAG}-1-hero.png`) });
  results.phases.arrival.cls_at_load = await page.evaluate(() => window.__cls ? { total: +window.__cls.total.toFixed(4), entries: window.__cls.entries.slice(0, 12) } : null);

  /* ───── PHASE B : DISMISS HERO → MAP ───── */
  log("Phase B — hero dismiss");
  let dismissed = false;
  if (heroShown) {
    // Snapshot pre-dismiss FAB/chrome presence; install rAF recorder for hero exit
    await page.evaluate(() => {
      window.__heroRec = { frames: [], stop: false };
      const tick = () => {
        const hero = document.querySelector("div[role=dialog][aria-label]");
        const fab = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "💬");
        window.__heroRec.frames.push({
          t: +performance.now().toFixed(1),
          hero: hero ? { op: getComputedStyle(hero).opacity, anim: getComputedStyle(hero).animationName, trans: getComputedStyle(hero).transitionDuration } : null,
          fab: fab ? { op: getComputedStyle(fab).opacity, anim: getComputedStyle(fab).animationName, trans: getComputedStyle(fab).transitionDuration } : null,
        });
        if (window.__heroRec.frames.length < 240 && !window.__heroRec.stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Scoped to the hero dialog — a bare button locator also matches the
    // BottomNav "Carte" tab behind the hero (force-click then lands on the CTA).
    const btn = page.locator("div[role=dialog] button", { hasText: /carte|map|mapa/i }).last();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true }).catch(() => {});
      dismissed = true;
    }
    await sleep(1600);
    await page.evaluate(() => { if (window.__heroRec) window.__heroRec.stop = true; });
    const rec = await page.evaluate(() => window.__heroRec ? window.__heroRec.frames : []);
    // Find frame where hero disappears, and frame where FAB appears
    let heroGoneIdx = -1, fabInIdx = -1, lastHeroFrame = null;
    for (let i = 0; i < rec.length; i++) {
      if (rec[i].hero) lastHeroFrame = rec[i];
      if (heroGoneIdx < 0 && i > 0 && rec[i - 1].hero && !rec[i].hero) heroGoneIdx = i;
      if (fabInIdx < 0 && i > 0 && !rec[i - 1].fab && rec[i].fab) fabInIdx = i;
    }
    results.phases.heroDismiss = {
      clicked: dismissed,
      frames: rec.length,
      heroExit: heroGoneIdx >= 0 ? {
        frameIdx: heroGoneIdx,
        lastHeroOpacity: lastHeroFrame ? lastHeroFrame.op || lastHeroFrame.hero.op : null,
        lastHeroAnim: lastHeroFrame ? lastHeroFrame.hero.anim : null,
        lastHeroTransition: lastHeroFrame ? lastHeroFrame.hero.trans : null,
        gapToPrev_ms: heroGoneIdx > 0 ? +(rec[heroGoneIdx].t - rec[heroGoneIdx - 1].t).toFixed(1) : null,
      } : "hero never left during recording",
      fabAppear: fabInIdx >= 0 ? {
        frameIdx: fabInIdx,
        firstOpacity: rec[fabInIdx].fab.op,
        anim: rec[fabInIdx].fab.anim,
        transition: rec[fabInIdx].fab.trans,
      } : null,
    };
    // What appeared after dismiss + computed motion on each chrome element
    results.phases.heroDismiss.chromeMotion = await page.evaluate(() => {
      const probe = (el, name) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { name, animationName: cs.animationName, animationDuration: cs.animationDuration, transitionProperty: cs.transitionProperty.slice(0, 60), transitionDuration: cs.transitionDuration };
      };
      const fab = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "💬");
      const inp = document.querySelector("input[placeholder]");
      return [
        probe(fab, "fab_chat"),
        probe(inp ? inp.closest(".sg-map-chrome > *") || inp.parentElement : null, "search_card"),
        probe(document.querySelector(".sg-bottom-nav"), "bottom_nav"),
        probe(document.querySelector(".sg-header-chrome"), "header"),
        probe(document.querySelector(".sg-carib-btn"), "carib_btn"),
        probe(document.querySelector(".leaflet-container"), "map"),
      ].filter(Boolean);
    });
  }
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, `wf2-${TAG}-2-map.png`) });

  /* ───── PHASE C : CADRAGE ───── */
  log("Phase C — framing");
  const chrome1 = await page.evaluate(CHROME_PROBE);
  results.phases.framing = { boxes: chrome1, overlaps: [] };
  const keys = Object.keys(chrome1).filter((k) => k !== "viewport" && chrome1[k]);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = chrome1[keys[i]], b = chrome1[keys[j]];
      // skip containment pairs (input inside card)
      if ((keys[i] === "search_input" && keys[j] === "search_card") || (keys[j] === "search_input" && keys[i] === "search_card")) continue;
      const ov = rectsOverlap(a, b);
      if (ov.area > 9) {
        // hit-test the overlap center
        const cx = Math.max(a.x, b.x) + ov.w / 2, cy = Math.max(a.y, b.y) + ov.h / 2;
        const top = await page.evaluate(({ x, y }) => {
          const els = document.elementsFromPoint(x, y).slice(0, 3).map((e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/)[0] : ""));
          return els;
        }, { x: cx, y: cy }).catch(() => []);
        results.phases.framing.overlaps.push({ a: keys[i], b: keys[j], overlap: ov, hitTestTop: top });
      }
    }
  }
  // Overflow viewport
  results.phases.framing.overflow = keys
    .filter((k) => {
      const r = chrome1[k];
      return r.x < -1 || r.y < -1 || r.x + r.w > VP.width + 1 || r.y + r.h > VP.height + 1;
    })
    .map((k) => ({ el: k, box: chrome1[k] }));

  /* ───── PHASE D : MOTION INVENTORY ───── */
  results.phases.motion = await page.evaluate(MOTION_INVENTORY);

  /* ───── PHASE E : FICHE PLAGE (sheet open/close, reload propre) ───── */
  log("Phase E — beach sheet");
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page, 11000);
  // hero seen in sessionStorage → map direct. Pick marker nearest viewport center in safe zone.
  const SAFE = vpKey === "mobile" ? { x1: 24, x2: VP.width - 24, y1: 135, y2: 660 } : { x1: 100, x2: VP.width - 100, y1: 140, y2: VP.height - 160 };
  let sheetResult = { opened: false };
  for (let attempt = 1; attempt <= 4 && !sheetResult.opened; attempt++) {
    const markers = await page.evaluate((sel) =>
      [...document.querySelectorAll(sel)].map((el, i) => {
        const r = el.getBoundingClientRect();
        return { i, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      }), ".leaflet-marker-pane .leaflet-marker-icon.leaflet-interactive").catch(() => []);
    const inSafe = markers.filter((m) => m.cx > SAFE.x1 && m.cx < SAFE.x2 && m.cy > SAFE.y1 && m.cy < SAFE.y2);
    if (!inSafe.length) { log("no marker in safe zone, attempt", attempt); await sleep(2000); continue; }
    const center = { x: VP.width / 2, y: VP.height / 2 };
    inSafe.sort((m, n) => Math.hypot(m.cx - center.x, m.cy - center.y) - Math.hypot(n.cx - center.x, n.cy - center.y));
    const target = inSafe[0];
    // install rAF recorder for sheet entrance
    await page.evaluate(() => {
      window.__cls.sheetStart = window.__cls.total;
      window.__sheetRec = { frames: [], stop: false };
      const tick = () => {
        const s = document.querySelector(".sheet");
        const b = document.querySelector(".backdrop");
        window.__sheetRec.frames.push({
          t: +performance.now().toFixed(1),
          sheet: s ? { top: +s.getBoundingClientRect().top.toFixed(1), op: getComputedStyle(s).opacity, anim: getComputedStyle(s).animationName, animDur: getComputedStyle(s).animationDuration, ease: getComputedStyle(s).animationTimingFunction } : null,
          backdrop: b ? { op: +(+getComputedStyle(b).opacity).toFixed(3), anim: getComputedStyle(b).animationName, animDur: getComputedStyle(b).animationDuration } : null,
        });
        if (window.__sheetRec.frames.length < 500 && !window.__sheetRec.stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const tClick = Date.now();
    await page.mouse.click(target.cx, target.cy);
    await sleep(2500);
    const opened = await page.evaluate(() => {
      const h2 = document.querySelector(".sheet h2");
      return h2 ? h2.textContent.trim() : null;
    });
    if (opened) {
      await page.evaluate(() => { window.__sheetRec.stop = true; });
      const frames = await page.evaluate(() => window.__sheetRec.frames);
      const first = frames.find((f) => f.sheet);
      const firstIdx = frames.indexOf(first);
      const t0f = frames[0] ? frames[0].t : 0;
      // entrance trajectory: top over time
      const traj = frames.filter((f) => f.sheet).slice(0, 40).map((f) => ({ dt: +(f.t - first.t).toFixed(0), top: f.sheet.top, op: f.sheet.op }));
      const settledTop = traj.length ? traj[traj.length - 1].top : null;
      const animFrames = traj.filter((f) => Math.abs(f.top - settledTop) > 2);
      sheetResult = {
        opened: true, beach: opened, attempts: attempt,
        clickToSheet_ms: first ? +(first.t - t0f).toFixed(0) : null,
        entranceAnim: first ? { name: first.sheet.anim, duration: first.sheet.animDur, easing: first.sheet.ease } : null,
        entranceFirstTop: first ? first.sheet.top : null,
        entranceAnimatedFrames: animFrames.length,
        entranceObserved_ms: animFrames.length ? animFrames[animFrames.length - 1].dt : 0,
        backdropAnim: (frames.find((f) => f.backdrop) || {}).backdrop || null,
        trajSample: traj.filter((_, i) => i % 3 === 0).slice(0, 12),
      };
      sheetResult.cls_sheetOpen = await page.evaluate(() => +(window.__cls.total - window.__cls.sheetStart).toFixed(4));
      await page.screenshot({ path: path.join(OUT, `wf2-${TAG}-3-sheet.png`) });
      // ── close: click backdrop, record exit
      await page.evaluate(() => {
        window.__closeRec = { frames: [], stop: false };
        const tick = () => {
          const s = document.querySelector(".sheet");
          const b = document.querySelector(".backdrop");
          window.__closeRec.frames.push({ t: +performance.now().toFixed(1), sheet: s ? { top: +s.getBoundingClientRect().top.toFixed(1), op: getComputedStyle(s).opacity } : null, backdrop: !!b });
          if (window.__closeRec.frames.length < 200 && !window.__closeRec.stop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      // Escape = same closeSheet path as backdrop/✕ (never a payment CTA).
      await page.keyboard.press("Escape");
      await sleep(1200);
      await page.evaluate(() => { window.__closeRec.stop = true; });
      const cFrames = await page.evaluate(() => window.__closeRec.frames);
      let goneIdx = -1;
      for (let i = 1; i < cFrames.length; i++) if (cFrames[i - 1].sheet && !cFrames[i].sheet) { goneIdx = i; break; }
      const lastSheet = [...cFrames].reverse().find((f) => f.sheet);
      sheetResult.close = {
        sheetGone: goneIdx >= 0,
        lastTopBeforeGone: lastSheet ? lastSheet.sheet.top : null,
        exitAnimated: goneIdx >= 2 ? cFrames.slice(0, goneIdx).filter((f) => f.sheet).map((f) => f.sheet.top).some((t, i, a) => i > 0 && Math.abs(t - a[0]) > 30) : false,
        framesBeforeGone: goneIdx,
      };
      await page.screenshot({ path: path.join(OUT, `wf2-${TAG}-4-after-close.png`) });
    } else {
      log(`attempt ${attempt}: no sheet (probable zoom disambig), retrying`);
      await sleep(1500);
    }
  }
  results.phases.sheet = sheetResult;
  results.phases.cls_final = await page.evaluate(() => ({ total: +window.__cls.total.toFixed(4), entries: window.__cls.entries.slice(-15) }));
  await ctx.close();

  /* ───── PHASE F : prefers-reduced-motion ───── */
  log("Phase F — reduced motion");
  const ctx2 = await newContext(browser, { reducedMotion: "reduce" });
  const p2 = await ctx2.newPage();
  await p2.goto(SITES[siteKey], { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(9000);
  results.phases.reducedMotion = await p2.evaluate(() => {
    const v = document.querySelector("video");
    const hero = document.querySelector("div[role=dialog][aria-label]");
    const chev = document.querySelector(".sg-hero-chev");
    const gbtn = document.querySelector(".gbtn");
    let gbtnAfter = null;
    if (gbtn) { const cs = getComputedStyle(gbtn, "::after"); gbtnAfter = { anim: cs.animationName, dur: cs.animationDuration }; }
    const animated = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0.05 && cs.animationIterationCount === "infinite";
    }).slice(0, 8).map((el) => {
      const cs = getComputedStyle(el);
      return { el: el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : ""), anim: cs.animationName, dur: cs.animationDuration };
    });
    return {
      matchMediaReduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
      heroPresent: !!hero,
      videoLoaded: !!v,
      chevAnim: chev ? getComputedStyle(chev).animationName + " " + getComputedStyle(chev).animationDuration : null,
      gbtnShineAfter: gbtnAfter,
      stillInfiniteAnimated: animated,
    };
  });
  await p2.screenshot({ path: path.join(OUT, `wf2-${TAG}-5-reduced.png`) });
  await ctx2.close();
  await browser.close();

  results.pageErrors = errs;
  const outFile = path.join(OUT, `wf2-results-${TAG}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
  log("DONE →", outFile);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
