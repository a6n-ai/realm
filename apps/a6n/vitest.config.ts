import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./drizzle");

export default defineConfig({
  // The first request in each file cold-starts the Worker bundle; under parallel load that exceeds 20s.
  test: { testTimeout: 60_000, hookTimeout: 60_000 },
  plugins: [
    tanstackStart(),
    cloudflareTest({
      // env.test drops the Secrets Store bindings (bindings are not inherited), so the strings below are used.
      wrangler: { configPath: "./wrangler.jsonc", environment: "test" },
      miniflare: {
        d1Databases: ["DB"],
        serviceBindings: { RELAY: () => new Response("no relay in tests", { status: 503 }) },
        bindings: {
          TEST_MIGRATIONS: migrations,
          MAILER: "memory",
          // Placeholder so /api/health sees a configured Relay; tests never call Relay.
          RELAY_API_KEY: "test-placeholder",
          BETTER_AUTH_SECRET: "a6n-test-secret-a6n-test-secret-a6n-test",
          BETTER_AUTH_URL: "http://localhost",
        },
      },
    }),
  ],
});
