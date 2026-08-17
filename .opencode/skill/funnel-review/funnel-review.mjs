#!/usr/bin/env node
/**
 * funnel-review.mjs — Revue complète funnel Sargagame
 * 
 * Orchestre : build → preview → screenshots → ux-smoke → playwright → rapport
 */

import { spawn, execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve('.'); // project root (run from repo root)
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUTDIR = join(ROOT, `funnel-review-${TIMESTAMP}`);
const SCREENSHOTS_DIR = join(OUTDIR, 'screenshots');
const PREVIEW_URL = 'http://localhost:4173';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: 'inherit', shell: true });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
    child.on('error', reject);
  });
}

function runCapture(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, shell: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `${cmd} exited ${code}`)));
    child.on('error', reject);
  });
}

async function main() {
  console.log(`\n🔍 FUNNEL REVIEW — ${TIMESTAMP}`);
  console.log(`📁 Output: ${OUTDIR}\n`);

  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  let previewProc = null;
  const results = {
    timestamp: TIMESTAMP,
    build: false,
    screenshots: false,
    uxSmoke: { FUNNEL_REACHED: false, ERRORS: false, WHITE_OR_TRANSPARENT_BUTTONS: false, RM_INFINITE: false },
    e2e: { funnel: false, contract: false },
    durationMs: 0,
    errors: []
  };
  const start = Date.now();

  try {
    // 1. Build
    console.log('📦 Building...');
    await run('npm', ['run', 'build'], { cwd: ROOT });
    results.build = true;
    console.log('✅ Build OK\n');

    // 2. Start preview server
    console.log('🚀 Starting preview server on :4173...');
    previewProc = spawn('npx', ['vite', 'preview', '--port', '4173'], {
      cwd: ROOT,
      stdio: 'ignore',
      detached: true,
      shell: true
    });
    previewProc.unref();
    await new Promise(r => setTimeout(r, 3000)); // wait for server

    // 3. Screenshots
    console.log('📸 Capturing screenshots (25 states × 4 viewports)...');
    await run('node', ['scripts/ui-audit-screenshots.mjs'], { cwd: ROOT });
    // Copy screenshots to our output dir
    const srcShots = join(ROOT, 'tests', 'ui-audit-screenshots');
    if (existsSync(srcShots)) {
      for (const f of readdirSync(srcShots)) {
        if (f.endsWith('.png')) {
          execSync(`cp "${join(srcShots, f)}" "${join(SCREENSHOTS_DIR, f)}"`);
        }
      }
    }
    results.screenshots = true;
    console.log('✅ Screenshots OK\n');

    // 4. ux-smoke
    console.log('💨 Running ux-smoke...');
    const smokeOut = await runCapture('node', ['scripts/ux-smoke.mjs'], { cwd: ROOT });
    writeFileSync(join(OUTDIR, 'ux-smoke.json'), smokeOut);
    const tokens = smokeOut.match(/^(FUNNEL_REACHED|ERRORS|WHITE_OR_TRANSPARENT_BUTTONS|RM_INFINITE)=(.+)$/gm);
    if (tokens) {
      for (const t of tokens) {
        const [, key, val] = t.split('=');
        results.uxSmoke[key] = val === 'map+fiche+paywall' || val === '[]';
      }
    }
    console.log('✅ ux-smoke OK:', JSON.stringify(results.uxSmoke));
    console.log('');

    // 5. Playwright E2E (funnel + contract)
    console.log('🎭 Running Playwright E2E (funnel-payment + contract-pass-one-time)...');
    try {
      await run('npx', ['playwright', 'test', 'tests/e2e/funnel-payment.spec.ts', 'tests/e2e/contract-pass-one-time.spec.ts', '--reporter=html'], { cwd: ROOT });
      results.e2e.funnel = true;
      results.e2e.contract = true;
      console.log('✅ E2E OK\n');
    } catch (e) {
      results.errors.push(`E2E failed: ${e.message}`);
      console.log('⚠️ E2E failed (non-blocking for report)');
    }

    // 6. Generate report
    console.log('📝 Generating report...');
    const report = generateReport(results);
    writeFileSync(join(OUTDIR, `funnel-review-${TIMESTAMP}.md`), report);
    console.log(`✅ Report: ${join(OUTDIR, `funnel-review-${TIMESTAMP}.md`)}`);

  } catch (e) {
    results.errors.push(e.message);
    console.error('❌ Error:', e.message);
  } finally {
    if (previewProc) previewProc.kill();
    results.durationMs = Date.now() - start;
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('FUNNEL REVIEW SUMMARY');
    console.log('='.repeat(50));
    console.log(`Build: ${results.build ? '✅' : '❌'}`);
    console.log(`Screenshots: ${results.screenshots ? '✅' : '❌'}`);
    console.log(`ux-smoke: ${Object.values(results.uxSmoke).every(v => v) ? '✅' : '❌'}`, results.uxSmoke);
    console.log(`E2E funnel: ${results.e2e.funnel ? '✅' : '❌'}`);
    console.log(`E2E contract: ${results.e2e.contract ? '✅' : '❌'}`);
    console.log(`Duration: ${(results.durationMs / 1000 / 60).toFixed(1)} min`);
    console.log(`Errors: ${results.errors.length || 'none'}`);
    console.log(`Report: ${join(OUTDIR, `funnel-review-${TIMESTAMP}.md`)}`);
  }
}

function generateReport(r) {
  const shots = existsSync(SCREENSHOTS_DIR) ? readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png')).sort() : [];
  const shotList = shots.map(f => `- \`${f}\``).join('\n') || '  (aucun)';

  return `# Funnel Review — ${r.timestamp}

## Résumé

| Check | Status |
|-------|--------|
| Build | ${r.build ? '✅ PASS' : '❌ FAIL'} |
| Screenshots (25 × 4 viewports) | ${r.screenshots ? '✅ PASS' : '❌ FAIL'} |
| ux-smoke FUNNEL_REACHED | ${r.uxSmoke.FUNNEL_REACHED ? '✅' : '❌'} |
| ux-smoke ERRORS | ${r.uxSmoke.ERRORS ? '✅' : '❌'} |
| ux-smoke WHITE_OR_TRANSPARENT_BUTTONS | ${r.uxSmoke.WHITE_OR_TRANSPARENT_BUTTONS ? '✅' : '❌'} |
| ux-smoke RM_INFINITE | ${r.uxSmoke.RM_INFINITE ? '✅' : '❌'} |
| Playwright funnel-payment | ${r.e2e.funnel ? '✅ PASS' : '❌ FAIL'} |
| Playwright contract-pass-one-time | ${r.e2e.contract ? '✅ PASS' : '❌ FAIL'} |

**Durée totale** : ${(r.durationMs / 1000 / 60).toFixed(1)} min

${r.errors.length ? `## ⚠️ Erreurs\n${r.errors.map(e => `- ${e}`).join('\n')}\n` : ''}

## Screenshots capturés (${shots.length})

${shotList}

## Tokens ux-smoke

\`\`\`json
${JSON.stringify(r.uxSmoke, null, 2)}
\`\`\`

## Artifacts

- Screenshots: \`${SCREENSHOTS_DIR}/\`
- ux-smoke brut: \`${OUTDIR}/ux-smoke.json\`
- Playwright HTML report: \`${ROOT}/test-results/report/\`
- Trace (si échec): \`${ROOT}/test-results/*/trace.zip\`

---

*Généré par funnel-review skill*
`;
}

main();