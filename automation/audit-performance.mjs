/**
 * automation/audit-performance.mjs — Audit performance automatisé (Core Web Vitals, bundle, timing).
 * 
 * Usage:
 *   node automation/audit-performance.mjs                    # Tous viewports, toutes routes
 *   node automation/audit-performance.mjs --viewport=mobile  # Un seul viewport
 *   node automation/audit-performance.mjs --route=home       # Une seule route
 * 
 * Sortie: automation/output/performance.json
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG } from './config.mjs';

const args = process.argv.slice(2);
const flags = {
  viewport: args.find(a => a.startsWith('--viewport='))?.split('=')[1],
  route: args.find(a => a.startsWith('--route='))?.split('=')[1],
  baseUrl: args.find(a => a.startsWith('--base='))?.split('=')[1] || CONFIG.baseUrl,
  outputDir: args.find(a => a.startsWith('--out='))?.split('=')[1] || CONFIG.outputDir,
  headless: !args.includes('--headed'),
  runs: parseInt(args.find(a => a.startsWith('--runs='))?.split('=')[1] || '3', 10),
};

async function main() {
  const viewports = flags.viewport
    ? CONFIG.viewports.filter(v => v.name === flags.viewport)
    : CONFIG.viewports;
  const routes = flags.route
    ? CONFIG.routes.filter(r => r.name === flags.route)
    : CONFIG.routes;

  if (viewports.length === 0 || routes.length === 0) {
    console.error('Viewport ou route invalide');
    process.exit(1);
  }

  console.log(`[audit-performance] Base: ${flags.baseUrl}`);
  console.log(`[audit-performance] Viewports: ${viewports.map(v => v.name).join(', ')}`);
  console.log(`[audit-performance] Routes: ${routes.map(r => r.name).join(', ')}`);
  console.log(`[audit-performance] Runs per route: ${flags.runs}`);

  const browser = await chromium.launch({ headless: flags.headless });
  const allResults = [];

  try {
    for (const vp of viewports) {
      for (const route of routes) {
        const routeResults = [];
        
        for (let run = 0; run < flags.runs; run++) {
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: vp.deviceScaleFactor,
            isMobile: vp.isMobile,
            hasTouch: vp.hasTouch,
            userAgent: vp.userAgent,
          });
          
          const page = await context.newPage();
          page.setDefaultNavigationTimeout(CONFIG.timeouts.navigation);
          page.setDefaultTimeout(CONFIG.timeouts.selector);

          // Collecter métriques via PerformanceObserver
          await page.addInitScript(() => {
            window.__perfMetrics = {
              navigation: null,
              paint: [],
              lcp: null,
              fid: null,
              cls: null,
              resources: [],
            };
            
            // Navigation timing
            if (performance.timing) {
              window.__perfMetrics.navigation = {
                dns: performance.timing.domainLookupEnd - performance.timing.domainLookupStart,
                tcp: performance.timing.connectEnd - performance.timing.connectStart,
                request: performance.timing.responseStart - performance.timing.requestStart,
                response: performance.timing.responseEnd - performance.timing.responseStart,
                domLoading: performance.timing.domLoading - performance.timing.navigationStart,
                domInteractive: performance.timing.domInteractive - performance.timing.navigationStart,
                domComplete: performance.timing.domComplete - performance.timing.navigationStart,
                loadEvent: performance.timing.loadEventEnd - performance.timing.navigationStart,
              };
            }
            
            // Paint timing
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                window.__perfMetrics.paint.push({
                  name: entry.name,
                  startTime: entry.startTime,
                  duration: entry.duration,
                });
              }
            }).observe({ type: 'paint', buffered: true });
            
            // LCP
            new PerformanceObserver(list => {
              const entries = list.getEntries();
              const last = entries[entries.length - 1];
              window.__perfMetrics.lcp = {
                startTime: last.startTime,
                size: last.size,
                id: last.id,
                url: last.url,
              };
            }).observe({ type: 'largest-contentful-paint', buffered: true });
            
            // FID (first-input-delay) - via first-input
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                window.__perfMetrics.fid = {
                  startTime: entry.startTime,
                  processingStart: entry.processingStart,
                  duration: entry.duration,
                };
              }
            }).observe({ type: 'first-input', buffered: true });
            
            // CLS
            let clsValue = 0;
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                  clsValue += entry.value;
                }
              }
              window.__perfMetrics.cls = clsValue;
            }).observe({ type: 'layout-shift', buffered: true });
            
            // Resources
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                window.__perfMetrics.resources.push({
                  name: entry.name,
                  type: entry.initiatorType,
                  duration: entry.duration,
                  size: entry.transferSize,
                  encodedSize: entry.encodedBodySize,
                  decodedSize: entry.decodedBodySize,
                  startTime: entry.startTime,
                });
              }
            }).observe({ type: 'resource', buffered: true });
          });

          try {
            console.log(`  [${vp.name}] ${route.name} (run ${run + 1}/${flags.runs})...`);
            const startTime = Date.now();
            
            await page.goto(`${flags.baseUrl}${route.path}`, { waitUntil: 'load', timeout: route.timeout });
            
            if (route.waitFor) {
              await page.waitForSelector(route.waitFor, { timeout: route.timeout, state: 'visible' }).catch(async () => {
                await page.waitForSelector(route.waitFor, { timeout: 5000, state: 'attached' }).catch(() => {});
              });
            }

            if (route.action === 'click-first-beach-label') {
              await page.evaluate(() => {
                const labels = [...document.querySelectorAll('.sg-maplabel')]
                  .filter(el => getComputedStyle(el).visibility !== 'hidden');
                if (labels.length > 0) labels[0].click();
              });
              await page.waitForSelector(CONFIG.selectors.beachSheet, { timeout: 15000, state: 'visible' }).catch(() => {});
              await page.waitForTimeout(1000);
            }

            // Attendre que les métriques se stabilisent
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(2000);

            const totalTime = Date.now() - startTime;
            
            // Récupérer métriques
            const metrics = await page.evaluate(() => window.__perfMetrics);
            
            // Web Vitals via web-vitals library (si dispo) ou calcul manuel
            const webVitals = await page.evaluate(() => {
              const vitals = {};
              // TTFB
              if (performance.timing) {
                vitals.ttfb = performance.timing.responseStart - performance.timing.requestStart;
              }
              // FCP
              const paint = performance.getEntriesByType('paint');
              const fcp = paint.find(p => p.name === 'first-contentful-paint');
              if (fcp) vitals.fcp = fcp.startTime;
              // LCP
              const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
              if (lcpEntries.length > 0) {
                const last = lcpEntries[lcpEntries.length - 1];
                vitals.lcp = last.startTime;
              }
              // CLS
              let cls = 0;
              const clsEntries = performance.getEntriesByType('layout-shift');
              for (const entry of clsEntries) {
                if (!entry.hadRecentInput) cls += entry.value;
              }
              vitals.cls = cls;
              // FID - approximé via first-input
              const fidEntries = performance.getEntriesByType('first-input');
              if (fidEntries.length > 0) {
                vitals.fid = fidEntries[0].processingStart - fidEntries[0].startTime;
              }
              // INP (Interaction to Next Paint) - pas dispo sans user interaction
              return vitals;
            });

            // Bundle analysis via ressources
            const resources = metrics.resources || [];
            const jsResources = resources.filter(r => r.type === 'script' || r.name.endsWith('.js'));
            const cssResources = resources.filter(r => r.type === 'stylesheet' || r.name.endsWith('.css'));
            const fontResources = resources.filter(r => r.type === 'font' || r.name.match(/\.(woff2?|ttf|otf)$/));
            const imgResources = resources.filter(r => r.type === 'img' || r.type === 'image');
            
            const totalJsSize = jsResources.reduce((s, r) => s + (r.size || 0), 0);
            const totalCssSize = cssResources.reduce((s, r) => s + (r.size || 0), 0);
            const totalFontSize = fontResources.reduce((s, r) => s + (r.size || 0), 0);
            const totalImgSize = imgResources.reduce((s, r) => s + (r.size || 0), 0);
            const totalSize = resources.reduce((s, r) => s + (r.size || 0), 0);

            routeResults.push({
              run: run + 1,
              totalTime,
              webVitals,
              paintMetrics: metrics.paint,
              lcp: metrics.lcp,
              fid: metrics.fid,
              cls: metrics.cls,
              navigation: metrics.navigation,
              resources: {
                total: resources.length,
                totalBytes: totalSize,
                js: { count: jsResources.length, bytes: totalJsSize },
                css: { count: cssResources.length, bytes: totalCssSize },
                fonts: { count: fontResources.length, bytes: totalFontSize },
                images: { count: imgResources.length, bytes: totalImgSize },
                byType: Object.entries(
                  resources.reduce((acc, r) => {
                    const t = r.type || 'other';
                    if (!acc[t]) acc[t] = { count: 0, bytes: 0 };
                    acc[t].count++;
                    acc[t].bytes += r.size || 0;
                    return acc;
                  }, {})
                ).map(([type, data]) => ({ type, ...data })),
              },
            });

          } catch (err) {
            console.error(`    ✗ Run ${run + 1}: ${err.message}`);
            routeResults.push({
              run: run + 1,
              error: err.message,
            });
          } finally {
            await page.close();
            await context.close();
          }
        }

        // Agréger les runs (médiane)
        const successfulRuns = routeResults.filter(r => !r.error);
        if (successfulRuns.length > 0) {
          const median = (arr) => {
            const sorted = [...arr].sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length / 2)];
          };
          
          const aggregated = {
            viewport: vp.name,
            route: route.name,
            path: route.path,
            runs: flags.runs,
            successfulRuns: successfulRuns.length,
            timestamp: new Date().toISOString(),
            webVitals: {
              ttfb: median(successfulRuns.map(r => r.webVitals?.ttfb).filter(v => v != null)),
              fcp: median(successfulRuns.map(r => r.webVitals?.fcp).filter(v => v != null)),
              lcp: median(successfulRuns.map(r => r.webVitals?.lcp).filter(v => v != null)),
              fid: median(successfulRuns.map(r => r.webVitals?.fid).filter(v => v != null)),
              cls: median(successfulRuns.map(r => r.webVitals?.cls).filter(v => v != null)),
            },
            resources: {
              total: median(successfulRuns.map(r => r.resources?.total)),
              totalBytes: median(successfulRuns.map(r => r.resources?.totalBytes)),
              js: {
                count: median(successfulRuns.map(r => r.resources?.js?.count)),
                bytes: median(successfulRuns.map(r => r.resources?.js?.bytes)),
              },
              css: {
                count: median(successfulRuns.map(r => r.resources?.css?.count)),
                bytes: median(successfulRuns.map(r => r.resources?.css?.bytes)),
              },
            },
            budget: {
              ttfb: { value: median(successfulRuns.map(r => r.webVitals?.ttfb).filter(v => v != null)), budget: CONFIG.performanceBudgets.ttfb, unit: 'ms' },
              fcp: { value: median(successfulRuns.map(r => r.webVitals?.fcp).filter(v => v != null)), budget: CONFIG.performanceBudgets.fcp, unit: 'ms' },
              lcp: { value: median(successfulRuns.map(r => r.webVitals?.lcp).filter(v => v != null)), budget: CONFIG.performanceBudgets.lcp, unit: 'ms' },
              fid: { value: median(successfulRuns.map(r => r.webVitals?.fid).filter(v => v != null)), budget: CONFIG.performanceBudgets.fid, unit: 'ms' },
              cls: { value: median(successfulRuns.map(r => r.webVitals?.cls).filter(v => v != null)), budget: CONFIG.performanceBudgets.cls, unit: 'score' },
              totalJs: { value: median(successfulRuns.map(r => r.resources?.js?.bytes)), budget: CONFIG.performanceBudgets.totalJsGzipped, unit: 'bytes' },
              totalCss: { value: median(successfulRuns.map(r => r.resources?.css?.bytes)), budget: CONFIG.performanceBudgets.totalCssGzipped, unit: 'bytes' },
            },
            rawRuns: routeResults,
          };
          
          allResults.push(aggregated);
          
          // Affichage budget
          const b = aggregated.budget;
          console.log(`    Résumé: LCP=${b.lcp.value?.toFixed(0)}ms (budget ${b.lcp.budget}ms), FID=${b.fid.value?.toFixed(0)}ms, CLS=${b.cls.value?.toFixed(3)}, JS=${Math.round((b.totalJs.value||0)/1024)}Ko (budget ${Math.round(b.totalJs.budget/1024)}Ko)`);
          
          // Alertes budget
          for (const [key, val] of Object.entries(b)) {
            if (val.value != null && val.value > val.budget) {
              console.warn(`    ⚠ BUDGET DÉPASSÉ: ${key} = ${val.value}${val.unit} > ${val.budget}${val.unit}`);
            }
          }
        } else {
          console.error(`    ✗ Tous les runs ont échoué pour ${route.name}`);
          allResults.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            error: 'All runs failed',
            rawRuns: routeResults,
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  // Sauvegarde
  const outDir = join(flags.outputDir);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, CONFIG.output.performanceJson);
  writeFileSync(outFile, JSON.stringify(allResults, null, 2));
  console.log(`\n[audit-performance] Rapport sauvé: ${outFile}`);
}

main().catch(err => {
  console.error('[audit-performance] Erreur fatale:', err);
  process.exit(1);
});