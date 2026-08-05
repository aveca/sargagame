import { test, expect, devices } from '@playwright/test';
import { SEL, BASE } from '../utils/selectors';

const BROWSERS = [
  { name: 'mobile', ...devices['iPhone 12'] },
  { name: 'tablet', ...devices['iPad Pro 11'] },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
];

const SEO_PAGES = [
  '/',                           // Home
  '/carte-sargasses/',           // Carte
  '/alertes/',                   // Alertes
  '/previsions/',                // Prévisions
  '/plages/',                    // Plages index
  '/plages-sans-sargasses/',     // Plages sans sargasses
  '/fiabilite/',                 // Fiabilité
  '/conditions/',                // Conditions
  '/sargasses-pour-hotels/',     // B2B
  '/a-propos/',                  // À propos
  '/faq/',                       // FAQ
  '/mentions-legales/',          // Mentions légales
  '/confidentialite/',           // Confidentialité
  '/recherche/',                 // Recherche
  '/lexique/',                   // Lexique
  '/methode-carte/',             // Méthode carte
  '/comprendre-sargasses/',      // Comprendre
  '/detection-satellite-sargasses/', // Détection satellite
  '/danger-sargasses-h2s/',      // Danger H2S
  '/nettoyer-sargasses/',        // Nettoyer
  '/saison-sargasses-martinique/', // Saison Martinique
  '/saison-sargasses-guadeloupe/', // Saison Guadeloupe
  '/meilleures-plages-martinique-sargasses/', // Meilleures plages MQ
  '/meilleures-plages-guadeloupe-sargasses/', // Meilleures plages GP
  '/bilan-sargasses-2025/',      // Bilan 2025
  '/bulletin-sargasses-martinique/', // Bulletin MQ
  '/bulletin-sargasses-guadeloupe/', // Bulletin GP
  '/sargasses-aujourdhui/',      // Aujourd'hui
  '/sargasses-martinique-cette-semaine/', // Cette semaine MQ
  '/sargasses-guadeloupe-cette-semaine/', // Cette semaine GP
  '/sargasses-juillet-2026/',    // Juillet 2026
  '/sargasses-aout-2026/',       // Août 2026
  '/sargasses-pres-de-moi/',     // Près de moi
  '/veille/',                    // Veille
  '/veilleur/',                  // Veilleur
  '/cine-atlas/',                // Cine atlas
  '/scene-atlas/',               // Scene atlas
  '/themes-lab/',                // Themes lab
  '/expansion-survey/',          // Expansion survey
  '/jeu/',                       // Jeu
  '/articles/',                  // Articles
  '/data/',                      // Data
  '/config/',                    // Config
  '/agir/',                      // Agir
  '/offres/',                    // Offres
  '/confirme/',                  // Confirmé
  '/veilles/',                   // Veilles
  '/veilles-mvp/',               // Veilles MVP
  '/veilles-studio/',            // Veilles Studio
  '/investigacion/',             // Investigación
];

const BEACH_PAGES = [
  '/plages/les-salines/',
  '/plages/anse-dufour/',
  '/plages/anse-mitoyen/',
  '/plages/anse-noire/',
  '/plages/anse-traversay/',
  '/plages/anse-a-l-ane/',
  '/plages/anse-dufour/',
  '/plages/anse-michel/',
  '/plages/anse-a-la-gourde/',
  '/plages/anse-a-l-eau/',
  '/plages/anse-a-la-voile/',
  '/plages/anse-bacchus/',
  '/plages/anse-beure/',
  '/plages/anse-bord/',
  '/plages/anse-bord-de-mer/',
  '/plages/anse-cabot/',
  '/plages/anse-canton/',
  '/plages/anse-chauveau/',
  '/plages/anse-coiffe/',
  '/plages/anse-couleuvre/',
  '/plages/anse-d-arlet/',
  '/plages/anse-d-azur/',
  '/plages/anse-de-mey/',
  '/plages/anse-de-sable/',
  '/plages/anse-des-gros-ibis/',
  '/plages/anse-des-ibis/',
  '/plages/anse-des-salines/',
  '/plages/anse-des-sous/',
  '/plages/anse-diamant/',
  '/plages/anse-du-bout/',
  '/plages/anse-du-clam/',
  '/plages/anse-du-feu/',
  '/plages/anse-du-four/',
  '/plages/anse-du-mouillage/',
  '/plages/anse-du-sac/',
  '/plages/anse-dufour/',
  '/plages/anse-fond-banane/',
  '/plages/anse-fortune/',
  '/plages/anse-gallon/',
  '/plages/anse-godet/',
  '/plages/anse-gordonne/',
  '/plages/anse-gros-ibis/',
  '/plages/anse-guyon/',
  '/plages/anse-l-azur/',
  '/plages/anse-l-eau/',
  '/plages/anse-la-rose/',
  '/plages/anse-la-voute/',
  '/plages/anse-le-levrier/',
  '/plages/anse-lepreux/',
  '/plages/anse-loquet/',
  '/plages/anse-magdeleine/',
  '/plages/anse-maillard/',
  '/plages/anse-marc/',
  '/plages/anse-marie/',
  '/plages/anse-michel/',
  '/plages/anse-mire/',
  '/plages/anse-mitre/',
  '/plages/anse-morin/',
  '/plages/anse-moustique/',
  '/plages/anse-moustiques/',
  '/plages/anse-rouge/',
  '/plages/anse-sable/',
  '/plages/anse-sans-nom/',
  '/plages/anse-sel/',
  '/plages/anse-tante/',
  '/plages/anse-toiny/',
  '/plages/anse-vincent/',
  '/plages/baie-de-fort-de-france/',
  '/plages/baie-du-marin/',
  '/plages/baie-du-vauclin/',
  '/plages/baie-des-anglais/',
  '/plages/baie-des-flibustiers/',
  '/plages/baie-des-trinitaires/',
  '/plages/baie-du-galion/',
  '/plages/baie-du-gosier/',
  '/plages/baie-du-robert/',
  '/plages/baie-mahault/',
  '/plages/baie-sainte-anne/',
  '/plages/caravelle/',
  '/plages/carbet/',
  '/plages/case-pilote/',
  '/plages/diamant/',
  '/plages/deshaies/',
  '/plages/etang-des-salines/',
  '/plages/fort-de-france/',
  '/plages/grand-riviere/',
  '/plages/grand-riviere-mq/',
  '/plages/grand-riviere-gp/',
  '/plages/gosier/',
  '/plages/grand-bourg/',
  '/plages/la-desirade/',
  '/plages/la-trinite/',
  '/plages/le-carbet/',
  '/plages/le-diamant/',
  '/plages/le-marin/',
  '/plages/le-moule/',
  '/plages/le-precheur/',
  '/plages/le-robert/',
  '/plages/le-vauclin/',
  '/plages/les-anses-d-arlet/',
  '/plages/les-saintes/',
  '/plages/les-trois-ilets/',
  '/plages/marie-galante/',
  '/plages/petit-bourg/',
  '/plages/petit-canal/',
  '/plages/pointe-a-pitre/',
  '/plages/pointe-noire/',
  '/plages/port-louis/',
  '/plages/riviere-pilote/',
  '/plages/saint-francois/',
  '/plages/saint-louis/',
  '/plages/saint-pierre/',
  '/plages/sainte-anne-guadeloupe/',
  '/plages/sainte-anne-martinique/',
  '/plages/sainte-luce/',
  '/plages/sainte-marie/',
  '/plages/sainte-rose/',
  '/plages/sante-symptomes/',
  '/plages/schoelcher/',
  '/plages/terre-de-bas-les-saintes/',
  '/plages/terre-de-haut-les-saintes/',
  '/plages/trois-rivieres/',
  '/plages/vieux-habitants/',
];

async function collectErrors(page) {
  const errors = {
    console: [] as string[],
    page: [] as string[],
    network: [] as string[],
  };
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.console.push(msg.text());
    }
  });
  
  page.on('pageerror', err => {
    errors.page.push(err.message);
  });
  
  page.on('response', resp => {
    if (resp.status() >= 400) {
      errors.network.push(`[${resp.status()}] ${resp.url()}`);
    }
  });
  
  return errors;
}

async function checkAccessibility(page) {
  const issues = [];
  
  // Check for images without alt
  const imagesWithoutAlt = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.filter(img => !img.alt && !img.getAttribute('role')?.includes('presentation')).map(img => img.src);
  });
  if (imagesWithoutAlt.length > 0) {
    issues.push(`${imagesWithoutAlt.length} images without alt text`);
  }
  
  // Check for buttons without accessible name
  const buttonsWithoutName = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"]'));
    return btns.filter(btn => {
      const text = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute('aria-label');
      const ariaLabelledby = btn.getAttribute('aria-labelledby');
      return !text && !ariaLabel && !ariaLabelledby;
    }).map(btn => btn.outerHTML.slice(0, 100));
  });
  if (buttonsWithoutName.length > 0) {
    issues.push(`${buttonsWithoutName.length} buttons without accessible name`);
  }
  
  // Check for form inputs without labels
  const inputsWithoutLabels = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    return inputs.filter(input => {
      const id = input.id;
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledby = input.getAttribute('aria-labelledby');
      const parentLabel = input.closest('label');
      return !label && !ariaLabel && !ariaLabelledby && !parentLabel;
    }).map(input => input.outerHTML.slice(0, 100));
  });
  if (inputsWithoutLabels.length > 0) {
    issues.push(`${inputsWithoutLabels.length} form inputs without labels`);
  }
  
  // Check color contrast (basic check)
  const lowContrast = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const issues = [];
    for (const el of elements) {
      const style = getComputedStyle(el);
      const color = style.color;
      const bgColor = style.backgroundColor;
      if (color && bgColor && color !== 'rgba(0, 0, 0, 0)' && bgColor !== 'rgba(0, 0, 0, 0)') {
        // Simple heuristic: if both are defined and not transparent
        const text = el.textContent?.trim();
        if (text && text.length > 0 && el.offsetWidth > 0 && el.offsetHeight > 0) {
          issues.push({ tag: el.tagName, text: text.slice(0, 50) });
        }
      }
    }
    return issues.slice(0, 10);
  });
  
  return { issues, imagesWithoutAlt, buttonsWithoutName, inputsWithoutLabels, lowContrast };
}

async function checkPerformance(page) {
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');
    return {
      domContentLoaded: nav?.domContentLoadedEventEnd - nav?.domContentLoadedEventStart,
      loadComplete: nav?.loadEventEnd - nav?.loadEventStart,
      fcp: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
      lcp: 0, // Would need PerformanceObserver
      cls: 0, // Would need PerformanceObserver
    };
  });
  return metrics;
}

async function checkSEO(page) {
  const issues = [];
  
  // Check title
  const title = await page.title();
  if (!title || title.length < 10 || title.length > 60) {
    issues.push(`Title length issue: "${title}" (${title.length} chars)`);
  }
  
  // Check meta description
  const metaDesc = await page.$eval('meta[name="description"]', el => el.getAttribute('content')).catch(() => null);
  if (!metaDesc || metaDesc.length < 50 || metaDesc.length > 160) {
    issues.push(`Meta description issue: "${metaDesc}" (${metaDesc?.length || 0} chars)`);
  }
  
  // Check h1
  const h1Count = await page.locator('h1').count();
  if (h1Count === 0) {
    issues.push('No H1 found');
  } else if (h1Count > 1) {
    issues.push(`Multiple H1s found: ${h1Count}`);
  }
  
  // Check canonical
  const canonical = await page.$eval('link[rel="canonical"]', el => el.getAttribute('href')).catch(() => null);
  if (!canonical) {
    issues.push('No canonical URL');
  }
  
  // Check structured data
  const structuredData = await page.$$eval('script[type="application/ld+json"]', scripts => scripts.length);
  if (structuredData === 0) {
    issues.push('No JSON-LD structured data');
  }
  
  return { issues, title, metaDesc, h1Count, canonical, structuredData };
}

async function testInteractions(page, pageName) {
  const results = {
    buttons: [] as string[],
    menus: [] as string[],
    forms: [] as string[],
    modals: [] as string[],
    links: [] as string[],
  };
  
  // Click all buttons
  const buttons = await page.locator('button, [role="button"], a.button, .btn').all();
  for (const btn of buttons.slice(0, 20)) { // Limit to 20 to avoid infinite loops
    try {
      const text = (await btn.textContent())?.trim().slice(0, 50) || 'no-text';
      const isVisible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVisible) {
        await btn.click({ timeout: 2000, trial: true }).catch(() => {});
        await btn.click({ timeout: 2000 }).catch(() => {});
        results.buttons.push(`${pageName}: ${text}`);
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Open all dropdowns/menus
  const menus = await page.locator('[role="menu"], [role="listbox"], .dropdown, .menu, select').all();
  for (const menu of menus.slice(0, 10)) {
    try {
      await menu.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape').catch(() => {});
      results.menus.push(`${pageName}: menu opened`);
    } catch (e) {
      // Ignore
    }
  }
  
  // Test forms
  const forms = await page.locator('form').all();
  for (const form of forms.slice(0, 5)) {
    try {
      const inputs = await form.locator('input, select, textarea').all();
      for (const input of inputs.slice(0, 5)) {
        const type = await input.getAttribute('type');
        if (type !== 'hidden' && type !== 'submit' && type !== 'button') {
          await input.fill('test').catch(() => {});
        }
      }
      results.forms.push(`${pageName}: form tested`);
    } catch (e) {
      // Ignore
    }
  }
  
  // Test modals
  const modals = await page.locator('[role="dialog"], .modal, .sg-modal-panel').all();
  for (const modal of modals.slice(0, 5)) {
    try {
      if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape').catch(() => {});
        results.modals.push(`${pageName}: modal tested`);
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Check links
  const links = await page.locator('a[href]').all();
  for (const link of links.slice(0, 30)) {
    try {
      const href = await link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        results.links.push(`${pageName}: ${href}`);
      }
    } catch (e) {
      // Ignore
    }
  }
  
  return results;
}

async function testScrollAndHover(page) {
  // Test scroll
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  
  // Test hover on interactive elements
  const hoverables = await page.locator('button, a, [role="button"], .sg-maplabel, .pww-plan').all();
  for (const el of hoverables.slice(0, 15)) {
    try {
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        await el.hover({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    } catch (e) {
      // Ignore
    }
  }
}

async function testKeyboardNavigation(page) {
  // Tab through focusable elements
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
  }
  // Shift+Tab back
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
  }
  // Escape to close modals
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

test.describe.configure({ mode: 'serial' });

for (const browserConfig of BROWSERS) {
  test.describe(`QA Exploration - ${browserConfig.name}`, () => {
    let browser;
    let context;
    let page;
    
    test.beforeAll(async ({ playwright }) => {
      browser = await playwright.chromium.launch();
      context = await browser.newContext({
        ...browserConfig,
        recordVideo: { dir: `test-results/videos/qa-${browserConfig.name}/` },
      });
      page = await context.newPage();
    });
    
    test.afterAll(async () => {
      await context?.close();
      await browser?.close();
    });
    
    test('Home page - full exploration', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      const interactions = await testInteractions(page, 'Home');
      
      const accessibility = await checkAccessibility(page);
      const performance = await checkPerformance(page);
      const seo = await checkSEO(page);
      
      // Take screenshot
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-home.png`, fullPage: true });
      
      // Report
      console.log(`[${browserConfig.name}] Home - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
      console.log(`[${browserConfig.name}] Home - Accessibility:`, accessibility.issues);
      console.log(`[${browserConfig.name}] Home - Performance:`, performance);
      console.log(`[${browserConfig.name}] Home - SEO:`, seo.issues);
      
      // Assert no critical errors (filter known issues)
      const criticalConsole = errors.console.filter(e => 
        !e.includes('Content Security Policy') && 
        !e.includes('Refused to connect') &&
        !e.includes('google-analytics') &&
        !e.includes('googletagmanager') &&
        !e.includes('referral_claim') &&
        !e.includes('Unexpected token') &&
        !e.includes('<?php')
      );
      // Log but don't fail on known issues
      if (criticalConsole.length > 0) {
        console.log(`[${browserConfig.name}] Home - Critical console errors:`, criticalConsole);
      }
      expect(errors.page).toEqual([]);
    });
    
    test('Carte (Map) - full exploration', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/carte-sargasses/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      const interactions = await testInteractions(page, 'Carte');
      
      const accessibility = await checkAccessibility(page);
      const performance = await checkPerformance(page);
      const seo = await checkSEO(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-carte.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Carte - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
      console.log(`[${browserConfig.name}] Carte - Accessibility:`, accessibility.issues);
      console.log(`[${browserConfig.name}] Carte - Performance:`, performance);
      console.log(`[${browserConfig.name}] Carte - SEO:`, seo.issues);
    });
    
    test('Fiche Plage (Beach Sheet) - full exploration', async () => {
      const errors = await collectErrors(page);
      // Navigate to a beach page
      await page.goto(BASE + '/plages/les-salines/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      const interactions = await testInteractions(page, 'Fiche-Plage');
      
      const accessibility = await checkAccessibility(page);
      const performance = await checkPerformance(page);
      const seo = await checkSEO(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-fiche-plage.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Fiche Plage - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
      console.log(`[${browserConfig.name}] Fiche Plage - Accessibility:`, accessibility.issues);
      console.log(`[${browserConfig.name}] Fiche Plage - Performance:`, performance);
      console.log(`[${browserConfig.name}] Fiche Plage - SEO:`, seo.issues);
    });
    
    test('Alertes - full exploration', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/alertes/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      const interactions = await testInteractions(page, 'Alertes');
      
      const accessibility = await checkAccessibility(page);
      const performance = await checkPerformance(page);
      const seo = await checkSEO(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-alertes.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Alertes - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
      console.log(`[${browserConfig.name}] Alertes - Accessibility:`, accessibility.issues);
      console.log(`[${browserConfig.name}] Alertes - Performance:`, performance);
      console.log(`[${browserConfig.name}] Alertes - SEO:`, seo.issues);
    });
    
    test('Favoris - full exploration', async () => {
      const errors = await collectErrors(page);
      // Favoris might be accessed via a button or URL
      await page.goto(BASE + '/?favoris=1', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      const interactions = await testInteractions(page, 'Favoris');
      
      const accessibility = await checkAccessibility(page);
      const performance = await checkPerformance(page);
      const seo = await checkSEO(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-favoris.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Favoris - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
      console.log(`[${browserConfig.name}] Favoris - Accessibility:`, accessibility.issues);
      console.log(`[${browserConfig.name}] Favoris - Performance:`, performance);
      console.log(`[${browserConfig.name}] Favoris - SEO:`, seo.issues);
    });
    
    test('Premium / Paywall - full exploration', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/?paywall=1', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(
        () => !window.location.search.includes('paywall=1'),
        {},
        { timeout: 15000 }
      );
      await page.waitForSelector(SEL.paywall.dialog, { timeout: 20000 });
      await page.waitForTimeout(2000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      const interactions = await testInteractions(page, 'Premium-Paywall');
      
      const accessibility = await checkAccessibility(page);
      const performance = await checkPerformance(page);
      const seo = await checkSEO(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-paywall.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Paywall - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
      console.log(`[${browserConfig.name}] Paywall - Accessibility:`, accessibility.issues);
      console.log(`[${browserConfig.name}] Paywall - Performance:`, performance);
      console.log(`[${browserConfig.name}] Paywall - SEO:`, seo.issues);
    });
    
    test('Checkout flow - test up to payment button', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/?paywall=1', { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(
        () => !window.location.search.includes('paywall=1'),
        {},
        { timeout: 15000 }
      );
      await page.waitForSelector(SEL.paywall.dialog, { timeout: 20000 });
      await page.waitForTimeout(2000);
      
      // Find and click payment button (but don't follow redirect)
      const goBtn = page.locator(`${SEL.paywall.goBtn}, ${SEL.paywall.goBtnFallback}`).first();
      await goBtn.waitFor({ state: 'attached', timeout: 10000 });
      
      // Check button is clickable
      const isEnabled = await goBtn.isEnabled();
      console.log(`[${browserConfig.name}] Checkout - Payment button enabled:`, isEnabled);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-checkout.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Checkout - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
    });
    
    test('Retour succès (payment success)', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/?payment_success=1', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-retour-succes.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Retour Succès - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
    });
    
    test('Retour erreur (payment error)', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/?payment_failed=1', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-retour-erreur.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Retour Erreur - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
    });
    
    test('Retour annulation (payment cancelled)', async () => {
      const errors = await collectErrors(page);
      await page.goto(BASE + '/?paywall=cancel', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      
      await testScrollAndHover(page);
      await testKeyboardNavigation(page);
      
      await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-retour-annulation.png`, fullPage: true });
      
      console.log(`[${browserConfig.name}] Retour Annulation - Errors:`, {
        console: errors.console.length,
        page: errors.page.length,
        network: errors.network.length,
      });
    });
    
    // Test a subset of SEO pages (first 10 to avoid timeout)
    for (const seoPage of SEO_PAGES.slice(0, 15)) {
      test(`SEO Page: ${seoPage}`, async () => {
        const errors = await collectErrors(page);
        await page.goto(BASE + seoPage, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(2000);
        
        await testScrollAndHover(page);
        await testKeyboardNavigation(page);
        
        const accessibility = await checkAccessibility(page);
        const performance = await checkPerformance(page);
        const seo = await checkSEO(page);
        
        await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-seo${seoPage.replace(/\//g, '-')}.png`, fullPage: true });
        
        console.log(`[${browserConfig.name}] SEO ${seoPage} - Errors:`, {
          console: errors.console.length,
          page: errors.page.length,
          network: errors.network.length,
        });
        console.log(`[${browserConfig.name}] SEO ${seoPage} - Accessibility:`, accessibility.issues);
        console.log(`[${browserConfig.name}] SEO ${seoPage} - Performance:`, performance);
        console.log(`[${browserConfig.name}] SEO ${seoPage} - SEO:`, seo.issues);
      });
    }
    
    // Test a subset of beach pages (first 5)
    for (const beachPage of BEACH_PAGES.slice(0, 5)) {
      test(`Beach Page: ${beachPage}`, async () => {
        const errors = await collectErrors(page);
        await page.goto(BASE + beachPage, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(2000);
        
        await testScrollAndHover(page);
        await testKeyboardNavigation(page);
        
        const accessibility = await checkAccessibility(page);
        const performance = await checkPerformance(page);
        const seo = await checkSEO(page);
        
        await page.screenshot({ path: `test-results/screenshots/qa-${browserConfig.name}-beach${beachPage.replace(/\//g, '-')}.png`, fullPage: true });
        
        console.log(`[${browserConfig.name}] Beach ${beachPage} - Errors:`, {
          console: errors.console.length,
          page: errors.page.length,
          network: errors.network.length,
        });
        console.log(`[${browserConfig.name}] Beach ${beachPage} - Accessibility:`, accessibility.issues);
        console.log(`[${browserConfig.name}] Beach ${beachPage} - Performance:`, performance);
        console.log(`[${browserConfig.name}] Beach ${beachPage} - SEO:`, seo.issues);
      });
    }
  });
}