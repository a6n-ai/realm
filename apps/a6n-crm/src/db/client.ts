import { connectD1 } from "@foundry/database/d1";
import * as schema from "./schema";

export function getDb(env: { DB: D1Database }) {
  return connectD1(env.DB, schema);
}

export type CrmDb = ReturnType<typeof getDb>;
