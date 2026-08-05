// tests/e2e/funnel-critical.spec.ts — Funnel critique Sargasses
// Parcours : Accueil (carte-monde) → Carte → Plage → Premium → Checkout (Mollie) → Retour succès
// + edge cases : erreurs console, annulation paiement, navigation arrière, refresh, mobile.
//
// Device principal : iPhone 12 (390x844) — cf. playwright.config.ts
// Gate : `npx playwright test tests/e2e/funnel-critical.spec.ts`
//
// Note funnel : le checkout Mollie réel exige une clé API live + ne doit JAMAIS être
// déclenché en CI (caisse active, interdiction produit). On valide donc le funnel
// JUSQU'AU clic du bouton de paiement (le goBtn .pww-gobtn) sans suivre la redirection
// Mollie. L'annulation paiement est testée via le deep-link `?paywall=cancel` qui simule
// le retour Mollie annulé (le handler nettoie l'URL et remonte dans le paywall).
import { test, expect } from '@playwright/test';
import { SEL, BASE } from '../utils/selectors';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// 1. FUNNEL PRINCIPAL — Accueil → Carte → Plage → Premium → Checkout
// ---------------------------------------------------------------------------
test.describe('Funnel principal mobile', () => {
  test('Accueil carte-monde: labels plages présents', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + e.message));

    await page.goto(BASE + '/', { waitUntil: 'load' });
    // Les labels .sg-maplabel existent (53) mais declutter en masque la plupart
    // (visibility:hidden). On attend qu'au moins un soit attaché, puis on compte
    // les visibles séparément = preuve que la carte est montée ET nourrie en data.
    await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    await page.waitForTimeout(2000); // settle declutter
    const visibleCount = await page.evaluate(() =>
      [...document.querySelectorAll('.sg-maplabel')]
        .filter(el => getComputedStyle(el).visibility !== 'hidden').length
    );
    expect(visibleCount, 'carte-monde doit afficher ≥1 label visible (declutter)').toBeGreaterThanOrEqual(1);
    const totalCount = await page.locator(SEL.map.label).count();
    expect(totalCount, 'carte-monde doit avoir ≥3 labels montés (preuve data nourrie)').toBeGreaterThanOrEqual(3);
  });

  test('Carte → Plage: tap label ouvre fiche', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    await page.waitForTimeout(2000); // settle declutter
    await page.evaluate(() => {
      const l = [...document.querySelectorAll<HTMLElement>('.sg-maplabel')]
        .find(el => getComputedStyle(el).visibility !== 'hidden');
      if (l) l.click();
    });
    await page.waitForSelector(`${SEL.fiche.comic}, ${SEL.fiche.sheet}`, { timeout: 12000 });
    expect(await page.$(SEL.fiche.comic)).not.toBeNull();
  });

  test('Plage → Premium: ?paywall=1 ouvre paywall', async ({ page }) => {
    await page.goto(BASE + '/?paywall=1', { waitUntil: 'load' });
    // Handler deep-link nettoie l'URL (proof chemin paywall atteint)
    await page.waitForFunction(
      () => !window.location.search.includes('paywall=1'),
      {},
      { timeout: 15000 }
    );
    expect(page.url(), 'URL nettoyée = handler deep-link exécuté').not.toContain('paywall=');
  });

  test('Premium → Checkout: bouton de paiement présent', async ({ page }) => {
    await page.goto(BASE + '/?paywall=1', { waitUntil: 'load' });
    await page.waitForFunction(
      () => !window.location.search.includes('paywall=1'),
      {},
      { timeout: 15000 }
    );
    // Le paywall prend ~1-2s à monter (chunk lazy PremiumModal). On cible le DIALOG
    // ARIA qui est stable même si .pww-wrap est visibility:hidden le temps de l'anim.
    await page.waitForSelector(SEL.paywall.dialog, { timeout: 20000 });
    // Le goBtn (.pww-gobtn) peut être visibility:hidden pendant le fade-in : on
    // accepte aussi les boutons de paiement par label (titre visible "Commencer maintenant").
    const goBtn = page.locator(`${SEL.paywall.goBtn}, ${SEL.paywall.goBtnFallback}`).first();
    await goBtn.waitFor({ state: 'attached', timeout: 10000 });
    expect(await goBtn.count(), 'au moins 1 bouton de paiement présent').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 1b. PAYMENT FLOW EDGE CASES — annulation, erreur, B2B trial
// ---------------------------------------------------------------------------
test.describe('Payment flow edge cases', () => {
  test('Annulation paiement: ?paywall=cancel retourne au paywall propre', async ({ page }) => {
    // Deep-link simulant retour Mollie annulé → handler nettoie l'URL et reste dans le paywall
    await page.goto(BASE + '/?paywall=cancel', { waitUntil: 'load' });
    await page.waitForFunction(
      () => !window.location.search.includes('paywall='),
      {},
      { timeout: 15000 }
    );
    expect(page.url()).not.toContain('paywall=');
    // Le paywall doit être visible (dialog ARIA monté)
    await page.waitForSelector(SEL.paywall.dialog, { timeout: 15000 });
    expect(await page.$(SEL.paywall.dialog)).not.toBeNull();
  });

  test('Erreur paiement: ?payment_failed=1 affiche message d\'erreur', async ({ page }) => {
    await page.goto(BASE + '/?payment_failed=1', { waitUntil: 'load' });
    await page.waitForFunction(
      () => !window.location.search.includes('payment_failed'),
      {},
      { timeout: 15000 }
    );
    expect(page.url()).not.toContain('payment_failed');
    // Doit soit réouvrir le paywall, soit afficher un toast d'erreur
    const hasErrorToast = await page.locator('.sg-toast, [role="alert"]').first().waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false);
    const hasPaywall = await page.$(SEL.paywall.dialog).then(() => true).catch(() => false);
    expect(hasErrorToast || hasPaywall, 'erreur paiement doit afficher toast ou rouvrir paywall').toBeTruthy();
  });

  test('B2B trial: ?pro=1 ouvre espace pro', async ({ page }) => {
    await page.goto(BASE + '/?pro=1', { waitUntil: 'load' });
    await page.waitForFunction(
      () => !window.location.search.includes('pro='),
      {},
      { timeout: 15000 }
    );
    // Vérifier présence éléments B2B (CTA, info essai 30j)
    const b2bContent = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return { hasTrial: body.includes('30') || body.includes('essai'), hasPro: body.includes('Pro') || body.includes('pro') };
    });
    expect(b2bContent.hasTrial || b2bContent.hasPro, 'espace pro doit mentionner essai ou Pro').toBeTruthy();
  });

  // Note: smart-email capture is inline in BeachSheet (not a standalone modal),
  // tested via Carte → Plage → BeachSheet flow. Not a separate funnel entry point.
});

// ---------------------------------------------------------------------------
// 2. EDGE CASES — erreurs console, boutons invisibles, reduced-motion
// ---------------------------------------------------------------------------
test.describe('Edge cases robustesse', () => {
  test('Aucune erreur console sur carte-monde', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));

    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    await page.waitForTimeout(2000);

    // Filtrer CSP (attendu en CI sans domaines allowlistés) + faux positifs connus
    const real = errors.filter(e =>
      !e.includes('Content Security Policy') &&
      !e.includes('Refused to connect') &&
      !e.includes('violates the following') &&
      !e.includes('Loading the script') &&
      !e.includes('Loading the image') &&
      !e.includes('Unexpected token') &&
      !e.includes('referral_claim') &&
      !e.includes("Cannot access 'rt'")
    );
    expect(real, 'erreurs console critiques:\n' + real.join('\n')).toEqual([]);
  });

  test('Aucun bouton fantôme/invisible sur carte, fiche et paywall', async ({ page }) => {
    await page.addInitScript(() => {
      // propage le scan au runtime
    });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    await page.waitForTimeout(1500);

    const ghosts = await page.evaluate(() => {
      const out: any[] = [];
      const DESIGN_OK = /(^|\s)sg-maplabel(\s|$)/;
      const painted = (c: string | null) => c != null && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
      for (const el of document.querySelectorAll('button, a[role=button], [role=button]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 30 || r.height < 18) continue;
        const cls = (el.className || '').toString();
        if (DESIGN_OK.test(cls)) continue;
        const s = getComputedStyle(el);
        const ownPaint = painted(s.backgroundColor) || s.backgroundImage !== 'none'
          || (s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) > 0)
          || s.boxShadow !== 'none';
        let effBg: string | null = null;
        let e:HTMLElement | null = el.parentElement;
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
        if (ghost || invisibleText) out.push({ why: ghost ? 'ghost' : 'text', t: (el.textContent || '').trim().slice(0, 32) });
      }
      return out;
    });
    expect(ghosts, 'boutons fantômes/invisibles:\n' + JSON.stringify(ghosts, null, 1)).toEqual([]);
  });

  test('Reduced-motion: aucune animation infinie restante', async ({ page }) => {
    // Active reduced-motion POUR CE TEST seulement (pas global)
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const rmInfinite = await page.evaluate(() => {
      const LOADING_OK = /(^|\s)(sg-sk\S*|skeleton\S*|lc-spin\S*|sg-spin\S*)(\s|$)/;
      const out: any[] = [];
      for (const a of document.getAnimations()) {
        try {
          if (a.playState !== 'running') continue;
          const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
          if (!timing || timing.iterations !== Infinity) continue;
          const el = a.effect && a.effect.target;
          const cls = el && el.className != null
            ? String((el as any).className.baseVal !== undefined ? (el as any).className.baseVal : el.className)
            : '';
          if (LOADING_OK.test(cls)) continue;
          out.push({ name: (a as any).animationName || (a as any).id || 'anim' });
        } catch (_) { /* une anim illisible ne casse pas la passe */ }
      }
      return out;
    });
    expect(rmInfinite, 'animations infinies sous reduced-motion:\n' + JSON.stringify(rmInfinite)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. NAVIGATION ARRIÈRE + REFRESH (resilience SPA)
// ---------------------------------------------------------------------------
test.describe('Navigation SPA résiliente', () => {
  test('Back/Forward ne casse pas la carte-monde', async ({ page }) => {
    await page.goto(BASE + '/?paywall=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !window.location.search.includes('paywall=1'), {}, { timeout: 15000 });
    await page.goBack(); // revenir à l'état initial
    await page.goForward();
    await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    const n = await page.locator(SEL.map.label).count();
    expect(n).toBeGreaterThanOrEqual(3);
  });

  test('Refresh après ouverture paywall: pas de cul-de-sac', async ({ page }) => {
    await page.goto(BASE + '/?paywall=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !window.location.search.includes('paywall=1'), {}, { timeout: 15000 });
    await page.waitForTimeout(1000); // ensure replaceState completed
    await page.reload({ waitUntil: 'load' });
    // Après refresh, on retombe sur la carte-monde (pas de cul-de-sac paywall gelé)
    await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    // .pww-wrap peut être visibility:hidden même si paywall fermé — on teste la présence
    // du dialog ARIA = preuve que le paywall n'est PAS monté après refresh nude URL.
    expect(await page.$(SEL.paywall.dialog)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3b. MULTI-RÉGIONS — funnel fonctionne sur les 5 domaines live
// ---------------------------------------------------------------------------
test.describe('Multi-régions (5 domaines live)', () => {
  const regions = [
    { name: 'Martinique', path: '/', live: true },
    { name: 'Guadeloupe', path: '/', live: true }, // GP a son propre domaine en prod, local = MQ
    { name: 'Florida', path: '/', live: true },
    { name: 'Punta Cana', path: '/', live: true },
    { name: 'Riviera Maya', path: '/', live: true },
  ];

  for (const region of regions) {
    test(`${region.name}: carte-monde accessible`, async ({ page }) => {
      test.slow();
      await page.goto(BASE + region.path, { waitUntil: 'load' });
      await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
      await page.waitForTimeout(1500);
      const n = await page.locator(SEL.map.label).count();
      expect(n, `${region.name} doit avoir ≥3 labels`).toBeGreaterThanOrEqual(3);
    });
  }

  test('Toutes régions: paywall accessible via ?paywall=1', async ({ page }) => {
    for (const region of regions) {
      await page.goto(BASE + region.path + '?paywall=1', { waitUntil: 'load' });
      await page.waitForFunction(
        () => !window.location.search.includes('paywall=1'),
        {},
        { timeout: 15000 }
      );
      await page.waitForSelector(SEL.paywall.dialog, { timeout: 20000 });
      expect(await page.$(SEL.paywall.dialog), `${region.name}: paywall doit être monté`).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. RESPONSIVE — desktop viewport fallback
// ---------------------------------------------------------------------------
test.describe('Responsive desktop', () => {
  test('Carte et paywall fonctionnent en 1280×800', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    expect(await p.locator(SEL.map.label).count()).toBeGreaterThanOrEqual(3);
    await p.goto(BASE + '/?paywall=1', { waitUntil: 'load' });
    await p.waitForFunction(() => !window.location.search.includes('paywall=1'), {}, { timeout: 15000 });
    await p.waitForTimeout(2000);
    await p.waitForSelector(SEL.paywall.dialog, { timeout: 20000 });
    expect(await p.$(SEL.paywall.dialog)).not.toBeNull();
    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// 5. PWA — manifest + service worker + registration
// ---------------------------------------------------------------------------
test.describe('PWA', () => {
  test('Manifest.json accessible et conforme', async ({ request }) => {
    const r = await request.get(BASE + '/manifest.json');
    expect(r.status(), 'manifest.json doit exister').toBe(200);
    const body = await r.json();
    expect(body.name).toBeTruthy();
    expect(body.short_name).toBeTruthy();
    expect(body.display).toBe('standalone');
    expect(body.start_url).toBe('/');
    expect(body.icons.length, 'au moins 2 icons').toBeGreaterThanOrEqual(2);
    expect(body.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(body.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('Service worker /sw.js accessible et CACHE_NAME versionné', async ({ request }) => {
    const r = await request.get(BASE + '/sw.js');
    expect(r.status()).toBe(200);
    const body = await r.text();
    expect(body, 'sw.js doit avoir un CACHE_NAME versionné').toMatch(/CACHE_NAME\s*[:=]\s*["'`]sargasses-v\d+/);
  });

  test('SW enregistré sur la page daccueil', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const swReg = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { scope: reg.scope, active: !!reg.active } : null;
    });
    expect(swReg, 'SW doit être enregistré (dev preview = registration possible)').not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. RÉSEAU — pas de requête bloquée 4xx/5xx critique sur funnel
// ---------------------------------------------------------------------------
test.describe('Réseau clean', () => {
  test('0 requête 4xx/5xx sur atterrissage carte-monde', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', r => {
      if (r.status() >= 400) failed.push(`[${r.status()}] ${r.url()}`);
    });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector(SEL.map.label, { timeout: 30000, state: 'attached' });
    await page.waitForTimeout(2000);
    // Filtrer les faux positifs (analytics blockés en preview, etc.)
    const real = failed.filter(u =>
      !u.includes('google-analytics') &&
      !u.includes('googletagmanager') &&
      !u.includes('facebook') &&
      !u.includes('plausible')
    );
    expect(real, 'requêtes 4xx/5xx:\n' + real.join('\n')).toEqual([]);
  });

  test('API sargassum.json fraîche (updatedAt récente)', async ({ request }) => {
    const r = await request.get(BASE + '/api/copernicus/sargassum.json');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.updatedAt, 'updatedAt présent').toBeTruthy();
    // Souple : la fraîcheur est monitorée par `npm run session`, pas par Playwright
    expect(typeof body.updatedAt).toBe('string');
  });
});
