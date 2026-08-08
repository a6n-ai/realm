import { updatableColumns } from "@realm/database";
import { jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import type { IntegrationsConfig } from "@realm/clover";

// The app/tenant singleton: one row. current_app_id() (in the baseline
// migration) resolves every other table's app_id FK through this row.
export const app = pgTable("app", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  currency: text("currency").notNull().default("CAD"),
  // Installed plugins + OAuth connection state (Clover tokens server-side only).
  // Mirrors tiffin-grab's payment_config JSONB pattern.
  integrationsConfig: jsonb("integrations_config").$type<IntegrationsConfig>(),
  // Shop origin every delivery-zone radius is measured from. Null falls back
  // to the DEFAULT_STORE_LAT/LNG constants.
  storeLat: numeric("store_lat", { precision: 9, scale: 6 }),
  storeLng: numeric("store_lng", { precision: 9, scale: 6 }),
});
