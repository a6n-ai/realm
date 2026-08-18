import { baseColumns } from "@realm/database";
import { bigint, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { deliveries } from "./deliveries";

// Every applied swap on a specific delivery. Eligibility (which category pairs
// may EVER swap) lives globally on category_swap_pairs (db/schema/menu.ts), not
// per meal size — there is no admin-authored ratio table anymore: the trade is
// always flat 1 TU of fromCategory for 1 TU of toCategory. qtyFrom/qtyTo here are
// PICK-COUNT deltas, derived at apply time from the chosen TU amount divided by
// each category's own meal_size_items.tuAmount (see category-swaps.service.ts) —
// not read off a rule row, because there is no rule row. Snapshotted at apply
// time so a later admin edit to a category's tuAmount can never retroactively
// change a swap a customer already applied — same "snapshot, don't re-derive"
// principle as orders.categoryCounts.
export const deliveryCategorySwaps = pgTable("delivery_category_swaps", {
  ...baseColumns("dcs"),
  deliveryId: bigint("delivery_id", { mode: "bigint" })
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" }),
  fromCategory: text("from_category").notNull(),
  toCategory: text("to_category").notNull(),
  qtyFrom: integer("qty_from").notNull(),
  qtyTo: integer("qty_to").notNull(),
}, (t) => [
  // Applying the same (from, to) pair twice on one delivery is legitimate now
  // (stack more of the same swap) — validateSwapStack bounds the total by what's
  // actually available, so there's nothing to uniquely constrain here anymore.
  index("delivery_category_swaps_delivery_idx").on(t.deliveryId),
]);
