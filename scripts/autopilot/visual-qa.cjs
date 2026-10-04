#!/usr/bin/env node
/**
 * visual-qa.cjs — VISUAL QA WITH BEFORE/AFTER COMPARISON
 *
 * Gère :
 * - Capture screenshots avant/après changement
 * - Diff visuel pixel-à-pixel
 * - Rapports de régression visuelle
 * - Intégration avec le gate de ship
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./lib/common.cjs');

const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';

function log(msg) {
  if (LIVE) console.log(`[${new Date().toISOString().slice(11, 19)}] VISUAL-QA ${msg}`);
  else console.log(`[VISUAL-QA] ${msg}`);
}

const SCREENSHOTS_DIR = path.join(C.paths.observations, 'screenshots');
const BASELINE_DIR = path.join(C.paths.baselines, 'visual');

/**
 * Capture un screenshot d'une route dans un worktree
 */
async function captureScreenshot(wt, route, viewport = 'mobile', label = 'current', baseUrl = null) {
  const vp = getViewport(viewport);
  const resolvedBaseUrl = baseUrl || process.env.SARGA_AUTOPILOT_BASE_URL || 'http://localhost:4173';
  const url = new URL(route, resolvedBaseUrl).toString();

  const script = buildCaptureScript(url, route, viewport, label, wt);
  const scriptPath = path.join(wt, '.ai', 'autopilot', 'tmp', `capture-${route.replace(/\//g, '-')}-${viewport}-${label}-${Date.now()}.cjs`);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, script);

  return new Promise((resolve, reject) => {
    const pw = spawn(process.execPath, ['scripts/autopilot/playwright-runner.cjs', scriptPath], {
      cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });

    let out = '', err = '';
    pw.stdout.on('data', d => { out += d; });
    pw.stderr.on('data', d => { err += d; });

    const timeout = setTimeout(() => { pw.kill('SIGKILL'); reject(new Error('capture timeout')); }, 30000);
    pw.on('exit', code => {
      clearTimeout(timeout);
      try { fs.unlinkSync(scriptPath); } catch (_) {}
      if (code !== 0) return reject(new Error(`capture exit ${code}: ${err}`));
      try {
        const result = JSON.parse(out.trim());
        if (result && result.error) return reject(new Error(`capture failed: ${result.error}`));
        resolve(result);
      } catch (_) {
        reject(new Error('capture parse error: ' + out.slice(-500)));
      }
    });
  });
}

function buildCaptureScript(url, route, viewport, label, wt) {
  const vp = getViewport(viewport);
  return `
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: ${vp.width}, height: ${vp.height} },
    deviceScaleFactor: ${vp.deviceScaleFactor},
    isMobile: ${vp.isMobile},
    hasTouch: ${vp.isMobile},
  });
  const page = await context.newPage();

const issues = [];
   page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) issues.push(msg.text()); });
   page.on('pageerror', err => issues.push(err.message));
   // Note: 'g' was previously used here but is undefined - fixed to use 'page'

  try {
    await page.goto('${url}', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#root', { timeout: 10000 }).catch(() => {});

    const shotDir = path.join('${SCREENSHOTS_DIR}', 'visual-qa');
    fs.mkdirSync(shotDir, { recursive: true });
    const shotPath = path.join(shotDir, '${label}-${route.replace(/\\//g, '-')}-${viewport}-${Date.now()}.png');
    await page.screenshot({ path: shotPath, fullPage: true });

    console.log(JSON.stringify({ route: '${route}', viewport: '${viewport}', label: '${label}', path: shotPath, issues }));
  } catch (e) {
    console.log(JSON.stringify({ route: '${route}', viewport: '${viewport}', label: '${label}', error: e.message }));
  } finally {
    await browser.close();
  }
})();
`;
}

function getViewport(name) {
  const viewports = {
    mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
    desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
    tablet: { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true },
  };
  return viewports[name] || viewports.mobile;
}

/**
 * Compare deux screenshots (baseline vs current)
 * Retourne { match: boolean, diffPixels: number, diffPercent: number }
 */
async function compareScreenshots(baselinePath, currentPath, threshold = 0.05) {
  // Utilise pixelmatch via script Node (CommonJS require)
  const script = `
const fs = require('fs');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const img1 = PNG.sync.read(fs.readFileSync('${baselinePath}'));
const img2 = PNG.sync.read(fs.readFileSync('${currentPath}'));

if (img1.width !== img2.width || img1.height !== img2.height) {
  console.log(JSON.stringify({ match: false, reason: 'dimension mismatch', w1: img1.width, h1: img1.height, w2: img2.width, h2: img2.height }));
  process.exit(0);
}

const diff = new PNG({ width: img1.width, height: img1.height });
const diffPixels = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, { threshold: 0.1 });
const totalPixels = img1.width * img1.height;
const diffPercent = diffPixels / totalPixels;

console.log(JSON.stringify({ match: diffPercent <= ${threshold}, diffPixels, diffPercent, totalPixels }));
`;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], { cwd: C.ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('exit', code => {
      if (code !== 0) return reject(new Error('compare failed'));
      try { resolve(JSON.parse(out.trim())); } catch (e) { reject(e); }
    });
  });
}

/**
 * Prend le baseline pour une route/viewport
 */
async function getBaseline(route, viewport) {
  const baselineFile = path.join(BASELINE_DIR, `${route.replace(/\//g, '-')}-${viewport}.png`);
  if (fs.existsSync(baselineFile)) return baselineFile;
  return null;
}

/**
 * Met à jour le baseline
 */
async function updateBaseline(route, viewport, sourcePath) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const baselineFile = path.join(BASELINE_DIR, `${route.replace(/\//g, '-')}-${viewport}.png`);
  fs.copyFileSync(sourcePath, baselineFile);
  return baselineFile;
}

/**
 * Exécute le visual QA complet pour un worktree
 * Retourne { passed: boolean, results: [], summary }
 */
async function runVisualQA(wt, routes = ['/', '/?paywall=1', '/carte-sargasses/'], viewports = ['mobile', 'desktop'], baseUrl = null) {
  log(`visual-qa: starting on ${routes.length} routes × ${viewports.length} viewports`);

  const results = [];
  let passed = true;

  for (const route of routes) {
    for (const viewport of viewports) {
      try {
        // Capture current
        const current = await captureScreenshot(wt, route, viewport, 'current', baseUrl);

        // Get baseline
        const baseline = await getBaseline(route, viewport);

        if (baseline) {
          // Compare
          const comparison = await compareScreenshots(baseline, current.path);
          const result = {
            route,
            viewport,
            baseline,
            current: current.path,
            match: comparison.match,
            diffPercent: comparison.diffPercent,
            diffPixels: comparison.diffPixels,
            passed: comparison.match,
          };
          results.push(result);
          if (!comparison.match) passed = false;
          log(`visual-qa: ${route}@${viewport} diff=${(comparison.diffPercent*100).toFixed(2)}% ${comparison.match ? 'PASS' : 'FAIL'}`);
        } else {
          // First run - establish baseline
          await updateBaseline(route, viewport, current.path);
          results.push({ route, viewport, baseline: current.path, established: true, passed: true });
          log(`visual-qa: ${route}@${viewport} baseline established`);
        }
      } catch (e) {
        results.push({ route, viewport, error: e.message, passed: false });
        passed = false;
        log(`visual-qa: ${route}@${viewport} ERROR ${e.message}`);
      }
    }
  }

  return { passed, results, summary: { total: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length } };
}

/**
 * Génère un rapport visuel HTML
 */
function generateVisualReport(results, outputPath) {
  const html = `
<!DOCTYPE html>
<html><head><title>Visual QA Report</title>
<style>
body { font-family: system-ui; margin: 20px; background: #0d1117; color: #e6edf3; }
h1 { color: #E8A800; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; }
.card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
.card.pass { border-color: #22C55E; }
.card.fail { border-color: #E8522A; }
img { max-width: 100%; border: 1px solid #30363d; }
.badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
.badge-pass { background: #22C55E; color: #0d1117; }
.badge-fail { background: #E8522A; color: white; }
.stats { display: flex; gap: 20px; margin-bottom: 20px; }
.stat { background: #161b22; padding: 16px; border-radius: 8px; }
</style></head><body>
<h1>Visual QA Report</h1>
<div class="stats">
  <div class="stat">Total: ${results.length}</div>
  <div class="stat" style="color: #22C55E;">Passed: ${results.filter(r => r.passed).length}</div>
  <div class="stat" style="color: #E8522A;">Failed: ${results.filter(r => !r.passed).length}</div>
</div>
<div class="grid">
${results.map(r => `
  <div class="card ${r.passed ? 'pass' : 'fail'}">
    <h3>${r.route} @ ${r.viewport} <span class="badge ${r.passed ? 'badge-pass' : 'badge-fail'}">${r.passed ? 'PASS' : 'FAIL'}</span></h3>
    ${r.diffPercent ? `<p>Diff: ${(r.diffPercent*100).toFixed(2)}% (${r.diffPixels}px)</p>` : '<p>Baseline established</p>'}
    ${r.current ? `<img src="file://${r.current}" alt="current">` : ''}
    ${r.baseline ? `<img src="file://${r.baseline}" alt="baseline">` : ''}
    ${r.error ? `<p style="color: #E8522A;">Error: ${r.error}</p>` : ''}
  </div>
`).join('')}
</div>
</body></html>
  `;
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = {
  captureScreenshot,
  compareScreenshots,
  getBaseline,
  updateBaseline,
  runVisualQA,
  generateVisualReport,
  SCREENSHOTS_DIR,
  BASELINE_DIR,
};