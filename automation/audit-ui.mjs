/**
 * automation/audit-ui.mjs — Audit UI automatisé (boutons fantômes, visibilité, cohérence).
 * 
 * Usage:
 *   node automation/audit-ui.mjs                    # Tous viewports, toutes routes
 *   node automation/audit-ui.mjs --viewport=mobile  # Un seul viewport
 *   node automation/audit-ui.mjs --route=home       # Une seule route
 * 
 * Sortie: automation/output/accessibility.json (fusionné avec audit-accessibility.mjs)
 *         console.log tokens: WHITE_OR_TRANSPARENT_BUTTONS, ERRORS
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

  console.log(`[audit-ui] Base: ${flags.baseUrl}`);
  console.log(`[audit-ui] Viewports: ${viewports.map(v => v.name).join(', ')}`);
  console.log(`[audit-ui] Routes: ${routes.map(r => r.name).join(', ')}`);

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

        const consoleErrors = [];
        const pageErrors = [];
        
        page.on('console', msg => {
          if (msg.type() === 'error') {
            const txt = msg.text();
            // Filtrer CSP et faux positifs connus (même logique que ux-smoke.mjs)
            if (!txt.includes('Content Security Policy') &&
                !txt.includes('Refused to connect') &&
                !txt.includes('violates the following') &&
                !txt.includes('Loading the script') &&
                !txt.includes('Loading the image') &&
                !txt.includes('Unexpected token') &&
                !txt.includes('referral_claim') &&
                !txt.includes("Cannot access 'rt'")) {
              consoleErrors.push(txt);
            }
          }
        });
        page.on('pageerror', err => pageErrors.push('PAGEERROR ' + err.message));

        try {
          console.log(`  [${vp.name}] ${route.name}...`);
          await page.goto(`${flags.baseUrl}${route.path}`, { waitUntil: 'load', timeout: route.timeout });
          
          if (route.waitFor) {
            await page.waitForSelector(route.waitFor, { timeout: route.timeout, state: 'visible' }).catch(async () => {
              await page.waitForSelector(route.waitFor, { timeout: 5000, state: 'attached' }).catch(() => {});
            });
          }

          // Actions spéciales funnel
          if (route.action === 'click-first-beach-label') {
            await page.evaluate(() => {
              const labels = [...document.querySelectorAll('.sg-maplabel')]
                .filter(el => getComputedStyle(el).visibility !== 'hidden');
              if (labels.length > 0) labels[0].click();
            });
            await page.waitForSelector(CONFIG.selectors.beachSheet, { timeout: 15000, state: 'visible' }).catch(() => {});
            await page.waitForTimeout(1000);
          }

          await page.waitForTimeout(1500);

          // ── 1. Scan boutons fantômes / invisibles (reprise ux-smoke.mjs) ──
          const ghostButtons = await page.evaluate(({ DESIGN_OK_CLASS }) => {
            const out = [];
            const DESIGN_OK = new RegExp(DESIGN_OK_CLASS);
            const painted = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
            for (const el of document.querySelectorAll('button, a[role=button], [role=button]')) {
              const r = el.getBoundingClientRect();
              if (r.width < 30 || r.height < 18) continue;
              const cls = el.className.toString();
              if (DESIGN_OK.test(cls)) continue;
              const s = getComputedStyle(el);
              const ownPaint = painted(s.backgroundColor) || s.backgroundImage !== 'none'
                || (s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) > 0)
                || s.boxShadow !== 'none';
              let effBg = null, e = el.parentElement;
              while (e && e !== document.documentElement) {
                const ps = getComputedStyle(e);
                if (painted(ps.backgroundColor)) { effBg = ps.backgroundColor; break; }
                if (ps.backgroundImage !== 'none') { effBg = 'image'; break; }
                e = e.parentElement;
              }
              const ghost = !ownPaint && !effBg;
              const resolvedBg = painted(s.backgroundColor) ? s.backgroundColor : effBg;
              const hasText = !!(el.textContent || '').trim();
              const invisibleText = hasText && s.backgroundImage === 'none' && resolvedBg
                && resolvedBg !== 'image' && resolvedBg === s.color && s.textShadow === 'none';
              if (ghost || invisibleText) out.push({
                why: ghost ? 'ghost' : 'invisible-text',
                text: (el.textContent || '').trim().slice(0, 40),
                bg: s.backgroundColor,
                color: s.color,
                class: cls.slice(0, 60),
                rect: { x: r.x, y: r.y, w: r.width, h: r.height },
              });
            }
            return out;
          }, { DESIGN_OK_CLASS: '(^|\\s)sg-maplabel(\\s|$)' });

          // ── 2. Vérification visibilité éléments clés ──
          const keyElements = await page.evaluate(({ selectors }) => {
            const check = (sel) => {
              const els = document.querySelectorAll(sel);
              return [...els].map(el => {
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return {
                  selector: sel,
                  visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0',
                  rect: { x: r.x, y: r.y, w: r.width, h: r.height },
                  tag: el.tagName.toLowerCase(),
                  id: el.id || null,
                  class: el.className.toString().slice(0, 60),
                };
              });
            };
            
            // Pour paywallGoBtn, on essaie d'abord le sélecteur CSS, puis on filtre par texte
            let paywallButtons = [];
            try {
              paywallButtons = check(selectors.paywallGoBtn);
              // Filtrer par texte visible si pas de résultat
              if (paywallButtons.length === 0 && selectors.paywallGoBtnText) {
                const allButtons = document.querySelectorAll('button, a[role=button], [role=button]');
                paywallButtons = [...allButtons]
                  .filter(el => selectors.paywallGoBtnText.some(t => (el.textContent || '').includes(t)))
                  .map(el => {
                    const r = el.getBoundingClientRect();
                    const s = getComputedStyle(el);
                    return {
                      selector: 'text-match',
                      visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0',
                      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
                      tag: el.tagName.toLowerCase(),
                      id: el.id || null,
                      class: el.className.toString().slice(0, 60),
                    };
                  });
              }
            } catch (e) {
              paywallButtons = [{ error: e.message }];
            }
            
            return {
              mapLabels: check(selectors.mapLabel),
              beachSheets: check(selectors.beachSheet),
              paywallDialogs: check(selectors.paywallDialog),
              paywallButtons,
              headers: check(selectors.header),
              footers: check(selectors.footer),
              mains: check(selectors.main),
              h1s: check(selectors.h1),
            };
          }, { selectors: CONFIG.selectors });

          // ── 3. Détection overflow horizontal ──
          const overflow = await page.evaluate(() => {
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return {
              hasHorizontalOverflow: docW > winW + 1, // tolérance 1px
              docWidth: docW,
              winWidth: winW,
              overflowX: getComputedStyle(document.body).overflowX,
            };
          });

          // ── 4. Contraste texte (échantillon) ──
          const contrastSamples = await page.evaluate(() => {
            const samples = [];
            const textEls = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, li, td, th, label');
            for (const el of textEls) {
              if (samples.length >= 20) break;
              const s = getComputedStyle(el);
              if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
              const bg = s.backgroundColor;
              const color = s.color;
              if (bg && color && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                samples.push({
                  tag: el.tagName.toLowerCase(),
                  class: el.className.toString().slice(0, 40),
                  text: (el.textContent || '').trim().slice(0, 30),
                  color,
                  backgroundColor: bg,
                  fontSize: s.fontSize,
                });
              }
            }
            return samples;
          });

          allResults.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            timestamp: new Date().toISOString(),
            ghostButtons,
            keyElements,
            overflow,
            contrastSamples,
            consoleErrors: consoleErrors.slice(0, 20),
            pageErrors: pageErrors.slice(0, 10),
          });

          // Tokens de compatibilité ux-smoke (pour CI)
          const whiteOut = ghostButtons
            .filter(b => b.why === 'ghost' || b.why === 'invisible-text')
            .slice(0, 25);
          console.log(`WHITE_OR_TRANSPARENT_BUTTONS=${JSON.stringify(whiteOut)}`);
          const realErrors = [...consoleErrors, ...pageErrors].slice(0, 12);
          console.log(`ERRORS=${JSON.stringify(realErrors)}`);

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
  const outFile = join(outDir, 'audit-ui.json');
  writeFileSync(outFile, JSON.stringify(allResults, null, 2));
  console.log(`\n[audit-ui] Rapport sauvé: ${outFile}`);

  // Résumé global
  const totalGhosts = allResults.reduce((sum, r) => sum + (r.ghostButtons?.length || 0), 0);
  const totalErrors = allResults.reduce((sum, r) => sum + (r.consoleErrors?.length || 0) + (r.pageErrors?.length || 0), 0);
  const hasOverflow = allResults.some(r => r.overflow?.hasHorizontalOverflow);
  console.log(`[audit-ui] Boutons fantômes/invisibles: ${totalGhosts}`);
  console.log(`[audit-ui] Erreurs console: ${totalErrors}`);
  console.log(`[audit-ui] Overflow horizontal: ${hasOverflow ? 'OUI' : 'NON'}`);
}

main().catch(err => {
  console.error('[audit-ui] Erreur fatale:', err);
  process.exit(1);
});