import { baseColumns } from "@foundry/database";
import { bigint, date, index, pgTable, text } from "drizzle-orm/pg-core";
import { deliveries } from "./deliveries";
import { organization } from "./organizations";

// One row per EXTRA tiffin a trip carries on an eating day it already covers (a moved tiffin
// landed on a day the customer eats anyway). A day's count is 1 (covers_dates) + its rows here.
// Deliberately no unique (delivery_id, eat_date): the per-day cap is MAX_TIFFINS_PER_DAY in
// lib/menu/coverage.ts, so raising it needs no migration.
// Invariant: tiffin_units = (covers_dates + extra rows) * persons.
export const deliveryExtraTiffins = pgTable("delivery_extra_tiffins", {
  ...baseColumns("dxt"),
  deliveryId: bigint("delivery_id", { mode: "bigint" })
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" }),
  eatDate: date("eat_date").notNull(),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("delivery_extra_tiffins_delivery_idx").on(t.deliveryId),
  index("delivery_extra_tiffins_organization_idx").on(t.organizationId),
]);
