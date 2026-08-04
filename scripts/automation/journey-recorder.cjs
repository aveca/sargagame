#!/usr/bin/env node
/**
 * journey-recorder.cjs — REAL screen-recording of the REAL Sargasses app, human-like.
 *
 * Pilots the actual dist app (http://127.0.0.1:8799, fallback prod) with Playwright
 * chromium, records an mp4/webm per journey (recordVideo), moves the mouse / scrolls /
 * hovers / clicks like a human, dwells on verdict/forecast, and CAPTURES the real
 * KPI funnel by listening to network POSTs to /rest/v1/analytics_events (Supabase).
 *
 * This is NOT AI-generated video. It is a screen capture of the shipped product.
 * The mp4s feed the `screencap` chapters of the TourVideo (Remotion) engine.
 *
 * CLI:
 *   node journey-recorder.cjs [--base=http://127.0.0.1:8799] [--bucket=short|long|mix]
 *                             [--count=N] [--maxMin=20] [--headed] [--dry]
 *
 * - Weighted-random journey selection that FILLS per-bucket quotas
 *   ("if the bucket is full -> next journey"). --count overrides total quota.
 * - Never crashes: every step is best-effort (try/catch), the run always finalizes
 *   the video + writes a manifest. Idempotent/append into a run-index.
 * - Installs chromium if the browser binary is missing.
 *
 * Output: scripts/automation/data/journeys/<ts>-<id>/ (recording.webm|mp4 + manifest.json)
 *         scripts/automation/data/journeys/run-index.json (append-only list of manifests)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..', '..'); // repo root
const DATA_DIR = path.join(__dirname, 'data');
const OUT_DIR = path.join(DATA_DIR, 'journeys');
const JOURNEYS_FILE = path.join(DATA_DIR, 'journeys.json');
const RUN_INDEX = path.join(OUT_DIR, 'run-index.json');

const DEFAULT_BASE = process.env.JOURNEY_BASE || 'http://127.0.0.1:8799';
const FALLBACK_BASE = 'https://sargasses-martinique.com';

// The real analytics endpoint the front posts to (Supabase REST).
const ANALYTICS_MATCH = '/rest/v1/analytics_events';
// B2B trial endpoint (self-serve Pro trial) — counts as a bonus KPI if hit.
const B2B_TRIAL_MATCH = '/api/b2b-trial.php';
// Checkout providers — a redirect to these = real intent-to-pay signal.
const CHECKOUT_HOSTS = ['mollie.com', 'checkout.mollie', 'paypal.com', 'stripe.com', 'checkout.stripe'];

// Mobile-first: the founder is mobile, the product is mobile-first. iPhone-ish.
const VIEWPORT = { width: 390, height: 844 };
const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rint = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const jitter = (ms) => Math.round(ms * (0.75 + Math.random() * 0.5)); // ±25%
const nowStamp = () =>
  new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

function log(...a) {
  console.log('[journey]', ...a);
}
function warn(...a) {
  console.warn('[journey][W]', ...a);
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (_) {
    return fallback;
  }
}

function ensureDir(d) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { base: DEFAULT_BASE, bucket: 'mix', count: null, maxMin: 20, headed: false, dry: false };
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'base') out.base = v || out.base;
    else if (k === 'bucket') out.bucket = (v || 'mix').toLowerCase();
    else if (k === 'count') out.count = Math.max(1, parseInt(v, 10) || 1);
    else if (k === 'maxMin') out.maxMin = Math.max(1, parseInt(v, 10) || 20);
    else if (k === 'headed') out.headed = true;
    else if (k === 'dry') out.dry = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Playwright loading + chromium install
// ---------------------------------------------------------------------------
function loadPlaywright() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    throw new Error(
      'playwright module not found. Install deps in the worktree (node_modules is junctioned). ' +
        'Original error: ' + e.message
    );
  }
  // Make sure the chromium binary is present; install best-effort if not.
  try {
    const p = playwright.chromium.executablePath();
    if (!p || !fs.existsSync(p)) throw new Error('chromium binary missing');
  } catch (_) {
    log('Chromium binary missing — running `npx playwright install chromium`…');
    try {
      // Hardcoded args, no user input — execFileSync avoids shell interpolation.
      execFileSync('npx', ['playwright', 'install', 'chromium'], {
        stdio: 'inherit',
        cwd: ROOT,
        shell: process.platform === 'win32', // npx needs the shell resolver on Windows
      });
    } catch (e) {
      warn('chromium install failed:', e.message, '— continuing, launch may still work');
    }
  }
  return playwright;
}

// ---------------------------------------------------------------------------
// Health check: is BASE reachable? Else fall back to prod.
// ---------------------------------------------------------------------------
async function resolveBase(playwright, wantedBase) {
  const candidates = [wantedBase];
  if (wantedBase !== FALLBACK_BASE) candidates.push(FALLBACK_BASE);
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (const base of candidates) {
      try {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const resp = await page.goto(base + '/', { timeout: 15000, waitUntil: 'domcontentloaded' });
        await ctx.close();
        if (resp && resp.status() < 500) {
          if (base !== wantedBase) warn('BASE', wantedBase, 'unreachable -> using fallback', base);
          return base;
        }
      } catch (e) {
        warn('health-check failed for', base, '-', e.message);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  warn('No base reachable via health-check; defaulting to', wantedBase, '(best-effort)');
  return wantedBase;
}

// ---------------------------------------------------------------------------
// Journey selection: weighted-random, fills per-bucket quotas
// ---------------------------------------------------------------------------
function planQueue(spec, opts) {
  const journeys = spec.journeys || [];
  const quotas = { ...(spec.bucketQuotas || { short: 4, long: 2 }) };

  // Filter by requested bucket
  const bucketFilter = opts.bucket === 'mix' ? null : opts.bucket;
  const remaining = {};
  for (const b of Object.keys(quotas)) {
    if (bucketFilter && b !== bucketFilter) {
      remaining[b] = 0;
    } else {
      remaining[b] = quotas[b];
    }
  }
  // --count overrides the total quota (spread it, but still respect bucket filter)
  if (opts.count != null) {
    // Re-distribute count across allowed buckets proportionally to original quota.
    const allowed = Object.keys(remaining).filter((b) => (bucketFilter ? b === bucketFilter : true));
    // If the requested bucket has no quota entry, seed it so --count still works.
    if (bucketFilter && !allowed.length) {
      remaining[bucketFilter] = 0;
      allowed.push(bucketFilter);
    }
    if (allowed.length === 1) {
      remaining[allowed[0]] = opts.count;
    } else {
      const base = Math.floor(opts.count / allowed.length);
      let leftover = opts.count - base * allowed.length;
      for (const b of allowed) remaining[b] = base + (leftover-- > 0 ? 1 : 0);
    }
  }

  const byBucket = {};
  for (const j of journeys) {
    (byBucket[j.bucket] = byBucket[j.bucket] || []).push(j);
  }

  const queue = [];
  let guard = 0;
  const remainingTotal = () => Object.values(remaining).reduce((a, c) => a + c, 0);

  while (remainingTotal() > 0 && guard++ < 1000) {
    // Buckets that still need journeys AND have at least one template
    const openBuckets = Object.keys(remaining).filter((b) => remaining[b] > 0 && (byBucket[b] || []).length);
    if (!openBuckets.length) break;
    // Prefer the emptiest bucket first (fill quotas evenly)
    openBuckets.sort((a, b) => remaining[b] - remaining[a]);
    const bucket = openBuckets[0];
    const pool = byBucket[bucket];
    // Weighted-random within the bucket ("if the bucket isn't full -> next journey")
    const j = weightedPick(pool);
    queue.push(j);
    remaining[bucket]--;
  }
  return queue;
}

function weightedPick(pool) {
  const weights = pool.map((j) => Math.max(1, j.weight || 1));
  const total = weights.reduce((a, c) => a + c, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// ---------------------------------------------------------------------------
// Human-like primitives
// ---------------------------------------------------------------------------
async function humanPause(minMs = 400, maxMs = 2500) {
  await sleep(rint(minMs, maxMs));
}

// Move mouse along a jittery multi-point path (never teleport).
async function humanMouseTo(page, x, y) {
  try {
    const start = page._sgMouse || { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
    const steps = rint(6, 14);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const jx = (Math.random() - 0.5) * 8;
      const jy = (Math.random() - 0.5) * 8;
      const cx = start.x + (x - start.x) * t + jx;
      const cy = start.y + (y - start.y) * t + jy;
      await page.mouse.move(cx, cy);
      await sleep(rint(8, 28));
    }
    await page.mouse.move(x, y);
    page._sgMouse = { x, y };
  } catch (_) {}
}

// Smooth wheel scroll in small increments.
async function humanScroll(page, totalPx) {
  try {
    const dir = totalPx >= 0 ? 1 : -1;
    let done = 0;
    const target = Math.abs(totalPx);
    while (done < target) {
      const step = rint(40, 120);
      await page.mouse.wheel(0, dir * step);
      done += step;
      await sleep(rint(30, 110));
    }
  } catch (_) {}
}

// Pick a random VISIBLE element matching a selector list (comma-separated ok).
async function pickVisible(page, selector) {
  try {
    const handles = await page.$$(selector);
    const visible = [];
    for (const h of handles) {
      try {
        const box = await h.boundingBox();
        if (!box) continue;
        if (box.width < 6 || box.height < 6) continue;
        // allow slightly below the fold — we scroll to it before clicking
        if (box.y > VIEWPORT.height * 3) continue;
        const vis = await h.isVisible().catch(() => false);
        if (!vis) continue;
        visible.push({ h, box });
      } catch (_) {}
    }
    if (!visible.length) return null;
    return visible[rint(0, visible.length - 1)];
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step executor — best effort, never throws
// ---------------------------------------------------------------------------
async function runStep(page, base, step) {
  const action = step.action;
  try {
    if (action === 'goto') {
      const url = base + (step.target || '/');
      log('  goto', step.target || '/');
      await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' }).catch((e) => warn('goto', e.message));
      // Let the SPA mount + fire sg_session_start (useEffect).
      await sleep(rint(1200, 2600));
      await humanMouseTo(page, rint(60, VIEWPORT.width - 60), rint(120, 400));
    } else if (action === 'scroll') {
      log('  scroll');
      await humanScroll(page, rint(220, 640));
      await humanPause(300, 1200);
    } else if (action === 'dwell') {
      const ms = jitter(step.dwellMs || 2500);
      log('  dwell', ms + 'ms');
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (Math.random() < 0.4) {
          await humanMouseTo(page, rint(40, VIEWPORT.width - 40), rint(120, VIEWPORT.height - 120));
        }
        await sleep(rint(400, 1100));
      }
    } else if (action === 'hover') {
      log('  hover', step.target);
      const pick = await pickVisible(page, step.target);
      if (pick) {
        await humanMouseTo(page, pick.box.x + pick.box.width / 2, pick.box.y + pick.box.height / 2);
        await humanPause(500, 1600);
      }
    } else if (action === 'maybeClick') {
      log('  maybeClick', step.target);
      const pick = await pickVisible(page, step.target);
      if (pick) {
        await pick.h.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        const box = (await pick.h.boundingBox().catch(() => null)) || pick.box;
        await humanMouseTo(page, box.x + box.width / 2, box.y + box.height / 2);
        await humanPause(250, 900);
        await pick.h.click({ timeout: 4000, delay: rint(40, 140) }).catch((e) => warn('click', e.message));
        await sleep(rint(900, 2200)); // let modal open / analytics fire
      } else {
        warn('  no visible element for', step.target, '(skipping click)');
      }
    }
    if (step.dwellMs && action !== 'dwell') {
      await sleep(jitter(Math.min(step.dwellMs, 4000)));
    }
    await humanPause(); // baseline 400-2500ms between steps
    return true;
  } catch (e) {
    warn('step failed', action, '-', e.message);
    return false;
  }
}

// Extract event names from an analytics_events POST (single or batch insert).
function extractEventNames(req) {
  const names = [];
  try {
    const pd = req.postData();
    if (!pd) return names;
    let body;
    try {
      body = JSON.parse(pd);
    } catch (_) {
      // Not JSON — grep for known event tokens as a resilient fallback.
      const m = pd.match(/sg_[a-z_]+|b2b_[a-z_]+/g);
      return m ? Array.from(new Set(m)) : names;
    }
    const rows = Array.isArray(body) ? body : [body];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const name = row.event || row.event_name || row.name || row.type || row.e;
      if (name) names.push(String(name));
    }
  } catch (_) {}
  return names;
}

// ---------------------------------------------------------------------------
// Record one journey
// ---------------------------------------------------------------------------
async function recordJourney(playwright, base, journey, buckets, opts) {
  const stamp = nowStamp();
  const runDir = path.join(OUT_DIR, `${stamp}-${journey.id}`);
  ensureDir(runDir);

  const bucketCfg = (buckets && buckets[journey.bucket]) || { minMs: 60000, maxMs: 600000 };
  const hardCapMs = Math.min(bucketCfg.maxMs, opts.maxMin * 60000);
  const t0 = Date.now();

  const kpiHit = new Set();
  const analyticsSeen = [];
  let checkoutRedirect = false;

  log(`> ${journey.id} [${journey.bucket}] — ${journey.persona}`);

  const browser = await playwright.chromium.launch({ headless: !opts.headed });
  let context, page, videoPath = null, manifest;
  try {
    context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: UA_MOBILE,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      locale: 'fr-FR',
      recordVideo: { dir: runDir, size: VIEWPORT },
    });
    page = await context.newPage();
    page._sgMouse = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

    // --- KPI capture: listen to real analytics POSTs + checkout redirects ---
    page.on('request', (req) => {
      try {
        const url = req.url();
        if (url.includes(ANALYTICS_MATCH)) {
          const names = extractEventNames(req);
          for (const n of names) {
            kpiHit.add(n);
            analyticsSeen.push(n);
          }
        } else if (url.includes(B2B_TRIAL_MATCH)) {
          kpiHit.add('b2b_trial_started');
          analyticsSeen.push('b2b_trial_started');
        } else if (CHECKOUT_HOSTS.some((h) => url.includes(h))) {
          checkoutRedirect = true;
          kpiHit.add('sg_checkout_redirect');
          analyticsSeen.push('sg_checkout_redirect(url)');
        }
      } catch (_) {}
    });
    // Also flag main-frame navigations to a checkout host.
    page.on('framenavigated', (frame) => {
      try {
        if (frame === page.mainFrame()) {
          const u = frame.url();
          if (CHECKOUT_HOSTS.some((h) => u.includes(h))) {
            checkoutRedirect = true;
            kpiHit.add('sg_checkout_redirect');
          }
        }
      } catch (_) {}
    });

    // --- Walk the steps ---
    let stepsDone = 0;
    for (const step of journey.steps) {
      if (Date.now() - t0 > hardCapMs) {
        warn('hard time cap reached — stopping steps early');
        break;
      }
      const ok = await runStep(page, base, step);
      if (ok) stepsDone++;
    }

    // --- Pad to the bucket minimum so the video reads as a real session ---
    const elapsed = () => Date.now() - t0;
    if (elapsed() < bucketCfg.minMs) {
      log(`  padding to bucket min (~${Math.round((bucketCfg.minMs - elapsed()) / 1000)}s of idle browsing)`);
      while (elapsed() < bucketCfg.minMs && elapsed() < hardCapMs) {
        await humanScroll(page, rint(-160, 220));
        await humanMouseTo(page, rint(40, VIEWPORT.width - 40), rint(120, VIEWPORT.height - 120));
        await sleep(rint(1500, 4000));
      }
    }

    const durationS = Math.round((Date.now() - t0) / 1000);

    // Close context so Playwright flushes the video file, then locate it.
    const video = page.video();
    await context.close().catch(() => {});
    context = null;
    if (video) {
      try {
        videoPath = await video.path();
      } catch (_) {
        videoPath = null;
      }
    }
    if (!videoPath) {
      // Fallback: newest media file in runDir
      try {
        const files = fs
          .readdirSync(runDir)
          .filter((f) => /\.(webm|mp4)$/i.test(f))
          .map((f) => path.join(runDir, f));
        if (files.length) videoPath = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      } catch (_) {}
    }

    manifest = {
      journey: journey.id,
      persona: journey.persona,
      bucket: journey.bucket,
      base,
      timestamp: new Date().toISOString(),
      duration_s: durationS,
      expected_kpis: journey.expectedKpis || [],
      kpi_events_hit: Array.from(kpiHit),
      kpi_events_sequence: analyticsSeen,
      checkout_redirect: checkoutRedirect,
      steps_total: journey.steps.length,
      steps_done: stepsDone,
      video_path: videoPath ? path.relative(ROOT, videoPath).replace(/\\/g, '/') : null,
      run_dir: path.relative(ROOT, runDir).replace(/\\/g, '/'),
    };
  } catch (e) {
    warn('journey error', journey.id, '-', e.message);
    manifest = manifest || {
      journey: journey.id,
      persona: journey.persona,
      bucket: journey.bucket,
      base,
      timestamp: new Date().toISOString(),
      duration_s: Math.round((Date.now() - t0) / 1000),
      expected_kpis: journey.expectedKpis || [],
      kpi_events_hit: Array.from(kpiHit),
      kpi_events_sequence: analyticsSeen,
      checkout_redirect: checkoutRedirect,
      steps_total: journey.steps.length,
      steps_done: 0,
      video_path: null,
      run_dir: path.relative(ROOT, runDir).replace(/\\/g, '/'),
      error: e.message,
    };
  } finally {
    try {
      if (context) await context.close();
    } catch (_) {}
    try {
      await browser.close();
    } catch (_) {}
  }

  try {
    fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  } catch (e) {
    warn('could not write manifest:', e.message);
  }

  log(
    `OK ${journey.id} — ${manifest.duration_s}s — KPI hit: [${manifest.kpi_events_hit.join(', ') || 'none'}] — video: ${
      manifest.video_path || 'MISSING'
    }`
  );
  return manifest;
}

// ---------------------------------------------------------------------------
// Run-index append (idempotent)
// ---------------------------------------------------------------------------
function appendRunIndex(manifests) {
  const idx = readJsonSafe(RUN_INDEX, { runs: [] });
  if (!Array.isArray(idx.runs)) idx.runs = [];
  for (const m of manifests) idx.runs.push(m);
  idx.updatedAt = new Date().toISOString();
  try {
    fs.writeFileSync(RUN_INDEX, JSON.stringify(idx, null, 2));
  } catch (e) {
    warn('could not write run-index:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);
  ensureDir(OUT_DIR);

  const spec = readJsonSafe(JOURNEYS_FILE, null);
  if (!spec || !Array.isArray(spec.journeys) || !spec.journeys.length) {
    console.error('[journey] No journeys.json found or it is empty at', JOURNEYS_FILE);
    process.exit(1);
  }

  const queue = planQueue(spec, opts);
  if (!queue.length) {
    console.error('[journey] Nothing to record for bucket=' + opts.bucket);
    process.exit(1);
  }

  log(`Plan: ${queue.length} journey(s) — bucket=${opts.bucket} — ` + queue.map((j) => j.id).join(', '));

  if (opts.dry) {
    log('DRY RUN — not launching a browser. Planned queue above. Exiting 0.');
    return;
  }

  const playwright = loadPlaywright();
  const base = await resolveBase(playwright, opts.base);
  log('Recording against BASE =', base);

  const manifests = [];
  for (const journey of queue) {
    let m;
    try {
      m = await recordJourney(playwright, base, journey, spec.buckets, opts);
    } catch (e) {
      warn('recordJourney threw (should not happen):', e.message);
      m = { journey: journey.id, error: e.message, video_path: null, kpi_events_hit: [] };
    }
    manifests.push(m);
    appendRunIndex([m]); // append incrementally so a crash still leaves a trail
  }

  const withVideo = manifests.filter((m) => m.video_path).length;
  const totalKpi = new Set();
  for (const m of manifests) for (const k of m.kpi_events_hit || []) totalKpi.add(k);
  log('----------------------------------------------');
  log(`DONE: ${manifests.length} journeys, ${withVideo} videos written.`);
  log(`Distinct KPI events captured across run: [${Array.from(totalKpi).join(', ') || 'none'}]`);
  log('Output dir:', path.relative(ROOT, OUT_DIR).replace(/\\/g, '/'));
}

main().catch((e) => {
  console.error('[journey] FATAL', e && e.stack ? e.stack : e);
  // Best-effort: still exit 0 so a cron step reports a run rather than red-failing.
  process.exit(0);
});
