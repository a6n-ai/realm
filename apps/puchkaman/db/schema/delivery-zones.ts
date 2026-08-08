import { updatableColumns } from "@realm/database";
import { bigint, boolean, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { deliveryTypes } from "./delivery-types";

/**
 * One concentric ring from the shop — geography only. The largest active
 * radius IS the delivery limit; rules (minimum, discount, scheduling) live
 * on `delivery_types`, not here.
 */
export const deliveryZones = pgTable("delivery_zones", {
  ...updatableColumns("zon"),
  name: text("name").notNull(),
  radiusKm: numeric("radius_km", { precision: 6, scale: 2 }).notNull(),
  // Soft delete: historical orders keep a resolvable zone.
  active: boolean("active").notNull().default(true),
});

/** Which delivery types a zone offers. A near zone can offer more than a far one. */
export const deliveryZoneTypes = pgTable(
  "delivery_zone_types",
  {
    ...updatableColumns("dzt"),
    zoneId: bigint("zone_id", { mode: "bigint" })
      .notNull()
      .references(() => deliveryZones.id),
    typeId: bigint("type_id", { mode: "bigint" })
      .notNull()
      .references(() => deliveryTypes.id),
  },
  (t) => [uniqueIndex("delivery_zone_types_zone_type_unique").on(t.zoneId, t.typeId)],
);
