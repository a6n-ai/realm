import { defineConfig } from "drizzle-kit";
import { resolveMigrationUrl } from "./db/resolve-migration-url";

if (!process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local (prod/container) — real env provides the URL */
  }
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: resolveMigrationUrl(process.env) },
});
