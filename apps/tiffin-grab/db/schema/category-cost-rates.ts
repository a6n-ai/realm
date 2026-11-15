import { updatableColumns } from "@foundry/database";
import { bigint, boolean, numeric, pgTable, text, unique } from "drizzle-orm/pg-core";
import { plans } from "./catalog";
import { organization } from "./organizations";

// Internal food cost per pick: cost_base + cost_per_tu * tu. Never shown to customers.
// Lookup: (org, plan) > (org, any plan) > (any org, plan) > (any org, any plan).
export const categoryCostRates = pgTable("category_cost_rates", {
  ...updatableColumns("ccr"),
  // Soft ref to dish_categories.key (mirrors addons.category).
  category: text("category").notNull(),
  // Null = every plan.
  planId: bigint("plan_id", { mode: "bigint" }).references(() => plans.id),
  costBase: numeric("cost_base", { precision: 10, scale: 2 }).notNull().default("0"),
  costPerTu: numeric("cost_per_tu", { precision: 10, scale: 4 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  // Null = app-wide rate.
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  unique("category_cost_rates_scope_unique").on(t.category, t.planId, t.organizationId).nullsNotDistinct(),
]);
