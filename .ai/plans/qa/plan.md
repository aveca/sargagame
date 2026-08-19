# QA Agent Plan — Playwright E2E, Visual Regression, Accessibility

## Mission
Playwright E2E, bugs UI, parcours critiques. Stratégie complète: `tests/README.md`.

## Stratégie de test

### Couches
| Couche | Outil | Couverture cible |
|--------|-------|------------------|
| **E2E** | Playwright | 100% funnel principal + B2B + PayPal + responsive + a11y + PWA |
| **Integration** | Playwright + MSW | API Mollie/PayPal, data pipeline, regions validation |
| **Unit** | Vitest / Node test | forecast, confidence, reliability, mollie-lib |

### Device principal
- **iPhone 12**: 390×844, UA Safari, DPR 2, isMobile, hasTouch
- **Reduced motion**: `emulateMedia({reducedMotion:'reduce'})`
- **Couleurs**: `getComputedStyle()` uniquement (jamais capture headless)

### Sélecteurs
- Centralisés: `tests/utils/selectors.ts`
- `data-testid` uniquement (pas de CSS classes instables)

## Priorités P0-P2

### P0 — Gate de ship (bloquant CI)
1. **Smoke funnel** (`scripts/ux-smoke.mjs`)
   - 4 tokens obligatoires:
     - `FUNNEL_REACHED=map+fiche+paywall`
     - `ERRORS=[]`
     - `WHITE_OR_TRANSPARENT_BUTTONS=[]`
     - `RM_INFINITE=[]`

2. **E2E critique** (Playwright)
   - `tests/e2e/funnel-payment.spec.ts` — 15 tests
   - `tests/e2e/contract-pass-one-time.spec.ts` — 2 tests
   - `tests/e2e/bottomnav-redesign.spec.ts` — 8 tests
   - `tests/e2e/b2b-flow.spec.ts` — 3 tests
   - `tests/e2e/responsive.spec.ts` — 3 viewports
   - Target: 100% pass (flaky <2% toléré)

3. **Bundle budget**
   - `node scripts/check-bundle-budget.cjs` → ≤210 Ko gzip eager

4. **PHP lint**
   - `php -l public/api/*.php` → 0 erreurs

### P1 — Régression & Accessibilité
5. **Visual regression** (future)
   - Baseline: screenshots `tests/ui-audit-screenshots/` (25 states × 4 viewports)
   - Diff: pixelmatch threshold 0.1%
   - CI: fail si régression non-intentionnelle

6. **Accessibilité (WCAG 2.1 AA)**
   - Axe-core dans Playwright: `axe-core/playwright`
   - Checks: contraste, focus, ARIA, landmarks, headings
   - Target: 0 violations critiques, <5 mineures

7. **Reduced motion**
   - `emulateMedia({reducedMotion:'reduce'})` sur tous tests
   - `RM_INFINITE=[]` token ux-smoke
   - Animations CSS: `animation: none` / `transition: none`

### P2 — Monitoring & Analytics
8. **Production monitoring**
   - `scripts/ux-smoke.mjs` sur prod (daily-copernicus post-deploy)
   - Alert si tokens non-green
   - Screenshot on failure → artifact GitHub Actions

9. **Performance budgets**
   - Lighthouse CI: Perf >90, A11y >95, BP >90
   - Core Web Vitals: LCP <2.5s, INP <200ms, CLS <0.1
   - Bundle: ≤210 Ko gzip eager

## Test Files Structure
```
tests/
├── e2e/
│   ├── funnel-payment.spec.ts        # 15 tests - funnel principal
│   ├── contract-pass-one-time.spec.ts # 2 tests - contrat Mollie
│   ├── bottomnav-redesign.spec.ts     # 8 tests - BottomNav/FABs/CTA
│   ├── b2b-flow.spec.ts               # 3 tests - B2B trial
│   ├── responsive.spec.ts             # 3 viewports - 320/375/390/1440
│   ├── around-me.spec.ts              # 10 tests - géoloc
│   └── ...
├── integration/
│   ├── mollie-api.spec.ts             # MSW mock Mollie
│   ├── data-pipeline.spec.ts          # ERDDAP fetch
│   └── regions-validation.spec.ts     # 5 régions live
├── unit/
│   ├── forecast.test.js               # drift + accumulation
│   ├── confidence.test.js             # score 0-100%
│   ├── reliability.test.js            # backtest
│   └── mollie-lib.test.js             # handlers
├── utils/
│   ├── selectors.ts                   # data-testid centralisés
│   └── helpers.ts                     # dismissCookie, dismissPremium, etc.
└── ui-audit-screenshots/              # 25 baselines (git tracked)
```

## CI/CD Integration
- `.github/workflows/ci-tests.yml` → lint + tests + build + bundle budget
- `.github/workflows/perf-budget.yml` → bundle budget check
- `.github/workflows/playwright.yml` → E2E matrix (chromium/firefox/webkit × mobile/desktop)
- Gate de ship: **TOUS** doivent passer avant merge

## Artefacts
- `tests/README.md` — stratégie complète
- `tests/utils/selectors.ts` — source de vérité sélecteurs
- `scripts/ux-smoke.mjs` — smoke funnel (4 tokens)
- `scripts/check-bundle-budget.cjs` — budget guard

## SLA
| Métrique | Target |
|----------|--------|
| E2E pass rate | 100% (flaky <2%) |
| Smoke tokens | 4/4 green |
| Bundle size | ≤210 Ko gzip |
| PHP lint | 0 erreurs |
| A11y violations | 0 critiques |
| Lighthouse Perf | >90 |