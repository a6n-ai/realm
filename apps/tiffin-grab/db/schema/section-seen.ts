import { baseColumns } from "@realm/database";
import { bigint, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";

// Which staff-facing section a "seen" marker applies to. The sidebar dot is
// derived per section from max(created_at) > seen_at — no per-row read receipts.
export const sectionKind = pgEnum("section_kind", ["tickets", "inquiries", "customers"]);

export const sectionSeen = pgTable("section_seen", {
  ...baseColumns("ssn"),
  userId: bigint("user_id", { mode: "bigint" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  section: sectionKind("section").notNull(),
  seenAt: bigint("seen_at", { mode: "number" }).notNull(),
}, (t) => [
  uniqueIndex("section_seen_user_section_idx").on(t.userId, t.section),
]);
