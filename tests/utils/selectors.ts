/**
 * tests/utils/selectors.ts — Centralized selectors for Playwright E2E.
 *
 * Canonical selectors for the Sargasses app. ALWAYS use data-testid, role,
 * or aria-label. Falling back to class names is acceptable for stable
 * presentation classes (.sg-modal-panel, .sg-maplabel, .lc-detail) but
 * SHOULD NOT be used for buttons/links (text i18n changes).
 *
 * Devices: iPhone 12 (390×844, Safari, isMobile, hasTouch) — primary.
 * Reduced motion: emulateMedia({ reducedMotion: 'reduce' }).
 */
export const selectors = {
  // ── BottomNav (redesign 2026-08-11) ──────────────────────────────
  // Le composant `BottomNav` (Sargasses_PROD.jsx:3028-3114) n'expose pas
  // encore de data-testid — on cible role=tab + aria-label i18n.
  bottomNav: 'nav.sg-bottom-nav',
  bottomNavTabMap: 'nav.sg-bottom-nav button:has-text("Carte"), nav.sg-bottom-nav button:has-text("Map"), nav.sg-bottom-nav button:has-text("Mapa")',
  bottomNavTabList: 'nav.sg-bottom-nav button:has-text("Plages"), nav.sg-bottom-nav button:has-text("Beaches"), nav.sg-bottom-nav button:has-text("Playas")',
  bottomNavTabPremium: 'nav.sg-bottom-nav button:has-text("Premium")',

  // ── Map / Carte ───────────────────────────────────────────────────
  mapPin: '.sg-maplabel',

  // ── Verdict (fiche plage) ─────────────────────────────────────────
  verdict: '.bsc-sheet, .lc-detail, .sheet',  // comic detail (default) OR legacy ChasseDetail OR fallback BeachSheet
  verdictCloseBtn: '[aria-label="Fermer"], [aria-label="Close"], [aria-label="Cerrar"]',
  verdictForecastUnlockCta:
    'button:has-text("Débloquer 7 jours"), button:has-text("Unlock 7 days"), button:has-text("Desbloquear 7 días")',
  // Legacy CTA label (still emitted by old bundles; kept for rollback tests)
  verdictAlertLegacy: 'button:has-text("Activer mon alerte")',

  // ── Paywall / PremiumModal ─────────────────────────────────────────
  // Le shell modal (.sg-modal-panel + role=dialog + aria-modal) a été
  // restauré le 2026-08-11 (commit adde0af1). `.pww-wrap` est un phantom
  // selector (matches nothing in DOM) — ne PAS l'utiliser.
  paywallModal: '.sg-modal-panel, [role="dialog"][aria-modal="true"]',
  paywallModalStrict: '.sg-modal-panel[role="dialog"][aria-modal="true"]',
  paywallBackdrop: '.sg-modal-panel + .backdrop, .backdrop',
  paywallCloseBtn: '.sg-modal-panel button[aria-label="Fermer"], .sg-modal-panel button[aria-label="Close"], .sg-modal-panel button[aria-label="Cerrar"]',
  paywallPriceEur: 'text=/€/',
  paywallPriceUsd: 'text=/\\$/',
  paywallPass30: 'button:has-text("Pass 30"), button:has-text("Pass 30 days"), button:has-text("Pase 30")',
  paywallStartCta: 'button:has-text("Commencer maintenant"), button:has-text("Get started"), button:has-text("Empezar")',

  // ── Tracking events (intercepted via setupTrackInterceptor) ────────
  // Read localStorage["sg_track_log"] for events. Names:
  events: {
    navTab: 'sg_nav_tab',                  // {tab: map|list|premium}
    beachOpen: 'sg_beach_open',            // {beach_id, status, source}
    premiumModalOpen: 'sg_premium_modal_open',
    premiumModalClose: 'sg_premium_modal_close',
    passCta: 'sg_pass_cta',
    beachCta: 'sg_beach_cta',
  },

  // ── localStorage keys ─────────────────────────────────────────────
  ls: {
    premium: 'sg_premium',
    premiumActivatedAt: 'sg_premium_activated_at',
    passType: 'sg_pass_type',
    passEnd: 'sg_premium_pass_end',
    seenBeach: 'sg_seen_beach',
    relSeen: 'sg_rel_seen',
    trackLog: 'sg_track_log',
    sgEmail: 'sg_email',
  },

  // ── FABs (redesign 2026-08-11 : 2 FABs seulement) ─────────────────
  // Carte droite只剩 SargaChat (96px) + Archipel (150px).
  fabSargaChat: 'button[aria-label="Demander au Veilleur"], button[aria-label="Ask the Watchman"], button[aria-label="Preguntar al Vigía"]',
  fabArchipel: 'button[aria-label="L\'archipel du Veilleur"], button[aria-label="The Watcher\'s archipelago"], button[aria-label="El archipiélago"]',
  fabDiscovery: 'button[aria-label="Comprendre les sargasses"], button[aria-label="Understand sargassum"], button[aria-label="Entender el sargazo"]',  // RETIRED — must NOT be visible
  fabSolutions: 'button[aria-label="Les solutions sargasses"], button[aria-label="Sargassum solutions"], button[aria-label="Soluciones al sargazo"]',  // RETIRED — must NOT be visible
  fab10Postes: 'button[aria-label*="10 postes"], button[aria-label*="10 posts"], button[aria-label*="10 puestos"]',  // RETIRED — must NOT be visible
} as const

export default selectors
