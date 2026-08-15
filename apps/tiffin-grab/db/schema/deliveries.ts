import { updatableColumns } from "@realm/database";
import { bigint, date, index, integer, pgEnum, pgTable, text, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  // How many tiffins THIS row is worth — normally order.persons, but there is no physical
  // Saturday/Sunday delivery: a weekend add-on ships with the preceding Friday instead, so
  // that Friday's row carries the extra units (see materializeDeliveries). Every write path
  // sets this explicitly; the default exists only to keep the column safely NOT NULL.
  // lib/services/tiffin-counts.ts sums this per row rather than assuming a flat persons
  // multiplier — that's what makes a bundled Friday count (and pool, on a miss) correctly.
  tiffinUnits: integer("tiffin_units").notNull().default(1),
  // A missed original spawns at most one make-up, ever. NULLs are distinct in Postgres, so the
  // N originals coexist under this unique index.
  makeupForDeliveryId: bigint("makeup_for_delivery_id", { mode: "bigint" })
    .references((): AnyPgColumn => deliveries.id),
  // Set once when this miss's tiffins were added to orders.pooled_tiffin_count (idempotent
  // reconcile). NULL = not yet accounted into the pool.
  pooledAt: bigint("pooled_at", { mode: "number" }),
  // All four NULL = inherit the order's address.
  fullName: text("full_name"),
  addressLine: text("address_line"),
  city: text("city"),
  postalCode: text("postal_code"),
  zoneId: bigint("zone_id", { mode: "bigint" }).references(() => deliveryZones.id),
  // Route assignment, WRITTEN ONLY BY THE OPTIMOROUTE PULL — never by hand and never by
  // the app's own logic. OptimoRoute plans the routes; these columns are a cache of its
  // answer so labels can print in the order the van is loaded. A stale value is corrected
  // by pulling again, and cleared when a delivery drops off the plan.
  routeDriverSerial: text("route_driver_serial"),
  routeDriverName: text("route_driver_name"),
  routeStopNumber: integer("route_stop_number"),
  routeSyncedAt: bigint("route_synced_at", { mode: "number" }),
  // Proof-of-delivery confirmation, WRITTEN ONLY BY THE OPTIMOROUTE COMPLETION PULL.
  // Deliberately additive: today's cutoff-passed-and-still-scheduled assumption (see
  // lib/services/tiffin-counts.ts) keeps deciding "delivered" for billing. A "success"
  // completion just records real-world confirmation alongside that assumption. A "failed"
  // completion is the one case that acts — see completions.ts, which flips the row to
  // skipped (reusing skipDelivery/reconcilePoolFromMisses) exactly as a manual skip would.
  optimoCompletionStatus: text("optimo_completion_status"), // "success" | "failed"
  optimoCompletedAt: bigint("optimo_completed_at", { mode: "number" }),
  // Driver's failure note (OptimoRoute's `form.note`) — null on a success completion.
  optimoCompletionNote: text("optimo_completion_note"),
}, (t) => [
  uniqueIndex("deliveries_order_date_unique").on(t.orderId, t.deliveryDate),
  uniqueIndex("deliveries_makeup_unique").on(t.makeupForDeliveryId),
  index("deliveries_order_date_idx").on(t.orderId, t.deliveryDate),
]);
