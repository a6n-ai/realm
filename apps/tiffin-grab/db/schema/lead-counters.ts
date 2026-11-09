import { integer, pgTable, text } from "drizzle-orm/pg-core";

// One row per organization ('' when the org is null): hands out the never-resetting
// "Lead <n>" numbers atomically via insert … on conflict do update … returning.
export const leadCounters = pgTable("lead_counters", {
  orgKey: text("org_key").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});
