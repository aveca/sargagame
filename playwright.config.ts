import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isFast = process.env.FAST === 'true';
const isFull = process.env.FULL === 'true';

export default defineConfig({
  testDir: './tests',
  fullyParallel: !isFast,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: isFast ? 1 : (process.env.CI ? 2 : undefined),
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['line'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  // Test timeout
  timeout: isFast ? 30000 : 60000,
  expect: { timeout: isFast ? 5000 : 10000 },

  use: {
    baseURL: process.env.PREVIEW_URL || 'http://localhost:4173',
    trace: isFull ? 'on' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isFull ? 'on' : 'retain-on-failure',
    // Disable silent error swallowing
    ignoreHTTPSErrors: true,
  },

  // Global setup/teardown
  globalSetup: resolve(__dirname, './tests/global-setup.ts'),
  globalTeardown: resolve(__dirname, './tests/global-teardown.ts'),

  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone 12'],
        browserName: 'chromium',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
    },
    // Desktop for FULL profile
    ...(isFull ? [{
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    }] : []),
    // Large mobile for FULL profile
    ...(isFull ? [{
      name: 'mobile-large',
      use: {
        ...devices['iPhone 12'],
        browserName: 'chromium',
        viewport: { width: 430, height: 932 },
      },
    }] : []),
  ],

  webServer: {
    command: 'npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60000,
    // Health check with proper error handling
    env: { NODE_ENV: 'production' },
  },

  // Output directories
  outputDir: 'test-results/',
  snapshotDir: 'tests/snapshots/',

  // Metadata for reporting
  metadata: {
    testType: isFast ? 'FAST' : (isFull ? 'FULL' : 'DEFAULT'),
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'local',
  },
});
