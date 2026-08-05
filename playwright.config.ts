// playwright.config.ts — Config Playwright centralisée Sargasses
// Device principal : iPhone 12 (390x844, mobile, touch) — cf. AGENTS.md
// Gate de ship : `npx playwright test tests/e2e/funnel-critical.spec.ts`
import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: BASE,
    // Mobile-first (le trafic Sargasses est ~80% mobile)
    ...devices['iPhone 12'],
    // NOTE : reduced-motion est activé PAR-TEST (cf. spec Reduced-motion), pas
    // globalement — le paywall et certaines surfaces dépendent d'animations pour
    // leur montage. L'activer globalement fausse le test paywall.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    navigationTimeout: 60_000,
  },

  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
    {
      name: 'desktop-chromium',
      use: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
    },
  ],

  webServer: process.env.PLAYWRIGHT_SKIP_SERVER
    ? undefined
    : {
        command: 'npx vite preview --port 4173 --strictPort',
        url: BASE,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
