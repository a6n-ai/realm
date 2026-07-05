import { defineConfig } from "drizzle-kit";
import { resolveMigrationUrl } from "./db/resolve-migration-url";

// drizzle-kit CLI (unlike Next.js) doesn't auto-load .env.local
process.loadEnvFile?.(".env.local");

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: resolveMigrationUrl(process.env) },
});
