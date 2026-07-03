import { defineConfig } from "drizzle-kit";
import { resolveMigrationUrl } from "./db/resolve-migration-url";

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: resolveMigrationUrl(process.env) },
});
