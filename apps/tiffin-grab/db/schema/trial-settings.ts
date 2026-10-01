import { updatableColumns } from "@foundry/database";
import { bigint, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { deliveryFrequencies } from "./catalog";
import { organization } from "./organizations";

// Trial meal rules, one row per franchise (organization_id null = the app-wide row),
// like @foundry/delivery's per-org config. A trial rides one delivery frequency: its
// days are the send days, and staff or the customer pick 1..maxDays of them as eating
// days, one tiffin each, so a trial fits inside one week.
export const trialSettings = pgTable("trial_settings", {
  ...updatableColumns("trs"),
  // Null = trials off.
  deliveryFrequencyId: bigint("delivery_frequency_id", { mode: "bigint" }).references(() => deliveryFrequencies.id),
  // Null = trials off. At most the frequency's day count and 5.
  maxDays: integer("max_days"),
  organizationId: text("organization_id").references(() => organization.id),
}, (t) => [unique("trial_settings_organization_unique").on(t.organizationId).nullsNotDistinct()]);
