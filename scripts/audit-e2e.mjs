import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const BASE = 'http://localhost:4173';
const AUDIT_DIR = resolve(import.meta.dirname, '..', 'audit');

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' };
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

const findings = [];

function log(msg) { console.log(`[AUDIT] ${msg}`); }
function finding(severity, screen, desc, details = '') {
  findings.push({ severity, screen, desc, details, time: new Date().toISOString() });
  log(`[${severity}] ${screen}: ${desc}`);
}

async function screenshot(page, dir, name, viewport) {
  const folder = resolve(AUDIT_DIR, dir);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  const suffix = viewport.isMobile ? 'mobile' : 'desktop';
  const path = resolve(folder, `${name}-${suffix}.png`);
  await page.screenshot({ path, fullPage: false });
  log(`Screenshot: ${path}`);
  return path;
}

async function inspectVisibility(page, selector, screenName) {
  try {
    const el = await page.$(selector);
    if (!el) return { visible: false, reason: 'not found in DOM' };
    const box = await el.boundingBox();
    const visible = box && box.width > 0 && box.height > 0;
    if (!visible) finding('P1', screenName, `Element not visible: ${selector}`, `boundingBox=${JSON.stringify(box)}`);
    return { visible, box };
  } catch (e) {
    return { visible: false, reason: e.message };
  }
}

async function inspectConsole(page, screenName) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

async function checkButtons(page, screenName) {
  const buttons = await page.$$eval('button, [role="button"], a[href]', els =>
    els.map(el => {
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 50),
        bg: style.backgroundColor,
        color: style.color,
        visible: el.offsetParent !== null,
        rect: el.getBoundingClientRect()
      };
    }).filter(b => b.visible && b.rect.width > 0)
  );

  const ghosts = buttons.filter(b => {
    const bg = b.bg;
    return (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || bg === 'rgb(255, 255, 255)') &&
           b.color === bg;
  });
  if (ghosts.length > 0) {
    finding('P1', screenName, `${ghosts.length} ghost/invisible buttons`, ghosts.map(g => `"${g.text}" bg=${g.bg} color=${g.color}`).join('; '));
  }
  return buttons;
}

async function auditScreen(page, region, route, screenName, viewport, actions = []) {
  log(`\n=== Auditing: ${screenName} (${region}/${route}) viewport=${viewport.isMobile ? 'mobile' : 'desktop'} ===`);

  const url = route.startsWith('http') ? route : `${BASE}${route}`;
  const errors = await inspectConsole(page, screenName);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    finding('P0', screenName, `Failed to load: ${e.message}`);
    return;
  }

  // Wait for app to settle
  await page.waitForTimeout(2000);

  // Execute custom actions
  for (const action of actions) {
    try {
      await action(page);
      await page.waitForTimeout(500);
    } catch (e) {
      finding('P1', screenName, `Action failed: ${e.message}`);
    }
  }

  // Screenshot
  await screenshot(page, `${region}/${screenName}`, screenName, viewport);

  // Check for visible text
  const bodyText = await page.textContent('body');
  if (!bodyText || bodyText.trim().length < 10) {
    finding('P0', screenName, 'Empty page / no visible text');
  }

  // Check for JS errors in console
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Check buttons
  await checkButtons(page, screenName);

  // Check for loading spinners stuck
  const spinners = await page.$$('.loading, .spinner, [class*="loading"], [class*="spinner"]');
  for (const sp of spinners) {
    const visible = await sp.isVisible().catch(() => false);
    if (visible) {
      finding('P2', screenName, 'Loading spinner still visible after 2s');
    }
  }

  log(`Console errors: ${consoleErrors.length}`);
  consoleErrors.forEach(e => finding('P2', screenName, `Console error: ${e.slice(0, 100)}`));

  return { bodyText: bodyText?.slice(0, 200), consoleErrors };
}

// === GP Screens ===
const GP_SCREENS = [
  { name: 'home', route: '/', actions: [] },
  { name: 'map', route: '/', actions: [
    async (p) => { /* wait for map to render */ await p.waitForTimeout(1000); }
  ] },
  { name: 'beach-detail', route: '/plages/les-salines-martinique/', actions: [] },
  { name: 'paywall', route: '/?paywall=1', actions: [] },
  { name: 'list', route: '/', actions: [
    async (p) => {
      // Click "Liste" tab in BottomNav
      const tabs = await p.$$('button');
      for (const tab of tabs) {
        const text = await tab.textContent();
        if (text?.includes('Liste') || text?.includes('list')) {
          await tab.click();
          break;
        }
      }
    }
  ] },
  { name: 'account', route: '/', actions: [
    async (p) => {
      // Try to open account sheet via avatar
      const avatar = await p.$('[data-testid="account-btn"], [data-testid="avatar-btn"], header button:last-child');
      if (avatar) await avatar.click();
    }
  ] },
];

// Screens with deep links
const DEEP_LINK_SCREENS = [
  { name: 'alertes', route: '/alertes/', region: 'gp' },
  { name: 'previsions', route: '/previsions/', region: 'gp' },
  { name: 'carte-sargasses', route: '/carte-sargasses/', region: 'gp' },
  { name: 'plages-sans-sargasses', route: '/plages-sans-sargasses/', region: 'gp' },
  { name: 'danger-h2s', route: '/danger-sargasses-h2s/', region: 'gp' },
  { name: 'faq', route: '/faq/', region: 'gp' },
  { name: 'fiabilite', route: '/fiabilite/', region: 'gp' },
  { name: 'a-propos', route: '/a-propos/', region: 'gp' },
];

async function main() {
  log('Starting comprehensive audit...');

  const browser = await chromium.launch({ headless: true });

  // === MOBILE AUDIT (primary — iPhone 12) ===
  log('\n\n========== MOBILE VIEWPORT (390×844) ==========');
  const mobileCtx = await browser.newContext({ ...MOBILE, viewport: { width: MOBILE.width, height: MOBILE.height } });
  const mobilePage = await mobileCtx.newPage();

  for (const screen of GP_SCREENS) {
    await auditScreen(mobilePage, 'gp', screen.route, screen.name, MOBILE, screen.actions);
  }

  for (const screen of DEEP_LINK_SCREENS) {
    await auditScreen(mobilePage, screen.region, screen.route, screen.name, MOBILE);
  }

  await mobileCtx.close();

  // === DESKTOP AUDIT ===
  log('\n\n========== DESKTOP VIEWPORT (1440×900) ==========');
  const desktopCtx = await browser.newContext({ ...DESKTOP, viewport: { width: DESKTOP.width, height: DESKTOP.height } });
  const desktopPage = await desktopCtx.newPage();

  for (const screen of GP_SCREENS) {
    await auditScreen(desktopPage, 'gp', screen.route, screen.name, DESKTOP, screen.actions);
  }

  for (const screen of DEEP_LINK_SCREENS) {
    await auditScreen(desktopPage, screen.region, screen.route, screen.name, DESKTOP);
  }

  await desktopCtx.close();

  // === PAYMENT FLOW AUDIT ===
  log('\n\n========== PAYMENT FLOW AUDIT ==========');
  const payCtx = await browser.newContext({ ...MOBILE, viewport: { width: MOBILE.width, height: MOBILE.height } });
  const payPage = await payCtx.newPage();

  // Open paywall
  await payPage.goto(`${BASE}/?paywall=1`, { waitUntil: 'networkidle', timeout: 15000 });
  await payPage.waitForTimeout(2000);
  await screenshot(payPage, 'gp/paywall', 'paywall-initial', MOBILE);

  // Look for CTA button
  const ctaButtons = await payPage.$$('button');
  let ctaTexts = [];
  for (const btn of ctaButtons) {
    const text = await btn.textContent();
    const visible = await btn.isVisible().catch(() => false);
    if (visible && text) ctaTexts.push(text.trim());
  }
  log(`Paywall CTA buttons found: ${JSON.stringify(ctaTexts)}`);

  // Check if Mollie checkout overlay exists
  const mollieOverlay = await payPage.$('[class*="mollie"], [class*="checkout"], iframe[src*="mollie"]');
  log(`Mollie overlay present: ${!!mollieOverlay}`);

  // Check email input
  const emailInput = await payPage.$('input[type="email"], input[name="email"]');
  log(`Email input present: ${!!emailInput}`);

  await payCtx.close();
  await browser.close();

  // === WRITE FINDINGS ===
  const findingsPath = resolve(AUDIT_DIR, 'findings', 'audit-findings.json');
  writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
  log(`\n\nTotal findings: ${findings.length}`);
  log(`P0: ${findings.filter(f => f.severity === 'P0').length}`);
  log(`P1: ${findings.filter(f => f.severity === 'P1').length}`);
  log(`P2: ${findings.filter(f => f.severity === 'P2').length}`);

  // Write summary
  const summaryPath = resolve(AUDIT_DIR, 'findings', 'audit-summary.md');
  const summary = `# Audit Summary — ${new Date().toISOString()}

## Viewports
- Mobile: 390×844 (iPhone 12, DPR 2, Safari UA)
- Desktop: 1440×900

## Screens Audited
${GP_SCREENS.map(s => `- ${s.name}: ${s.route}`).join('\n')}
${DEEP_LINK_SCREENS.map(s => `- ${s.name}: ${s.route}`).join('\n')}

## Findings
${findings.map(f => `### [${f.severity}] ${f.screen}\n${f.desc}\n${f.details ? `Details: ${f.details}` : ''}\n`).join('\n---\n\n')}

## Totals
- P0: ${findings.filter(f => f.severity === 'P0').length}
- P1: ${findings.filter(f => f.severity === 'P1').length}
- P2: ${findings.filter(f => f.severity === 'P2').length}
`;
  writeFileSync(summaryPath, summary);
  log(`Summary written to ${summaryPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
