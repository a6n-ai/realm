import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Reseed admin/member after the run — the live-DB suites delete them in
    // teardown, which otherwise leaves the dev DB unable to log in.
    globalTeardown: ["./vitest.teardown.ts"],
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin" },
    // Integration tests share one Postgres table; run files serially so their
    // truncate-in-beforeEach does not race across parallel workers.
    fileParallelism: false,
  },
});
