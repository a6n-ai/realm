import { like, type SQL } from "drizzle-orm";
import { notificationOutbox } from "@/db/schema";

/**
 * Outbox rows whose dedupe key starts with `prefix` (the engine appends `:<channel>`).
 * `_` and `%` are escaped: public ids contain `_`, and an unescaped one is a wildcard that also
 * cuts the index range on `notification_outbox_dedupe_prefix_idx` down to the text before it.
 */
export function dedupeKeyStartsWith(prefix: string): SQL {
  return like(notificationOutbox.dedupeKey, `${prefix.replace(/[\\%_]/g, "\\$&")}%`);
}
