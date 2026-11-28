import { newId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";

/** One fixed window per key in `rate_limits` (`last_request` holds the window start). */
export async function hitRateLimit(db: CrmDb, key: string, max: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const over = now - windowMs;
  const [row] = await db.all<{ count: number }>(sql`INSERT INTO rate_limits (id, key, count, last_request)
    VALUES (${newId("rlm")}, ${key}, 1, ${now})
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN last_request < ${over} THEN 1 ELSE count + 1 END,
      last_request = CASE WHEN last_request < ${over} THEN ${now} ELSE last_request END
    RETURNING count`);
  return row!.count <= max;
}
