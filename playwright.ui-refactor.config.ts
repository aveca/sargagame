import { defineConfig, devices } from "@playwright/test";

// The CI workflow builds the app and starts Vite preview on port 4173 first.
// No second webServer is started here (avoids competing servers in CI).
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["ui-refactor-after.spec.ts"],
  fullyParallel: false,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["line"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PREVIEW_URL || "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
