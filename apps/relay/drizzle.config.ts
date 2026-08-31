import { defineConfig } from "drizzle-kit";

if (!process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* prod supplies env */
  }
}

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
