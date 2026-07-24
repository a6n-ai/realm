import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** Always resolve from the tiffin-grab package root (where pnpm scripts run). */
const pkg = process.cwd();
const auth = (name: string) => path.join(pkg, "e2e/.auth", name);

/**
 * Realm / tiffin-grab Playwright E2E framework.
 *
 *   pnpm --filter tiffin-grab test:e2e
 *   pnpm --filter tiffin-grab test:e2e -- --project=admin
 *   pnpm --filter tiffin-grab test:e2e -- --grep "New inquiry"
 *
 * Unit / component tests: Vitest (`pnpm test`).
 * Browser E2E (every feature surface): Playwright (this config).
 */
export default defineConfig({
  testDir: path.join(pkg, "e2e"),
  testIgnore: ["**/__tests__/**"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(pkg, "e2e/playwright-report") }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "setup-admin", testMatch: /auth\.setup\.admin\.ts/ },
    { name: "setup-customer", testMatch: /auth\.setup\.customer\.ts/ },
    { name: "public", testMatch: /public\/.*\.spec\.ts/ },
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ["setup-admin"],
      use: { storageState: auth("admin.json") },
    },
    {
      name: "customer",
      testMatch: /customer\/.*\.spec\.ts/,
      dependencies: ["setup-customer"],
      use: { storageState: auth("customer.json") },
    },
  ],
  outputDir: path.join(pkg, "e2e/test-results"),
});
