// tests/utils/selectors.ts — Selectors centralisés Sargasses (data-≠testid).
// Le codebase n'utilise PAS de data-testid (audit 2026-08-02). On retombe sur des
// selectors structurels stables : classes CSS (.sg-maplabel, .pww-wrap, .sg-modal-panel),
// rôles ARIA, et texte. À migrer progressivement vers data-testid quand on touche
// une surface (peu de churn, stable dans le temps).
//
// MAINTENIR CETTE SOURCE DE VÉRITÉ — toute spec E2E doit importer d'ici.

export const SEL = {
  // Carte-monde (atterrissage CARTE-FIRST)
  map: {
    label: '.sg-maplabel',
  },
  // Fiche plage (ComicDetail flag mapdetail, sinon BeachSheet .sheet)
  fiche: {
    comic: '.lc-detail',
    sheet: '.sheet',
  },
  // Paywall (PremiumModal) — on cible le DIALOG ARIA (stable, monté même si le
  // panel .pww-wrap a visibility:hidden pendant l'animation lazy) plutôt que le
  // wrapper qui peut être temporairement invisible.
  paywall: {
    wrapper: '.pww-wrap',
    panel: '.sg-modal-panel',
    dialog: '[role="dialog"][aria-modal="true"]',
    goBtn: '.pww-gobtn',
    goBtnFallback: 'button:has-text("Commencer maintenant"), button:has-text("Acheter le pass"), button:has-text("Start now"), button:has-text("Comprar")',
    plan: '.pww-plan',
    planOn: '.pww-plan.on',
    close: '.sg-modal-panel [aria-label*="lose"], .pww-wrap [aria-label*="lose"]',
  },
  // Deep links (portes de conversion depuis l'URL — reverse-engineered)
  deepLinks: {
    paywall: '?paywall=1',
    hero: '?hero=1',
    homeAZ: '?home_az=1',
  },
} as const;

export const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173';

export async function waitForFunnel(p: import('@playwright/test').Page, surface: 'map' | 'fiche' | 'paywall', timeout = 15000) {
  switch (surface) {
    case 'map':
      await p.waitForSelector(SEL.map.label, { timeout });
      break;
    case 'fiche':
      await p.waitForSelector(`${SEL.fiche.comic}, ${SEL.fiche.sheet}`, { timeout });
      break;
    case 'paywall':
      await p.waitForSelector(`${SEL.paywall.wrapper}, ${SEL.paywall.panel}`, { timeout });
      break;
  }
}
