import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin" },
  },
});
