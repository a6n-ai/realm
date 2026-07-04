import { updatableColumns } from "@realm/database";
import { bigint, boolean, index, pgTable, text } from "drizzle-orm/pg-core";

export const leadSources = pgTable("lead_sources", {
  ...updatableColumns("lsr"),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  isInbound: boolean("is_inbound").notNull().default(true),
  active: boolean("active").notNull().default(true),
});

export const leadSubsources = pgTable("lead_subsources", {
  ...updatableColumns("lss"),
  sourceId: bigint("source_id", { mode: "bigint" }).notNull().references(() => leadSources.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [index("lead_subsources_source_idx").on(t.sourceId)]);
