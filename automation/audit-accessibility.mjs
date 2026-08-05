/**
 * automation/audit-accessibility.mjs — Audit accessibilité automatisé (a11y, reduced-motion, focus, contraste).
 * 
 * Usage:
 *   node automation/audit-accessibility.mjs                    # Tous viewports, toutes routes
 *   node automation/audit-accessibility.mjs --viewport=mobile  # Un seul viewport
 *   node automation/audit-accessibility.mjs --route=home       # Une seule route
 * 
 * Sortie: automation/output/accessibility.json
 * Tokens: RM_INFINITE (animations infinies sous reduced-motion)
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

  console.log(`[audit-accessibility] Base: ${flags.baseUrl}`);
  console.log(`[audit-accessibility] Viewports: ${viewports.map(v => v.name).join(', ')}`);
  console.log(`[audit-accessibility] Routes: ${routes.map(r => r.name).join(', ')}`);

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

        try {
          console.log(`  [${vp.name}] ${route.name} (normal)...`);
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

          await page.waitForTimeout(1500);

          // ── 1. Audit normal (sans reduced-motion) ──
          const normalAudit = await page.evaluate(({ selectors }) => {
            const results = {
              // Structure sémantique
              landmarks: {},
              headings: [],
              // Focus
              focusableCount: 0,
              focusStyles: [],
              // ARIA
              ariaIssues: [],
              // Images
              images: [],
              // Formulaires
              forms: [],
              // Liens
              links: [],
            };

            // Landmarks
            const landmarkRoles = ['banner', 'main', 'navigation', 'complementary', 'contentinfo', 'search', 'region'];
            for (const role of landmarkRoles) {
              const els = document.querySelectorAll(`[role="${role}"], ${role}`);
              results.landmarks[role] = els.length;
            }

            // Headings (hiérarchie)
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
            results.headings = [...headings].map(h => ({
              level: h.tagName.match(/H(\d)/i)?.[1] || h.getAttribute('aria-level') || '?',
              text: (h.textContent || '').trim().slice(0, 60),
              id: h.id || null,
            }));

            // Éléments focusables
            const focusable = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="menuitem"]');
            results.focusableCount = focusable.length;
            
            // Vérifier styles de focus visibles
            for (const el of focusable) {
              if (results.focusStyles.length >= 20) break;
              const s = getComputedStyle(el);
              const focusStyles = s.getPropertyValue('outline') || s.getPropertyValue('box-shadow') || '';
              if (focusStyles && focusStyles !== 'none') {
                results.focusStyles.push({
                  tag: el.tagName.toLowerCase(),
                  class: el.className.toString().slice(0, 40),
                  id: el.id || null,
                  hasVisibleFocus: true,
                  focusStyle: focusStyles.slice(0, 100),
                });
              } else {
                // Pas de style de focus explicite - pourrait être un problème
                results.focusStyles.push({
                  tag: el.tagName.toLowerCase(),
                  class: el.className.toString().slice(0, 40),
                  id: el.id || null,
                  hasVisibleFocus: false,
                });
              }
            }

            // ARIA issues
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const attrs = [...el.attributes].filter(a => a.name.startsWith('aria-'));
              for (const attr of attrs) {
                // aria-hidden sur élément focusable = problème
                if (attr.name === 'aria-hidden' && attr.value === 'true') {
                  const isFocusable = el.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                  if (isFocusable) {
                    results.ariaIssues.push({
                      issue: 'aria-hidden=true on focusable element',
                      tag: el.tagName.toLowerCase(),
                      class: el.className.toString().slice(0, 40),
                    });
                  }
                }
                // aria-label vide
                if (attr.name === 'aria-label' && !attr.value.trim()) {
                  results.ariaIssues.push({
                    issue: 'empty aria-label',
                    tag: el.tagName.toLowerCase(),
                    class: el.className.toString().slice(0, 40),
                  });
                }
              }
            }

            // Images sans alt
            for (const img of document.querySelectorAll('img')) {
              if (results.images.length >= 30) break;
              const alt = img.getAttribute('alt');
              const role = img.getAttribute('role');
              const isDecorative = role === 'presentation' || alt === '';
              results.images.push({
                src: img.src.slice(0, 80),
                alt: alt || null,
                hasAlt: !!alt,
                isDecorative,
                width: img.width,
                height: img.height,
              });
            }

            // Formulaires
            for (const form of document.querySelectorAll('form')) {
              const inputs = form.querySelectorAll('input, select, textarea');
              results.forms.push({
                action: form.action,
                method: form.method,
                inputCount: inputs.length,
                hasLabels: [...inputs].every(inp => {
                  const id = inp.id;
                  const label = id ? document.querySelector(`label[for="${id}"]`) : null;
                  const ariaLabel = inp.getAttribute('aria-label');
                  const ariaLabelledby = inp.getAttribute('aria-labelledby');
                  return label || ariaLabel || ariaLabelledby || inp.type === 'hidden';
                }),
              });
            }

            // Liens
            for (const link of document.querySelectorAll('a[href]')) {
              if (results.links.length >= 30) break;
              const text = (link.textContent || '').trim();
              const href = link.href;
              results.links.push({
                href: href.slice(0, 100),
                text: text.slice(0, 60) || '[pas de texte]',
                hasText: !!text,
                isExternal: href.startsWith('http') && !href.startsWith(window.location.origin),
              });
            }

            return results;
          }, { selectors: CONFIG.selectors });

          // ── 2. Audit reduced-motion (reprise ux-smoke.mjs) ──
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.waitForTimeout(CONFIG.reducedMotion.waitAfterEnable);
          
          const rmInfinite = await page.evaluate(({ allowedClasses }) => {
            const LOADING_OK = new RegExp(`(^|\\s)(${allowedClasses.join('|')})(\\s|$)`);
            const out = [];
            for (const a of document.getAnimations()) {
              try {
                if (a.playState !== 'running') continue;
                const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
                if (!timing || timing.iterations !== Infinity) continue;
                const el = a.effect && a.effect.target;
                const cls = el && el.className != null
                  ? String(el.className.baseVal !== undefined ? el.className.baseVal : el.className)
                  : '';
                if (LOADING_OK.test(cls)) continue;
                out.push({
                  name: a.animationName || a.id || 'anim',
                  element: el ? el.tagName.toLowerCase() + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : '') : '?',
                  duration: timing.duration,
                  easing: timing.easing,
                });
              } catch (_) {}
            }
            return out;
          }, { allowedClasses: CONFIG.reducedMotion.allowedInfiniteClasses });

          // Token RM_INFINITE pour compat CI
          console.log(`RM_INFINITE=${JSON.stringify(rmInfinite.slice(0, 12))}`);

          // ── 3. Audit contraste (WCAG AA) ──
          // Calcul ratio de contraste simplifié
          const contrastIssues = await page.evaluate(() => {
            function getLuminance(rgb) {
              const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (!match) return null;
              const [_, r, g, b] = match.map(Number);
              const srgb = [r, g, b].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
              });
              return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
            }
            
            function contrastRatio(fg, bg) {
              const l1 = getLuminance(fg);
              const l2 = getLuminance(bg);
              if (l1 === null || l2 === null) return null;
              const lighter = Math.max(l1, l2);
              const darker = Math.min(l1, l2);
              return (lighter + 0.05) / (darker + 0.05);
            }

            const issues = [];
            const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, li, td, th, label, [role="button"]');
            for (const el of textElements) {
              if (issues.length >= 50) break;
              const s = getComputedStyle(el);
              if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
              const text = (el.textContent || '').trim();
              if (!text) continue;
              
              const fg = s.color;
              let bg = s.backgroundColor;
              // Chercher fond effectif
              if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
                let e = el.parentElement;
                while (e && e !== document.documentElement) {
                  const ps = getComputedStyle(e);
                  if (ps.backgroundColor && ps.backgroundColor !== 'rgba(0, 0, 0, 0)' && ps.backgroundColor !== 'transparent') {
                    bg = ps.backgroundColor;
                    break;
                  }
                  if (ps.backgroundImage !== 'none') {
                    bg = 'image';
                    break;
                  }
                  e = e.parentElement;
                }
              }
              if (bg && bg !== 'image') {
                const ratio = contrastRatio(fg, bg);
                if (ratio !== null) {
                  const fontSize = parseFloat(s.fontSize);
                  const isLarge = fontSize >= 18 || (fontSize >= 14 && s.fontWeight >= 700);
                  const threshold = isLarge ? 3 : 4.5; // WCAG AA
                  if (ratio < threshold) {
                    issues.push({
                      selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
                      text: text.slice(0, 50),
                      fgColor: fg,
                      bgColor: bg,
                      ratio: Math.round(ratio * 100) / 100,
                      threshold,
                      fontSize,
                      isLarge,
                    });
                  }
                }
              }
            }
            return issues;
          });

          allResults.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            timestamp: new Date().toISOString(),
            normal: normalAudit,
            reducedMotion: {
              infiniteAnimations: rmInfinite,
              passed: rmInfinite.length === 0,
            },
            contrast: {
              issues: contrastIssues,
              passed: contrastIssues.length === 0,
            },
          });

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
  const outFile = join(outDir, CONFIG.output.accessibilityJson);
  writeFileSync(outFile, JSON.stringify(allResults, null, 2));
  console.log(`\n[audit-accessibility] Rapport sauvé: ${outFile}`);

  // Résumé
  const totalRmInfinite = allResults.reduce((s, r) => s + (r.reducedMotion?.infiniteAnimations?.length || 0), 0);
  const totalContrastIssues = allResults.reduce((s, r) => s + (r.contrast?.issues?.length || 0), 0);
  const totalAriaIssues = allResults.reduce((s, r) => s + (r.normal?.ariaIssues?.length || 0), 0);
  console.log(`[audit-accessibility] Animations infinies (reduced-motion): ${totalRmInfinite}`);
  console.log(`[audit-accessibility] Problèmes contraste: ${totalContrastIssues}`);
  console.log(`[audit-accessibility] Problèmes ARIA: ${totalAriaIssues}`);
}

main().catch(err => {
  console.error('[audit-accessibility] Erreur fatale:', err);
  process.exit(1);
});