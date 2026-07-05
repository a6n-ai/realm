import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Next.js loads .env.local; standalone tsx scripts (seeds) don't. Fill it in
// when missing. No-op under Next (already set) and in prod (file absent).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* file absent — real env is expected to provide DATABASE_URL */
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// prepare: false is required when DATABASE_URL points at a transaction-mode
// PgBouncer — a named PREPARE and its EXECUTE may land on different backends.
// Harmless on a direct connection. Queries stay parameterized.
const client = postgres(connectionString, { max: 10, prepare: false });
export const db = drizzle(client, { schema });
export { schema };
