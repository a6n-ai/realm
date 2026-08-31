import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* env expected */
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

type Pg = ReturnType<typeof postgres>;
const globalForDb = globalThis as typeof globalThis & { __relayPg?: Pg };

const poolSize = process.env.NODE_ENV === "production" ? 10 : 4;
const client =
  globalForDb.__relayPg ??
  postgres(connectionString, {
    max: poolSize,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__relayPg = client;

export const db = drizzle(client, { schema });
export { schema };
