/**
 * automation/audit-network.mjs — Audit réseau automatisé (requêtes, tailles, erreurs, timing).
 * 
 * Usage:
 *   node automation/audit-network.mjs                    # Tous viewports, toutes routes
 *   node automation/audit-network.mjs --viewport=mobile  # Un seul viewport
 *   node automation/audit-network.mjs --route=home       # Une seule route
 * 
 * Sortie: automation/output/network.json
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

  console.log(`[audit-network] Base: ${flags.baseUrl}`);
  console.log(`[audit-network] Viewports: ${viewports.map(v => v.name).join(', ')}`);
  console.log(`[audit-network] Routes: ${routes.map(r => r.name).join(', ')}`);

  const browser = await chromium.launch({ headless: flags.headless });
  const allResults = [];

  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        userAgent: vp.userAgent,
      });

      for (const route of routes) {
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(CONFIG.timeouts.navigation);
        page.setDefaultTimeout(CONFIG.timeouts.selector);

        const requests = [];
        const responses = [];
        const failedRequests = [];
        let totalBytes = 0;
        let totalRequests = 0;

        page.on('request', req => {
          totalRequests++;
          requests.push({
            url: req.url(),
            method: req.method(),
            resourceType: req.resourceType(),
            headers: req.headers(),
            postData: req.postData(),
            timestamp: Date.now(),
          });
        });

page.on('response', res => {
          const req = res.request();
          let timing = null;
          try {
            timing = req.timing();
          } catch (e) {
            timing = null;
          }
          const size = parseInt(res.headers()['content-length'] || '0', 10);
          totalBytes += size;
          
          const entry = {
            url: res.url(),
            status: res.status(),
            statusText: res.statusText(),
            resourceType: req.resourceType(),
            contentType: res.headers()['content-type'] || '',
            size,
            compressedSize: size,
            timing: timing ? {
              dns: timing.domainLookupStart ? timing.domainLookupEnd - timing.domainLookupStart : null,
              tcp: timing.connectStart ? timing.connectEnd - timing.connectStart : null,
              tls: timing.secureConnectionStart ? timing.connectEnd - timing.secureConnectionStart : null,
              ttfb: timing.responseStart ? timing.responseStart - timing.requestStart : null,
              download: timing.responseEnd ? timing.responseEnd - timing.responseStart : null,
              total: timing.responseEnd ? timing.responseEnd - timing.requestStart : null,
            } : { dns: null, tcp: null, tls: null, ttfb: null, download: null, total: null },
            fromCache: false, // fromCache() not available in this Playwright version
            timestamp: Date.now(),
          };
          
          responses.push(entry);
          
          if (res.status() >= 400) {
            failedRequests.push(entry);
          }
        });

        try {
          console.log(`  [${vp.name}] ${route.name}...`);
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

          // Attendre que le réseau se calme
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1000);

          // Analyser par type de ressource
          const byType = {};
          for (const r of responses) {
            const t = r.resourceType || 'other';
            if (!byType[t]) byType[t] = { count: 0, totalSize: 0, totalTime: 0, errors: 0 };
            byType[t].count++;
            byType[t].totalSize += r.size;
            byType[t].totalTime += r.timing.total || 0;
            if (r.status >= 400) byType[t].errors++;
          }

          // Top requêtes par taille
          const topBySize = [...responses]
            .sort((a, b) => b.size - a.size)
            .slice(0, 20)
            .map(r => ({ url: r.url, size: r.size, type: r.resourceType, status: r.status }));

          // Top requêtes par temps
          const topByTime = [...responses]
            .filter(r => r.timing.total)
            .sort((a, b) => (b.timing.total || 0) - (a.timing.total || 0))
            .slice(0, 20)
            .map(r => ({ url: r.url, time: r.timing.total, type: r.resourceType, status: r.status }));

          // Ressources critiques (JS, CSS, fonts, HTML)
          const criticalResources = responses.filter(r => 
            ['script', 'stylesheet', 'font', 'document'].includes(r.resourceType)
          );

          // Vérification budget
          const jsResources = responses.filter(r => r.resourceType === 'script');
          const cssResources = responses.filter(r => r.resourceType === 'stylesheet');
          const totalJsSize = jsResources.reduce((s, r) => s + r.size, 0);
          const totalCssSize = cssResources.reduce((s, r) => s + r.size, 0);

          allResults.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            timestamp: new Date().toISOString(),
            summary: {
              totalRequests,
              totalBytes,
              failedCount: failedRequests.length,
              totalJsSize,
              totalCssSize,
              criticalCount: criticalResources.length,
            },
            byType,
            topBySize,
            topByTime,
            failedRequests: failedRequests.map(r => ({ url: r.url, status: r.status, type: r.resourceType })),
            criticalResources: criticalResources.map(r => ({
              url: r.url,
              status: r.status,
              size: r.size,
              type: r.resourceType,
              timing: r.timing,
            })),
            allResponses: responses.map(r => ({
              url: r.url,
              status: r.status,
              type: r.resourceType,
              size: r.size,
              timing: r.timing,
            })),
          });

          console.log(`    Requêtes: ${totalRequests}, Échecs: ${failedRequests.length}, JS: ${Math.round(totalJsSize/1024)}Ko, CSS: ${Math.round(totalCssSize/1024)}Ko`);

        } catch (err) {
          console.error(`    ✗ ${route.name}: ${err.message}`);
          allResults.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            error: err.message,
            timestamp: new Date().toISOString(),
          });
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  // Sauvegarde
  const outDir = join(flags.outputDir);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, CONFIG.output.networkJson);
  writeFileSync(outFile, JSON.stringify(allResults, null, 2));
  console.log(`\n[audit-network] Rapport sauvé: ${outFile}`);

  // Résumé global
  const totalReq = allResults.reduce((s, r) => s + (r.summary?.totalRequests || 0), 0);
  const totalFail = allResults.reduce((s, r) => s + (r.summary?.failedCount || 0), 0);
  const totalJs = allResults.reduce((s, r) => s + (r.summary?.totalJsSize || 0), 0);
  const totalCss = allResults.reduce((s, r) => s + (r.summary?.totalCssSize || 0), 0);
  console.log(`[audit-network] Total requêtes: ${totalReq}, Échecs: ${totalFail}`);
  console.log(`[audit-network] JS total: ${Math.round(totalJs/1024)}Ko, CSS total: ${Math.round(totalCss/1024)}Ko`);
  
  // Vérification budget
  const budget = CONFIG.performanceBudgets;
  if (totalJs > budget.totalJsGzipped) {
    console.warn(`[audit-network] ⚠ DÉPASSEMENT BUDGET JS: ${Math.round(totalJs/1024)}Ko > ${Math.round(budget.totalJsGzipped/1024)}Ko`);
  }
  if (totalCss > budget.totalCssGzipped) {
    console.warn(`[audit-network] ⚠ DÉPASSEMENT BUDGET CSS: ${Math.round(totalCss/1024)}Ko > ${Math.round(budget.totalCssGzipped/1024)}Ko`);
  }
}

main().catch(err => {
  console.error('[audit-network] Erreur fatale:', err);
  process.exit(1);
});