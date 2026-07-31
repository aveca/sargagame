# Stratégie de Tests — Sargagame

> Guide pour l'agent QA et tout agent écrivant des tests.
> Objectif : 100% des parcours critiques couverts, exécution CI < 5 min.

## Architecture de tests

```
tests/
├── e2e/                    # Tests Playwright End-to-End (parcours utilisateur)
│   ├── funnel-payment.spec.ts      # Funnel principal : carte → verdict → paywall → paiement
│   ├── b2b-flow.spec.ts          # Funnel B2B : outreach → espace → essai → paiement
│   ├── paypal-flow.spec.ts       # Flux PayPal secondaire
│   ├── responsive.spec.ts        # 360/390/430/1440px
│   ├── a11y.spec.ts              # Accessibilité (reduced-motion, focus, contraste)
│   └── pwa.spec.ts               # PWA : install, offline, push
├── integration/            # Tests d'intégration (API, data pipeline)
│   ├── mollie-api.spec.ts        # Endpoints Mollie (payment_status, webhook)
│   ├── paypal-api.spec.ts        # Endpoints PayPal
│   ├── data-pipeline.spec.ts     # ERDDAP → forecast → confidence → JSON
│   └── regions.spec.ts           # Validation regions/*.json
├── unit/                   # Tests unitaires (logique pure)
│   ├── forecast.test.js          # scripts/lib/forecast.cjs
│   ├── confidence.test.js        # scripts/lib/confidence.cjs
│   ├── reliability.test.js       # scripts/lib/reliability-page.cjs
│   └── mollie-lib.test.js        # public/api/mollie-lib.php (via PHPUnit ou Node mock)
├── fixtures/               # Données de test
│   ├── sargassum.sample.json
│   ├── mollie-webhook-payloads/
│   └── paypal-webhook-payloads/
├── utils/                  # Helpers partagés
│   ├── test-setup.ts             # beforeAll/afterAll Playwright
│   ├── selectors.ts              # Selectors centralisés (data-testid)
│   └── mock-server.ts            # MSW pour mocker APIs
├── playwright.config.ts    # Config centralisée
└── README.md               # Ce fichier
```

## Configuration Playwright (playwright.config.ts)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { outputFolder: 'test-results/html' }], ['line']],
  
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  projects: [
    {
      name: 'mobile-chromium',  // Device principal : iPhone 12
      use: { 
        ...devices['iPhone 12'],
        // Forcer émulation Safari-like
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-mobile',    // Vrai WebKit pour validation finale
      use: { ...devices['iPhone 12'], browserName: 'webkit' },
    },
  ],
  
  webServer: {
    command: 'npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

## Parcours Critiques (P0) — Couverture Obligatoire

### 1. Funnel Principal B2C
```
Home → Carte SVG (WorldMapView) → Clic plage → Verdict gratuit (fiche) 
  → Paywall (PremiumModal) → Checkout Mollie (Components/Apple/Google Pay) 
  → Retour app → Premium activé (localStorage + cross-device)
```
**Test** : `funnel-payment.spec.ts`
- Variantes : EUR (MQ/GP) + USD (FL/PC/RM)
- Rollback flags : `?pwcomic=0`, `?fc7=0`, etc.
- Assertions : 4 tokens smoke (`FUNNEL_REACHED`, `ERRORS=[]`, `WHITE_OR_TRANSPARENT_BUTTONS=[]`, `RM_INFINITE=[]`)

### 2. Funnel B2B Self-Serve
```
Email outreach → /pro/espace/?beach&name&partner 
  → Essai 30j (b2b-trial.php) → Dashboard Pro 
  → Paiement Mollie (paylink 690€ ou subscription 79€)
```
**Test** : `b2b-flow.spec.ts`
- Token essai émis et valide
- Paylink annuel 690€ fonctionne
- Subscription mensuelle 79€ créée

### 3. PayPal Secondaire
```
Même funnel mais PAY_PROVIDER=paypal
```
**Test** : `paypal-flow.spec.ts`

### 4. Responsive (4 viewports)
```
360px (small mobile) → 390px (iPhone 12) → 430px (large mobile) → 1440px (desktop)
```
**Test** : `responsive.spec.ts`
- Aucun overflow horizontal
- Cibles tactiles ≥ 44px
- Typo `clamp()` lisible
- Carte SVG interactive sur mobile

### 5. Accessibilité
```
prefers-reduced-motion → animations désactivées
Focus trap modales → Échap ferme, focus restauré
Contraste → computed styles (pas capture)
```
**Test** : `a11y.spec.ts`
- `RM_INFINITE=[]` validé
- `role="dialog"` sur toutes modales

### 6. PWA
```
Install prompt → Standalone iOS (css fix #root inset:0) 
  → Offline → Push OneSignal (cloche Header)
```
**Test** : `pwa.spec.ts`

## Selectors — Convention `data-testid`

**Jamais** de selectors CSS fragiles. Toujours `data-testid` :

```tsx
// Dans le code React
<button data-testid="paywall-cta-primary" className="...">Acheter</button>
<div data-testid="beach-verdict" data-beach="les-salines">Propre</div>
<svg data-testid="world-map" className="world-map">...</svg>
```

```typescript
// Dans les tests
await page.getByTestId('paywall-cta-primary').click();
await expect(page.getByTestId('beach-verdict')).toContainText('Propre');
await page.getByTestId('world-map').click({ position: { x: 400, y: 300 } });
```

**Mapping selectors** dans `tests/utils/selectors.ts` :
```typescript
export const selectors = {
  // Map
  worldMap: '[data-testid="world-map"]',
  beachPin: (beachId: string) => `[data-testid="beach-pin-${beachId}"]`,
  beachSheet: '[data-testid="beach-sheet"]',
  
  // Verdict
  verdictClean: '[data-testid="verdict-clean"]',
  verdictSargassum: '[data-testid="verdict-sargassum"]',
  verdictUncertain: '[data-testid="verdict-uncertain"]',
  
  // Paywall
  paywallModal: '[data-testid="paywall-modal"]',
  paywallCta: '[data-testid="paywall-cta-primary"]',
  paywallClose: '[data-testid="paywall-close"]',
  paywallComicVariant: '[data-testid="paywall-comic"]',
  
  // Mollie
  mollieComponents: '[data-testid="mollie-components"]',
  applePayButton: '[data-testid="apple-pay-button"]',
  googlePayButton: '[data-testid="google-pay-button"]',
  
  // B2B
  b2bTrialCta: '[data-testid="b2b-trial-cta"]',
  b2bPaylinkAnnual: '[data-testid="b2b-paylink-annual"]',
  b2bSubscriptionMonthly: '[data-testid="b2b-subscription-monthly"]',
};
```

## Mocking APIs (MSW)

Pour tests rapides sans réseau :

```typescript
// tests/utils/mock-server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const mockServer = setupServer(
  // ERDDAP data
  http.get('/api/copernicus/sargassum.json', () => 
    HttpResponse.json(require('../fixtures/sargassum.sample.json'))
  ),
  
  // Mollie payment_status
  http.post('/api/mollie.php', async ({ request }) => {
    const body = await request.json();
    if (body.action === 'payment_status') {
      return HttpResponse.json({ 
        status: 'paid', 
        terminal: true,
        payment_id: 'tr_test_123' 
      });
    }
    return HttpResponse.json({ error: 'Unknown action' }, { status: 400 });
  }),
  
  // Mollie webhook
  http.post('/api/mollie-webhook.php', () => HttpResponse.json({ received: true })),
  
  // B2B trial
  http.post('/api/b2b-trial.php', () => HttpResponse.json({ 
    token: 'test_pro_token', 
    expires: '2026-08-31' 
  })),
);
```

## Gate de Ship — Tests Bloquants

Ces tests **doivent passer** avant tout merge sur `main` :

| Test | Commande | Critère de succès |
|------|----------|-------------------|
| Build | `npm run build` | exit 0 |
| Bundle budget | `node scripts/check-bundle-budget.cjs` | ≤ 210 Ko gzip |
| PHP Lint | `php -l` sur fichiers modifiés | exit 0 |
| Smoke funnel | `node scripts/ux-smoke.mjs` | 4 tokens littéraux présents |
| E2E critique | `npx playwright test tests/e2e/funnel-payment.spec.ts` | passed |
| Regions valid | `node -e "require('./regions/index.cjs').assertAllRegionsValid()"` | exit 0 |

**CI** : `.github/workflows/ci-tests.yml` exécute tout ça sur chaque PR.

## Données de Test (fixtures)

```json
// tests/fixtures/sargassum.sample.json
{
  "updatedAt": "2026-07-31T12:00:00.000Z",
  "erddapTimestamp": "2026-07-31T10:00:00.000Z",
  "source": "ERDDAP-live",
  "stale": false,
  "regions": {
    "martinique": {
      "beaches": [
        { "id": "les-salines", "name": "Les Salines", "forecast": "clean", "confidence": 0.85 },
        { "id": "anse-dufour", "name": "Anse Dufour", "forecast": "sargassum", "confidence": 0.72 }
      ]
    }
  }
}
```

## Exécution Locale

```bash
# 1. Build prod
npm run build

# 2. Preview server (background)
npx vite preview --port 4173 &

# 3. Install Playwright browsers (first time)
npx playwright install chromium webkit

# 4. Run all tests
npx playwright test

# 5. Run specific suite
npx playwright test tests/e2e/funnel-payment.spec.ts

# 6. Run with UI mode (debug)
npx playwright test --ui

# 7. Show report
npx playwright show-report test-results/html
```

## Debugging Tips

1. **Screenshots auto** : `screenshot: 'only-on-failure'` + `video: 'retain-on-failure'`
2. **Trace viewer** : `npx playwright show-trace trace.zip` (sur failure CI)
3. **Computed styles** : Pour couleurs, utiliser `page.evaluate(() => getComputedStyle(el).backgroundColor)`
4. **Reduced motion** : `await page.emulateMedia({ reducedMotion: 'reduce' })`
5. **Mobile emulation** : Déjà configuré dans `playwright.config.ts` (iPhone 12)

## Métriques de Couverture Objectif

| Couche | Objectif | Actuel |
|--------|----------|--------|
| Funnel principal | 100% (tous variants) | ~60% |
| Funnel B2B | 100% | 0% |
| PayPal | 100% | 0% |
| Responsive | 4 viewports × 5 pages | 0% |
| Accessibilité | 100% règles plancher | 0% |
| PWA | Install + offline + push | 0% |
| API Mollie | payment_status, webhook, create_subscription | 0% |
| Data pipeline | ERDDAP → forecast → confidence | 0% |

## Rôle QA Agent — Workflow

1. **Pick task** : `TASK-P1-002` (E2E tests) depuis `.ai/tasks.md`
2. **Branch** : `agent/qa/TASK-P1-002`
3. **Write tests** : Un fichier par parcours critique
4. **Run local** : `npx playwright test` (vert)
5. **Push + PR** : CI valide
6. **Handoff** : MAJ `.ai/current_state.md` + `.ai/changelog.md` + `.ai/tasks.md [x]`

## Anti-Patterns à Éviter

| ❌ Ne pas faire | ✅ Faire |
|----------------|----------|
| `page.locator('.btn-primary')` | `page.getByTestId('paywall-cta')` |
| `await page.waitForTimeout(1000)` | `await expect(el).toBeVisible()` |
| Tester sur `npm run dev` | Tester sur `vite preview` (build prod) |
| Valider couleur sur screenshot | Valider `getComputedStyle` |
| Un test = 50 assertions | Un test = 1 parcours, assertions ciblées |
| Skip `prefers-reduced-motion` | Tester `RM_INFINITE=[]` |

---

## Checklist Pré-Merge (pour tout agent)

- [ ] Tests E2E écrits pour nouvelle feature
- [ ] `npx playwright test` passe en local
- [ ] `npm run build` + `check-bundle-budget` + `ux-smoke` passent
- [ ] `php -l` sur fichiers PHP touchés
- [ ] `data-testid` ajoutés sur nouveaux éléments UI
- [ ] Mock MSW mis à jour si nouvelle API
- [ ] `.ai/changelog.md` + `.ai/current_state.md` + `.ai/tasks.md` mis à jour