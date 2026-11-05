import { defineConfig } from "@playwright/test";
import { APP_URL } from "./e2e/support/stack";

/**
 * End-to-end tests for the Stylebook canvas and picker.
 *
 * `globalSetup` boots an isolated stack (throwaway `organizing_app_e2e`
 * database, a freshly built Go backend on :18080 and a Vite dev server on
 * :15173 proxying to it) and returns its teardown. Nothing here talks to the
 * developer's own backend (:8080), Vite (:5173) or database.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: APP_URL,
    browserName: "chromium",
    // The PWA service worker must never cache or intercept test traffic.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      // API-only tests don't depend on the viewport; run them once.
      testIgnore: /api\.spec\.ts$/,
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
