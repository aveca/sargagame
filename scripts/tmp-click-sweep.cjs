/**
 * tmp-click-sweep.cjs — balayage "dead clicks" du landing + sheet (live).
 * Pour chaque élément VISIBLE qui a l'air interactif (button/a/[role]/cursor:pointer)
 * OU qui attire les clics Clarity (cartes, badge verdict, photo, score) :
 * clic → une réaction doit survenir sous 700 ms (mutation DOM, navigation, scroll).
 * Zéro réaction = dead click (la friction mesurée par Clarity).
 *
 * Skips de sécurité : CTA paiement EUR (pollution funnel/A-B), submits de formulaires.
 *
 * Usage: node scripts/tmp-click-sweep.cjs <url> [--state landing|map|sheet]
 */
const { chromium } = require("playwright");

const URL_ = process.argv[2] || "https://sargasses-martinique.com";
const SKIP = /premium|payer|pay |checkout|stripe|subscribe|s'abonner|email|mail|@|alerte/i;

async function freshPage(ctx, state) {
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000); // data + reveals settle
  // Détecteur de réaction : toute mutation DOM met à jour __lastMut
  await page.evaluate(() => {
    window.__lastMut = 0;
    new MutationObserver(() => { window.__lastMut = performance.now() }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  if (state === "map") {
    try { await page.click("text=/Toutes les plages|Toute l.île/i", { timeout: 4000 }); await page.waitForTimeout(2500) } catch (e) {}
  }
  if (state === "sheet") {
    try { await page.click("text=/Toutes les plages|Toute l.île/i", { timeout: 4000 }); await page.waitForTimeout(2500) } catch (e) {}
    // ouvre la première fiche via un pin au centre
    const m = await page.$$(".leaflet-marker-pane .leaflet-marker-icon");
    for (const el of m) {
      const b = await el.boundingBox();
      if (b && b.y > 140 && b.y < 640) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); break }
    }
    await page.waitForTimeout(2200);
  }
  return page;
}

async function listTargets(page, scopeSel) {
  return page.evaluate((scopeSel) => {
    const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
    if (!scope) return [];
    const looksInteractive = el => {
      const cs = getComputedStyle(el);
      if (cs.cursor === "pointer") return true;
      if (["BUTTON", "A", "INPUT", "SELECT"].includes(el.tagName)) return true;
      if (el.getAttribute("role") === "button" || el.onclick) return true;
      return false;
    };
    const out = [];
    const seen = new Set();
    for (const el of scope.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 18 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") continue;
      const inter = looksInteractive(el);
      // cibles "aimants à clics" même non-interactives : cartes, images, gros titres
      const magnet = /card|verdict|badge|score|hero|photo|status|fact/i.test(el.className || "") && r.height > 40;
      if (!inter && !magnet) continue;
      // dédoublonne par zone (parents/enfants superposés) : garde le plus profond interactif
      const key = `${Math.round(r.x / 8)},${Math.round(r.y / 8)},${Math.round(r.width / 8)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = (el.textContent || el.alt || el.className || el.tagName).trim().replace(/\s+/g, " ").slice(0, 48);
      out.push({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)), label, tag: el.tagName, cls: String(el.className).slice(0, 60), inter });
    }
    return out;
  }, scopeSel);
}

async function sweep(state) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem("sg_onb", "1") } catch (e) {} });

  let page = await freshPage(ctx, state);
  const targets = await listTargets(page, state === "sheet" ? ".sheet" : null);
  console.log(`\n=== état "${state}" : ${targets.length} cibles visibles ===`);
  const dead = [], ok = [], skipped = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (SKIP.test(t.label) || SKIP.test(t.cls)) { skipped.push(t); continue }
    // page fraîche toutes les 6 cibles ou après navigation
    if (i % 6 === 0 && i > 0) { await page.close(); page = await freshPage(ctx, state) }
    const urlBefore = page.url();
    const before = await page.evaluate(() => ({ mut: window.__lastMut, sc: scrollY })).catch(() => null);
    if (!before) { page = await freshPage(ctx, state); continue }
    await page.mouse.click(t.x, t.y).catch(() => {});
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({ mut: window.__lastMut, sc: scrollY })).catch(() => ({ mut: -1, sc: -1 }));
    const navigated = page.url() !== urlBefore || after.mut === -1;
    const reacted = navigated || after.mut > before.mut || Math.abs(after.sc - before.sc) > 4;
    ;(reacted ? ok : dead).push(t);
    if (!reacted) console.log(`  DEAD ${t.inter ? "[interactif!]" : "[aimant]"} <${t.tag}> "${t.label}" @(${t.x},${t.y}) .${t.cls.slice(0, 40)}`);
    if (navigated) { await page.close(); page = await freshPage(ctx, state) }
  }
  console.log(`bilan "${state}": ${ok.length} réactifs, ${dead.length} morts, ${skipped.length} skip sécurité`);
  await browser.close();
  return dead;
}

;(async () => {
  const state = (process.argv.find(a => a.startsWith("--state")) || "").split("=")[1];
  const states = state ? [state] : ["landing", "map", "sheet"];
  for (const s of states) await sweep(s);
})();
