import { defineConfig } from "drizzle-kit";
import { resolveMigrationUrl } from "./db/resolve-migration-url";

// drizzle-kit CLI (unlike Next.js) doesn't auto-load .env.local. Only for local
// dev — in prod (Docker) the file is absent and vars come from the real env, so
// swallow ENOENT rather than crash.
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
