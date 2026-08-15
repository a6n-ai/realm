import { and, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NotificationTables } from "./schema";
import type { Channel, Kind } from "./types";

// Schema generic is loose (matches @realm/database's Database type): these
// helpers only use the core query builder, and pinning a concrete schema would
// reject every app `db` — each app has its own schema shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

/**
 * One normalizer for both address kinds. An email is lowercased (bounce
 * payloads echo the envelope as sent, which may differ in case from what
 * better-auth stored); a phone keeps a leading `+` and drops formatting.
 */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export type SuppressionScope = "all" | "marketing";

/**
 * Record a bounce, complaint, unsubscribe or manual block. Idempotent.
 *
 * `scope` defaults to "all" — the conservative direction. A caller that means
 * "marketing only" has to say so, because getting it backwards silently
 * suppresses receipts.
 */
export async function suppress(
  db: Db,
  tables: NotificationTables,
  input: { address: string; channel: Channel; reason: string; scope?: SuppressionScope },
): Promise<void> {
  await db
    .insert(tables.messageSuppression)
    .values({
      address: normalizeAddress(input.address),
      channel: input.channel,
      scope: input.scope ?? "all",
      reason: input.reason,
    })
    .onConflictDoUpdate({
      target: [
        tables.messageSuppression.address,
        tables.messageSuppression.channel,
        tables.messageSuppression.scope,
      ],
      set: { reason: input.reason },
    });
}

/**
 * Channels blocked for ANY of the given addresses (a recipient's email + phone),
 * for a message of this kind. A "marketing"-scoped row blocks only marketing;
 * an "all"-scoped row blocks both.
 */
export async function suppressedChannelsFor(
  db: Db,
  tables: NotificationTables,
  addresses: string[],
  kind: Kind = "transactional",
): Promise<Channel[]> {
  const normalized = addresses.filter(Boolean).map(normalizeAddress);
  if (normalized.length === 0) return [];
  const scopes: SuppressionScope[] = kind === "marketing" ? ["all", "marketing"] : ["all"];
  const rows = await db
    .select({ channel: tables.messageSuppression.channel })
    .from(tables.messageSuppression)
    .where(
      and(
        inArray(tables.messageSuppression.address, normalized),
        inArray(tables.messageSuppression.scope, scopes),
      ),
    );
  return [...new Set(rows.map((r) => r.channel as Channel))];
}
