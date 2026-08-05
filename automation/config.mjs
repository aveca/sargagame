/**
 * automation/config.mjs — Configuration centrale pour l'infrastructure d'audit automatisé.
 * 
 * Ce fichier définit toutes les constantes, routes, viewports et sélecteurs utilisés
 * par les scripts d'audit. Modifiable sans toucher au code des scripts.
 */

export const CONFIG = {
  // URL de base du serveur de preview (vite preview)
  baseUrl: process.env.AUDIT_BASE_URL || 'http://localhost:4173',
  
  // Dossier de sortie
  outputDir: process.env.AUDIT_OUTPUT_DIR || 'automation/output',
  
  // Viewports à tester (nom, width, height, deviceScaleFactor, isMobile, hasTouch, userAgent)
  viewports: [
    {
      name: 'mobile',
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    {
      name: 'tablet',
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    {
      name: 'desktop',
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  ],

  // Routes à auditer (path, name, waitForSelector, extraActions)
  routes: [
    // Pages principales
    { path: '/', name: 'home', waitFor: '.sg-maplabel', timeout: 30000 },
    { path: '/plages/', name: 'plages', waitFor: '.sg-maplabel', timeout: 30000 },
    { path: '/alertes/', name: 'alertes', waitFor: 'h1', timeout: 15000 },
    { path: '/previsions/', name: 'previsions', waitFor: 'h1', timeout: 15000 },
    { path: '/faq/', name: 'faq', waitFor: 'h1', timeout: 15000 },
    { path: '/fiabilite/', name: 'fiabilite', waitFor: 'h1', timeout: 15000 },
    { path: '/sargasses-pour-hotels/', name: 'b2b', waitFor: 'h1', timeout: 15000 },
    // Versions linguistiques
    { path: '/en/', name: 'en-home', waitFor: '.sg-maplabel', timeout: 30000 },
    { path: '/es/', name: 'es-home', waitFor: '.sg-maplabel', timeout: 30000 },
    // Parcours funnel (deep-links)
    { path: '/?paywall=1', name: 'paywall', waitFor: '[role="dialog"][aria-modal="true"]', timeout: 20000, isFunnel: true },
    // Fiche plage (via clic sur label)
    { path: '/', name: 'beach-sheet', waitFor: '.lc-detail, .sheet', timeout: 15000, isFunnel: true, action: 'click-first-beach-label' },
  ],

  // Sélecteurs stables (data-testid préférés, fallback sur classes/ARIA)
  // NOTE: :has-text() est un sélecteur Playwright, pas CSS natif.
  // Pour querySelectorAll natif, on utilise des sélecteurs CSS valides seulement.
  selectors: {
    // Carte
    mapLabel: '.sg-maplabel',
    // Fiche plage
    beachSheet: '.lc-detail, .sheet',
    // Paywall
    paywallDialog: '[role="dialog"][aria-modal="true"]',
    paywallGoBtn: '.pww-gobtn, .pww-wrap button, .sg-modal-panel button',
    paywallGoBtnText: ['Commencer', 'Acheter', 'Start', 'Comprar'], // pour fallback texte
    // Boutons génériques
    button: 'button, a[role=button], [role=button]',
    // Toast/alertes
    toast: '.sg-toast, [role="alert"]',
    // Navigation
    header: 'header',
    footer: 'footer',
    // Contenu principal
    main: 'main',
    h1: 'h1',
  },

  // Seuils de performance (budget)
  performanceBudgets: {
    // Core Web Vitals
    lcp: 2500,        // ms
    fid: 100,         // ms
    cls: 0.1,         // score
    fcp: 1800,        // ms
    ttfb: 800,        // ms
    // Bundle
    totalJsGzipped: 210 * 1024,  // 210 Ko
    totalCssGzipped: 50 * 1024,  // 50 Ko
    // Réseau
    maxRequests: 100,
    maxTotalBytes: 2 * 1024 * 1024, // 2 Mo
  },

  // Configuration reduced-motion
  reducedMotion: {
    enabled: true,
    waitAfterEnable: 1500,
    // Classes tolérées pour animations infinies (loaders, skeletons)
    allowedInfiniteClasses: [
      'sg-sk',
      'skeleton',
      'lc-spin',
      'sg-spin',
    ],
  },

  // Configuration capture d'écran
  screenshot: {
    fullPage: true,
    animations: 'disabled', // 'disabled' | 'allow'
    type: 'png',
    quality: 90,
  },

  // Timeouts globaux
  timeouts: {
    navigation: 60000,
    selector: 30000,
    action: 10000,
    screenshot: 5000,
  },

  // Fichiers de sortie
  output: {
    screenshotsDir: 'screenshots',
    reportJson: 'report.json',
    reportHtml: 'report.html',
    reportMd: 'report.md',
    consoleJson: 'console.json',
    networkJson: 'network.json',
    accessibilityJson: 'accessibility.json',
    performanceJson: 'performance.json',
  },
};

export default CONFIG;