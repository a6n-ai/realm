import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Schema generic is intentionally loose: repositories use Drizzle's core query
// builder (select/insert/update/delete), never the relational query API, so the
// concrete schema shape is irrelevant — and pinning it would reject every app
// `db` typed with its own schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PostgresJsDatabase<any>;
