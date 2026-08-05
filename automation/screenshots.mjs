/**
 * automation/screenshots.mjs — Capture d'écrans automatisée multi-viewport, multi-routes.
 * 
 * Usage:
 *   node automation/screenshots.mjs                    # Toutes routes, tous viewports
 *   node automation/screenshots.mjs --viewport=mobile  # Un seul viewport
 *   node automation/screenshots.mjs --route=home       # Une seule route
 *   node automation/screenshots.mjs --list             # Lister les routes/viewports
 * 
 * Sortie: automation/output/screenshots/{viewport}/{route}.png
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { CONFIG } from './config.mjs';

const args = process.argv.slice(2);
const flags = {
  viewport: args.find(a => a.startsWith('--viewport='))?.split('=')[1],
  route: args.find(a => a.startsWith('--route='))?.split('=')[1],
  list: args.includes('--list'),
  headless: !args.includes('--headed'),
  baseUrl: args.find(a => a.startsWith('--base='))?.split('=')[1] || CONFIG.baseUrl,
  outputDir: args.find(a => a.startsWith('--out='))?.split('=')[1] || CONFIG.outputDir,
};

async function main() {
  // Lister et quitter
  if (flags.list) {
    console.log('=== VIEWPORTS ===');
    CONFIG.viewports.forEach(v => console.log(`  ${v.name}: ${v.width}x${v.height} (DPR ${v.deviceScaleFactor}) ${v.isMobile ? 'mobile' : 'desktop'}`));
    console.log('\n=== ROUTES ===');
    CONFIG.routes.forEach(r => console.log(`  ${r.name}: ${r.path} (waitFor: ${r.waitFor}, timeout: ${r.timeout}ms)${r.isFunnel ? ' [FUNNEL]' : ''}`));
    return;
  }

  // Filtrer viewports
  const viewports = flags.viewport
    ? CONFIG.viewports.filter(v => v.name === flags.viewport)
    : CONFIG.viewports;
  if (viewports.length === 0) {
    console.error(`Viewport inconnu: ${flags.viewport}`);
    console.error('Disponibles:', CONFIG.viewports.map(v => v.name).join(', '));
    process.exit(1);
  }

  // Filtrer routes
  const routes = flags.route
    ? CONFIG.routes.filter(r => r.name === flags.route)
    : CONFIG.routes;
  if (routes.length === 0) {
    console.error(`Route inconnue: ${flags.route}`);
    console.error('Disponibles:', CONFIG.routes.map(r => r.name).join(', '));
    process.exit(1);
  }

  console.log(`[screenshots] Base URL: ${flags.baseUrl}`);
  console.log(`[screenshots] Output: ${flags.outputDir}`);
  console.log(`[screenshots] Viewports: ${viewports.map(v => v.name).join(', ')}`);
  console.log(`[screenshots] Routes: ${routes.map(r => r.name).join(', ')}`);
  console.log(`[screenshots] Headless: ${flags.headless}`);

  const browser = await chromium.launch({ headless: flags.headless });
  const results = [];

  try {
    for (const vp of viewports) {
      const vpDir = join(flags.outputDir, CONFIG.output.screenshotsDir, vp.name);
      mkdirSync(vpDir, { recursive: true });

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

        const url = `${flags.baseUrl}${route.path}`;
        const safeName = route.name.replace(/[^a-z0-9_-]/gi, '_');
        const screenshotPath = join(vpDir, `${safeName}.png`);

        try {
          console.log(`  [${vp.name}] ${route.name} → ${url}`);
          
          await page.goto(url, { waitUntil: 'load', timeout: route.timeout });

          // Attendre le sélecteur cible
          if (route.waitFor) {
            await page.waitForSelector(route.waitFor, { timeout: route.timeout, state: 'visible' }).catch(async () => {
              // Fallback: attendre attached si visible échoue
              await page.waitForSelector(route.waitFor, { timeout: 5000, state: 'attached' }).catch(() => {});
            });
          }

          // Actions spéciales pour les parcours funnel
          if (route.action === 'click-first-beach-label') {
            await page.evaluate(() => {
              const labels = [...document.querySelectorAll('.sg-maplabel')]
                .filter(el => getComputedStyle(el).visibility !== 'hidden');
              if (labels.length > 0) labels[0].click();
            });
            await page.waitForSelector(CONFIG.selectors.beachSheet, { timeout: 15000, state: 'visible' }).catch(() => {});
            await page.waitForTimeout(1000);
          }

          // Attendre un peu pour le rendu final
          await page.waitForTimeout(1500);

          // Capture
          await page.screenshot({
            path: screenshotPath,
            fullPage: CONFIG.screenshot.fullPage,
            animations: CONFIG.screenshot.animations,
            type: CONFIG.screenshot.type,
          });

          const stats = existsSync(screenshotPath) ? (await import('fs')).promises.stat(screenshotPath) : null;
          results.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            url,
            screenshot: screenshotPath,
            size: stats?.size || 0,
            success: true,
          });
          console.log(`    ✓ ${safeName}.png (${Math.round((stats?.size || 0) / 1024)} Ko)`);
        } catch (err) {
          console.error(`    ✗ ${route.name}: ${err.message}`);
          results.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            url,
            screenshot: null,
            error: err.message,
            success: false,
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

  // Résumé
  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`\n[screenshots] Terminé: ${success} OK, ${failed} échoué(s)`);
  
  if (failed > 0) {
    console.log('\nÉchecs:');
    results.filter(r => !r.success).forEach(r => 
      console.log(`  [${r.viewport}] ${r.route}: ${r.error}`)
    );
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[screenshots] Erreur fatale:', err);
  process.exit(1);
});