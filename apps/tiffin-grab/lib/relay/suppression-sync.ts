import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { relayRpc } from "@/lib/relay/client";
import { readLeaseValue, writeLeaseValue } from "@/lib/runtime/lease";

// Cursor in runtime_leases (value column), so it survives deploys like the pay lock does.
const CURSOR_KEY = "relay:suppression-sync:created_at";

type Row = { created_at: number | string; address: string; scope: string; reason: string };

/**
 * Copies engine email opt-outs to Relay, oldest first, one suppress call per row. The engine table is
 * only read here. The cursor moves past a row only once Relay accepted it. When a failed row shares its
 * millisecond with an accepted one, the cursor drops one ms so that row is retried (suppress is idempotent).
 */
export async function syncSuppressionsToRelay(limit = 100): Promise<{ pushed: number }> {
  const cursor = Number((await readLeaseValue(CURSOR_KEY)) ?? 0);
  const rows = (await db.execute(sql`
    SELECT created_at, address, scope, reason FROM message_suppression
    WHERE channel = 'email' AND created_at > ${cursor}
    ORDER BY created_at, id LIMIT ${limit}`)) as unknown as Row[];
  const rpc = relayRpc();
  let next = cursor;
  let pushed = 0;
  for (const r of rows) {
    const at = Number(r.created_at);
    try {
      await rpc.suppress(suppressInput(r));
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      // Logs the message only: the address is personal data.
      console.error("relay suppression sync failed", { err: message });
      // Relay will never accept a malformed row, so skip it rather than stall every later opt-out.
      if (message !== "invalid input") {
        next = Math.min(next, at - 1);
        break;
      }
      next = at;
      continue;
    }
    next = at;
    pushed++;
  }
  if (next !== cursor) await writeLeaseValue(CURSOR_KEY, String(next));
  return { pushed };
}

/** Maps an engine row to the suppress input. Exported for the unit test. */
export function suppressInput(r: Pick<Row, "address" | "scope" | "reason">) {
  return {
    email: r.address.trim().toLowerCase(),
    reason: /unsubscribe/i.test(r.reason) ? ("unsubscribe" as const) : ("manual" as const),
    stream: r.scope === "marketing" ? ("marketing" as const) : null,
  };
}
