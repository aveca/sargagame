#!/usr/bin/env node
/**
 * observe.cjs — sonde Playwright de la PRODUCTION (lecture seule, jamais de clic
 * d'achat ni de formulaire envoyé). Alimente .ai/autopilot/observations/.
 *
 * - Découverte des routes via sitemap.xml (vérité terrain par domaine)
 * - Viewports : config observe.viewports ; mode léger = lightViewports (défaut
 *   hors fenêtre unattended ; --all-viewports pour forcer)
 * - Capture : screenshots, console errors, pageerrors, requêtes 1st-party en
 *   échec/≥400, perf (ttfb/dcl/load/lcp/bytes), liens internes cassés (échantillon)
 * - Visual diff vs baselines locales (sharp, gradient descendant 256px) — ADVISORY
 *   (le contenu dynamique bouge ; sert à repérer les gros changements, pas à bloquer)
 *
 * Usage :
 *   node scripts/autopilot/observe.cjs [--run-id ID] [--all-viewports]
 *                                      [--regions mq,florida] [--accept-baseline]
 * Exit : 0 = sonde OK (même si des findings existent) ; 1 = sonde elle-même cassée.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');
const C = require('./lib/common.cjs');

const args = process.argv.slice(2);
const ARG = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def;
};

const THIRD_PARTY_NOISE = [
  'googletagmanager.com', 'google-analytics.com', 'clarity.ms', 'onesignal.com',
  'js.mollie.com', 'gstatic.com', 'google.com/recaptcha', 'facebook',
];

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'sargagame-autopilot-observe' } });
    const text = await res.text();
    return { status: res.status, text };
  } finally { clearTimeout(t); }
}

/** Routes d'un domaine depuis son sitemap (fallback : home seul). */
async function discoverRoutes(cfg, regionId, domain) {
  const routes = [
    { key: 'home', url: `https://${domain}/` },
    { key: 'paywall', url: `https://${domain}/?paywall=1`, surface: 'premium-modal' },
  ];
  try {
    const { status, text } = await fetchText(`https://${domain}/sitemap.xml`, cfg.observe.navigationTimeoutMs);
    if (status === 200) {
      const locs = Array.from(text.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => m[1]).filter(u => u.includes(domain));
      const beaches = locs.filter(u => u.includes('/beach/')).sort();
      const deep = locs.filter(u => !u.includes('/beach/') && u !== `https://${domain}/` && !/\.(xml|txt|json)$/.test(u)).sort();
      beaches.slice(0, cfg.observe.maxBeachPagesPerRegion).forEach((u, i) => routes.push({ key: 'beach-' + (i + 1), url: u, surface: 'seo-beach' }));
      deep.slice(0, cfg.observe.maxDeepLinksPerRegion).forEach((u, i) => routes.push({ key: 'deep-' + (i + 1), url: u, surface: 'seo-deep' }));
    }
  } catch (e) {
    routes.push({ key: 'sitemap-error', url: '', error: e.message });
  }
  return routes.filter(r => r.url);
}

/** Diff gradient (sharp) → {seeded} | {meanAbs, pctHot, flagged} | {skipped:raison}. */
async function visualDiff(cfg, regionId, routeKey, vpName, shotBuf, log) {
  const baseDir = path.join(C.paths.baselines, regionId);
  fs.mkdirSync(baseDir, { recursive: true });
  const basePath = path.join(baseDir, `${routeKey}-${vpName}.png`);
  if (process.env.SG_ACCEPT_BASELINE === '1' || !fs.existsSync(basePath)) {
    fs.writeFileSync(basePath, shotBuf);
    return { seeded: true };
  }
  try {
    const W = 256;
    const raw = async (buf) => sharp(buf).resize(W).grayscale().raw().toBuffer();
    const [a, b] = await Promise.all([raw(shotBuf), raw(fs.readFileSync(basePath))]);
    const n = Math.min(a.length, b.length);
    let sum = 0, hot = 0;
    for (let i = 0; i < n; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > 25) hot++; }
    const meanAbs = sum / n / 255;
    const pctHot = hot / n;
    return { meanAbs: +meanAbs.toFixed(4), pctHot: +pctHot.toFixed(4), flagged: pctHot > cfg.observe.visualDiffThreshold };
  } catch (e) {
    return { skipped: e.message };
  }
}

async function observePage(context, route, vp, cfg, log) {
  const page = await context.newPage();
  const out = {
    route: route.key, url: route.url, viewport: vp.name,
    consoleErrors: [], pageErrors: [], firstPartyFailures: [], thirdPartyFailures: [],
    timing: {}, bytes: 0, lcp: null, checks: {}, brokenLinks: [], shot: null, visual: null,
  };
  const host = new URL(route.url).hostname;
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text();
      if (!/Content Security Policy|Refused to connect to 'https:\/\/(www\.)?(googletagmanager|clarity)/.test(t)) out.consoleErrors.push(t.slice(0, 300));
    }
  });
  page.on('pageerror', e => out.pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on('response', res => {
    if (res.status() >= 400) {
      const u = res.url();
      (THIRD_PARTY_NOISE.some(d => u.includes(d)) ? out.thirdPartyFailures : out.firstPartyFailures)
        .push({ url: u.slice(0, 200), status: res.status() });
    }
  });
  page.on('requestfailed', req => {
    const u = req.url();
    if (u.startsWith('data:')) return;
    (new URL(u).hostname === host ? out.firstPartyFailures : out.thirdPartyFailures)
      .push({ url: u.slice(0, 200), status: 0, error: (req.failure() || {}).errorText });
  });
  try {
    await page.addInitScript(() => {
      window.__sgLcp = 0;
      try {
        new PerformanceObserver(l => {
          const es = l.getEntries(); if (es.length) window.__sgLcp = es[es.length - 1].startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (_) {}
    });
    const t0 = Date.now();
    const resp = await page.goto(route.url, { waitUntil: 'domcontentloaded', timeout: cfg.observe.navigationTimeoutMs });
    out.httpStatus = resp ? resp.status() : 0;
    await page.waitForTimeout(cfg.observe.settleMs);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      let bytes = 0;
      for (const r of performance.getEntriesByType('resource')) bytes += r.transferSize || 0;
      return {
        ttfb: Math.round(nav.responseStart || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0),
        load: Math.round(nav.loadEventEnd || 0), bytes, lcp: Math.round(window.__sgLcp || 0),
        bodyLen: (document.body && document.body.innerText || '').length,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        h1: !!document.querySelector('h1'),
      };
    });
    out.timing = { ttfb: m.ttfb, dcl: m.dcl, load: m.load, total: Date.now() - t0 };
    out.bytes = m.bytes; out.lcp = m.lcp;
    out.checks = { hasContent: m.bodyLen > 500, dialogs: m.dialogs, h1: m.h1, reachable: (out.httpStatus || 0) < 400 };

    // Liens internes cassés (échantillon stable : triés)
    const hrefs = await page.$$eval('a[href]', as =>
      Array.from(new Set(as.map(a => a.getAttribute('href'))))
        .filter(h => h && !h.startsWith('#') && !/^(mailto|tel|javascript):/i.test(h))
        .sort()
    ).catch(() => []);
    const origin = `https://${host}`;
    const internal = hrefs
      .map(h => { try { return new URL(h, origin).href.split('#')[0]; } catch (_) { return null; } })
      .filter(u => u && new URL(u).hostname === host)
      .slice(0, cfg.observe.maxLinkChecksPerPage);
    for (const u of internal) {
      try {
        const r = await fetchText(u, 8000);
        if (r.status >= 400) out.brokenLinks.push({ url: u.replace(origin, ''), status: r.status });
      } catch (e) { out.brokenLinks.push({ url: u.replace(origin, ''), status: 0, error: e.name }); }
    }

    out.shot = await page.screenshot({ type: 'png' });
  } catch (e) {
    out.fatal = String(e.message || e).slice(0, 300);
  } finally {
    await page.close().catch(() => {});
  }
  out.consoleErrors = [...new Set(out.consoleErrors)].slice(0, 12);
  out.pageErrors = [...new Set(out.pageErrors)].slice(0, 12);
  out.firstPartyFailures = out.firstPartyFailures.slice(0, 15);
  return out;
}

async function main() {
  C.ensureDirs();
  const cfg = C.loadConfig();
  const lg = C.makeLogger(null);
  const log = (m) => lg.log('observe', m);

  const runIdParam = ARG('run-id', null);
  const id = runIdParam === true ? C.runId() : (runIdParam || C.runId());
  const heavy = args.includes('--all-viewports') ||
    (cfg.resources.heavyViewportsWhenUnattended && C.isUnattendedWindow(cfg));
  const vps = heavy ? cfg.observe.viewports
    : cfg.observe.viewports.filter(v => cfg.observe.lightViewports.includes(v.name));
  if (args.includes('--accept-baseline')) process.env.SG_ACCEPT_BASELINE = '1';

  const regionsCfg = (ARG('regions', null) ? String(ARG('regions')).split(',') : cfg.observe.regions)
    .filter(Boolean);
  const allRegions = require(path.join(C.ROOT, 'regions', 'index.cjs')).getAllRegions();
  const regions = regionsCfg.map(id => {
    const r = allRegions.find(x => x.id === id);
    return r ? { id: r.id, domain: r.domain } : null;
  }).filter(Boolean).filter(r => r.domain);

  const obsDir = path.join(C.paths.observations, id);
  fs.mkdirSync(path.join(obsDir, 'shots'), { recursive: true });

  const started = Date.now();
  const result = { id, at: C.nowIso(), heavy, regions: {}, totals: { pages: 0, consoleErrors: 0, pageErrors: 0, firstPartyFailures: 0, brokenLinks: 0, visualFlagged: 0 } };

  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  try {
    for (const reg of regions) {
      const routes = await discoverRoutes(cfg, reg.id, reg.domain);
      result.regions[reg.id] = { domain: reg.domain, pages: [] };
      for (const route of routes) {
        for (const vp of vps) {
          const ctx = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: vp.deviceScaleFactor || 1,
            isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile,
          });
          const page = await observePage(ctx, route, vp, cfg, log);
          await ctx.close();
          if (page.shot) {
            const name = `${reg.id}-${route.key}-${vp.name}.png`;
            fs.writeFileSync(path.join(obsDir, 'shots', name), page.shot);
            page.visual = await visualDiff(cfg, reg.id, route.key, vp.name, page.shot, log);
            if (page.visual && page.visual.flagged) result.totals.visualFlagged++;
            page.shot = `shots/${name}`;
          }
          result.regions[reg.id].pages.push(page);
          result.totals.pages++;
          result.totals.consoleErrors += page.consoleErrors.length;
          result.totals.pageErrors += page.pageErrors.length;
          result.totals.firstPartyFailures += page.firstPartyFailures.length;
          result.totals.brokenLinks += page.brokenLinks.length;
          log(`${reg.id}/${route.key}@${vp.name} → ${page.httpStatus || 'ERR'} · err ${page.consoleErrors.length + page.pageErrors.length} · 1p-fail ${page.firstPartyFailures.length} · load ${page.timing.load ?? '?'}ms`);
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  result.durationSec = Math.round((Date.now() - started) / 1000);
  C.writeJSON(path.join(C.paths.observations, id + '.json'), result);
  C.writeJSON(path.join(C.paths.observations, 'latest.json'), result);
  log(`observation ${id} terminée : ${result.totals.pages} pages · ${result.totals.consoleErrors} console · ${result.totals.pageErrors} pageerrors · ${result.totals.brokenLinks} liens cassés · ${result.totals.visualFlagged} visual-flag(s)`);
  console.log(`OBSERVATION_FILE=${path.join(C.paths.observations, id + '.json')}`);
  process.exit(0);
}

main().catch(e => { console.error('OBSERVE_FATAL', e); process.exit(1); });
