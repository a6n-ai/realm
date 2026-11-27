import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./drizzle");

export default defineConfig({
  // The first request in each file cold-starts the Worker bundle, so 5s is too tight.
  test: { testTimeout: 20_000 },
  plugins: [
    tanstackStart(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["DB"],
        serviceBindings: { RELAY: () => new Response("no relay in tests", { status: 503 }) },
        bindings: {
          TEST_MIGRATIONS: migrations,
          MAILER: "memory",
          BETTER_AUTH_SECRET: "k7Qz2mVx9LrT4wNp8sHc3YbF6jDa1eUg0oRi5tKl",
          BETTER_AUTH_URL: "http://localhost",
        },
      },
    }),
  ],
});
