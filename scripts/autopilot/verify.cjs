#!/usr/bin/env node
/**
 * verify.cjs — TEST / BROWSER QA / PERF QA : le Gate de ship, exécuté dans le
 * worktree autopilot (jamais sur l'arbre du fondateur).
 *
 * Étapes (chaque échec = {ok:false, failedStep, log extrait} — jamais contourné) :
 *   0. esbuild syntaxe par fichier JS modifié (+ php -l si .php — interdit par policy, parano)
 *   1. npm run build
 *   2. check-bundle-budget (≤ 210 Ko eager gzip)
 *   3. invariant régions (assertAllRegionsValid)
 *   4. tests de contrat déclarés par l'opportunité
 *   5. vite preview (port dédié 4183) + ux-smoke 4 tokens
 *
 * Exit CLI : 0 ok / 1 gate rouge. Usage : node scripts/autopilot/verify.cjs --wt <path> \
 *   --files a.js,b.jsx --tests tests/unit/x.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const C = require('./lib/common.cjs');

const LIVE = process.env.SARGA_AUTOPILOT_LIVE === '1';

function log(msg) {
  if (LIVE) console.log(`[${new Date().toISOString().slice(11, 19)}] VERIFY    ${msg}`);
}

function sh(cmd, cwd, opts = {}) {
  return execSync(cmd, { cwd, encoding: 'utf8', timeout: (opts.timeoutMin || 3) * 60000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(opts.env || {}) } });
}
function shSafe(cmd, cwd, opts = {}) {
  try { return { ok: true, out: sh(cmd, cwd, opts) }; }
  catch (e) { return { ok: false, out: ((e.stdout || '') + '\n' + (e.stderr || '') + '\n' + e.message).slice(-3000), code: e.status }; }
}

async function waitForPort(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function killTree(child, log) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch (_) { try { child.kill('SIGKILL'); } catch (__) {} }
}

/**
 * runGate({wt, files, tests, log}) → {ok, steps[], failedStep?, detail?}
 */
async function runGate({ wt, files = [], tests = [], log = console.log }) {
  const steps = [];
  const fail = (step, detail) => ({ ok: false, steps, failedStep: step, detail: (detail || '').slice(-2500) });

  // 0. syntaxe
  const jsFiles = files.filter(f => /\.(jsx?|mjs|cjs)$/.test(f) && fs.existsSync(path.join(wt, f)));
  for (const f of jsFiles) {
    if (LIVE) log(`esbuild ${f}...`);
    const r = shSafe(`npx --no-install esbuild "${f}" --bundle=false --log-level=error --outfile=NUL`, wt);
    steps.push(`esbuild ${f}: ${r.ok ? 'OK' : 'FAIL'}`);
    if (!r.ok) return fail('esbuild:' + f, r.out);
  }
  const phpFiles = files.filter(f => f.endsWith('.php'));
  for (const f of phpFiles) {
    if (LIVE) log(`php -l ${f}...`);
    const r = shSafe(`php -l "${f}"`, wt);
    steps.push(`php -l ${f}: ${r.ok ? 'OK' : 'FAIL'}`);
    if (!r.ok) return fail('php-l:' + f, r.out);
  }

  // 1. build
  if (LIVE) log('npm run build...');
  log('verify: npm run build…');
  const b = shSafe('npm run build', wt, { timeoutMin: 8 });
  steps.push(`build: ${b.ok ? 'exit 0' : 'FAIL'}`);
  if (!b.ok) return fail('build', b.out);
  if (LIVE) log('build PASS');

  // 2. budget bundle
  if (LIVE) log('check-bundle-budget...');
  const budget = shSafe('node scripts/check-bundle-budget.cjs', wt);
  steps.push(`bundle-budget: ${budget.ok ? 'OK' : 'FAIL'}`);
  if (!budget.ok) return fail('bundle-budget', budget.out);
  if (LIVE) log('bundle PASS');

  // 3. invariant régions
  if (LIVE) log('regions invariant...');
  const reg = shSafe('node -e "require(\'./regions/index.cjs\').assertAllRegionsValid()"', wt);
  steps.push(`regions-invariant: ${reg.ok ? 'OK' : 'FAIL'}`);
  if (!reg.ok) return fail('regions', reg.out);
  if (LIVE) log('regions PASS');

  // 4. tests de contrat
  for (const t of tests) {
    if (!fs.existsSync(path.join(wt, t))) { steps.push(`test ${t}: SKIP (absent)`); continue; }
    if (LIVE) log(`test ${t}...`);
    const r = shSafe(`node "${t}"`, wt, { timeoutMin: 3 });
    steps.push(`test ${t}: ${r.ok ? 'OK' : 'FAIL'}`);
    if (!r.ok) return fail('test:' + t, r.out);
    if (LIVE) log(`test ${t} PASS`);
  }

  // 5. preview + smoke
  if (LIVE) log('vite preview + ux-smoke...');
  log('verify: vite preview :4183 + ux-smoke…');
  const { VITE_BIN } = require('../lib/process-runner.cjs');
  
  // Handle VITE_BIN being either string or [node, script] array
  let preview;
  if (Array.isArray(VITE_BIN)) {
    preview = spawn(VITE_BIN[0], [...VITE_BIN.slice(1), 'preview', '--port', '4183', '--strictPort'],
      { cwd: wt, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  } else {
    preview = spawn(VITE_BIN, ['preview', '--port', '4183', '--strictPort'],
      { cwd: wt, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  }
  try {
    const up = await waitForPort('http://localhost:4183/');
    if (!up) return fail('preview', 'vite preview :4183 pas monté en 20 s');
    const smoke = shSafe('node scripts/ux-smoke.mjs', wt, { timeoutMin: 4, env: { SMOKE_BASE: 'http://localhost:4183' } });
    const tokens = ['FUNNEL_REACHED=map+fiche+paywall', 'ERRORS=[]', 'WHITE_OR_TRANSPARENT_BUTTONS=[]', 'RM_INFINITE=[]'];
    const missing = tokens.filter(t => !(smoke.out || '').includes(t));
    steps.push(`ux-smoke: ${smoke.ok && !missing.length ? '4 tokens OK' : 'FAIL'}`);
    if (!smoke.ok || missing.length) return fail('ux-smoke', `tokens manquants: ${missing.join(' | ')}\n${smoke.out}`);
    if (LIVE) log('ux-smoke PASS');
  } finally {
    killTree(preview, log);
  }

  return { ok: true, steps };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const ARG = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  runGate({
    wt: path.resolve(ARG('wt', process.cwd())),
    files: (ARG('files', '') || '').split(',').filter(Boolean),
    tests: (ARG('tests', '') || '').split(',').filter(Boolean),
  }).then(r => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}

module.exports = { runGate };
