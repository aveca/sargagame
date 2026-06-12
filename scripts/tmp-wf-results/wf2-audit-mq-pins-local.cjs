/**
 * wf2-audit-mq-pins.cjs — LIVE audit sargasses-martinique.com
 * Clic pin par pin pour les 10 plages du sargassum.json MQ (ids sans gp-),
 * au zoom par défaut mobile (390x844) — parcours utilisateur réel.
 *
 * Protocole (hérité de tmp-click-pins.cjs / audit-fl-local.cjs) :
 *  - 1 page FRAÎCHE par pin (sessionStorage vierge → hero affiché → dismiss bouton)
 *  - block script.google.com (+googleusercontent / GA) → zéro pollution funnel
 *  - attente >=11s post-load (refresh data re-fit la vue sinon)
 *  - projection lat/lng → containerPoint dérivée du tile pane (z/x/y + rect,
 *    gère le zoom fractionnaire zoomSnap .25) — la carte n'expose pas son instance
 *  - page.mouse.click sur le point projeté, attente 2500ms+ (disambig zoom + open)
 *  - succès = .sheet h2 ouvert avec la plage attendue OU une voisine <800m
 *  - retries au même point reprojeté (échelle disambig prod : +2 zoom par clic ambigu)
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:5220";
const VW = 390, VH = 844;
const OUT = __dirname;

const beachesAll = JSON.parse(fs.readFileSync(path.join(OUT, "wf2-live-beaches.json"), "utf8"));
const MQ = (Array.isArray(beachesAll) ? beachesAll : beachesAll.beaches).filter(b => b.island === "mq");

// sargassum.json MQ ids -> beaches-list ids (SARG_TO_BEACH, Sargasses_PROD.jsx:371)
const TARGETS = [
  ["grande-anse", "mq014"], ["anse-mitan", "mq011"], ["anse-noire", "mq012"],
  ["tartane", "mq034"], ["anse-madame", "mq024"], ["diamant", "mq016"],
  ["pt-marin", "mq008"], ["sainte-anne", "mq004"], ["les-salines", "mq001"],
  ["vauclin", "mq044"],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/['’‘]/g, "'").replace(/[^a-z0-9]/g, "");

function findBeachByName(name) {
  const n = norm(name);
  return MQ.find(b => norm(b.name) === n)
    || MQ.find(b => { const bn = norm(b.name); return bn.includes(n) || n.includes(bn); })
    || null;
}

/* In-page snapshot: projection from tile pane + sheet + markers near a point */
const PAGE_FNS = `
  function __wf2Project(lat, lng) {
    const tiles = Array.from(document.querySelectorAll('.leaflet-tile-pane img'))
      .map(im => {
        const m = (im.src || '').match(/\\/(\\d+)\\/(\\d+)\\/(\\d+)(@2x)?\\.png/);
        if (!m) return null;
        const r = im.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return null;
        return { z: +m[1], x: +m[2], y: +m[3], r };
      }).filter(Boolean);
    if (!tiles.length) return null;
    const z = Math.max(...tiles.map(t => t.z));
    const tz = tiles.filter(t => t.z === z);
    const n = 256 * Math.pow(2, z);
    const gx = (lng + 180) / 360 * n;
    const la = lat * Math.PI / 180;
    const gy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
    let sx = 0, sy = 0, ss = 0;
    for (const t of tz) {
      const s = t.r.width / 256;
      sx += t.r.left + (gx - t.x * 256) * s;
      sy += t.r.top + (gy - t.y * 256) * s;
      ss += s;
    }
    const scale = ss / tz.length;
    return { x: sx / tz.length, y: sy / tz.length, zoom: +(z + Math.log2(scale)).toFixed(2), tiles: tz.length };
  }
  function __wf2State(lat, lng) {
    const p = __wf2Project(lat, lng);
    const h2 = document.querySelector('.sheet h2');
    const out = { proj: p, sheet: h2 ? h2.textContent.trim() : null,
      zoomAnim: !!document.querySelector('.leaflet-container.leaflet-zoom-anim'),
      markers: document.querySelectorAll('.leaflet-marker-pane > *').length };
    if (p) {
      // markers within 18px (AMBIG_PX prod) + 40px of the aim point => cluster state
      let near18 = 0, near40 = 0, dotAt = null;
      for (const el of document.querySelectorAll('.leaflet-marker-pane > *')) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(cx - p.x, cy - p.y);
        if (d <= 18) { near18++; if (d <= 5) { const inner = el.querySelector('div > div'); dotAt = inner ? Math.round(inner.getBoundingClientRect().width) : null; } }
        if (d <= 40) near40++;
      }
      out.near18 = near18; out.near40 = near40; out.pinInnerPx = dotAt;
      out.topEls = (document.elementsFromPoint(p.x, p.y) || []).slice(0, 3).map(e =>
        e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/)[0] : ''));
    }
    return out;
  }
`;

async function waitMapSettled(page, timeout = 25000) {
  const t0 = Date.now();
  let prev = null, stable = 0;
  while (Date.now() - t0 < timeout) {
    const cur = await page.evaluate(() => {
      const pane = document.querySelector('.leaflet-map-pane');
      const anim = !!document.querySelector('.leaflet-container.leaflet-zoom-anim');
      const mk = document.querySelectorAll('.leaflet-marker-pane > *').length;
      return pane ? (pane.style.transform || '') + '|' + mk + '|' + anim : null;
    }).catch(() => null);
    if (cur && !cur.endsWith('true') && cur === prev) { if (++stable >= 3) return true; }
    else stable = 0;
    prev = cur;
    await sleep(400);
  }
  return false;
}

async function testBeach(ctx, sargId, beach) {
  const page = await ctx.newPage();
  const events = [];
  page.on("pageerror", e => events.push("pageerror:" + String(e.message).slice(0, 100)));
  try {
    const t0 = Date.now();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Hero verdict : dismiss par le bouton (parcours réel)
    const heroBtn = page.locator('text=Toutes les plages sur la carte').first();
    try {
      await heroBtn.waitFor({ state: "visible", timeout: 15000 });
      await heroBtn.click({ timeout: 5000 });
      events.push("hero dismissed");
    } catch (e) { events.push("hero button not seen (" + String(e.message).slice(0, 40) + ")"); }
    await page.addScriptTag({ content: PAGE_FNS });
    // data refresh re-fits the view jusqu'à ~8-10s : attendre comme un vrai user
    const remain = 11500 - (Date.now() - t0);
    if (remain > 0) await sleep(remain);
    await waitMapSettled(page);

    const MAX_ATTEMPTS = 4; // z~10.5 -> 12.5 -> 14.5 -> >=15 (plus de disambig)
    let last = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const st = await page.evaluate(([la, ln]) => __wf2State(la, ln), [beach.lat, beach.lng]);
      last = st;
      if (!st.proj) { events.push(`a${attempt}: no tiles -> no projection`); break; }
      const { x, y } = st.proj;
      events.push(`a${attempt}@(${Math.round(x)},${Math.round(y)}) z=${st.proj.zoom} near18=${st.near18} near40=${st.near40} top=${(st.topEls || []).join(">")}`);
      if (x < 4 || x > VW - 4 || y < 80 || y > VH - 100) {
        events.push(`a${attempt}: point hors zone sûre (${Math.round(x)},${Math.round(y)})`);
        // au zoom défaut tout pin doit être dans le frame (fitBounds padded) — fail direct
        break;
      }
      await page.mouse.click(x, y);
      await sleep(2500); // disambig zoom anim + moveend + open
      let name = await page.evaluate(() => {
        const h = document.querySelector('.sheet h2');
        return h ? h.textContent.trim() : null;
      }).catch(() => null);
      if (!name) { // un peu plus de temps (anim lente / réseau)
        await sleep(2000);
        name = await page.evaluate(() => {
          const h = document.querySelector('.sheet h2');
          return h ? h.textContent.trim() : null;
        }).catch(() => null);
      }
      if (name) {
        const opened = findBeachByName(name);
        const dist = opened ? haversine(beach.lat, beach.lng, opened.lat, opened.lng) : null;
        const exact = norm(name) === norm(beach.name);
        const ok = exact || (dist !== null && dist < 800);
        return { sargId, beach, ok, name, dist, exact, attempt, zoom: st.proj.zoom, near18: st.near18, events };
      }
      events.push(`a${attempt}: pas de fiche après clic`);
      await waitMapSettled(page, 9000);
    }
    const shot = path.join(OUT, `wf2-fail-${sargId}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    return { sargId, beach, ok: false, name: null, last, events };
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: false, // hasTouch:false => mouse.click déclenche les handlers Leaflet click
    locale: "fr-FR",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  // RÈGLE LIVE : zéro hit funnel/analytics
  await ctx.route(/script\.google(usercontent)?\.com|google-analytics\.com|googletagmanager\.com/, r => r.abort());
  // skip onboarding (comme tmp-click-pins)
  await ctx.addInitScript(() => { try { localStorage.setItem("sg_onb", "1"); } catch (e) {} });

  const results = [];
  for (const [sargId, beachId] of TARGETS) {
    const beach = MQ.find(b => b.id === beachId);
    if (!beach) { results.push({ sargId, ok: false, name: null, events: ["beach id " + beachId + " absent de beaches-list"] }); continue; }
    let r;
    try {
      r = await Promise.race([
        testBeach(ctx, sargId, beach),
        new Promise((_, rej) => setTimeout(() => rej(new Error("watchdog 120s")), 120000)),
      ]);
    } catch (e) {
      r = { sargId, beach, ok: false, name: null, events: ["exception: " + String(e.message).slice(0, 120)] };
    }
    results.push(r);
    log(`[${sargId}] ${r.ok ? "OK " : "FAIL"} attendu="${beach.name}" ouvert="${r.name || "-"}"${r.dist != null ? ` dist=${r.dist}m` : ""}${r.attempt ? ` (essai ${r.attempt})` : ""} | ${r.events.join(" ; ")}`);
  }
  await browser.close();

  const pass = results.filter(r => r.ok).length;
  console.log("\n=== JSON ===");
  console.log(JSON.stringify({
    domain: "sargasses-martinique.com", tested: results.length, pass,
    results: results.map(r => ({
      id: r.sargId, name: r.beach ? r.beach.name : "?", ok: r.ok, opened: r.name,
      dist: r.dist ?? null, attempt: r.attempt ?? null, zoom: r.zoom ?? (r.last && r.last.proj ? r.last.proj.zoom : null),
      near18: r.near18 ?? (r.last ? r.last.near18 : null), events: r.events,
    })),
  }, null, 1));
  fs.writeFileSync(path.join(OUT, "wf2-mq-results.json"), JSON.stringify(results, null, 2));
})().catch(e => { console.error("FATAL", e); process.exit(1); });
