import { baseColumns } from "@foundry/database";
import { bigint, date, index, pgTable, text } from "drizzle-orm/pg-core";
import { deliveries } from "./deliveries";
import { orders } from "./orders";
import { organization } from "./organizations";

// One row per tiffin the customer moved: it stopped being eaten on from_eat_date (on
// from_delivery_id) and is now eaten on to_eat_date, riding to_delivery_id with that day's menu.
// It answers "Fri: moved to Wed" / "Wed: + Fri's tiffin", and it is what makes a moved tiffin
// immovable: a day's movable tiffins = its count on the trip minus rows here landing on it.
// NULL from_* = a pooled tiffin scheduled onto an existing trip (it came from the pool, not a day).
export const deliveryMoves = pgTable("delivery_moves", {
  ...baseColumns("dmv"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromDeliveryId: bigint("from_delivery_id", { mode: "bigint" }).references(() => deliveries.id, { onDelete: "cascade" }),
  toDeliveryId: bigint("to_delivery_id", { mode: "bigint" }).notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  fromEatDate: date("from_eat_date"),
  toEatDate: date("to_eat_date").notNull(),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [
  index("delivery_moves_order_idx").on(t.orderId),
  index("delivery_moves_from_idx").on(t.fromDeliveryId),
  index("delivery_moves_to_idx").on(t.toDeliveryId),
  index("delivery_moves_organization_idx").on(t.organizationId),
]);
