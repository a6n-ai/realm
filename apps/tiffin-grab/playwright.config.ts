import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./skeleton-audit",
  timeout: 60_000,
  use: {
    baseURL: process.env.AUDIT_BASE_URL ?? "http://localhost:3000",
    contextOptions: {
      // kill pulse animation so a captured skeleton frame is stable
      reducedMotion: "reduce",
    },
  },
});
