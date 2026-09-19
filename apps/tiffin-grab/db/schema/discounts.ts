import { updatableColumns } from "@foundry/database";
import { bigint, boolean, check, integer, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization } from "./organizations";

export const discountKind = pgEnum("discount_kind", ["delivery", "duration"]);

// Central catalog-discount table. Applicable rows ADD UP, capped by app.max_discount_pct.
// targetId is a soft ref (delivery_frequencies.id or duration_packages.id by kind); null = every row of that kind.
export const discounts = pgTable("discounts", {
  ...updatableColumns("dsc"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  kind: discountKind("kind").notNull(),
  targetId: bigint("target_id", { mode: "bigint" }),
  percent: numeric("percent", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  startsAt: bigint("starts_at", { mode: "number" }),
  endsAt: bigint("ends_at", { mode: "number" }),
  minWeeks: integer("min_weeks"),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [check("discounts_percent_range", sql`${t.percent} >= 0 AND ${t.percent} <= 100`)]);
