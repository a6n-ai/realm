import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// prepare: false is required when DATABASE_URL points at a transaction-mode
// PgBouncer — a named PREPARE and its EXECUTE may land on different backends.
// Harmless on a direct connection. Queries stay parameterized.
const client = postgres(connectionString, { max: 10, prepare: false });
export const db = drizzle(client, { schema });
export { schema };
