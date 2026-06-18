import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin" },
    // Integration tests share one Postgres table; run files serially so their
    // truncate-in-beforeEach does not race across parallel workers.
    fileParallelism: false,
  },
});
