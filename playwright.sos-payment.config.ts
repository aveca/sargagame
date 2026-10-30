import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["sos-plage-checkout.spec.ts"],
  fullyParallel: false,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["line"]],
  outputDir: "test-results/sos-plage-payment",
  use: {
    baseURL: process.env.PREVIEW_URL || "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "tablet-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
