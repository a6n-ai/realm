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

type Pg = ReturnType<typeof postgres>;
const globalForDb = globalThis as typeof globalThis & { __puchkamanPg?: Pg };

// Cache the pool on globalThis. Turbopack re-evaluates this module on HMR and
// would otherwise open a new 10-connection pool each time without ending the
// old one — local Postgres max_connections (100) fills in under an hour of
// `next dev`, then every query dies with "too many clients already".
const poolSize = process.env.NODE_ENV === "production" ? 10 : 4;
const client =
  globalForDb.__puchkamanPg ??
  postgres(connectionString, {
    max: poolSize,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__puchkamanPg = client;

export const db = drizzle(client, { schema });
export { schema };
