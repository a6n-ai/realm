import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

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
const globalForDb = globalThis as typeof globalThis & { __xplorersPg?: Pg };

const poolSize = process.env.NODE_ENV === "production" ? 10 : 4;
const client =
  globalForDb.__xplorersPg ??
  postgres(connectionString, {
    max: poolSize,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__xplorersPg = client;

export const db = drizzle(client, { schema });
export { schema };
