import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Kabanchik / ScrumAgent web app.
 *
 * Covers smoke tests for every screen. Run locally via `npm run test:e2e`.
 * The config boots `next dev` automatically (or reuses an existing server on
 * 3000 outside CI) so contributors don't need a separate terminal.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: isCI ? 2 : 0,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
