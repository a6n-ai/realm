import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";

export const toNameKey = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export async function searchCompanies(db: CrmDb, q: string): Promise<{ id: string; name: string }[]> {
  const key = toNameKey(q);
  if (!key) return [];
  return db.all<{ id: string; name: string }>(
    sql`SELECT id, name FROM companies WHERE name_key LIKE ${likePattern(key)} ESCAPE '\\' ORDER BY name_key LIMIT 10`,
  );
}
