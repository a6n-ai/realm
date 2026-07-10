import { updatableColumns } from "@realm/database";
import { bigint, date, index, pgEnum, pgTable, text, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { deliveryZones } from "./catalog";
import { orders } from "./orders";

export const deliveryStatus = pgEnum("delivery_status", ["scheduled", "paused", "skipped", "cancelled"]);

export const deliveries = pgTable("deliveries", {
  ...updatableColumns("dlv"),
  orderId: bigint("order_id", { mode: "bigint" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  deliveryDate: date("delivery_date").notNull(),
  status: deliveryStatus("status").notNull().default("scheduled"),
  // Snapshot of this row's cutoff instant. Missed-ness must never be re-derived from the
  // mutable app.cutoffHour/timezone, or an admin edit could un-miss a delivery that already
  // spawned a make-up.
  cutoffAt: bigint("cutoff_at", { mode: "number" }).notNull(),
  // A missed original spawns at most one make-up, ever. NULLs are distinct in Postgres, so the
  // N originals coexist under this unique index.
  makeupForDeliveryId: bigint("makeup_for_delivery_id", { mode: "bigint" })
    .references((): AnyPgColumn => deliveries.id),
  // All four NULL = inherit the order's address.
  fullName: text("full_name"),
  addressLine: text("address_line"),
  city: text("city"),
  postalCode: text("postal_code"),
  zoneId: bigint("zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
}, (t) => [
  uniqueIndex("deliveries_order_date_unique").on(t.orderId, t.deliveryDate),
  uniqueIndex("deliveries_makeup_unique").on(t.makeupForDeliveryId),
  index("deliveries_order_date_idx").on(t.orderId, t.deliveryDate),
]);
